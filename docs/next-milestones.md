# UAIT Eye: screens and next milestones

The approved starting point is the warm paper, navy, cobalt and yellow Home design. Its oversized library action is an assumption until the student and mentor confirm their priorities. The concepts in `design-concepts/` are illustrations, not specifications or tested functionality.

## Screen direction

- **First run and calibration:** two large input choices, clear camera permission and positioning help, multi-point calibration with progress, validation, retry and recovery. Preserve existing calibration logic and gesture suppression.
- **Home:** large labeled targets, clear dwell feedback and consistently reachable Pause and Settings. Confirm the balance between reading and other activities with the student.
- **Library and reader:** browse a few large book targets per page, add PDF with adult assistance, resume prior progress, paginate the library and show clear empty/error states. Keep reading content central; prioritize Menu, Previous, Next and Pause with a separate accessible options panel for zoom and other controls.
- **Algorithms:** keep flowchart, program output and variables visible; provide accessible insertion, Run, Step, Stop, File and navigation controls. Preserve existing interpreter behavior and protect unsaved work.
- **Internet:** allowed sites and links, readable pages and accessible Menu, Back, scrolling and font controls. The actual feature requires the existing PHP backend.
- **Tetris and trainer:** large, stable controls, clear instructions, exit and recovery. Preserve the eye-closure suppression used during exercises. Do not make unsupported medical claims.

## Feature priorities

1. **Safe recovery:** address paused-state escape in every dialog, accessible dialog focus/lifecycle, accidental reactivation after transitions, and responsive Settings. The current change covers Settings Close during pause only.
2. **One complete learning journey:** Home → library → PDF → return, including pagination beyond ten books, readable controls, error recovery and persistent progress. Existing PDFs and progress are stored in browser IndexedDB per origin: preview and production libraries are separate.
3. **Navigation and consistency:** synchronize URLs and browser Back, extend the visual language across library/reader, settings and algorithms, and retain existing accessibility feedback.
4. **Real conditions:** evaluate webcam calibration, tracking loss, privacy/network behavior, intended device, accessibility preferences and fatigue with appropriate support from the mentor and intended user. Avoid asserting video is local-only until verified.
5. **Release:** review the branch, test PHP browser features on a matching backend and reconcile server-side changes (especially `browser-sites.json`) before any production deployment. The private static preview excludes PHP.

## Validation

For each implemented flow, exercise mouse/keyboard and simulated dwell at desktop and phone sizes, then test actual gaze input on representative hardware. Include pause/resume, modal focus, lost tracking, zoom/long text, persistence and failure recovery. A screenshot or successful calibration alone does not establish usability.
