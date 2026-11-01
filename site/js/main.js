// Точка входу: з'єднує модулі. Логіки тут мінімум — лише «що на що реагує».
import { store, programChanged } from './core/store.js';
import { on } from './core/bus.js';
import { initGazeSession } from './gaze/session.js';
import { renderChart } from './ui/flowchart.js';
import { choose } from './ui/modal.js';
import { toast } from './ui/dom.js';
import { chooseBlockKind, editStmt } from './ui/editors.js';
import { createStmt, insertStmt, removeStmt, BLOCK_INFO } from './model/program.js';
import { startRun, stepRun, stopRun, runState } from './ui/runner.js';
import { showVars } from './ui/console.js';
import { openSettings, openFileMenu } from './ui/settings.js';
import { initTetris } from './tetris/tetris.js';
import { initReader } from './reader/reader.js';
import { initHome } from './portal/home.js';
import { initBrowser } from './browser/browser.js';
import { initRelax } from './relax/relax.js';
import { initBreakReminder } from './core/breaks.js';

const $ = (id) => document.getElementById(id);
const onDwell = (id, fn) => $(id).addEventListener('dwell', fn);

// ---------- Блок-схема ----------
function redraw() {
  $('chart').style.zoom = store.settings.zoom;
  renderChart($('chart'), store.program, {
    locked: store.running,
    activeId: runState.activeId,
    errorId: runState.errorId,
    onInsert: async (listId, index) => {
      const kind = await chooseBlockKind();
      if (!kind) return;
      const st = createStmt(kind);
      if (await editStmt(st)) { runState.errorId = null; insertStmt(store.program, listId, index, st); programChanged(); }
    },
    onBlock: async (st) => {
      const info = BLOCK_INFO[st.kind];
      const hasChildren = ['if', 'while', 'for'].includes(st.kind);
      const a = await choose(`${info.icon} ${info.title}`, [
        { label: 'Змінити', icon: '✏️', value: 'edit' },
        { label: 'Видалити', icon: '🗑', value: 'del', cls: 'danger', sub: hasChildren ? 'разом з усім всередині' : '' },
      ], { cols: 3 });
      if (a === 'edit' && await editStmt(st)) { runState.errorId = null; programChanged(); }
      if (a === 'del') {
        const sure = !hasChildren || await choose('Точно видалити?', [{ label: 'Так, видалити', icon: '🗑', value: true, cls: 'danger' }], { cols: 2 });
        if (sure) { removeStmt(store.program, st.id); programChanged(); }
      }
    },
  });
}
on('program-changed', redraw);
on('settings-changed', redraw);
on('run-state', ({ running, auto }) => {
  document.body.classList.toggle('running', running);
  $('btn-run').classList.toggle('active', running && auto);
  redraw();
});

// ---------- Тулбар ----------
onDwell('btn-run', () => startRun());
onDwell('btn-step', () => stepRun());
onDwell('btn-stop', () => stopRun());
onDwell('btn-file', () => { if (!store.running) openFileMenu(); else toast('Спочатку зупиніть програму'); });
onDwell('btn-settings', () => openSettings());

// Прокрутка схеми поглядом.
const scrollBy = (dx, dy) => $('chart-wrap').scrollBy({ left: dx * $('chart-wrap').clientWidth * 0.35, top: dy * $('chart-wrap').clientHeight * 0.35, behavior: 'smooth' });
onDwell('scroll-up', () => scrollBy(0, -1));
onDwell('scroll-down', () => scrollBy(0, 1));
onDwell('scroll-left', () => scrollBy(-1, 0));
onDwell('scroll-right', () => scrollBy(1, 0));

// ---------- Старт ----------
initGazeSession({ statusEl: $('cam-status'), calibBtn: $('btn-calib'), pauseBtn: $('btn-pause') });
initTetris();
initReader();
initBrowser();
initRelax();
initBreakReminder();
initHome();       // після Тетрісу й Книг: їхні кнопки «Вихід» уже прив'язані
redraw();
showVars({});
