# Eye: evidence and engineering roadmap

Research note, 3 November 2026. The intended user is one 12-year-old student. His device, visual and motor needs, preferred activities, support arrangements and access to a dedicated eye tracker remain unknown. Ask him, his family and mentor; do not infer these from a diagnosis. Include the child in decisions in a way he chooses, with the option to stop or take breaks ([UNICEF](https://www.unicef.org/documents/disability-inclusion-frontline-workers-training-focus-brief-participation), [W3C](https://www.w3.org/TR/coga-usable/)).

## Most valuable next milestone: independently open and read one textbook

1. **Agree on the real setup.** Record screen size, browser, camera, positioning, lighting, existing input devices, reading goals and how the child wants to give feedback. Ask what success would mean for him. Do not collect diagnosis or video unless needed and explicitly agreed.
2. **Test the complete journey** on that setup: start, choose input, calibrate, open a real permitted textbook, turn pages, pause, return home and resume after restarting. Observe unassisted completions, wrong activations, recovery, time and the child's own comfort; compare with mouse or any existing assistive tracker. Agree a small number of sessions rather than claiming accuracy from a demo. Treat the result as one person's experience, not population-level evidence.
3. **Make failure recoverable.** A visible tracking status, a gaze-accessible pause/resume, safe retry and a way for an adult to return to another input should work at every stage. Test camera denied, camera disconnected, loss of face, browser refresh and storage full. Camera permission and a secure context are required by the browser ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)).
4. **Keep text labels and large separated controls.** The 24 CSS pixel WCAG 2.2 minimum has exceptions and is a floor, not a target proven sufficient for gaze; determine usable size, spacing and dwell settings with this child. Keep alternatives to dragging, plus keyboard access ([W3C WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)).

## Candidate features, in priority order

| Priority | Proposal | Why / acceptance test |
| --- | --- | --- |
| 1 | **Reading continuity** | Existing PDF library already has local storage, paging and saved progress. Verify a real PDF including large scanned pages; improve visible recovery and preserve position after reload. A student can return to the same page without help. |
| 2 | **Gaze setup and quality check** | Existing multi-point calibration, validation and drift prompts are a start. Add a short separate target-check task with pass/retry and clear loss-of-tracking feedback, then tune using actual device observations. Avoid calling calibration success proof of reliable control. |
| 3 | **Personalized reading controls** | Offer a small set of adjustable dwell, text/contrast and page-navigation choices only after testing. Make changes reversible and remember them locally. First confirm what he needs. |
| 4 | **Accessible book formats and read-aloud** | Test whether textbooks contain selectable text; scans may not. Pilot a properly licensed accessible HTML/EPUB book with navigation and Ukrainian speech when suitable. UNESCO highlights navigation, speech and descriptions as accessible textbook features ([UNESCO](https://www.unesco.org/sdg4education2030/en/knowledge-hub/accessible-digital-textbooks-expand-inclusive-learning-millions-children)). Verify content rights and voice availability; avoid promising speech works for scanned PDFs. |
| 5 | **Communication board, only if requested** | A small customizable set of meaningful phrases with speech could support communication; design with the child and a qualified communication professional. Never assume the child cannot speak or replace established communication methods. |
| 6 | **Learning activities** | Extend the existing algorithm editor with a few age-appropriate, gaze-completable exercises and save/resume, after asking the child and mentor whether this matters more than other subjects. Measure whether he can complete an activity without hand assistance. |

## Engineering concerns

- **Webcam gaze is an experiment, not a hardware replacement guarantee.** WebGazer estimates gaze from a standard webcam and calibrates from user interaction; the original study establishes feasibility under its conditions, not suitability for this child ([original research](https://ijcai.org/proceedings/2016/540), [project documentation](https://webgazer.cs.brown.edu/)). Benchmark against the actual screen, posture, light and camera, including movement and tracking loss. The project reports upstream updates are no longer guaranteed; inspect the vendored version and license before updating or distributing.
- **Do not confuse drift estimates with ground truth.** `site/js/gaze/drift.js` compares activation coordinates to button centers. A user may intentionally look at an edge, and `fire()` can record an adult's manual click while webcam mode is active. Treat its warning as a heuristic; validate it before relying on it or changing calibration automatically.
- **Privacy and durability:** the library is browser-local IndexedDB, so a different origin/device or cleared browser data means a different library. Decide whether adult-initiated export/backup is necessary; never silently upload textbooks, camera footage or gaze data. WebGazer describes client-side processing, but verify this app's own network behavior before making privacy claims ([WebGazer](https://webgazer.cs.brown.edu/)).
- **Test the actual server:** the private static preview does not execute `browser.php`. Check the permitted-site browser and security on a representative PHP environment before release. Avoid exposing arbitrary remote browsing or adding accounts without a clear need.
- **Avoid medical claims:** an eye exercise or a game is not proven therapy by virtue of being in this app. Ask qualified professionals about any proposed therapeutic use.

## Decisions to ask the mentor and student

What device and input does he use today? Can he select targets reliably and for how long? Which subjects and specific textbooks does he want? Does he prefer speech, text, or another way to communicate? Who can help with setup and what would he like to do independently? What activities are enjoyable or frustrating? Are the necessary books available with permission?

Do not start by building accounts, AI tutoring, analytics or a large feature catalogue. First verify the reading journey and let the student's priorities decide the next investment.
