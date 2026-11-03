---
name: stat-alloc-reel
description: Build a STAT ALLOC REEL, a 9:16 game build-guide reel where beat-locked HyperFrames motion graphics (hook slam, header with a level bar, a frosted panel that unrolls as stat rows land, a summary card, and a follow CTA) play over clean gameplay. Use when the user asks for a stat allocation reel, a build guide or stat guide video, a "STAT ALLOC REEL", or sends a filled-in STAT ALLOC REEL brief. Use short-form-edit for talking-head reels.
---

# STAT ALLOC REEL

Input: a clean gameplay video (no text burned in), optional music, and a filled-in
brief. Output: a 1080x1920 MP4 and its editable HyperFrames project.

The look was approved on the creator's Butcher/Battle Blacksmith reel. Every
size, position, and entrance time is generated from the brief, so do not
hand-edit `index.html`; change the brief and rebuild.

## 1. Get the brief

If the user has not sent one, give them the blank form in
[brief-template.txt](references/brief-template.txt) and the filled
[example-brief.txt](references/example-brief.txt). They need to send:

- **Video:** clean gameplay, ideally vertical. Landscape is center-cropped to 9:16.
- **Music:** the video's own sound or a separate file; BPM is optional.
- **Hook:** 1 to 3 short lines; the last word slams in. Icon: hammers, swords, shield, staff, or none.
- **Header:** title, optional subtitle, level-bar label, and max level.
- **Levels:** one block per level band with `STAT + NUMBER = reason` lines and an optional note.
- **Summary** (optional) and a **CTA** of 1 or 2 lines.
- **Options:** pace (fast, normal, slow), panel (frosted, light, none), whether
  the footage already shows the frame and logo, and an optional logo file.

`*stars*` mark accent-colored words in the subtitle, notes, descriptions,
summary, and CTA. Keep the user's wording verbatim. The parser only typesets
quotes, dashes, and label case. When it warns about a repeated or
non-increasing level band, ask the user; never silently change their numbers.

## 2. Build

Work from the kit root. Keep media and outputs inside the project.

```sh
npm run new-video -- <slug>
K=.agents/skills/stat-alloc-reel/scripts
node $K/prepare-media.mjs video-projects/<slug> --video <gameplay.mp4> [--music <track>] [--bpm 130] [--logo <logo.png>]
node $K/parse-brief.mjs <brief.txt> --out video-projects/<slug>/reel.json
node $K/build-reel.mjs video-projects/<slug>
```

- `prepare-media.mjs` writes `assets/background.mp4` (1080x1920, 30 fps, 1 s
  keyframes), `assets/music.wav`, and `assets/media.json` with the detected beat.
  A confidence below 1.4 means no clear beat: ask for the BPM and pass `--bpm`.
- `parse-brief.mjs` reports errors with line numbers. Fix them with the user.
- `build-reel.mjs` writes `index.html`, `plan.json` (every timing and size),
  `DESIGN.md`, and fitted media. Footage or music shorter than the reel loops,
  with a warning; prefer footage at least as long as the reel.

Timing: the hook takes about 1.3 to 1.9 s. Rows land every 1, 2, or 3 beats by
pace, and each new band takes one extra beat. The finished board holds for two
row steps, then the CTA runs about 2.5 s. Eighteen rows at normal pace and
130 BPM make a reel of about 29 s.

Layout: the guide scales between 0.68x and 1.15x to fit the panel (200 to
1572 px), descriptions shrink one by one to fit their line, and the summary sits
beside the last band when that band has no descriptions, else below it. More
than about 24 rows will not fit; suggest splitting the guide into two reels.

## 3. Check

```sh
cd video-projects/<slug> && npx hyperframes lint && cd -
node $K/check-layout.mjs video-projects/<slug>
node scripts/preflight.mjs video-projects/<slug>
```

- Lint must report 0 errors and 0 warnings.
- `check-layout.mjs` seeks the hook, the finished board, and the CTA in headless
  Chromium with the real fonts, then fails on overflow, a note longer than two
  lines, or overlaps. It saves `renders/layout-*.png`; look at them.
- Preflight reports `root_data_start_conflicts_with_video`. HyperFrames 0.7.109
  lint requires `data-start="0"` on the root, and the video sits in a non-timed
  wrapper, so this one finding is expected.

## 4. Render and review

```sh
cd video-projects/<slug>
npx hyperframes render --quality draft --output renders/draft.mp4
```

In a cloud session behind a proxy, prefix `NODE_USE_ENV_PROXY=1`. If
`npx hyperframes doctor` cannot find Chrome Headless Shell, set
`HYPERFRAMES_BROWSER_PATH` to an installed headless shell.

Review the encoded draft, not the HTML. From `plan.json`, extract frames at the
hook, at each `bands[].pill + 0.5`, when the board is complete, at every frame
from `exit` to `ctaStart + 0.3`, and at the end. Check outlines over bright
footage, the logo clearance, rows landing on the beat, and that the music fades
at the end. Record evidence in `VERIFY.md`, then render the final with
`--quality high`. Only publish when the user authorizes it.

## Changing a draft

| Note from the user | Change |
| --- | --- |
| Text, typos, rows | Edit the brief, rerun parse and build |
| Too fast or too slow | `Pace:` fast, normal, or slow |
| Rows off the beat | `--bpm <n>` on prepare-media, then rebuild |
| Gameplay hidden too much | `Panel: light`, or `none` for outlines only |
| Different color | `Accent color: #RRGGBB` in [VIDEO] |
| No frame or logo in the footage | `Logo and frame already in video: no` plus `--logo` |

Design rules and the palette live in [design.md](references/design.md).
