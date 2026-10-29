#!/usr/bin/env node
// Builds a STAT ALLOC REEL composition (index.html) from reel.json and assets/media.json.
// Usage: node build-reel.mjs <project> [--reel <reel.json>]
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planReel, FRAME } from './plan-reel.mjs';

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const px = (n) => `${Math.round(n * 10) / 10}px`;
const runsHtml = (runs, accentClass = 'y') => runs.map((r) => (r.accent ? `<span class="${accentClass}">${esc(r.text)}</span>` : esc(r.text))).join('');

// ---- Color helpers for a custom accent --------------------------------------------------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
function palette(accent) {
  if (accent === '#FFE11A') return { yellow: '#FFE11A', gold: '#F2B705', pillTop: '#FFF06A', pillMid: '#FFD21A', pillShadow: '#8A5A00' };
  return { yellow: accent, gold: mix(accent, '#8A5A00', 0.3), pillTop: mix(accent, '#FFFFFF', 0.35), pillMid: accent, pillShadow: mix(accent, '#120C04', 0.6) };
}

// ---- Icons ----------------------------------------------------------------------------
const GRAD = `<defs><linearGradient id="hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF3A0"/><stop offset=".55" stop-color="var(--gold)"/><stop offset="1" stop-color="#8A5A00"/></linearGradient></defs>`;
const ICONS = {
  hammers: () => {
    const one = (a) => `<g transform="rotate(${a} 80 84)"><rect x="72" y="40" width="16" height="112" rx="7" fill="#8B5A2B" stroke="#120C04" stroke-width="6"/>` +
      `<rect x="34" y="10" width="92" height="40" rx="7" fill="url(#hg)" stroke="#120C04" stroke-width="6"/><rect x="42" y="17" width="76" height="8" rx="4" fill="#FFF8C8" opacity=".8"/></g>`;
    return one(-38) + one(38);
  },
  swords: () => {
    const one = (a) => `<g transform="rotate(${a} 80 88)"><polygon points="73,112 73,28 80,6 87,28 87,112" fill="url(#hg)" stroke="#120C04" stroke-width="5" stroke-linejoin="round"/>` +
      `<line x1="80" y1="22" x2="80" y2="106" stroke="#FFF8C8" stroke-width="3" opacity=".7"/><rect x="54" y="108" width="52" height="12" rx="5" fill="url(#hg)" stroke="#120C04" stroke-width="5"/>` +
      `<rect x="74" y="120" width="12" height="30" rx="4" fill="#8B5A2B" stroke="#120C04" stroke-width="5"/><circle cx="80" cy="156" r="9" fill="url(#hg)" stroke="#120C04" stroke-width="5"/></g>`;
    return one(-36) + one(36);
  },
  shield: () => `<path d="M80 8 L142 28 L136 96 Q126 142 80 164 Q34 142 24 96 L18 28 Z" fill="url(#hg)" stroke="#120C04" stroke-width="7" stroke-linejoin="round"/>` +
    `<path d="M80 30 L122 44 L118 94 Q110 126 80 142 Q50 126 42 94 L38 44 Z" fill="#7A1E12" stroke="#120C04" stroke-width="4"/>` +
    `<rect x="73" y="40" width="14" height="96" rx="3" fill="url(#hg)" stroke="#120C04" stroke-width="3"/><rect x="44" y="72" width="72" height="14" rx="3" fill="url(#hg)" stroke="#120C04" stroke-width="3"/>`,
  staff: () => `<g transform="rotate(18 80 90)"><rect x="73" y="54" width="14" height="112" rx="6" fill="#8B5A2B" stroke="#120C04" stroke-width="6"/>` +
    `<path d="M80 66 C56 60 52 30 64 14 M80 66 C104 60 108 30 96 14" fill="none" stroke="#120C04" stroke-width="12" stroke-linecap="round"/>` +
    `<path d="M80 66 C56 60 52 30 64 14 M80 66 C104 60 108 30 96 14" fill="none" stroke="url(#hg)" stroke-width="6" stroke-linecap="round"/>` +
    `<circle cx="80" cy="38" r="17" fill="#FF8A1F" stroke="#120C04" stroke-width="5"/><circle cx="74" cy="32" r="6" fill="#FFF3A0"/></g>`,
};

// ---- Digit strips ---------------------------------------------------------------------
function strip(count, index = 0) {
  let s = '';
  for (let i = 0; i < count; i++) s += `<i>${i % 10}</i>`;
  return `<span class="d"><span class="strip" data-index="${index}" data-count="${count}">${s}</span></span>`;
}
const rollNumber = (value) => String(value).split('').map((c) => strip(20, 10 + Number(c))).join('');

// Level-bar counter: each digit only ever rolls forward; the ones digit spins a full turn per step.
function levelCounter(levels, digits) {
  const pos = Array.from({ length: digits }, () => ({ index: 0, steps: [] }));
  levels.forEach((lv, k) => {
    const ds = String(lv).padStart(digits, '0').split('').map(Number);
    ds.forEach((d, p) => {
      const cur = pos[p];
      let next = cur.index + ((d - (cur.index % 10) + 10) % 10);
      if (p === digits - 1) next += 10;
      cur.index = next;
      cur.steps.push({ index: next, visible: p === digits - 1 || lv >= 10 ** (digits - 1 - p), step: k });
    });
  });
  return pos.map((p) => ({ count: Math.ceil((p.index + 1) / 10) * 10, steps: p.steps }));
}

export function renderHtml(reel, media, plan, files) {
  const { timing: T, layout: L, growth } = plan;
  const G = L.guide, S = G.S;
  const C = palette(reel.video.accent);
  const panel = reel.video.panel;
  const D = T.duration;
  const r3 = (n) => Math.round(n * 1000) / 1000;

  // Hook
  const hookLines = reel.hook.lines.map((line, i) =>
    `<div class="hl" style="font-size:${px(L.hook.sizes[i])}">${line.map((w, j) => `<span class="hw ink" data-t="${T.hook[i][j]}">${esc(w.text)}</span>`).join('')}</div>`).join('');
  const rays = [-84, -42, 0, 42, 84].map((a) => `<span class="ray" style="--a:${a}deg"><i class="spark"></i></span>`).join('');
  const icon = reel.hook.icon !== 'none'
    ? `<div id="hook-icon">${rays}<svg viewBox="0 0 160 170" width="160" height="170" aria-hidden="true">${GRAD}${ICONS[reel.hook.icon]()}</svg></div>` : '';

  // Header
  const levels = reel.bands.map((b) => b.level).filter((v) => v !== null);
  const counter = levelCounter(levels, L.header.maxDigits);
  const levelBar = L.header.bar
    ? `<div id="xp"><div id="xp-track"><div id="xp-fill"></div></div><div id="xp-label" class="ink">${esc(reel.header.levelBar)} <span class="num ink">${counter.map((c) => strip(c.count)).join('')}</span></div></div>` : '';
  const subtitle = reel.header.subtitle.length ? `<div id="h-sub" class="ink" style="font-size:${px(L.header.subtitle)}">${runsHtml(reel.header.subtitle)}</div>` : '';

  // Guide rows
  const rows = [];
  let levelStep = 0;
  reel.bands.forEach((band, bi) => {
    const box = G.bands[bi];
    const tb = T.bands[bi];
    const lvIndex = band.level === null ? -1 : levelStep++;
    const note = band.note ? `<div class="note ink" style="font-size:${px(box.pill.noteSize)}"><b>=</b> ${runsHtml(band.note)}</div>` : '';
    rows.push(`<div class="pill-row" style="top:${px(box.pill.top)};height:${px(box.pill.height)}" data-t="${tb.pill}" data-lv="${band.level ?? ''}" data-step="${lvIndex}">` +
      `<div class="pill"><span class="pill-text">${esc(band.label)}</span><i class="shine"></i></div>${note}</div>`);
    band.rows.forEach((row, ri) => {
      const words = row.desc ? row.desc.flatMap((r) => r.text.split(/(\s+)/).filter((w) => w.trim()).map((w) => (r.accent ? `<span class="w y">${esc(w)}</span>` : `<span class="w">${esc(w)}</span>`))).join(' ') : '';
      const desc = row.desc ? `<span class="desc ink" style="font-size:${px(box.rows[ri].descSize)}"><b class="w">=</b> ${words}</span>` : '';
      rows.push(`<div class="stat-row" style="top:${px(box.rows[ri].top)}" data-t="${tb.rows[ri]}"><i class="glow"></i>` +
        `<span class="sn ink">${esc(row.stat)}</span><span class="plus ink">+</span><span class="num ink">${rollNumber(row.value)}</span>${desc}</div>`);
    });
  });
  const sm = G.summary;
  const summary = sm
    ? `<div id="summary" style="left:${px(sm.left)};top:${px(sm.top)};width:${px(sm.width)};height:${px(sm.height)}" data-t="${T.summary}">` +
      `<div class="sum-title ink">${runsHtml(reel.summary.title)}</div><ul>` +
      reel.summary.items.map((it, i) => `<li data-t="${T.summaryItems[i]}" style="font-size:${px(sm.size)}"><i class="tick"></i><span class="ink">${runsHtml(it, 'em')}</span></li>`).join('') +
      `</ul></div>` : '';

  // CTA
  const ctaLines = reel.cta.lines.map((line, i) =>
    `<div class="cl cl${i + 1}">${line.map((w, j) => `<span class="cw ink${w.accent ? ' y' : ''}" data-t="${T.ctaWords[i][j]}">${esc(w.text)}</span>`).join('')}</div>`).join('');
  const U = L.cta.underline;
  const uPath = `M8 40 C ${r3(U.width * 0.23)} 18, ${r3(U.width * 0.58)} 52, ${U.width - 8} 22`;
  const marks = (id, pos, angles) => `<div class="marks" id="${id}" style="left:${px(pos.left)};top:${px(pos.top)}">${angles.map((a) => `<span class="ray" style="--a:${a}deg"><i class="mark"></i></span>`).join('')}</div>`;

  // Optional frame and logo when the footage has neither
  const brand = reel.video.brandInVideo ? '' :
    `<div id="brand" class="clip layer" data-start="0" data-duration="${D}" data-track-index="7"><i class="fr fr-l"></i><i class="fr fr-r"></i><i class="fr fr-b"></i>` +
    (media.logo ? `<img id="logo" src="${esc(media.logo)}" alt="">` : '') + `</div>`;

  const panelCss = {
    frosted: `background:rgba(18,12,4,.58);-webkit-backdrop-filter:blur(24px) saturate(.55) brightness(.72);backdrop-filter:blur(24px) saturate(.55) brightness(.72);box-shadow:inset 0 0 0 2px rgba(242,183,5,.6),0 18px 40px rgba(0,0,0,.45)`,
    light: `background:rgba(18,12,4,.34);-webkit-backdrop-filter:blur(12px) saturate(.8) brightness(.86);backdrop-filter:blur(12px) saturate(.8) brightness(.86);box-shadow:inset 0 0 0 2px rgba(242,183,5,.5)`,
    none: `background:transparent`,
  }[panel];
  const scrimCss = {
    frosted: `-webkit-backdrop-filter:blur(22px) saturate(.6) brightness(.7);backdrop-filter:blur(22px) saturate(.6) brightness(.7);background:rgba(18,12,4,.38)`,
    light: `-webkit-backdrop-filter:blur(12px) saturate(.8) brightness(.85);backdrop-filter:blur(12px) saturate(.8) brightness(.85);background:rgba(18,12,4,.2)`,
    none: '',
  }[panel];
  const bandCss = panel === 'none'
    ? 'background:linear-gradient(180deg,rgba(18,12,4,.75),rgba(18,12,4,.45) 70%,rgba(18,12,4,0))'
    : 'background:linear-gradient(180deg,rgba(18,12,4,.94),rgba(18,12,4,.84) 70%,rgba(18,12,4,.62));-webkit-backdrop-filter:blur(16px) saturate(.7);backdrop-filter:blur(16px) saturate(.7)';
  const extraInk = panel === 'none' ? 2 : 0;
  const scrims = panel !== 'none';

  const runtime = {
    T, growth, panelTop: plan.panelTop,
    counter: counter.map((c) => c.steps),
    levelSteps: levels.map((lv) => lv / reel.header.maxLevel),
  };

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(reel.header.title.map((r) => r.text).join(''))}</title>
<script src="assets/gsap.min.js"></script>
<style>
@font-face{font-family:"Anton";src:url("assets/fonts/anton-latin.woff2") format("woff2");font-weight:400;font-style:normal;font-display:block}
@font-face{font-family:"ReelSans";src:url("assets/fonts/montserrat-latin.woff2") format("woff2");font-weight:100 900;font-style:normal;font-display:block}
*{box-sizing:border-box;margin:0;padding:0}
:root{--yellow:${C.yellow};--gold:${C.gold};--ink:#120C04;--parch:#F7F1E6;--ember:#FF8A1F}
html,body{width:1080px;height:1920px;overflow:hidden;background:#120C04}
#root{position:relative;width:1080px;height:1920px;overflow:hidden;background:var(--ink);font-family:"ReelSans",sans-serif;color:var(--parch)}
#bg-wrap{position:absolute;left:0;top:0;width:1080px;height:1920px;z-index:0}
#bg{display:block;width:1080px;height:1920px;object-fit:cover}
.layer{position:absolute;left:0;top:0;width:1080px;height:1920px;pointer-events:none}
#brand{z-index:3}#hook{z-index:5}#panel{z-index:5}#header{z-index:6}#cta-scrim{z-index:4}#cta{z-index:7}
.ink{paint-order:stroke fill;-webkit-text-stroke:calc(var(--sw,6px) + ${extraInk}px) var(--ink)}
.y{color:var(--yellow)}
.scrim{${scrimCss};-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 16%,#000 84%,transparent 100%);mask-image:linear-gradient(180deg,transparent 0,#000 16%,#000 84%,transparent 100%)}

/* Optional frame and logo */
.fr{position:absolute;display:block;background:linear-gradient(180deg,var(--gold),#FFF3A0 50%,var(--gold));box-shadow:0 0 10px rgba(255,225,26,.45)}
.fr-l{left:24px;top:200px;width:3px;height:1690px}.fr-r{right:24px;top:200px;width:3px;height:1690px}.fr-b{left:24px;top:1887px;width:1032px;height:3px}
#logo{position:absolute;left:50%;bottom:28px;max-width:480px;max-height:300px;transform:translateX(-50%);filter:drop-shadow(0 8px 16px rgba(0,0,0,.6))}

/* Hook */
#hook-scrim{position:absolute;left:0;top:${px(L.hook.scrimTop)};width:1080px;height:${px(L.hook.scrimHeight)}}
#hook-text{position:absolute;left:0;top:${px(L.hook.top)};width:1080px;display:flex;flex-direction:column;align-items:center}
#hook-icon{position:relative;width:160px;height:170px;margin-bottom:-6px}
#hook-icon svg{position:relative;z-index:1;filter:drop-shadow(0 6px 0 #120C04)}
.hl{display:flex;gap:.24em;justify-content:center;white-space:nowrap;font-weight:900;color:var(--yellow);line-height:1.04;letter-spacing:-.01em;--sw:16px;text-shadow:0 7px 0 var(--ink)}
.hw{display:inline-block}
.ray{position:absolute;left:50%;top:50%;width:0;height:0;transform:rotate(var(--a))}
.ray i{position:absolute;display:block;transform-origin:50% 100%}
.spark{left:-5px;top:-122px;width:10px;height:36px;border-radius:4px;background:var(--yellow);box-shadow:0 0 10px var(--ember),0 0 0 2px var(--ink)}

/* Header */
#header-band{position:absolute;left:0;top:0;width:1080px;height:192px;${bandCss}}
#header-wrap{position:absolute;left:0;top:0;width:1080px;height:192px;display:flex;flex-direction:column;align-items:center;justify-content:${L.header.subtitle ? 'flex-start' : 'center'};padding-top:10px}
.h-mask{overflow:hidden;padding:24px 60px 4px;margin:-24px -60px 0}
#h-title{font-family:"Anton",sans-serif;font-size:${px(L.header.title)};line-height:1.05;color:var(--yellow);letter-spacing:.01em;--sw:8px;text-shadow:0 4px 0 var(--ink);white-space:nowrap}
#h-sub{font-family:"Anton",sans-serif;line-height:1.1;color:var(--parch);letter-spacing:.02em;--sw:6px;white-space:nowrap}
#xp{display:flex;align-items:center;gap:18px;margin-top:4px;width:960px}
#xp-track{position:relative;flex:1;height:14px;border-radius:7px;background:rgba(247,241,230,.1);box-shadow:inset 0 0 0 1.5px rgba(242,183,5,.6);overflow:hidden}
#xp-fill{position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:0 50%;transform:scaleX(0);background:linear-gradient(90deg,#B57A00,var(--gold) 60%,var(--yellow))}
#xp-label{display:flex;align-items:center;gap:10px;font-weight:800;font-size:22px;letter-spacing:.08em;color:var(--parch);white-space:nowrap;--sw:5px}
#xp-label .num{display:flex;font-family:"Anton",sans-serif;font-size:36px;letter-spacing:0;color:var(--yellow)}
#h-line{position:absolute;left:40px;width:1000px;top:190px;height:3px;background:linear-gradient(90deg,transparent,var(--gold) 18%,var(--yellow) 50%,var(--gold) 82%,transparent)}
.gem{position:absolute;display:block;width:20px;height:20px;background:linear-gradient(135deg,#FFF3A0,var(--gold) 55%,#8A5A00);box-shadow:0 0 14px rgba(255,225,26,.8),0 0 0 2px var(--ink)}
#h-line .gem{left:490px;top:-9px;transform:rotate(45deg)}

/* Guide panel */
#panel-bg{position:absolute;left:8px;top:${plan.panelTop}px;width:1064px;height:0;border-radius:26px;${panelCss}}
#panel-bg .gem{left:522px;bottom:-10px;transform:rotate(45deg)${panel === 'none' ? ';display:none' : ''}}
#rows{position:absolute;left:0;top:0;width:1080px;height:1920px}
.pill-row,.stat-row{position:absolute;left:30px;width:1030px;display:flex;align-items:center}
.pill{position:relative;flex:none;height:${px(S.pillH)};padding:0 ${px(S.pillPadX)};border-radius:${px(S.pillH / 2)};overflow:hidden;display:flex;align-items:center;background:linear-gradient(180deg,${C.pillTop} 0%,${C.pillMid} 55%,var(--gold) 100%);box-shadow:0 4px 0 ${C.pillShadow},0 0 22px rgba(255,210,26,.35);transform-origin:0 50%}
.pill-text{font-weight:900;font-size:${px(S.pillFont)};color:var(--ink);letter-spacing:.01em;white-space:nowrap}
.shine{position:absolute;left:0;top:-20px;width:64px;height:${px(S.pillH + 44)};background:linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent);transform:translateX(-120px) skewX(-20deg)}
.note{position:absolute;left:${px(G.noteLeft - 30)};width:${px(G.noteWidth)};font-weight:600;line-height:1.2;text-wrap:balance;--sw:4px}
.note b,.desc b{color:var(--gold);font-weight:800}
.stat-row{height:${px(S.statRow)}}
.glow{position:absolute;left:-22px;top:${px(S.statRow * 0.02)};width:1062px;height:${px(S.statRow * 0.96)};border-radius:12px;background:linear-gradient(90deg,rgba(255,138,31,.45),rgba(255,225,26,.18) 45%,transparent);opacity:0}
.sn{position:relative;width:${px(G.snW)};text-align:right;font-weight:900;font-size:${px(S.sn)};color:var(--yellow);--sw:7px;text-shadow:0 3px 0 var(--ink)}
.plus{position:relative;width:${px(G.plusW)};text-align:center;font-weight:900;font-size:${px(S.plus)};color:var(--parch);--sw:6px}
.stat-row .num{position:relative;width:${px(G.numW)};display:flex;font-weight:900;font-size:${px(S.num)};color:var(--yellow);--sw:7px;font-variant-numeric:tabular-nums;text-shadow:0 3px 0 var(--ink)}
.d{display:block;height:1.2em;line-height:1.2em;overflow:hidden;padding:0 6px;margin:0 -6px}
.strip{display:block}
.strip i{display:block;height:1.2em;font-style:normal}
.desc .w{display:inline-block}
.desc{position:relative;margin-left:${px(12 * G.s)};font-weight:600;white-space:nowrap;--sw:4px}
#summary{position:absolute;padding:${px(S.sumPadY)} ${px(S.sumPadX)};border-radius:18px;background:rgba(18,12,4,.55);box-shadow:inset 0 0 0 1.5px rgba(242,183,5,.6);transform-origin:50% 0}
.sum-title{font-family:"Anton",sans-serif;font-size:${px(S.sumTitle)};line-height:1.1;color:var(--yellow);letter-spacing:.03em;--sw:6px;margin-bottom:${px(6 * G.s)}}
#summary ul{list-style:none;display:flex;flex-direction:column;gap:${px(S.sumGap)}}
#summary li{display:flex;align-items:center;gap:${px(14 * G.s)};font-weight:700;line-height:1.2;white-space:nowrap;--sw:4px}
#summary em,#summary .em{font-style:normal;color:var(--yellow)}
.tick{flex:none;width:${px(S.tick)};height:${px(S.tick)};transform:rotate(45deg);background:var(--gold);box-shadow:0 0 0 2px var(--ink),0 0 10px rgba(255,225,26,.6)}

/* Call to action */
#cta-scrim{top:${px(L.cta.scrimTop)};height:${px(L.cta.scrimHeight)}}
#cta-text{position:absolute;left:0;top:${px(L.cta.top)};width:1080px;display:flex;flex-direction:column;align-items:center}
.cl{display:flex;gap:.22em;justify-content:center;white-space:nowrap;font-family:"Anton",sans-serif;font-size:${px(L.cta.size)};line-height:1.04;letter-spacing:.01em;color:#FFFFFF;--sw:16px;text-shadow:0 9px 0 var(--ink)}
.cw{display:inline-block}
#cta-underline{position:absolute;left:${px(U.left)};top:${px(U.top)};width:${px(U.width)};height:60px;overflow:visible}
.marks{position:absolute;width:0;height:0}
.mark{left:-5px;top:-74px;width:10px;height:40px;border-radius:5px;background:#FFFFFF;box-shadow:0 0 0 3px var(--ink)}
</style></head><body>
<div id="root" data-composition-id="root" data-start="0" data-duration="${D}" data-width="${FRAME.width}" data-height="${FRAME.height}">
<div id="bg-wrap"><video id="bg" src="${esc(files.video)}" data-start="0" data-duration="${D}" data-track-index="0" muted playsinline></video></div>
<audio id="music" src="${esc(files.music)}" data-start="0" data-duration="${D}" data-track-index="1" data-volume="1"></audio>
${brand}
<div id="hook" class="clip layer" data-start="0" data-duration="${r3(T.hookExit + 0.45)}" data-track-index="2">
${scrims ? '<div id="hook-scrim" class="scrim"></div>' : ''}
<div id="hook-text">${icon}${hookLines}</div>
</div>

<div id="header" class="clip layer" data-start="${r3(T.header - 0.12)}" data-duration="${r3(T.ctaStart + 0.1 - (T.header - 0.12))}" data-track-index="3">
<div id="header-band"></div>
<div id="header-wrap">
<div class="h-mask"><div id="h-title" class="ink">${runsHtml(reel.header.title)}</div></div>
${subtitle}
${levelBar}
</div>
<div id="h-line"><i class="gem"></i></div>
</div>

<div id="panel" class="clip layer" data-start="${r3(T.header - 0.12)}" data-duration="${r3(T.ctaStart + 0.1 - (T.header - 0.12))}" data-track-index="4">
<div id="panel-bg"><i class="gem"></i></div>
<div id="rows">
${rows.join('\n')}
${summary}
</div>
</div>

${scrims ? `<div id="cta-scrim" class="clip layer scrim" data-start="${r3(T.exit - 0.05)}" data-duration="${r3(D - (T.exit - 0.05))}" data-track-index="5"></div>` : ''}
<div id="cta" class="clip layer" data-start="${T.ctaStart}" data-duration="${r3(D - T.ctaStart)}" data-track-index="6">
<div id="cta-text">${ctaLines}
<svg id="cta-underline" viewBox="0 0 ${U.width} 60" aria-hidden="true"><path d="${uPath}" fill="none" stroke="#120C04" stroke-width="18" stroke-linecap="round"/><path d="${uPath}" fill="none" stroke="#FFFFFF" stroke-width="9" stroke-linecap="round"/></svg>
${marks('m-left', L.cta.marksLeft, [-60, -30, 0])}${marks('m-right', L.cta.marksRight, [120, 150, 180])}
</div>
</div>
</div>
<script>
(function () {
  const R = ${JSON.stringify(runtime)};
  const T = R.T;
  const root = document.getElementById('root');
  const $ = (sel, el) => (el || root).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || root).querySelectorAll(sel));
  const tl = gsap.timeline({ paused: true });
  const rollTo = (strip, index, at, dur) =>
    tl.to(strip, { yPercent: (-100 * index) / Number(strip.dataset.count), duration: dur, ease: 'power3.out' }, at);

  // ---- Hook: words slam in on the beat, the icon drops, then the hook punches out.
  const hookWords = $$('.hw');
  hookWords.forEach((w) => {
    tl.fromTo(w, { opacity: 0, scale: 2.1, filter: 'blur(14px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.26, ease: 'expo.out' }, Number(w.dataset.t));
  });
  const slam = hookWords[hookWords.length - 1];
  const slamT = Number(slam.dataset.t);
  tl.to('#hook-text', { keyframes: { x: [0, 14, -11, 8, -5, 2, 0], y: [0, -6, 5, -3, 2, 0, 0] }, duration: 0.3, ease: 'none' }, slamT + 0.04);
  tl.fromTo(slam, { color: '#FFFFFF' }, { color: '${C.yellow}', duration: 0.4, ease: 'power1.out' }, slamT);
  if (T.icon !== null) {
    tl.fromTo('#hook-icon svg', { y: -90, rotation: -30, scale: 0.4, opacity: 0 }, { y: 0, rotation: 0, scale: 1, opacity: 1, duration: 0.34, ease: 'back.out(3)' }, T.icon);
    tl.fromTo('#hook-icon .spark', { scaleY: 0, y: 26, opacity: 1 }, { scaleY: 1, y: -18, duration: 0.22, ease: 'power3.out' }, T.icon + 0.12);
    tl.to('#hook-icon .spark', { opacity: 0, y: -40, duration: 0.2, ease: 'power1.in' }, T.icon + 0.35);
  }
  tl.to('#hook-text', { scale: 0.86, opacity: 0, filter: 'blur(12px)', duration: 0.2, ease: 'power2.in' }, T.hookExit - 0.16);
  tl.set('#hook-text', { opacity: 0 }, T.hookExit + 0.05);
  if ($('#hook-scrim')) {
    tl.to('#hook-scrim', { opacity: 0, duration: 0.2, ease: 'power1.in' }, T.header + 0.05);
    tl.set('#hook-scrim', { opacity: 0 }, T.header + 0.26);
  }

  // ---- Header: band in, title rises out of a mask, subtitle settles, level bar slides in.
  const H = T.header;
  tl.fromTo('#header-band', { opacity: 0 }, { opacity: 1, duration: 0.14, ease: 'none' }, H - 0.1);
  tl.fromTo('#h-line', { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: 'expo.out' }, H - 0.06);
  tl.fromTo('#h-title', { yPercent: 115 }, { yPercent: 0, duration: 0.42, ease: 'power4.out' }, H);
  if ($('#h-sub')) tl.fromTo('#h-sub', { opacity: 0, scale: 1.12, y: 10 }, { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: 'circ.out' }, H + 0.14);
  if ($('#xp')) tl.fromTo('#xp', { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.35, ease: 'sine.out' }, H + 0.26);

  // ---- Panel unrolls ahead of each row so every new line lands on a ready surface.
  R.growth.forEach(([start, dur, height], i) => {
    if (i === 0) tl.fromTo('#panel-bg', { height: 0, opacity: 0 }, { height, opacity: 1, duration: dur, ease: 'power3.out' }, start);
    else {
      tl.to('#panel-bg', { height, duration: dur, ease: 'power2.inOut' }, start);
      tl.fromTo('#panel-bg .gem', { scale: 1.6 }, { scale: 1, duration: 0.3, ease: 'power2.out', immediateRender: false }, start + dur);
    }
  });

  // ---- Level pills: stretch from the left, text settles, shine sweeps, level bar fills.
  const counterStrips = $$('#xp-label .strip');
  $$('.pill-row').forEach((row) => {
    const t = Number(row.dataset.t);
    tl.fromTo($('.pill', row), { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.34, ease: 'back.out(1.6)' }, t);
    tl.fromTo($('.pill-text', row), { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.24, ease: 'power2.out' }, t + 0.12);
    tl.fromTo($('.shine', row), { x: -120 }, { x: 420, duration: 0.55, ease: 'power2.inOut' }, t + 0.26);
    const note = $('.note', row);
    if (note) tl.fromTo(note, { opacity: 0, x: 34 }, { opacity: 1, x: 0, duration: 0.42, ease: 'power3.out' }, t + 0.18);
    const step = Number(row.dataset.step);
    if (!$('#xp') || step < 0) return;
    tl.to('#xp-fill', { scaleX: R.levelSteps[step], duration: 0.6, ease: 'power2.inOut' }, t + 0.1);
    R.counter.forEach((steps, p) => {
      const s = steps[step];
      rollTo(counterStrips[p], s.index, t + 0.1, 0.5);
      tl.set(counterStrips[p].parentNode, { opacity: s.visible ? 1 : 0 }, t + 0.1);
    });
  });
  if ($('#xp')) R.counter.forEach((steps, p) => tl.set(counterStrips[p].parentNode, { opacity: steps[0].visible ? 1 : 0 }, 0));

  // ---- Stat rows: slide in, name pops, value rolls, description reveals word by word, glow flashes.
  $$('.stat-row').forEach((row) => {
    const t = Number(row.dataset.t);
    tl.fromTo(row, { opacity: 0, x: -44 }, { opacity: 1, x: 0, duration: 0.32, ease: 'expo.out' }, t);
    tl.fromTo($('.sn', row), { scale: 1.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2.2)' }, t);
    $$('.strip', row).forEach((strip, i) => rollTo(strip, Number(strip.dataset.index), t + 0.04 + i * 0.07, 0.55));
    const desc = $('.desc', row);
    if (desc) tl.fromTo($$('.w', desc), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.26, ease: 'power2.out', stagger: 0.035 }, t + 0.12);
    tl.fromTo($('.glow', row), { opacity: 0 }, { opacity: 1, duration: 0.12, ease: 'none' }, t);
    tl.to($('.glow', row), { opacity: 0, duration: 0.7, ease: 'sine.inOut' }, t + 0.45);
  });

  // ---- Summary card.
  if ($('#summary')) {
    const S = T.summary;
    tl.fromTo('#summary', { scaleY: 0, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 0.3, ease: 'power3.out' }, S);
    tl.fromTo('.sum-title', { opacity: 0, y: -14 }, { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out' }, S + 0.08);
    $$('#summary li').forEach((li) => {
      const t = Number(li.dataset.t);
      tl.fromTo(li, { opacity: 0, x: 26 }, { opacity: 1, x: 0, duration: 0.32, ease: 'power3.out' }, t);
      tl.fromTo($('.tick', li), { scale: 0 }, { scale: 1, rotation: 45, duration: 0.3, ease: 'back.out(3)' }, t + 0.04);
    });
  }

  // ---- Hand-off: the guide lifts away on the beat and is gone when the CTA clip starts.
  const X = T.exit, Y = T.ctaStart;
  tl.to('#rows', { y: -110, opacity: 0, filter: 'blur(10px)', duration: Y - X, ease: 'power3.in' }, X);
  tl.to('#header-wrap', { y: -70, opacity: 0, duration: Y - X - 0.01, ease: 'power3.in' }, X + 0.01);
  tl.to('#panel-bg', { y: -40, opacity: 0, duration: Y - X - 0.02, ease: 'power2.in' }, X + 0.02);
  tl.to('#header-band', { opacity: 0, duration: Y - X - 0.02, ease: 'power1.in' }, X + 0.02);
  tl.to('#h-line', { opacity: 0, duration: Y - X - 0.02, ease: 'power1.in' }, X + 0.02);
  tl.set('#rows', { opacity: 0 }, Y);
  tl.set('#header-wrap', { opacity: 0 }, Y);
  tl.set('#panel-bg', { opacity: 0 }, Y);
  tl.set('#header-band', { opacity: 0 }, Y);
  tl.set('#h-line', { opacity: 0 }, Y);

  // ---- CTA
  if ($('#cta-scrim')) tl.fromTo('#cta-scrim', { opacity: 0 }, { opacity: 1, duration: 0.12, ease: 'none' }, X - 0.05);
  $$('.cl1 .cw').forEach((w) => {
    tl.fromTo(w, { opacity: 0, y: 70, rotation: -6, scale: 0.7 }, { opacity: 1, y: 0, rotation: 0, scale: 1, duration: 0.34, ease: 'back.out(2.2)' }, Number(w.dataset.t));
  });
  $$('.cl2 .cw').forEach((w) => {
    tl.fromTo(w, { opacity: 0, scale: 1.9, filter: 'blur(12px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.3, ease: 'expo.out' }, Number(w.dataset.t));
  });
  $$('#cta-underline path').forEach((p) => {
    const len = ${Math.round(U.width * 1.08)};
    tl.fromTo(p, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.36, ease: 'power2.out' }, T.underline - 0.2);
  });
  tl.fromTo('#cta .mark', { scaleY: 0, opacity: 1 }, { scaleY: 1, duration: 0.2, ease: 'power3.out', stagger: 0.04 }, T.sparks);
  T.pulses.forEach((t) => {
    tl.fromTo('#cta-text', { scale: 1.045 }, { scale: 1, duration: 0.36, ease: 'power2.out', immediateRender: false }, t);
    tl.fromTo('#cta .mark', { y: -10 }, { y: 0, duration: 0.3, ease: 'power2.out', immediateRender: false }, t);
  });

  window.__timelines = window.__timelines || {};
  window.__timelines['root'] = tl;
})();
</script>
</body></html>
`;
}

// Loops and trims media to the reel length; fades the music out.
function fitMedia(project, media, duration) {
  const files = { video: media.video.file, music: 'assets/music-fit.wav' };
  if (media.video.duration + 0.05 < duration) {
    files.video = 'assets/background-fit.mp4';
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-stream_loop', '-1', '-i', join(project, media.video.file), '-t', String(duration + 0.2), '-c', 'copy', join(project, files.video)]);
    if (r.status !== 0) throw new Error(`ffmpeg video loop failed: ${r.stderr}`);
  }
  const fade = Math.max(0, duration - 0.6).toFixed(3);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-stream_loop', '-1', '-i', join(project, media.music.file), '-t', String(duration),
    '-af', `afade=t=out:st=${fade}:d=0.6`, '-c:a', 'pcm_s16le', join(project, files.music)]);
  if (r.status !== 0) throw new Error(`ffmpeg music fit failed: ${r.stderr}`);
  return files;
}

function main(argv) {
  const project = resolve(argv[0] || '');
  const reelPath = argv[1] === '--reel' && argv[2] ? resolve(argv[2]) : join(project, 'reel.json');
  if (!argv[0] || !existsSync(reelPath)) {
    console.log('Usage: node build-reel.mjs <project> [--reel <reel.json>]   (reel.json comes from parse-brief.mjs)');
    process.exit(1);
  }
  const reel = JSON.parse(readFileSync(reelPath, 'utf8'));
  const mediaPath = join(project, 'assets/media.json');
  if (!existsSync(mediaPath)) throw new Error('assets/media.json is missing; run prepare-media.mjs first.');
  const media = JSON.parse(readFileSync(mediaPath, 'utf8'));
  const plan = planReel(reel, media);
  for (const w of plan.warnings) console.warn(`warning: ${w}`);

  mkdirSync(join(project, 'assets/fonts'), { recursive: true });
  for (const f of ['anton-latin.woff2', 'montserrat-latin.woff2']) copyFileSync(join(SKILL, 'fonts', f), join(project, 'assets/fonts', f));
  if (!existsSync(join(project, 'assets/gsap.min.js'))) throw new Error('assets/gsap.min.js is missing; create the project with npm run new-video.');
  copyFileSync(join(SKILL, 'references/design.md'), join(project, 'DESIGN.md'));
  const files = fitMedia(project, media, plan.timing.duration);

  writeFileSync(join(project, 'index.html'), renderHtml(reel, media, plan, files));
  writeFileSync(join(project, 'plan.json'), JSON.stringify(plan, null, 2) + '\n');
  const meta = join(project, 'meta.json');
  const m = existsSync(meta) ? JSON.parse(readFileSync(meta, 'utf8')) : {};
  writeFileSync(meta, JSON.stringify({ ...m, id: 'root', width: FRAME.width, height: FRAME.height, fps: FRAME.fps }, null, 2) + '\n');
  const t = plan.timing;
  console.log(`index.html: ${t.duration}s at ${t.beat.bpm} BPM, a row every ${t.rowStep}s, guide scale ${plan.layout.guide.s}, ` +
    `summary ${plan.layout.guide.summary?.mode ?? 'none'}, board complete at ${t.summary ?? t.bands.at(-1).rows.at(-1)}s, CTA at ${t.ctaStart}s`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(`error: ${e.message}`); process.exit(1); }
}
