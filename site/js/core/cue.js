// Аудіо-підказка: студійний MP3, якщо він є, інакше браузерний синтез (speechSynthesis).
// Дає плавний апгрейд: щойно поклали audio/<key>.mp3 — застосунок озвучує ним; поки нема — говорить браузер.
import { speak } from './voice.js';
import { store } from './store.js';

const cache = {};   // key -> true, якщо файл існує (щоб не робити зайвих запитів)

export function cue(key, text) {
  if (!store.settings.voiceEnabled) return;
  let done = false;
  const fallback = () => { if (done) return; done = true; try { speak(text); } catch { /* тиша */ } };
  if (cache[key] === false) return fallback();
  try {
    const a = new Audio(`audio/${key}.mp3`);
    a.onerror = () => { cache[key] = false; fallback(); };
    a.oncanplay = () => { cache[key] = true; };
    a.onended = () => { done = true; };
    const p = a.play();
    if (p && p.catch) p.catch(() => { cache[key] = false; fallback(); });
  } catch { fallback(); }
}
