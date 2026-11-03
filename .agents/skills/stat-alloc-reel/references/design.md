# STAT ALLOC REEL design

## Style Prompt

A game build-guide reel. Gameplay plays underneath a dark frosted "guild ledger"
panel that unrolls downward as each stat row arrives. Type is loud and game-like:
hard yellow display letters with a black outline, gold hardware, and pop-ins
locked to the music's beat. The full build stays on screen long enough to pause
and screenshot. Built from the creator's approved Butcher/Battle Blacksmith reel.

## Colors

| Role | Hex | Use |
| --- | --- | --- |
| Guide Yellow (accent) | `#FFE11A` | Hook, stat names, numbers, title, starred words |
| Gold | `#F2B705` | `=` signs, borders, level bar, pill shading |
| Ink | `#120C04` | Outlines, pill text, panel tint |
| Parchment | `#F7F1E6` | Descriptions and notes |
| Ember | `#FF8A1F` | Glow on emphasis only (hook sparks, newest row) |

A brief may replace the accent; gold and the pill shading are derived from it.

## Typography

- Montserrat 900 for the hook, stat names, numbers, and level pills; 600 for
  descriptions and notes; 700 for summary items.
- Anton for the header, the summary title, the level counter, and the CTA.
- Tabular numbers on every stat value. Every size auto-fits its line.

## Layout (1080x1920)

- Header band 0-192 px: title, optional subtitle, and the level bar.
- Guide panel from 200 px down to at most 1572 px, so a logo at the bottom stays
  clear. Rows scale together (0.68x to 1.15x) to fit the brief.
- Hook centered near 490 px; CTA centered near 550 px.

## Motion

- Every entrance lands on the beat grid. Rows arrive every 1, 2, or 3 beats
  (fast, normal, slow), kept between about 0.4 and 1.8 seconds apart.
- Hook words slam in from 2.1x with blur; the last word shakes the frame.
- Pills stretch out from the left, then catch a shine sweep; the level bar fills.
- Stat values roll like a slot counter; descriptions reveal word by word; the
  newest row flashes a gold glow that fades back to rest.
- The guide lifts away on a beat; the CTA lands, underlines, and pulses on beats.

## What NOT to Do

- No text straight on raw gameplay without an outline or a panel behind it.
- No pastel or neon palettes; no full-frame linear gradients.
- Never cover a logo at the bottom of the frame.
- No more than one new row per beat; never two entrances landing together.
- No exit animations until the guide hands off to the call to action.
