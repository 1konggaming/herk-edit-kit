import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseBrief } from '../.agents/skills/stat-alloc-reel/scripts/parse-brief.mjs';
import { planReel, planLayout } from '../.agents/skills/stat-alloc-reel/scripts/plan-reel.mjs';
import { renderHtml } from '../.agents/skills/stat-alloc-reel/scripts/build-reel.mjs';

const root = resolve(import.meta.dirname, '..');
const refs = join(root, '.agents/skills/stat-alloc-reel/references');
const example = () => parseBrief(readFileSync(join(refs, 'example-brief.txt'), 'utf8'));
const beat = { bpm: 130, period: 0.4616, first: 0.435 };
const media = { video: { file: 'assets/background.mp4', duration: 40 }, music: { file: 'assets/music.wav', duration: 40 }, logo: '', beat };
const onBeat = (t) => Math.abs(((t - beat.first) / beat.period) - Math.round((t - beat.first) / beat.period)) < 0.01;

test('the example brief parses into five bands with typeset labels', () => {
  const { reel, errors } = example();
  assert.deepEqual(errors, []);
  assert.equal(reel.bands.length, 5);
  assert.equal(reel.bands.reduce((a, b) => a + b.rows.length, 0), 18);
  assert.equal(reel.bands[0].label, 'LEVEL 1–10');
  assert.equal(reel.bands[4].level, 99);
  assert.equal(reel.header.subtitle[0].text, '“PROPER”');
  assert.equal(reel.header.subtitle[0].accent, true);
  assert.equal(reel.summary.items.length, 5);
  assert.equal(reel.cta.lines[1][0].accent, true);
});

test('the blank template is rejected until its placeholders are filled', () => {
  const { errors } = parseBrief(readFileSync(join(refs, 'brief-template.txt'), 'utf8'));
  assert.ok(errors.some((e) => e.includes('placeholder "LINE 1"')));
  assert.ok(errors.some((e) => e.includes('STAT + 0 = reason')));
  assert.ok(errors.some((e) => e.includes('needs a Title')));
});

test('a repeated level band is flagged, not silently renamed', () => {
  const brief = '[HOOK]\nGO\n[HEADER]\nTitle: T\n[LEVELS]\nLEVEL 70-90\nSTR + 1\nLEVEL 70-90\nSTR + 2\n[CTA]\nFOLLOW\n';
  const { reel, warnings } = parseBrief(brief);
  assert.equal(reel.bands[1].label, 'LEVEL 70–90');
  assert.ok(warnings.some((w) => w.includes('repeats the band above')));
});

test('every pill and row lands on the beat, in order, one step apart', () => {
  const { timing: t } = planReel(example().reel, media);
  const marks = t.bands.flatMap((b) => [b.pill, ...b.rows]);
  for (const m of marks) assert.ok(onBeat(m), `${m}s is off the beat grid`);
  for (let i = 1; i < marks.length; i++) assert.ok(marks[i] - marks[i - 1] >= t.rowStep - 0.01, `entrances at ${marks[i - 1]}s and ${marks[i]}s are too close`);
  assert.ok(t.hook.flat().every((h) => h < t.header));
  assert.ok(t.summary > marks.at(-1) && t.exit > t.summary);
  assert.ok(t.exit < t.ctaStart && t.ctaStart < t.underline && t.underline < t.duration);
});

test('the panel finishes growing before each row it serves', () => {
  const { timing: t, growth, layout } = planReel(example().reel, media);
  let last = 0;
  for (const [start, dur, height] of growth) {
    assert.ok(height > last);
    last = height;
    assert.ok(start >= 0 && dur > 0);
  }
  t.bands.forEach((b, i) => b.rows.forEach((rt, j) => {
    const need = layout.guide.bands[i].rows[j].top + layout.guide.S.statRow - 200;
    const ready = growth.filter(([s, d]) => s + d <= rt + 1e-6).map(([, , h]) => h);
    assert.ok(ready.length && Math.max(...ready) >= need, `row at ${rt}s lands before the panel reaches it`);
  }));
});

test('the example layout fits the panel at full scale with the summary beside the last band', () => {
  const { guide, warnings } = planLayout(example().reel);
  assert.equal(guide.s, 1);
  assert.ok(guide.bottom <= 1572);
  assert.equal(guide.summary.mode, 'beside');
  assert.deepEqual(warnings, []);
});

test('a longer guide scales down, and one that cannot fit is refused', () => {
  const { reel } = example();
  const extra = JSON.parse(JSON.stringify(reel.bands[2]));
  reel.bands.push({ ...extra, label: 'LEVEL 99–120', level: 120 });
  reel.header.maxLevel = 120;
  const { guide } = planLayout(reel);
  assert.ok(guide.s < 1 && guide.s >= 0.68);
  assert.ok(guide.bottom <= 1572 + 1);
  for (let i = 0; i < 4; i++) reel.bands.push(JSON.parse(JSON.stringify(extra)));
  assert.throws(() => planLayout(reel), /too long for one screen/);
});

test('the composition registers one root timeline and keeps every clip on its own track', () => {
  const { reel } = example();
  const plan = planReel(reel, media);
  const html = renderHtml(reel, media, plan, { video: 'assets/background.mp4', music: 'assets/music-fit.wav' });
  assert.match(html, /data-composition-id="root" data-start="0" data-duration="[\d.]+"/);
  assert.match(html, /window\.__timelines\['root'\] = tl/);
  const clips = [...html.matchAll(/data-start="([\d.]+)" data-duration="([\d.]+)" data-track-index="(\d+)"/g)].map((m) => m.slice(1).map(Number));
  const tracks = new Map();
  for (const [s, d, k] of clips) {
    assert.ok(s + d <= plan.timing.duration + 1e-6, `track ${k} runs past the end`);
    assert.ok(!tracks.has(k), `track ${k} is used twice`);
    tracks.set(k, true);
  }
  assert.ok(!/Math\.random|Date\.now|repeat:\s*-1/.test(html));
});
