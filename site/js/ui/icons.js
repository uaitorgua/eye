import { h } from './dom.js';

const icons = {
  "🏠": "house",
  "👁": "eye",
  "▶": "play",
  "👣": "footprints",
  "■": "square",
  "📁": "folder",
  "🎯": "target",
  "⚙": "settings",
  "◀": "chevron-left",
  "⬇": "arrow-down",
  "⬇️": "arrow-down",
  "⬆️": "arrow-up",
  "🚪": "log-out",
  "🔄": "refresh-cw",
  "⬅": "arrow-left",
  "📚": "library",
  "📰": "newspaper",
  "🎓": "graduation-cap",
  "🔍": "zoom-out",
  "↔": "move-horizontal",
  "🔎": "zoom-in",
  "⏫": "chevrons-up",
  "⏬": "chevrons-down",
  "⋯": "ellipsis",
  "⏸": "pause",
  "🔖": "bookmark",
  "🔗": "link",
  "🔠": "case-sensitive",
  "⏮": "skip-back",
  "⏭": "skip-forward",
  "✕": "x",
  "✏️": "pencil",
  "🗑": "trash-2",
  "📷": "camera",
  "🖱": "mouse",
  "🙂": "scan-face",
  "✓": "check",
  "➕": "plus",
  "🧹": "eraser",
  "🌐": "globe",
  "🔊": "volume-2",
  "🔔": "bell",
  "📍": "map-pin",
  "📄": "file",
  "💡": "lightbulb",
  "💾": "save",
  "📂": "folder-open",
  "🧩": "puzzle",
  "⌨️": "keyboard",
  "⌨": "keyboard",
  "⌫": "delete",
  "⇧": "arrow-up",
  "␣": "space",
  "➡": "arrow-right",
  "🚫": "ban",
  "💬": "message-square",
  "📦": "box",
  "❓": "circle-help",
  "🔁": "repeat",
  "🔢": "hash",
  "☰": "ellipsis",
  "⏱": "eye"
};

export function iconElement(symbol) {
  const name = icons[symbol] || 'globe';
  return h('span', { class: 'ui-icon', 'aria-hidden': 'true', style: `--icon:url(../assets/icons/${name}.svg)` });
}

// Leading pictograph in a heading ("📁 Файл") → { icon, text }. Unknown symbols are dropped so
// emoji never render inside titles; the icon set stays the only source of pictograms.
export function splitIcon(text) {
  const match = /^([^\p{L}\p{N}«"(]+)\s+(.+)$/su.exec(String(text));
  if (!match) return { icon: null, text };
  const symbol = match[1].trim();
  return { icon: icons[symbol] ? symbol : null, text: match[2] };
}
