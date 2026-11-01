// Тетріс з керуванням очима (dwell).
// Логіка гри + рендеринг на canvas + інтеграція з DOM.
import { store } from '../core/store.js';
import { onPointer } from '../gaze/pointer.js';

// ═══════════════ Константи ═══════════════
const COLS = 10;
const ROWS = 20;

const TETROMINOES = [
  { shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], color: '#3fd0d0', glow: 'rgba(63,208,208,.45)' },   // I
  { shape: [[1,1],[1,1]],                               color: '#ffc257', glow: 'rgba(255,194,87,.45)' },   // O
  { shape: [[0,1,0],[1,1,1],[0,0,0]],                   color: '#b98cff', glow: 'rgba(185,140,255,.45)' },  // T
  { shape: [[0,1,1],[1,1,0],[0,0,0]],                   color: '#4cd08a', glow: 'rgba(76,208,138,.45)' },   // S
  { shape: [[1,1,0],[0,1,1],[0,0,0]],                   color: '#ff6b6b', glow: 'rgba(255,107,107,.45)' },  // Z
  { shape: [[1,0,0],[1,1,1],[0,0,0]],                   color: '#5aa9ff', glow: 'rgba(90,169,255,.45)' },   // J
  { shape: [[0,0,1],[1,1,1],[0,0,0]],                   color: '#ff9f5a', glow: 'rgba(255,159,90,.45)' },   // L
];

// Швидкість падіння (мс) по рівнях. Керування очима повільне (крок руху ~0,45 с,
// «клік» поворот/дроп до 2 с), тож падіння теж має бути неквапливим і ніколи не «панічним».
const SPEEDS = [2600, 2400, 2200, 2000, 1800, 1650, 1500, 1400, 1300, 1200, 1100, 1000, 950, 900, 850];

// Поки гравець «цілиться» — дивиться на зону керування — фігура не падає (погляд зайнятий
// керуванням, а не дошкою). Гравітація діє лише коли погляд вільний (на дошці).
const AIM_FREEZE_MS = 550;
let lastAimAt = -Infinity;

// Очки за кількість зібраних рядків
const LINE_SCORES = [0, 100, 300, 500, 800];

// ═══════════════ Стан гри ═══════════════
let board, current, nextPiece, score, linesCleared, level, gameOver;
let canvas, ctx, nextCanvas, nextCtx;
let cellSize, lastDrop, animId;
let bag = [];
let els = {};

// ═══════════════ Логіка дошки ═══════════════
function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

// 7-bag рандомізація (кожна фігура з'являється рівно раз перед повтором)
function nextFromBag() {
  if (!bag.length) {
    bag = [...Array(TETROMINOES.length).keys()];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag.pop();
}

function randomPiece() {
  const idx = nextFromBag();
  const t = TETROMINOES[idx];
  return {
    shape: t.shape.map(r => [...r]),
    color: t.color,
    glow: t.glow,
    x: Math.floor((COLS - t.shape[0].length) / 2),
    y: 0,
  };
}

function rotate(shape) {
  const N = shape.length;
  const out = Array.from({ length: N }, () => Array(N).fill(0));
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++)
      out[c][N - 1 - r] = shape[r][c];
  return out;
}

function valid(shape, px, py) {
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) {
        const nx = px + c, ny = py + r;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
        if (ny >= 0 && board[ny][nx]) return false;
      }
  return true;
}

function lock() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c]) {
        const ny = current.y + r;
        if (ny < 0) { gameOver = true; return; }
        board[ny][current.x + c] = current.color;
      }
  clearLines();
  spawn();
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(c => c)) {
      board.splice(r, 1);
      board.unshift(Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    linesCleared += cleared;
    score += LINE_SCORES[Math.min(cleared, 4)] * level;
    level = Math.floor(linesCleared / 10) + 1;
    updateInfo();
  }
}

function spawn() {
  current = nextPiece;
  nextPiece = randomPiece();
  if (!valid(current.shape, current.x, current.y)) gameOver = true;
  drawNext();
}

function ghostY() {
  let gy = current.y;
  while (valid(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

// ═══════════════ Рендеринг ═══════════════
function resize() {
  const container = canvas.parentElement;
  canvas.width = canvas.height = 0;           // щоб не заважало виміряти контейнер
  const maxH = container.clientHeight - 10;
  const maxW = container.clientWidth - 10;
  cellSize = Math.max(8, Math.floor(Math.min(maxW / COLS, maxH / ROWS)));
  canvas.width = cellSize * COLS;
  canvas.height = cellSize * ROWS;
  nextCanvas.width = nextCanvas.height = 120;
  drawNext();
}

function drawCell(context, x, y, color, alpha = 1, size = cellSize) {
  const pad = 2;
  const cx = x * size + pad;
  const cy = y * size + pad;
  const s = size - pad * 2;
  const r = Math.max(2, size * 0.12);

  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.beginPath();
  context.roundRect(cx, cy, s, s, r);
  context.fill();

  // Блиск (верхня частина)
  context.fillStyle = 'rgba(255,255,255,0.18)';
  context.beginPath();
  context.roundRect(cx + 1, cy + 1, s - 2, s * 0.35, [r, r, 0, 0]);
  context.fill();

  context.globalAlpha = 1;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Сітка
  ctx.strokeStyle = 'rgba(52,60,79,0.4)';
  ctx.lineWidth = 1;
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * cellSize); ctx.lineTo(COLS * cellSize, r * cellSize); ctx.stroke();
  }
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * cellSize, 0); ctx.lineTo(c * cellSize, ROWS * cellSize); ctx.stroke();
  }

  // Заблоковані блоки
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c]) drawCell(ctx, c, r, board[r][c]);

  if (!current || gameOver) return;

  // Тінь (ghost piece)
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawCell(ctx, current.x + c, gy + r, current.color, 0.18);

  // Поточна фігура з підсвіткою
  ctx.shadowColor = current.glow;
  ctx.shadowBlur = 12;
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawCell(ctx, current.x + c, current.y + r, current.color);
  ctx.shadowBlur = 0;
}

function drawNext() {
  if (!nextCtx || !nextPiece) return;
  const s = Math.floor(nextCanvas.width / 4);
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = nextPiece.shape;
  const ox = Math.floor((4 - shape[0].length) / 2);
  const oy = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      if (shape[r][c]) drawCell(nextCtx, ox + c, oy + r, nextPiece.color, 1, s);
}

function updateInfo() {
  if (els.score) els.score.textContent = score;
  if (els.level) els.level.textContent = level;
  if (els.lines) els.lines.textContent = linesCleared;
}

// ═══════════════ Ігровий цикл ═══════════════
function loop(time) {
  if (gameOver) { draw(); showGameOver(); return; }

  // Пауза застосунку зупиняє і гру; поки гравець цілиться поглядом у зону — гравітація завмирає.
  const aiming = time - lastAimAt < AIM_FREEZE_MS;
  if (aiming) lastDrop = time;      // не накопичуємо «борг» падіння, поки цілимось
  if (!store.paused && !aiming && !els.section.classList.contains('hidden')) {
    const speed = SPEEDS[Math.min(level - 1, SPEEDS.length - 1)];
    if (time - lastDrop >= speed) {
      if (!valid(current.shape, current.x, current.y + 1)) lock();
      else current.y++;
      lastDrop = time;
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function showGameOver() {
  const ov = document.getElementById('tetris-overlay');
  if (ov) {
    document.getElementById('tetris-final-score').textContent = score;
    ov.classList.remove('hidden');
  }
}

// ═══════════════ Керування ═══════════════
function moveLeft()  { if (current && !gameOver && valid(current.shape, current.x - 1, current.y)) current.x--; }
function moveRight() { if (current && !gameOver && valid(current.shape, current.x + 1, current.y)) current.x++; }

function rotatePiece() {
  if (!current || gameOver) return;
  const rotated = rotate(current.shape);
  for (const dx of [0, -1, 1, -2, 2]) {
    if (valid(rotated, current.x + dx, current.y)) {
      current.shape = rotated;
      current.x += dx;
      return;
    }
  }
}

function hardDrop() {
  if (!current || gameOver) return;
  // Очки за дроп: 2 × кількість пропущених рядків
  const rows = ghostY() - current.y;
  score += rows * 2;
  current.y = ghostY();
  lock();
  lastDrop = performance.now();
  updateInfo();
}

// ═══════════════ Публічний API ═══════════════
function startGame() {
  board = createBoard();
  bag = [];
  score = 0; linesCleared = 0; level = 1; gameOver = false;
  nextPiece = randomPiece();
  spawn();
  updateInfo();
  lastDrop = performance.now();
  if (animId) cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// Секція накриває весь екран (position: fixed), програма під нею не зникає.
export function openTetris() {
  els.section.classList.remove('hidden');
  resize();
  startGame();
}

export function closeTetris() {
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  els.section.classList.add('hidden');
  document.getElementById('tetris-overlay')?.classList.add('hidden');
}

export function initTetris() {
  els = {
    section: document.getElementById('tetris-section'),
    score:   document.getElementById('tetris-score'),
    level:   document.getElementById('tetris-level'),
    lines:   document.getElementById('tetris-lines'),
  };
  if (!els.section) return;

  canvas    = document.getElementById('tetris-canvas');
  ctx        = canvas.getContext('2d');
  nextCanvas = document.getElementById('tetris-next-canvas');
  nextCtx    = nextCanvas.getContext('2d');

  const bindDwell = (id, fn, repeat) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.setAttribute('data-dwell', '');
    if (repeat) btn.setAttribute('data-dwell-repeat', '');
    btn.addEventListener('dwell', fn);
  };

  bindDwell('btn-tetris-exit',   closeTetris);
  bindDwell('btn-tetris-overlay-exit', closeTetris);
  bindDwell('btn-tetris-restart', () => { document.getElementById('tetris-overlay')?.classList.add('hidden'); startGame(); });

  // Зони погляду. ◀ ▶ повторюються, поки на них дивитися; поворот і «впустити» — звичайний клік
  // (затримка, подвійне кліпання або довге закриття очей — як обрано в налаштуваннях).
  bindDwell('tz-left', moveLeft, true);
  bindDwell('tz-right', moveRight, true);
  bindDwell('tz-rotate', rotatePiece);
  bindDwell('tz-drop', hardDrop);

  // Погляд у будь-якій зоні керування = «цілюсь»: заморожуємо падіння (див. loop()).
  const zoneEls = ['tz-left', 'tz-right', 'tz-rotate', 'tz-drop']
    .map(id => document.getElementById(id)).filter(Boolean);
  onPointer((x, y) => {
    if (els.section.classList.contains('hidden')) return;
    for (const z of zoneEls) {
      const r = z.getBoundingClientRect();
      if (r.width && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        lastAimAt = performance.now();
        return;
      }
    }
  });

  // Клавіатура (для викладача / тестування)
  document.addEventListener('keydown', (e) => {
    if (els.section.classList.contains('hidden') || gameOver) return;
    switch (e.key) {
      case 'ArrowLeft':  moveLeft(); break;
      case 'ArrowRight': moveRight(); break;
      case 'ArrowUp':    rotatePiece(); break;
      case 'ArrowDown':  hardDrop(); break;
      case ' ':          hardDrop(); break;
      default: return;
    }
    e.preventDefault();
  });

  window.addEventListener('resize', () => {
    if (!els.section.classList.contains('hidden')) resize();
  });
}
