// Збереження програми у файл .json і відкриття з файлу.
// Вікно вибору файлу браузер відкриває лише після справжнього кліку мишею (викладач);
// погляд його не відкриє — тому підпис «клік мишею».
import { store, setProgram } from '../core/store.js';
import { serializeProgram, parseProgramFile } from '../model/program-file.js';
import { keyboard } from './editors.js';
import { toast } from './dom.js';

export async function exportProgramFile() {
  const name = await keyboard('Як назвати файл?', 'моя програма');
  if (name == null) return;
  const safe = name.trim().replace(/[\\/:*?"<>|]+/g, '_') || 'програма';
  const blob = new Blob([serializeProgram(store.program, name.trim())], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = safe + '.eyeflow.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Файл збережено в «Завантаження» ✓');
}

export function importProgramFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const { program, name } = parseProgramFile(await file.text());
      setProgram(program);
      toast('Відкрито: ' + (name || file.name));
    } catch (e) {
      toast(e.message, 6000);
    }
  });
  input.click();
}
