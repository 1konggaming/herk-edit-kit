#!/usr/bin/env node
// Renders a STAT ALLOC REEL composition in headless Chromium and checks that text fits.
// Usage: node check-layout.mjs <project>
// Seeks the hook, the finished guide, and the CTA; saves renders/layout-*.png.
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const project = resolve(process.argv[2] || '');
if (!process.argv[2]) {
  console.log('Usage: node check-layout.mjs <project>');
  process.exit(1);
}
const plan = JSON.parse(readFileSync(join(project, 'plan.json'), 'utf8'));
const T = plan.timing;
const lastRow = T.bands.at(-1).rows.at(-1);
const moments = {
  hook: Math.max(...T.hook.flat()) + 0.45,
  guide: (T.summaryItems.length ? T.summaryItems.at(-1) : lastRow) + 0.6,
  cta: T.duration - 0.2,
};

const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files', '--disable-features=PointerLock'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto('file://' + join(project, 'index.html'));
await page.evaluate(async () => {
  await Promise.all(['900 46px ReelSans', '600 34px ReelSans', '700 27px ReelSans', '800 22px ReelSans', '68px Anton'].map((f) => document.fonts.load(f)));
  await document.fonts.ready;
});
mkdirSync(join(project, 'renders'), { recursive: true });

const problems = [];
for (const [name, t] of Object.entries(moments)) {
  const found = await page.evaluate(({ name, t }) => {
    window.__timelines.root.seek(t, false);
    const out = [];
    const box = (el) => el.getBoundingClientRect();
    const label = (el) => `"${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 48)}"`;
    const inFrame = (sel, min = 16, max = 1064) => document.querySelectorAll(sel).forEach((el) => {
      const r = box(el);
      if (r.width && (r.left < min || r.right > max)) out.push(`${name}: ${sel} ${label(el)} spans ${Math.round(r.left)}-${Math.round(r.right)}px`);
    });
    if (name === 'hook') inFrame('.hl', 30, 1050);
    if (name === 'cta') inFrame('.cl', 30, 1050);
    if (name === 'guide') {
      inFrame('#h-title', 30, 1050); inFrame('#h-sub', 30, 1050);
      inFrame('.desc'); inFrame('.note'); inFrame('#summary li span', 16, 1062); inFrame('.pill');
      const bottom = box(document.getElementById('panel-bg')).bottom;
      if (bottom > 1584) out.push(`guide: panel bottom ${Math.round(bottom)}px runs into the logo area`);
      document.querySelectorAll('.note').forEach((n) => {
        const lines = Math.round(box(n).height / parseFloat(getComputedStyle(n).lineHeight));
        if (lines > 2) out.push(`guide: note ${label(n)} wraps to ${lines} lines`);
        const pill = n.parentNode.querySelector('.pill');
        if (box(pill).right > box(n).left - 4) out.push(`guide: note ${label(n)} touches its pill`);
      });
      document.querySelectorAll('.stat-row').forEach((row) => {
        const num = row.querySelector('.num'), desc = row.querySelector('.desc');
        if (desc && box(num).right > box(desc).left) out.push(`guide: ${label(row)} value overlaps its description`);
      });
      const sum = document.getElementById('summary');
      if (sum) {
        const sb = box(sum);
        document.querySelectorAll('.pill, .stat-row .num').forEach((el) => {
          const r = box(el);
          if (r.right > sb.left && r.left < sb.right && r.bottom > sb.top && r.top < sb.bottom) out.push(`guide: summary overlaps ${label(el)}`);
        });
      }
    }
    return out;
  }, { name, t });
  problems.push(...found);
  await page.screenshot({ path: join(project, 'renders', `layout-${name}.png`) });
}
await browser.close();

if (problems.length) {
  for (const p of problems) console.error(`layout: ${p}`);
  process.exit(1);
}
console.log(`Layout OK at hook ${moments.hook.toFixed(2)}s, guide ${moments.guide.toFixed(2)}s, CTA ${moments.cta.toFixed(2)}s; screenshots in renders/layout-*.png`);
