// Розпізнавання закриття очей за точками повік з facemesh (WebGazer).
// Не покладаємось на «зник погляд»: при закритих очах WebGazer часто далі видає точки.
// Сам автомат — у blink-detector.js [pure]; тут лише опитування камери й події.
//
// Події на document:
//   'eyes-closed' / 'eyes-opened'  — стан змінився
//   'gaze-doubleblink'             — два короткі кліпання поспіль
//   'gaze-longclose'               — навмисне довге заплющення й РОЗПЛЮЩЕННЯ (у вікні longCloseMs..+REST_WINDOW);
//                                    ще довше закриття = відпочинок, кліку немає (див. blink-detector.js)
import { store } from '../core/store.js';
import { createBlinkDetector, eyeAspect, LEFT_EYE, RIGHT_EYE } from './blink-detector.js';

const EVENT = { closed: 'eyes-closed', opened: 'eyes-opened', doubleblink: 'gaze-doubleblink', longclose: 'gaze-longclose' };

export const eyes = { closed: false, reopenedAt: 0, ear: 0, baseline: 0, ok: false };

const FACE_LOST_MS = 1000;
let detector = createBlinkDetector();
let lastFace = 0;

function sample(now) {
  const pos = window.webgazer?.getTracker?.()?.getPositions?.();
  if (!pos || pos.length < 400) {                 // обличчя не видно — не вважаємо це закриттям
    eyes.ok = false;
    if (now - lastFace > FACE_LOST_MS && eyes.closed) {
      // Не лишаємо вказівник замороженим назавжди: скидаємо стан без жодного «кліку».
      detector = createBlinkDetector();
      Object.assign(eyes, { closed: false, reopenedAt: now });
      document.dispatchEvent(new CustomEvent('eyes-opened'));
    }
    return;
  }
  lastFace = now;
  eyes.ok = true;
  eyes.ear = (eyeAspect(pos, LEFT_EYE) + eyeAspect(pos, RIGHT_EYE)) / 2;
  eyes.baseline = detector.baseline;
  for (const ev of detector.update(eyes.ear, now, store.settings.longCloseMs)) {
    if (ev === 'closed') eyes.closed = true;
    if (ev === 'opened') { eyes.closed = false; eyes.reopenedAt = now; }
    document.dispatchEvent(new CustomEvent(EVENT[ev]));
  }
}

let timer = null;
export function startBlinkDetection() {
  if (!timer) timer = setInterval(() => sample(performance.now()), 33);
}
