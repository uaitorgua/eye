// Керування виконанням: Запуск (автоматично), Крок (по одному), Стоп.
// Тримає генератор з interpreter.js, підсвічує активний блок, питає ввід через numpad.
import { store } from '../core/store.js';
import { emit } from '../core/bus.js';
import { run, RuntimeError } from '../lang/interpreter.js';
import { print, clearConsole, showVars } from './console.js';
import { numpad } from './editors.js';

let gen = null, vars = {}, timer = null, auto = false, waitingInput = false;
export const runState = { activeId: null, errorId: null };

function setRunning(v) {
  store.running = v;
  emit('run-state', { running: v, auto });
}

function begin() {
  clearConsole();
  vars = {};
  gen = run(store.program, vars);
  runState.errorId = null;
  setRunning(true);
  print('▶ Програма почалась', 'sys');
}

function finish(msg, cls = 'sys') {
  clearTimeout(timer);
  gen = null; auto = false;
  runState.activeId = null;
  if (msg) print(msg, cls);
  setRunning(false);
}

// Виконати до наступного кроку (події 'step'). Повертає false, якщо програма закінчилась.
async function advance(inputValue) {
  try {
    let r = inputValue === undefined ? gen.next() : gen.next(inputValue);
    while (!r.done) {
      const ev = r.value;
      if (ev.type === 'step') {
        runState.activeId = ev.id;
        showVars(vars);
        emit('run-state', { running: true, auto });
        document.getElementById('blk-' + ev.id)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        return true;
      }
      if (ev.type === 'output') { print(ev.text); r = gen.next(); continue; }
      if (ev.type === 'input') {
        waitingInput = true;
        const value = await numpad(`⌨️ Введи значення для «${ev.name}»`);
        waitingInput = false;
        if (!gen) return false;   // зупинили під час вводу
        print(`${ev.name} ← ${value}`, 'input');
        r = gen.next(value);
        continue;
      }
    }
    showVars(vars);
    finish('■ Програма закінчилась');
    return false;
  } catch (e) {
    if (e instanceof RuntimeError) {
      runState.errorId = e.id;
      showVars(vars);
      finish('⚠ ' + e.message, 'error');
      return false;
    }
    throw e;
  }
}

async function tickAuto() {
  if (!gen || !auto || waitingInput) return;
  if (await advance()) timer = setTimeout(tickAuto, store.settings.runSpeedMs);
}

export function startRun() {
  if (gen && auto) return;
  if (!gen) begin();
  auto = true;
  tickAuto();
}

export async function stepRun() {
  if (!gen) { begin(); }
  auto = false; clearTimeout(timer);
  if (!waitingInput) await advance();
}

export function stopRun() {
  if (gen) finish('■ Зупинено');
}
