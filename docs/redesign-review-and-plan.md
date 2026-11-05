# Eye redesign review and next steps

Reviewed 2026-11-02. Target: current local `codex/home-redesign` home screen and adjacent first-run, modal and reading flows. This is a review and plan, not an implementation pass.

## Evidence and scope

Applied Impeccable critique and UI Taste audit/craft guidance. Independent design assessment, independent detector assessment, and separate functional tester examined the source. Browser retry returned “Local browser use is disabled in Work settings.” No rendered screenshots, touch tests, camera permission tests or gaze accuracy measurements were obtained. Syntax and menu structure checks passed, but these do not establish usability.

The deterministic detector emitted six warnings across four rules. The glow/stripe warnings belong to functional gaze/calibration feedback outside the home redesign; clipping is not proven by the body's intentional full-screen shell. Its contrast warning concerns the trainer gradient and needs rendered sampling. None establishes a confirmed home-screen visual failure. Full detector output is retained in the local temp file `eye-impeccable-detect.json`.

## What to keep

The cream, navy, cobalt and restrained yellow direction feels welcoming without treating a 12-year-old like a toddler. Learning/break grouping, labeled native buttons, decorative SVG semantics, reduced-motion support and retained dwell hooks are useful foundations. Keep large stable controls and restrained motion. Do not introduce statistics, streaks, or a decorative dashboard.

## Prioritized findings

1. **P1: Shared dialogs lack accessible lifecycle handling.** `site/js/ui/modal.js` creates a generic div without dialog semantics, accessible title association, initial/restored focus or background inertness. This affects first-run mode selection, settings and the library. Correct once in the shared helper while retaining the existing dwell scope. Test stacked dialogs, Tab/Shift+Tab and return focus. Do not add Escape dismissal to the mandatory input chooser without defining a safe outcome.
2. **P1: Reader toolbar is too dense for phones.** `site/css/reader.css` puts nine controls into one row. At 390 CSS px, gaps and padding leave roughly 32 px per control. Runtime clipping was not inspected, but the sizing constraints are inadequate for this input method. Keep Menu, page navigation and Pause as primary controls; put zoom/scroll options on a separate reachable control page.
3. **P1: Home dwell feedback has weak source-color contrast.** The yellow progress strip (#efb21d) over light tiles (#fffdf8) is approximately 1.87:1. It communicates activation timing. Use navy/cobalt on light actions and retain yellow on blue actions; verify contrast in focused and paused states.
4. **P2: Books after the first ten have no selection path.** `openLibrary()` uses `list.slice(0, 10)` without pagination. Storage sorts newest first, so the eleventh addition hides the oldest book from the selection grid. Add large previous/next library pages and retain position after returning from a book or deleting an item.
5. **P2: Browser Back does not follow in-app navigation.** `home.js` replaces history for section transitions and has no hash/popstate handling. Empty-library exit also leaves a books hash. Define Home → section → Back and direct-link/reload behavior; keep calibration alive across transitions.
6. **Unverified release risk: recovery controls can move below the viewport.** Home permits scrolling, but has no gaze-operated scrolling. Minimum layout sizes, zoom and long camera-status text could push Pause/Settings off-screen. Pin recovery controls and define overflow behavior only after measuring target layouts. A CSS comment is not evidence of reachability.
7. **P2: Visual continuity ends at Home.** Settings, library, reader and algorithms retain the dark emoji-based interface. Extend the chosen control geometry and navigation consistently, while preserving strong state contrast and useful calibration feedback. Light mode is not a medical requirement.

## Staged improvement plan

### Pass 1 — make recovery and navigation dependable

Fix shared dialog semantics/focus, home dwell contrast and reachable pause/resume. Validate desktop 1440×900 and 1366×768, phones 390×844 and 360×640, landscape 844×390, enlarged text/200% zoom, long error/status text, paused state, mouse/keyboard and simulated dwell. Verify foreground-only target activation, no accidental activations behind modals, and recovery without a mouse. Actual gaze calibration must be tested on the intended hardware separately.

### Pass 2 — complete one reading journey

Design and implement library → open/resume PDF → page navigation/zoom → library → Home. Include empty/loading/invalid-PDF/storage-full states, more than ten books, return-to-page persistence, and a clear adult-assisted import path. PDFs/progress are currently stored per browser origin in IndexedDB; the private preview and production site do not share them. Avoid changing origin/storage keys casually during migration.

### Pass 3 — apply the same system to remaining screens

Adapt settings and algorithms after the reading flow works. Keep pause placement, labels, focus/dwell feedback, and recovery language consistent. Decide whether reading should dominate Home once mentor/user priorities are known; the oversized book tile remains a design hypothesis.

### Pass 4 — deployment and real use

Restore a PHP-capable preview for Internet testing; the hosted static preview deliberately excludes PHP. Test camera permission denied/unavailable, tracking loss/recovery, calibration persistence and repeated selection on representative hardware. Then arrange supported feedback from the intended child and caregiver through the mentor. Do not claim therapeutic benefit or webcam accuracy from mockups or a calibration success alone.

## New library concept

A generated library proposal accompanies this review. It carries the approved palette into a four-target book picker with Menu, Pause and explicit pagination. Book titles/page counts are illustrative, not a real uploaded collection. This is an exploration, not a final implementation target: the apparent inner CTA should become part of a single full-card button, and the yellow dwell strip on the light surface needs the contrast correction above. Separate dwell timing from reading progress so the two cannot be confused.

## Verification status

No runtime visual pass or accessibility conformance claim. No product source was changed during this review. The existing home branch remains a work in progress. Questions for the mentor: confirm the primary task, actual device/browser/camera and supported way to gather the child's preferences. These are product unknowns, not reasons to delay the source-confirmed fixes.
