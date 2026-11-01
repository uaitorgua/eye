// Відбір посилань для «Лупи» Браузера. [pure]
//   visibleLinks(blocks, blockRects, viewRect) → унікальні посилання блоків, що хоч частково видно
//   pageOf(items, start, size) → { items, hasMore, next }

// blockEls — масив об'єктів з getBoundingClientRect() і dataset.i (індекс блоку); у тестах — прості об'єкти.
export function visibleLinks(blocks, blockEls, viewRect) {
  const seen = new Set();
  const out = [];
  for (const el of blockEls) {
    const r = el.getBoundingClientRect();
    if (r.bottom <= viewRect.top || r.top >= viewRect.bottom) continue;
    const block = blocks[Number(el.dataset.i)];
    for (const link of block?.links || []) {
      if (seen.has(link.href)) continue;
      seen.add(link.href);
      out.push(link);
    }
  }
  // Дозволені посилання — першими: їх можна відкрити.
  return out.sort((a, b) => Number(b.allowed) - Number(a.allowed));
}

export function pageOf(items, start, size) {
  const slice = items.slice(start, start + size);
  const next = start + size;
  return { items: slice, hasMore: next < items.length, next };
}
