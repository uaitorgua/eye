import { store } from './store.js';

let synth = window.speechSynthesis;
let voices = [];

if (synth) {
  // Браузери завантажують голоси асинхронно
  synth.onvoiceschanged = () => { voices = synth.getVoices(); };
  voices = synth.getVoices();
}

export function speak(text) {
  if (!store.settings.voiceEnabled || !synth || !text) return;
  
  // Зупиняємо попереднє озвучення (щоб голос не накладався при швидкому перемиканні)
  synth.cancel();

  // Видаляємо емодзі з тексту, щоб синтезатор не читав їх як "smiley face"
  const cleanText = text.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
  if (!cleanText) return;

  const u = new SpeechSynthesisUtterance(cleanText);
  
  const isEng = store.settings.lang === 'en';
  
  // Вибір найкращого голосу: uk-UA для української, en-GB (британська) для англійської.
  // Ніколи не фоллбекаємо на 'ru'!
  const voice = pickBestVoice(isEng);
  if (voice) u.voice = voice;
  
  // Для англійської спробуємо застосувати дуже просту транслітерацію/переклад ключових слів на льоту,
  // оскільки всі алгоритми жорстко закодовані українською.
  if (isEng) {
    u.lang = 'en-GB';
    u.text = translateToEn(cleanText);
  } else {
    u.lang = 'uk-UA';
  }
  
  u.rate = 1.1; // трохи швидше для алгоритмів
  
  synth.speak(u);
}

// Вибір найякіснішого голосу для мови.
function pickBestVoice(isEng) {
  if (!voices.length) return null;
  
  // Пріоритетні префікси мови
  const preferred = isEng ? ['en-GB', 'en-US', 'en-AU', 'en'] : ['uk-UA', 'uk'];
  
  // Знаходимо всі голоси, що підходять за мовою
  const candidates = [];
  for (const pref of preferred) {
    for (const v of voices) {
      if (v.lang.startsWith(pref) && !candidates.includes(v)) candidates.push(v);
    }
  }
  
  if (!candidates.length) return null;
  
  // Ранжуємо: вищий бал = кращий голос
  const scored = candidates.map(v => {
    let score = 0;
    const name = v.name.toLowerCase();
    // Якісні голоси (Google, Microsoft Online, Natural)
    if (name.includes('google')) score += 10;
    if (name.includes('natural')) score += 8;
    if (name.includes('online')) score += 6;
    // Не-дефолтні зазвичай кращі
    if (!v.default) score += 2;
    // Уникаємо дуже простих голосів
    if (name.includes('zira') || name.includes('david') || name.includes('hazel')) score -= 3;
    return { voice: v, score };
  });
  
  scored.sort((a, b) => b.score - a.score);
  return scored[0].voice;
}

export function stopSpeaking() {
  if (synth) synth.cancel();
}

// Мікро-словник для перекладу повідомлень алгоритмів на льоту (дуже базовий)
function translateToEn(txt) {
  return txt
    .replace(/Шукаємо число/gi, 'Looking for number')
    .replace(/в масиві/gi, 'in array')
    .replace(/Перевіряємо елемент/gi, 'Checking element')
    .replace(/Знайшли/gi, 'Found')
    .replace(/на позиції/gi, 'at position')
    .replace(/Знайдено за/gi, 'Found in')
    .replace(/кроків/gi, 'steps')
    .replace(/не знайдено/gi, 'not found')
    .replace(/Діапазон/gi, 'Range')
    .replace(/Середина/gi, 'Middle')
    .replace(/шукаємо праворуч/gi, 'search right')
    .replace(/шукаємо ліворуч/gi, 'search left')
    .replace(/Починаємо/gi, 'Starting')
    .replace(/Порівнюємо/gi, 'Comparing')
    .replace(/міняємо/gi, 'swapping')
    .replace(/на своєму місці/gi, 'is in place')
    .replace(/Масив відсортовано/gi, 'Array is sorted')
    .replace(/Новий мінімум/gi, 'New minimum')
    .replace(/Зсуваємо/gi, 'Shifting')
    .replace(/Відсортовано/gi, 'Sorted')
    .replace(/Ділимо/gi, 'Dividing')
    .replace(/Зливаємо/gi, 'Merging')
    .replace(/беремо/gi, 'taking')
    .replace(/Заходимо у вершину/gi, 'Visiting node')
    .replace(/Дивимось ребро/gi, 'Checking edge')
    .replace(/йдемо туди/gi, 'going there')
    .replace(/Повертаємось до/gi, 'Returning to')
    .replace(/вже відвіданий/gi, 'already visited')
    .replace(/оброблена/gi, 'processed')
    .replace(/Обійшли всі/gi, 'Visited all')
    .replace(/вершин/gi, 'nodes')
    .replace(/Додаємо/gi, 'Adding')
    .replace(/у чергу/gi, 'to queue')
    .replace(/з черги/gi, 'from queue')
    .replace(/Оновили відстань до/gi, 'Updated distance to')
    .replace(/Найкоротші шляхи знайдено/gi, 'Shortest paths found')
    .replace(/Рахуємо вхідний степінь/gi, 'Calculating in-degree')
    .replace(/степінь/gi, 'degree')
    .replace(/до результату/gi, 'to result')
    .replace(/ще чекаємо/gi, 'still waiting')
    .replace(/Порядок/gi, 'Order')
    .replace(/Сортуємо/gi, 'Sorting')
    .replace(/ребер за вагою/gi, 'edges by weight')
    .replace(/вага/gi, 'weight')
    .replace(/Цикл!/gi, 'Cycle!')
    .replace(/вже з'єднані/gi, 'already connected')
    .replace(/Загальна вага/gi, 'Total weight')
    .replace(/Крок/gi, 'Step')
    .replace(/і/gi, 'and')
    .replace(/та/gi, 'and');
}
