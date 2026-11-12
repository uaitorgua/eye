// Малює AST як блок-схему з HTML-елементів.
// Між блоками — слоти «+» (вставка). Все, що можна натиснути, має data-dwell.
//   renderChart(root, program, { onInsert(listId, index), onBlock(stmt), activeId, errorId, locked })
import { h } from './dom.js';
import { exprText } from '../lang/expr.js';
import { BLOCK_INFO } from '../model/program.js';

function blockText(st) {
  switch (st.kind) {
    case 'output': return exprText(st.expr);
    case 'input': return (st.name || '…');
    case 'assign': return `${st.name || '…'} = ${exprText(st.expr)}`;
    case 'if': return exprText(st.cond) + ' ?';
    case 'while': return 'поки ' + exprText(st.cond);
    case 'for': return `${st.name} від ${exprText(st.from)} до ${exprText(st.to)}`;
  }
  return '';
}

export function renderChart(root, program, opts) {
  const dwell = (el, fn) => {
    if (!opts.locked) { el.setAttribute('data-dwell', ''); el.addEventListener('dwell', fn); }
    return el;
  };

  const slot = (listId, index) =>
    dwell(h('div', { class: 'fc-slot', title: 'Додати блок' }, h('span', {}, '+')), () => opts.onInsert(listId, index));

  const block = (st) => {
    const info = BLOCK_INFO[st.kind];
    const cls = ['fc-block', 'kind-' + st.kind];
    if (st.id === opts.activeId) cls.push('active');
    if (st.id === opts.errorId) cls.push('error');
    return dwell(h('div', { class: cls.join(' '), id: 'blk-' + st.id },
      h('span', { class: 'fc-kind' }, info.icon + ' ' + info.title),
      h('span', { class: 'fc-text' }, blockText(st))), () => opts.onBlock(st));
  };

  const seq = (list, listId) => {
    const col = h('div', { class: 'fc-seq' });
    col.appendChild(slot(listId, 0));
    list.forEach((st, i) => {
      col.appendChild(stmt(st));
      col.appendChild(slot(listId, i + 1));
    });
    return col;
  };

  const stmt = (st) => {
    if (st.kind === 'if') {
      return h('div', { class: 'fc-if' }, block(st),
        h('div', { class: 'fc-branches' },
          h('div', { class: 'fc-branch yes' }, h('div', { class: 'fc-label' }, '✔ Так'), seq(st.yes, st.id + '.yes')),
          h('div', { class: 'fc-branch no' }, h('div', { class: 'fc-label' }, '✘ Ні'), seq(st.no, st.id + '.no'))),
        h('div', { class: 'fc-merge' }));
    }
    if (st.kind === 'while' || st.kind === 'for') {
      return h('div', { class: 'fc-loop' }, block(st),
        h('div', { class: 'fc-loop-body' }, seq(st.body, st.id + '.body')),
        h('div', { class: 'fc-label back' }, '↩ знову'));
    }
    return block(st);
  };

  // Порожня програма: підказуємо перший крок, щоб екран не виглядав «зламаним».
  const hint = !program.main.length && !opts.locked
    ? h('p', { class: 'fc-empty-hint' }, h('b', {}, 'Тут буде твоя програма.'), ' Подивись на «+» між «Початок» і «Кінець», щоб додати перший блок.')
    : null;
  root.replaceChildren(h('div', { class: 'fc-seq fc-main' },
    h('div', { class: 'fc-terminal' }, '▶ Початок'),
    seq(program.main, 'main'),
    h('div', { class: 'fc-terminal end' }, '■ Кінець')), ...(hint ? [hint] : []));
}
