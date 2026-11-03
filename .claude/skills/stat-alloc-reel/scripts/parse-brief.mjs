#!/usr/bin/env node
// Parses a filled-in STAT ALLOC REEL brief (references/brief-template.txt) into reel.json.
// Usage: node parse-brief.mjs <brief.txt> [--out <reel.json>]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SECTIONS = new Set(['VIDEO', 'HOOK', 'HEADER', 'LEVELS', 'SUMMARY', 'CTA']);
const ICONS = new Set(['hammers', 'swords', 'shield', 'staff', 'none']);
const PACES = new Set(['fast', 'normal', 'slow']);
const PANELS = new Set(['frosted', 'light', 'none']);
const STAT_LINE = /^([A-Za-z]{2,4})\s*\+\s*(\d{1,3})\s*(?:=\s*(.*))?$/;
const PLACEHOLDERS = [/^LINE \d$/i, /^STAT$/i, /^reason$/i, /^item$/i];

// Straight quotes to curly, and digit-digit ranges to an en dash.
export function typeset(text) {
  return text
    .replace(/(\d)\s*-\s*(\d)/g, '$1–$2')
    .replace(/"([^"]*)"/g, '“$1”')
    .replace(/(\w)'(\w)/g, '$1’$2')
    .replace(/'([^']*)'/g, '‘$1’');
}

// "*word* plain" -> [{ text: 'word', accent: true }, { text: ' plain', accent: false }]
export function runs(text) {
  const out = [];
  const parts = typeset(text).split('*');
  parts.forEach((part, i) => { if (part) out.push({ text: part, accent: i % 2 === 1 }); });
  return out;
}

// Word list for word-by-word animation; starred words keep their accent.
export function words(text) {
  const list = [];
  for (const run of runs(text)) for (const w of run.text.split(/\s+/)) if (w) list.push({ text: w, accent: run.accent });
  return list;
}

const plain = (rs) => rs.map((r) => r.text).join('');

export function parseBrief(source) {
  const errors = [];
  const warnings = [];
  const reel = {
    version: 1,
    video: { file: '', music: 'video', bpm: 'auto', brandInVideo: true, logo: '', pace: 'normal', panel: 'frosted', accent: '#FFE11A' },
    hook: { lines: [], icon: 'none' },
    header: { title: [], subtitle: [], levelBar: 'BASE LV', maxLevel: 99 },
    bands: [],
    summary: null,
    cta: { lines: [] },
  };
  let section = null;
  const err = (n, msg) => errors.push(`Line ${n}: ${msg}`);
  const placeholder = (s) => PLACEHOLDERS.some((re) => re.test(s.trim()));

  source.split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trim();
    if (!line || line.startsWith('# ') || line === '#' || /^=+.*=+$/.test(line)) return;
    const head = line.match(/^\[([A-Z ]+)\]$/i);
    if (head) {
      section = head[1].trim().toUpperCase();
      if (!SECTIONS.has(section)) err(n, `unknown section [${head[1]}]; use ${[...SECTIONS].map((s) => `[${s}]`).join(' ')}`);
      if (section === 'SUMMARY') reel.summary = { title: runs('THIS GIVES:'), items: [] };
      return;
    }
    const kv = line.match(/^([A-Za-z][A-Za-z ]*?)\s*:\s*(.*)$/);
    const key = kv ? kv[1].toLowerCase() : '';
    const val = kv ? kv[2].trim() : '';

    switch (section) {
      case 'VIDEO': {
        if (!kv) return err(n, 'expected "Name: value" in [VIDEO]');
        const v = reel.video;
        if (key === 'background video') v.file = val;
        else if (key === 'music') v.music = val || 'video';
        else if (key === 'bpm') {
          if (!val || val.toLowerCase() === 'auto') v.bpm = 'auto';
          else if (Number(val) >= 60 && Number(val) <= 200) v.bpm = Number(val);
          else err(n, 'BPM must be "auto" or a number between 60 and 200');
        } else if (key === 'logo and frame already in video') {
          if (!/^(yes|no)$/i.test(val)) err(n, 'write yes or no');
          v.brandInVideo = !/^no$/i.test(val);
        } else if (key === 'logo file') v.logo = val;
        else if (key === 'pace') {
          if (!PACES.has(val.toLowerCase())) err(n, 'Pace must be fast, normal, or slow');
          else v.pace = val.toLowerCase();
        } else if (key === 'panel') {
          if (!PANELS.has(val.toLowerCase())) err(n, 'Panel must be frosted, light, or none');
          else v.panel = val.toLowerCase();
        } else if (key === 'accent color') {
          if (!/^#[0-9a-f]{6}$/i.test(val)) err(n, 'Accent color must look like #FFE11A');
          else v.accent = val.toUpperCase();
        } else warnings.push(`Line ${n}: ignored unknown [VIDEO] field "${kv[1]}"`);
        return;
      }
      case 'HOOK': {
        if (kv && key === 'icon') {
          const icon = val.toLowerCase() || 'none';
          if (!ICONS.has(icon)) err(n, `Icon must be one of ${[...ICONS].join(', ')}`);
          else reel.hook.icon = icon;
          return;
        }
        if (placeholder(line)) return err(n, `replace the placeholder "${line}" with your hook text`);
        if (reel.hook.lines.length === 3) return err(n, 'the hook takes at most 3 lines');
        reel.hook.lines.push(words(line));
        return;
      }
      case 'HEADER': {
        if (!kv) return err(n, 'expected "Title:", "Subtitle:", "Level bar:", or "Max level:"');
        if (key === 'title') reel.header.title = runs(val);
        else if (key === 'subtitle') reel.header.subtitle = runs(val);
        else if (key === 'level bar') reel.header.levelBar = !val || /^off$/i.test(val) ? null : typeset(val).toUpperCase();
        else if (key === 'max level') {
          if (!(Number(val) >= 2 && Number(val) <= 999)) err(n, 'Max level must be a number like 99');
          else reel.header.maxLevel = Number(val);
        } else warnings.push(`Line ${n}: ignored unknown [HEADER] field "${kv[1]}"`);
        return;
      }
      case 'LEVELS': {
        const band = reel.bands[reel.bands.length - 1];
        if (kv && key === 'note') {
          if (!band) return err(n, 'a Note must come after a level label');
          if (val) band.note = runs(val);
          return;
        }
        const stat = line.match(STAT_LINE);
        if (stat) {
          if (!band) return err(n, 'put a level label (e.g. LEVEL 1-10) before the first stat line');
          const [, name, value, desc] = stat;
          if (placeholder(name) || (desc && placeholder(desc))) return err(n, `replace the placeholder "${line}" with a real stat line`);
          band.rows.push({ stat: name.toUpperCase(), value: Number(value), desc: desc ? runs(desc.trim()) : null });
          return;
        }
        if (/\+/.test(line) && /^[A-Za-z]{2,4}\s*\+/.test(line)) return err(n, 'a stat line needs a number after "+", e.g. DEX + 20 = reason');
        const label = typeset(line).toUpperCase();
        const nums = label.match(/\d+/g);
        reel.bands.push({ label, level: nums ? Number(nums[nums.length - 1]) : null, note: null, rows: [], line: n });
        return;
      }
      case 'SUMMARY': {
        if (kv && key === 'title') { reel.summary.title = runs(val || 'THIS GIVES:'); return; }
        const item = line.match(/^[-•]\s*(.+)$/);
        if (!item) return err(n, 'summary items start with "- "');
        if (placeholder(item[1])) return err(n, `replace the placeholder "${item[1]}"`);
        reel.summary.items.push(runs(item[1]));
        return;
      }
      case 'CTA': {
        if (reel.cta.lines.length === 2) return err(n, 'the CTA takes at most 2 lines');
        reel.cta.lines.push(words(line));
        return;
      }
      default:
        err(n, 'text before the first [SECTION] heading');
    }
  });

  if (!reel.video.file) warnings.push('[VIDEO] Background video is empty; pass the file to prepare-media.mjs instead.');
  if (!reel.video.brandInVideo && !reel.video.logo) warnings.push('[VIDEO] No logo file: the gold frame is added without a logo.');
  if (!reel.hook.lines.length) errors.push('[HOOK] needs at least one line.');
  if (!reel.header.title.length) errors.push('[HEADER] needs a Title.');
  if (!reel.bands.length) errors.push('[LEVELS] needs at least one level band.');
  reel.bands.forEach((band, i) => {
    const prev = reel.bands[i - 1];
    if (!prev) return;
    if (prev.label === band.label) warnings.push(`Line ${band.line}: "${band.label}" repeats the band above; check for a copy-paste slip.`);
    else if (band.level !== null && prev.level !== null && band.level <= prev.level) warnings.push(`Line ${band.line}: "${band.label}" does not go past the band above (${prev.label}).`);
  });
  for (const band of reel.bands) {
    if (!band.rows.length) errors.push(`Line ${band.line}: level band "${band.label}" has no stat lines.`);
    if (reel.header.levelBar && band.level === null) warnings.push(`Line ${band.line}: "${band.label}" has no number, so the level bar skips it.`);
    if (band.level !== null && band.level > reel.header.maxLevel) errors.push(`Line ${band.line}: "${band.label}" goes past Max level ${reel.header.maxLevel}.`);
    delete band.line;
  }
  if (reel.summary && !reel.summary.items.length) reel.summary = null;
  if (!reel.cta.lines.length) errors.push('[CTA] needs at least one line.');
  const rows = reel.bands.reduce((a, b) => a + b.rows.length, 0);
  if (rows > 26) errors.push(`${rows} stat lines will not fit one screen; keep it to about 24 or split the guide into two reels.`);
  return { reel, errors, warnings, summary: `${reel.bands.length} level bands, ${rows} stat lines, ${reel.summary ? reel.summary.items.length : 0} summary items` };
}

export const plainText = plain;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [file, flag, out] = process.argv.slice(2);
  if (!file) {
    console.log('Usage: node parse-brief.mjs <brief.txt> [--out <reel.json>]');
    process.exit(1);
  }
  const { reel, errors, warnings, summary } = parseBrief(readFileSync(file, 'utf8'));
  for (const w of warnings) console.warn(`warning: ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`error: ${e}`);
    process.exit(1);
  }
  const dest = flag === '--out' && out ? out : file.replace(/\.[^.]+$/, '') + '.reel.json';
  writeFileSync(dest, JSON.stringify(reel, null, 2) + '\n');
  console.log(`${dest}: ${summary}`);
}
