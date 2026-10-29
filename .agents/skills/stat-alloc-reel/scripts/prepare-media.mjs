#!/usr/bin/env node
// Normalizes the background video and music for a STAT ALLOC REEL project and detects the beat.
// Usage: node prepare-media.mjs <project> --video <file> [--music <file>] [--bpm <n>] [--logo <file>]
// Writes <project>/assets/background.mp4, music.wav, optional logo, and media.json.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { maxBuffer: 1 << 30, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${String(r.stderr || '').slice(-600)}`);
  return r.stdout;
};

export function probe(file) {
  const out = JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', file], { encoding: 'utf8' }));
  const video = out.streams.find((s) => s.codec_type === 'video');
  return {
    duration: Number(out.format.duration),
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    hasAudio: out.streams.some((s) => s.codec_type === 'audio'),
  };
}

// Onset envelope: positive change in log energy of a low band (kick) plus the full band.
function onsetEnvelope(samples, sr, hop) {
  const n = Math.floor(samples.length / hop);
  const low = new Float64Array(n);
  const full = new Float64Array(n);
  const a = Math.exp((-2 * Math.PI * 160) / sr);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    let el = 0, ef = 0;
    for (let j = i * hop; j < (i + 1) * hop; j++) {
      const x = samples[j];
      lp = a * lp + (1 - a) * x;
      el += lp * lp;
      ef += x * x;
    }
    low[i] = Math.log1p(1e4 * el / hop);
    full[i] = Math.log1p(1e4 * ef / hop);
  }
  const env = new Float64Array(n);
  for (let i = 1; i < n; i++) env[i] = 2 * Math.max(0, low[i] - low[i - 1]) + Math.max(0, full[i] - full[i - 1]);
  return env;
}

// Grid search for the period and first beat that best line up with the onsets.
export function detectBeat(samples, sr, { bpm = null, minBpm = 90, maxBpm = 180 } = {}) {
  const hop = 256;
  const env = onsetEnvelope(samples, sr, hop);
  const fps = sr / hop;
  const mean = env.reduce((x, y) => x + y, 0) / env.length || 1e-9;
  const score = (period, phase) => {
    let s = 0, c = 0;
    for (let t = phase; t * fps < env.length - 1; t += period) {
      const i = Math.round(t * fps);
      s += Math.max(env[i - 1] ?? 0, env[i], env[i + 1] ?? 0);
      c++;
    }
    return c ? s / c : 0;
  };
  const periods = [];
  if (bpm) periods.push(60 / bpm);
  else for (let p = 60 / maxBpm; p <= 60 / minBpm; p += 0.0004) periods.push(p);
  let best = { score: -1, period: 0.5, phase: 0 };
  for (const period of periods) {
    for (let phase = 0; phase < period; phase += 0.004) {
      const s = score(period, phase);
      if (s > best.score) best = { score: s, period, phase };
    }
  }
  // Refine the phase finely around the winner.
  for (let phase = Math.max(0, best.phase - 0.01); phase < best.phase + 0.01; phase += 0.001) {
    const s = score(best.period, phase);
    if (s > best.score) best = { ...best, score: s, phase };
  }
  const confidence = best.score / mean;
  return {
    bpm: Math.round((60 / best.period) * 100) / 100,
    period: Math.round(best.period * 10000) / 10000,
    first: Math.round(best.phase * 1000) / 1000,
    confidence: Math.round(confidence * 100) / 100,
  };
}

export function decodeMono(file, sr = 22050) {
  const buf = run('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-']);
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
}

function main(argv) {
  const project = argv[0];
  const opt = {};
  for (let i = 1; i < argv.length; i += 2) opt[argv[i].replace(/^--/, '')] = argv[i + 1];
  if (!project || !opt.video) {
    console.log('Usage: node prepare-media.mjs <project> --video <file> [--music <file>] [--bpm <n>] [--logo <file>]');
    process.exit(1);
  }
  const assets = join(resolve(project), 'assets');
  mkdirSync(assets, { recursive: true });
  const src = probe(opt.video);
  if (src.width && src.height && src.width > src.height) {
    console.warn(`warning: the video is landscape (${src.width}x${src.height}); its center is cropped to 9:16.`);
  }
  const bg = join(assets, 'background.mp4');
  run('ffmpeg', ['-v', 'error', '-y', '-i', opt.video, '-an',
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1',
    '-r', '30', '-g', '30', '-keyint_min', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', bg]);

  const musicSrc = opt.music && opt.music !== 'video' ? opt.music : opt.video;
  if (musicSrc === opt.video && !src.hasAudio) throw new Error('The video has no sound. Pass --music <file>.');
  const music = join(assets, 'music.wav');
  run('ffmpeg', ['-v', 'error', '-y', '-i', musicSrc, '-vn', '-ac', '2', '-ar', '44100', '-c:a', 'pcm_s16le', music]);

  let logo = '';
  if (opt.logo) {
    logo = `assets/logo${extname(opt.logo).toLowerCase() || '.png'}`;
    copyFileSync(opt.logo, join(resolve(project), logo));
  }

  const bpm = opt.bpm && opt.bpm !== 'auto' ? Number(opt.bpm) : null;
  const beat = { ...detectBeat(decodeMono(music), 22050, { bpm }), source: bpm ? 'brief' : 'auto' };
  if (beat.confidence < 1.4) console.warn(`warning: no clear beat (confidence ${beat.confidence}); check the timing or pass --bpm.`);

  const media = {
    video: { file: 'assets/background.mp4', source: basename(opt.video), ...probe(bg) },
    music: { file: 'assets/music.wav', source: basename(musicSrc), duration: probe(music).duration },
    logo,
    beat,
  };
  delete media.video.hasAudio;
  writeFileSync(join(assets, 'media.json'), JSON.stringify(media, null, 2) + '\n');
  console.log(`media.json: video ${media.video.duration.toFixed(2)}s, music ${media.music.duration.toFixed(2)}s, ` +
    `${beat.bpm} BPM, first beat ${beat.first}s (confidence ${beat.confidence})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(`error: ${e.message}`); process.exit(1); }
}
