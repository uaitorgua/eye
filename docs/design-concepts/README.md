# UAIT Eye: screen concepts

These are exploratory AI-generated images, not screenshots of implemented behavior. Book titles, page counts, gameplay scores and article content are illustrative. They extend the cream, navy, cobalt and saffron direction of the Home concept and show large targets for gaze interaction. They are not evidence of accessibility, tracking accuracy or suitability for the intended child.

| Sheet | Surfaces |
| --- | --- |
| [01-library-reader.png](01-library-reader.png) | Book library and PDF reader |
| [02-algorithms-browser.png](02-algorithms-browser.png) | Flowchart editor and simplified web browser |
| [03-settings-calibration.png](03-settings-calibration.png) | Paged settings and calibration |
| [04-tetris-trainer.png](04-tetris-trainer.png) | Tetris and gaze trainer |

## Review before implementation

- These are two-screen compositions, so actual control sizes and readability must be verified on each target screen, especially on small screens and at 200% zoom. Preserve large, separated gaze targets and always-reachable pause/resume and return actions.
- **Library/reader:** covers, textbooks and page count are fictional. The library's Next button appears enabled when there is only one page; fix the state in implementation. The reader's up/down arrows appear on both edges and conflict with their labels; define the edge-scrolling directions clearly. Preserve fit-width and the existing auto-scroll toggle, absent from the concept. Do not confuse dwell feedback with reading progress.
- **Algorithms/browser:** the algorithm panel depicts a copy function and component palette not established as current functionality. It also omits horizontal scroll, File and Settings. Reconcile with actual behavior rather than inventing features. The article photo and text are illustrative; use actual allowed-site content and appropriately licensed assets. The generated browser layout duplicates navigation labels and should avoid duplicated gaze targets.
- **Settings/calibration:** pagination is a proposed response to the current cramped settings screen, not an implemented feature. “Плавність/Магніт: Середня” are illustrative labels; preserve current numerical settings and accessibility. The calibration image shows only one point: the real calibration collects and validates multiple screen positions, shows the camera when required, and reports results. Do not replace or obscure that established calibration flow, focus cues, or failure recovery based on the illustration. A permanently available Menu/Pause during calibration is a proposal whose interaction with the real calibration process must be designed and tested before use.
- **Tetris/trainer:** the mockup moves rotation from the game canvas to a distinct control, a proposed interaction change that needs validation. It depicts Menu and Pause twice on the trainer; retain one predictable location. The tagline suggesting this is an app solely for learning Ukrainian is inaccurate and should be removed. Example scores and progress are not real data. Avoid attributing therapeutic benefits to the trainer.
- Confirm hierarchy with the child, mentor and caregiver. Reading is emphasized because it was discussed as important, but is not yet a validated primary task. Test mouse, keyboard, touch and the intended camera/eye tracker; a still image does not prove operability or comfort.

## Generation prompts

Generated with Codex's built-in image-generation tool, using four separate prompts. Each requested two straight-on desktop UAIT Eye screen mockups in Ukrainian with the existing warm ivory, deep navy, cobalt and saffron palette, large separated gaze targets and Menu/Pause controls. Pair-specific prompts described (1) a PDF library and reader, (2) flowchart editor and browser, (3) paginated settings and calibration, and (4) Tetris and the gaze trainer. No images of a child, personal data or real textbook files were supplied. Generated text and visual details are proposals subject to the review notes above.
