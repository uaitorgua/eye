# Design system pass — 5 November 2026

Full visual review of every screen on `codex/home-redesign` (desktop 1440×900, laptop 1280×720, phone 390×844) with headless Edge, followed by one shared design layer. Before/after pairs: `docs/screenshots/2026-11-05-system/` (left = before, right = after).

## What the review found

| Screen | Problem |
| --- | --- |
| Mode chooser (first run) | Two 740 px tall tiles with a 20 px icon and 16 px label in the middle; read as empty. Title carried "(обирає дорослий)" in brackets. |
| All choice dialogs | Same empty-tile problem; emoji leaked into titles ("🔖 Куди підемо?", "📁 Файл", "☰ Меню"); with one option a whole column stayed blank. |
| Settings | +/− glyphs ~24 px inside 200×280 px targets; emoji in stepper labels. |
| Library (empty) | Blank page, plus disabled "Назад / 1 / 1 / Далі" pagination with nothing to page. |
| Tetris | Huge white side panels with thin arrows; nothing suggested they were controls. |
| Eye exercises | Different heading font from the rest of the app; empty stage before the first exercise. |
| Global | Flat tiles, dwell progress only as a thin strip; leftover dark-theme tokens in `base.css`. |

## What changed

- **`site/css/system.css`** (new, loaded last): shared tokens (paper / ink / cobalt / gold); legacy dark tokens now map to the light system.
  - Tiles get a "keycap" look: a 3 px lip and a soft drop shadow. The press animation runs when a target fires.
  - **Dwell feedback is a rising fill.** The tile fills from the bottom in step with the progress bar. `dwell.js` records the target height as `--dwell-h`, so the fill reaches the top exactly when the bar completes.
  - Gaze pointer: solid core and a gold progress ring.
  - Dialog heading: an icon chip, a serif title and an optional subtitle.
  - Choice tiles use a poster layout: an icon chip at the top, an arrow at the top-right and words at the bottom-left. Cancel is a dashed secondary target.
  - Dialogs with one or two options show large tinted "doors". Cancel is narrower.
  - Other per-screen polish:
    - Settings: large steppers.
    - Library: empty-shelf illustration, and book tiles with a coloured spine.
    - Tetris: blue arrow chips.
    - Exercises: calm ring backdrop.
    - Home: camera status pill and arrow micro-motion.
    - Algorithms: placeholder text in the empty console.
- `js/ui/icons.js` `splitIcon()` turns a leading emoji in any dialog title into an SVG icon chip, or drops it.
- `js/ui/modal.js`: `openModal`/`choose` accept `subtitle`; dialogs with ≤2 options get the `choice-few` class.
- `js/reader/reader.js`: empty-shelf state; pagination is shown only when there is more than one page.
- `js/gaze/session.js`, `js/ui/settings.js`: copy cleanup (no bracketed note, no emoji labels).

Target sizes were not reduced anywhere. `prefers-reduced-motion` disables the press animation, focus lift and arrow motion.

## Verification

- All 10 unit tests in `tests/` pass (run each file with `node --test <file>`).
- Screens were captured at all three sizes. The pages produced no errors. The only console message is a missing favicon (404), which was there before this pass.
- Not verified: real webcam calibration screen (CSS only: `.modal.calib` keeps white text on black), PHP browser pages, actual gaze hardware.
