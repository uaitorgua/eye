# Runtime review — Eye redesign

Date: 2026-11-02. Read-only product review using Impeccable and UI Taste guidance, plus an independent source reviewer. No app source changed.

## Runtime coverage

Opened the private hosted preview in a fresh in-app browser tab. Inspected actual home/settings/empty-library screenshots at the default 914×833 viewport and emulated 390×844 / 360×640 sizes. Used pointer clicks, keyboard Shift+Tab, accessibility snapshots and read-only DOM measurements. These are desktop browser viewport tests, not physical phone/touch or eye-tracker tests.

The preview already had mouse/tracker mode selected. Camera permissions were not requested. The Internet backend was excluded from this static deployment, so its PHP behavior was not assessed. Screenshots were inspected in the browser tool output; no local screenshot files were saved. No visual-conformance score or hardware-usability claim is made.

## Confirmed findings

### P1 — settings layout fails on a compact phone

At 360×640, settings labels and values overlap, the lower option grid extends beyond the right edge, and the Close action is outside the visible width. The source uses fixed settings-grid assumptions (`site/css/modals.css`) that the redesigned Home does not solve. Use a small number of settings per page with persistent Back/Close and gaze-accessible paging. Avoid requiring a touchscreen scroll to recover.

### P1 — dialog focus remains in the background

Opening Settings left focus on `home-settings` instead of moving into the modal. Read-only DOM inspection found zero dialog roles. While the modal was still open, Shift+Tab moved focus to `home-pause` behind it. This reproduces the source finding in `site/js/ui/modal.js`; fix dialog naming, initial/restored focus, background inertness and stacked-modal behavior in the shared helper.

### P1 — paused settings has no gaze-enabled escape path

After pausing and opening Settings by click, runtime inspection recorded `paused: true`, `modalOpen: true`, 25 modal dwell targets and zero `data-dwell-always` targets. Focus remained on `home-settings`. Source in `gaze/dwell.js` restricts gaze to the top modal and rejects all paused targets without that attribute. Together these establish an inaccessible gaze-recovery state; actual eye movement was not exercised. Provide an always-reachable resume/close action without enabling arbitrary settings during pause.

### P2 — leaving the empty library leaves a stale route

Clicked Books, inspected the empty-library state, then clicked Exit. The reader was hidden while `location.hash` remained `#/books`. Define and synchronize the section navigation lifecycle, including explicit exits, native Back and direct links.

### P2 — compact Home labels need refinement

At 390×844, Settings breaks inside the Ukrainian word. At 360×640, secondary descriptions are visibly clipped in their tiles. Shorter labels or deliberate line breaks/geometry should replace arbitrary word breaking, without shrinking all controls or text.

## Earlier risks narrowed by runtime evidence

At 360×640, Home Pause was inside the viewport (top 562.97, bottom 626.97, height 64 CSS px); Settings was also inside it (bottom 628). Therefore normal-size Home recovery controls are NOT confirmed off-screen at this size. Enlarged text, zoom, longer errors and short landscape remain untested. The source-only overflow concern remains limited to those conditions.

The welcoming home palette and learning/break grouping work in the inspected desktop and portrait views. Secondary systems still visibly use the old dark design. Preserve the direction and prioritize operability before further decorative changes.

## Independent reviewer

The subagent had no browser-control tool exposed, so its review was source-only. It independently confirmed shared-dialog and paused-recovery mechanisms, the nine-column reader sizing issue, the ten-book limit, missing library pagination and navigation-state inconsistencies. It also noted settings rebuild their controls after adjustments, which needs a focus-retention test in the next pass.

## Recommended next implementation pass

1. Shared accessible modal lifecycle plus an always-reachable paused recovery path.
2. Responsive paged settings; verify 360×640, 390×844, landscape and enlarged text.
3. High-contrast home dwell progress, intentional compact labels, stable pause placement.
4. Paged PDF library and a smaller primary reader toolbar; retain local PDF/progress storage and add explicit empty/error recovery.
5. Consistent route/Back handling, then extend the visual system across the reading journey.

Validate each change with mouse/keyboard and simulated dwell. Webcam accuracy, calibration and fatigue require representative hardware and supported user feedback; viewport screenshots do not answer them.

## End state and exclusions

Reset the temporary viewport override and reloaded the preview at Home, unpaused. No uploads, account changes, camera permissions, source edits or deployment changes were performed. No full PDF reading, >10-book import, storage failure, physical touch, 200% zoom or real gaze test was completed.
