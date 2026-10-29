// Turns reel.json (from parse-brief.mjs) and media.json (from prepare-media.mjs)
// into a frame-accurate plan: beat-locked timing and an auto-fitted 1080x1920 layout.
import { textWidth, fitSize } from './font-metrics.mjs';

export const FRAME = { width: 1080, height: 1920, fps: 30 };
const PANEL_TOP = 200;
const PANEL_MAX_BOTTOM = 1572;
const LEFT = 30;
const RIGHT = 1060;
const TEXT_MAX = 1000;
const BASE = {
  pad: 14, pillRow: 70, pillNoteRow: 82, statRow: 52, gap: 8,
  pillH: 60, pillFont: 34, pillPadX: 26, sn: 46, plus: 38, num: 46, desc: 34,
  note: 26, sumTitle: 38, sumItem: 27, sumGap: 5, sumPadY: 12, sumPadX: 22, tick: 16,
};
const PACE = { fast: [1, 0.42, 0.8], normal: [2, 0.8, 1.3], slow: [3, 1.15, 1.8] };

const r3 = (n) => Math.round(n * 1000) / 1000;
const plain = (runs) => runs.map((r) => r.text).join('');
const wordsText = (ws) => ws.map((w) => w.text).join(' ');

// ---- Timing -------------------------------------------------------------------------------

function beatGrid(beat) {
  const { period } = beat;
  const first = beat.first;
  return {
    period,
    at: (i) => first + i * period,
    // First beat at or after t.
    after: (t) => first + Math.max(0, Math.ceil((t - first) / period - 1e-6)) * period,
  };
}

function rowStepBeats(pace, period) {
  const [beats, min, max] = PACE[pace] ?? PACE.normal;
  let k = beats;
  while (k * period < min) k++;
  while (k > 1 && k * period > max) k--;
  return k;
}

export function planTiming(reel, beat) {
  const g = beatGrid(beat);
  const P = g.period;
  const step = rowStepBeats(reel.video.pace, P) * P;
  const hookStep = Math.ceil(0.4 / P - 1e-6) * P;
  const lead = g.after(0.3);

  // Hook: line 1 at 0.1 s, each later line on the next hook step; words stagger inside a line.
  const stagger = Math.min(0.115, P / 4);
  const hook = reel.hook.lines.map((line, i) => {
    const start = i === 0 ? 0.1 : lead + (i - 1) * hookStep;
    return line.map((_, j) => r3(start + j * stagger));
  });
  const lastWord = hook[hook.length - 1][hook[hook.length - 1].length - 1];
  const icon = reel.hook.icon !== 'none' ? r3(lead + (hook.length - 1) * hookStep) : null;
  const header = r3(g.after(Math.max(lastWord + 0.75, (icon ?? 0) + 0.4, 1.3)));
  const hookExit = r3(header - 0.04);

  // Guide: band 1 opens with the header; rows every step; a new band takes one extra beat.
  let t = header;
  const bands = reel.bands.map((band, i) => {
    if (i > 0) t += step + P;
    const pill = r3(t);
    const rows = band.rows.map(() => r3((t += step)));
    return { pill, rows };
  });
  const lastRow = t;
  const summary = reel.summary ? r3(lastRow + step) : null;
  const summaryItems = reel.summary ? reel.summary.items.map((_, i) => r3(summary + 0.16 + i * 0.1)) : [];
  const exit = r3((summary ?? lastRow) + 2 * step);

  // CTA: line 1 half a beat after the exit, line 2 a beat later, then underline and pulses on beats.
  const ctaWords = reel.cta.lines.map((line, i) => {
    const start = exit + (i === 0 ? P / 2 : P * 1.5);
    return line.map((_, j) => r3(start + j * stagger));
  });
  const ctaStart = r3(ctaWords[0][0] - 0.05);
  const underline = r3(exit + 2 * P);
  const end = Math.ceil((underline + 1.6) * FRAME.fps) / FRAME.fps;
  const pulses = [];
  for (let b = underline + P; b < end - 0.4; b += P) pulses.push(r3(b));

  return {
    beat: { bpm: beat.bpm, period: P, first: beat.first },
    rowStep: r3(step), hook, hookExit, icon, header, bands, summary, summaryItems,
    exit, ctaStart, ctaWords, underline, sparks: underline, pulses, duration: r3(end),
  };
}

// ---- Layout -------------------------------------------------------------------------------

function wrapLines(text, font, size, width) {
  const space = textWidth(' ', font, size);
  let lines = 1, x = 0;
  for (const w of text.split(/\s+/)) {
    const ww = textWidth(w, font, size);
    if (x && x + space + ww > width) { lines++; x = ww; } else x += (x ? space : 0) + ww;
  }
  return lines;
}

function hookLayout(reel) {
  const n = reel.hook.lines.length;
  const base = [[132], [124, 110], [118, 102, 96]][n - 1];
  const sizes = reel.hook.lines.map((line, i) => {
    const one = line.reduce((a, w) => a + textWidth(w.text, 'm900', 1, -0.01), 0) + 0.24 * (line.length - 1);
    return Math.floor(Math.min(base[i], (TEXT_MAX * 0.97) / one));
  });
  const iconH = reel.hook.icon !== 'none' ? 170 : 0;
  const height = iconH + sizes.reduce((a, s) => a + s * 1.04, 0);
  const top = Math.round(490 - height / 2);
  return { sizes, iconH, top, scrimTop: top - 20, scrimHeight: Math.round(height + 80) };
}

function headerLayout(reel) {
  const title = fitSize(plain(reel.header.title), 'anton', 68, TEXT_MAX, { letterSpacing: 0.01 });
  const subtitle = reel.header.subtitle.length ? fitSize(plain(reel.header.subtitle), 'anton', 43, TEXT_MAX, { letterSpacing: 0.02 }) : 0;
  return { title, subtitle, bar: Boolean(reel.header.levelBar), maxDigits: String(reel.header.maxLevel).length };
}

function ctaLayout(reel) {
  const lines = reel.cta.lines;
  const one = lines.map((ws) => ws.reduce((a, w) => a + textWidth(w.text, 'anton', 1, 0.01), 0) + 0.22 * (ws.length - 1));
  const size = Math.floor(Math.min(124, ...one.map((w) => (TEXT_MAX * 0.97) / w)));
  const lh = size * 1.04;
  const height = lh * lines.length;
  const top = Math.round(550 - height / 2);
  const widths = one.map((w) => w * size);
  const starts = widths.map((w) => (FRAME.width - w) / 2);
  // Underline the first accent word of the last line, else the whole last line.
  const last = lines.length - 1;
  const ws = lines[last];
  let k = ws.findIndex((w) => w.accent);
  let x = starts[last], w = widths[last];
  if (k >= 0) {
    x = starts[last] + ws.slice(0, k).reduce((a, v) => a + textWidth(v.text, 'anton', size, 0.01) + 0.22 * size, 0);
    w = textWidth(ws[k].text, 'anton', size, 0.01);
  }
  return {
    size, top, scrimTop: top - 70, scrimHeight: Math.round(height + 210),
    underline: { left: Math.round(x - 12), top: Math.round(height + 10), width: Math.round(w + 50) },
    marksLeft: { left: Math.round(starts[0] - 14), top: 30 },
    marksRight: { left: Math.round(starts[last] + widths[last] + 12), top: Math.round(height + 12) },
  };
}

function guideLayout(reel, s, warnings) {
  const S = Object.fromEntries(Object.entries(BASE).map(([k, v]) => [k, v * s]));
  const pillW = (label) => textWidth(label, 'm900', S.pillFont, 0.01) + 2 * S.pillPadX;
  const maxPillW = Math.max(...reel.bands.map((b) => pillW(b.label)));
  const stats = reel.bands.flatMap((b) => b.rows);
  const snW = Math.max(...stats.map((r) => textWidth(r.stat, 'm900', S.sn))) + 6;
  const plusW = 42 * s;
  const digits = Math.max(...stats.map((r) => String(r.value).length));
  const numW = digits * Math.max(...'0123456789'.split('').map((d) => textWidth(d, 'm900', S.num))) + 10;
  const descLeft = LEFT + snW + plusW + numW + 12 * s;
  const descWidth = RIGHT - descLeft;
  const noteLeft = LEFT + maxPillW + 18 * s;
  const noteWidth = RIGHT - noteLeft;

  let y = PANEL_TOP + S.pad;
  const bands = reel.bands.map((band, bi) => {
    let noteSize = S.note;
    if (band.note) {
      while (noteSize > 19 && wrapLines('= ' + plain(band.note), 'm600', noteSize, noteWidth * 0.97) > 2) noteSize -= 0.5;
      if (wrapLines('= ' + plain(band.note), 'm600', noteSize, noteWidth * 0.97) > 2) warnings.push(`Note under "${band.label}" is long; it may run to three lines.`);
    }
    const h = band.note ? S.pillNoteRow : S.pillRow;
    const pill = { top: y, height: h, width: pillW(band.label), noteSize };
    y += h;
    const rows = band.rows.map((row) => {
      let descSize = S.desc;
      if (row.desc) {
        const text = '= ' + plain(row.desc);
        descSize = fitSize(text, 'm600', S.desc, descWidth, { min: 1 });
        if (descSize < 22) warnings.push(`"${row.stat} + ${row.value}" description is long; shrunk to ${descSize}px.`);
      }
      const r = { top: y, descSize };
      y += S.statRow;
      return r;
    });
    const last = bi === reel.bands.length - 1;
    if (!last) y += S.gap;
    return { pill, rows, bottomAfterPill: pill.top + h, top: pill.top };
  });

  let summary = null;
  if (reel.summary) {
    const items = reel.summary.items;
    const lastBand = reel.bands[reel.bands.length - 1];
    const lastBox = bands[bands.length - 1];
    const besideOk = lastBand.rows.every((r) => !r.desc);
    const measure = (left, width) => {
      const avail = width - 2 * S.sumPadX - S.tick - 14 * s;
      const sizes = items.map((it) => fitSize(plain(it), 'm700', S.sumItem, avail, { min: 1 }));
      const size = Math.min(...sizes);
      const height = 2 * S.sumPadY + S.sumTitle * 1.1 + 6 * s + items.length * size * 1.2 + (items.length - 1) * S.sumGap;
      return { left, width, size, height };
    };
    const beside = measure(noteLeft, RIGHT + 2 - noteLeft);
    const room = y - lastBox.top - 6 * s;
    if (besideOk && beside.height <= room && beside.size >= 21) {
      summary = { ...beside, top: lastBox.top + 4 * s, height: room, mode: 'beside' };
    } else {
      y += S.gap;
      const below = measure(LEFT, RIGHT - LEFT);
      summary = { ...below, top: y, mode: 'below' };
      y += below.height;
    }
    if (summary.size < 20) warnings.push(`A summary item is long; items shrunk to ${summary.size}px.`);
  }
  const bottom = y + S.pad;
  return { s, S, snW, plusW, numW, descLeft, noteLeft, noteWidth, bands, summary, bottom };
}

export function planLayout(reel) {
  const warnings = [];
  let layout = guideLayout(reel, 1, warnings);
  const fit = (PANEL_MAX_BOTTOM - PANEL_TOP) / (layout.bottom - PANEL_TOP);
  const s = Math.min(1.15, fit);
  if (s < 0.68) throw new Error(`The guide is too long for one screen (${Math.round(100 / fit)}% of the space). Remove rows or split it into two reels.`);
  if (Math.abs(s - 1) > 0.005) {
    warnings.length = 0;
    layout = guideLayout(reel, Math.floor(s * 1000) / 1000, warnings);
  }
  return { hook: hookLayout(reel), header: headerLayout(reel), cta: ctaLayout(reel), guide: layout, warnings };
}

// Panel heights to reach just before each new pill or row lands.
export function panelGrowth(timing, guide) {
  const needs = [];
  timing.bands.forEach((b, i) => {
    const box = guide.bands[i];
    needs.push({ t: b.pill, bottom: box.bottomAfterPill });
    b.rows.forEach((t, j) => needs.push({ t, bottom: box.rows[j].top + guide.S.statRow }));
  });
  if (timing.summary !== null && guide.summary?.mode === 'below') needs.push({ t: timing.summary, bottom: guide.summary.top + guide.summary.height });
  const steps = [];
  let current = 0, prevEnd = 0;
  needs.forEach((n, i) => {
    const height = Math.round(n.bottom + guide.S.pad - PANEL_TOP);
    if (height <= current) return;
    const start = i === 0 ? timing.header - 0.1 : Math.max(n.t - 0.28, prevEnd);
    const end = i === 0 ? timing.header + 0.16 : n.t;
    steps.push([r3(start), r3(Math.max(0.08, end - start)), height]);
    current = height;
    prevEnd = end;
  });
  return steps;
}

export function planReel(reel, media) {
  const timing = planTiming(reel, media.beat);
  const layout = planLayout(reel);
  const growth = panelGrowth(timing, layout.guide);
  const warnings = [...layout.warnings];
  if (media.video.duration + 0.05 < timing.duration) warnings.push(`The video is ${media.video.duration.toFixed(1)}s but the reel runs ${timing.duration.toFixed(1)}s; the video loops.`);
  if (media.music.duration + 0.05 < timing.duration) warnings.push(`The music is ${media.music.duration.toFixed(1)}s but the reel runs ${timing.duration.toFixed(1)}s; the music loops.`);
  return { timing, layout, growth, warnings, panelTop: PANEL_TOP, text: { hook: reel.hook.lines.map(wordsText) } };
}
