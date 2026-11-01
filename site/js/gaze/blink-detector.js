// Автомат розпізнавання кліпання за EAR (eye aspect ratio). [pure]
//   const d = createBlinkDetector();  d.update(ear, nowMs, longCloseMs) → ['closed' | 'opened' | 'doubleblink' | 'longclose', ...]
// Базова лінія відкритого ока вчиться сама; закрите — EAR < CLOSED_RATIO × базова.

export const CLOSED_RATIO = 0.62;
export const OPEN_RATIO = 0.75;        // гістерезис
export const BLINK_MIN = 60, BLINK_MAX = 550;
export const DOUBLE_GAP = 900;
// «Довге закриття» = клік, лише якщо око розплющується у вікні [longCloseMs, longCloseMs + REST_WINDOW].
// Довше закриття вважаємо ВІДПОЧИНКОМ і кліку не робимо — щоб людина могла спокійно заплющити очі,
// не боячись випадкового натискання. Клік спрацьовує на РОЗПЛЮЩЕННІ, а не поки очі закриті.
export const REST_WINDOW = 2500;

export function createBlinkDetector() {
  let baseline = 0, closed = false, closedAt = 0, lastBlinkEnd = -Infinity;

  return {
    get closed() { return closed; },
    get baseline() { return baseline; },
    update(e, now, longCloseMs) {
      const out = [];
      if (!baseline) baseline = e;
      if (!closed) baseline = e > baseline ? baseline * 0.9 + e * 0.1 : baseline * 0.995 + e * 0.005;

      if (!closed && e < baseline * CLOSED_RATIO) {
        closed = true; closedAt = now;
        out.push('closed');
      } else if (closed && e > baseline * OPEN_RATIO) {
        closed = false;
        out.push('opened');
        const dur = now - closedAt;
        if (dur >= BLINK_MIN && dur <= BLINK_MAX) {
          // коротке кліпання (можливо, подвійне)
          if (now - lastBlinkEnd < DOUBLE_GAP) { out.push('doubleblink'); lastBlinkEnd = -Infinity; }
          else lastBlinkEnd = now;
        } else if (dur >= longCloseMs && dur <= longCloseMs + REST_WINDOW) {
          out.push('longclose');        // навмисне довге заплющення й розплющення = клік
        }
        // dur поза вікнами: мимовільний мікрорух або відпочинок — жодної дії
      }
      return out;
    },
  };
}

// EAR з точок facemesh: індекси [верх, низ, лівий кут, правий кут].
export const LEFT_EYE = [159, 145, 33, 133], RIGHT_EYE = [386, 374, 362, 263];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function eyeAspect(points, [t, b, l, r]) { return dist(points[t], points[b]) / (dist(points[l], points[r]) || 1); }
