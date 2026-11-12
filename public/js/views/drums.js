// Bateria: biblioteca de ritmos, transporte e editor de passos.

import { h, icon, stepper, confirmAsk, groupBy } from '../ui.js';
import { playButton, beatLeds, patternSelect } from './common.js';
import {
  INSTRUMENTS, TIME_SIGNATURES, NEXT_CELL, stepsPerBar, totalSteps, velocityOf, signatureOf,
  genericFill, blankPattern, copyPattern, reshapePattern,
} from '../drums/patterns.js';
import { uid } from '../store.js';

let editFill = false;

const CELL_CLASS = { '.': 'off', x: 'on', X: 'acc', o: 'ghost' };
const CELL_WORD = { '.': 'vazio', x: 'normal', X: 'acento', o: 'leve' };

function customOf(app, id) {
  return app.store.get().customPatterns.find((p) => p.id === id);
}

export function render(app) {
  const s = app.store.get();
  const p = app.pattern(s.drums.patternId);
  const editable = !p.builtin;
  const offs = [];
  const sig = signatureOf(p);
  const swingAllowed = p.stepsPerBeat === 4 || p.stepsPerBeat === 2;

  // ---- Biblioteca ----
  const createPattern = () => {
    const np = blankPattern(`c-${uid()}`);
    app.store.update((st) => { st.customPatterns.unshift(np); });
    app.selectPattern(np.id);
  };
  const groups = groupBy(app.patterns(), (x) => (x.builtin ? x.style : 'Meus ritmos'));
  const compactPicker = h('div', { class: 'lib-compact' },
    patternSelect(app, p.id, (id) => app.selectPattern(id), { label: 'Escolher ritmo' }),
    h('button', { class: 'btn', type: 'button', onclick: createPattern }, icon('plus'), 'Novo ritmo'));
  const library = h('aside', { class: 'library', 'aria-label': 'Ritmos' },
    h('div', { class: 'library-head' },
      h('h2', {}, 'Ritmos'),
      h('button', { class: 'btn small', type: 'button', onclick: createPattern }, icon('plus'), 'Novo')),
    [...groups].map(([style, list]) => h('div', { class: 'lib-group' },
      h('h3', { class: 'lib-style' }, style),
      list.map((x) => h('button', {
        class: `lib-item ${x.id === p.id ? 'on' : ''}`,
        type: 'button',
        'aria-current': x.id === p.id ? 'true' : null,
        onclick: () => app.selectPattern(x.id),
      }, h('span', { class: 'lib-name' }, x.name), h('span', { class: 'lib-meta' }, `${signatureOf(x).id.replace('T', '')}, ${x.bpm}`))))));

  // ---- Cabeçalho do ritmo ----
  const head = h('div', { class: 'pattern-head' },
    editable
      ? h('input', {
        class: 'input title-input', value: p.name, maxlength: 40, 'aria-label': 'Nome do ritmo',
        onchange: (e) => app.store.update((st) => { const cp = customOf(app, p.id); if (cp) cp.name = e.target.value.trim() || 'Sem nome'; }),
      })
      : h('h1', { class: 'pattern-title' }, p.name),
    h('div', { class: 'pattern-meta' },
      editable
        ? [
          h('select', {
            class: 'input', 'aria-label': 'Compasso', value: sig.id,
            onchange: (e) => app.store.update((st) => { const cp = customOf(app, p.id); if (cp) reshapePattern(cp, e.target.value, cp.bars || 1); }),
          }, TIME_SIGNATURES.map((t) => h('option', { value: t.id }, t.label))),
          h('select', {
            class: 'input', 'aria-label': 'Tamanho', value: String(p.bars || 1),
            onchange: (e) => app.store.update((st) => { const cp = customOf(app, p.id); if (cp) reshapePattern(cp, signatureOf(cp).id, Number(e.target.value)); }),
          }, h('option', { value: '1' }, '1 compasso'), h('option', { value: '2' }, '2 compassos'), h('option', { value: '4' }, '4 compassos')),
        ]
        : h('span', { class: 'muted' }, `${sig.label}, ${p.bars > 1 ? `${p.bars} compassos` : '1 compasso'}, sugerido ${p.bpm} BPM`)));

  // ---- Transporte ----
  const leds = beatLeds(p.beatsPerBar);
  const bpmCtl = stepper({ value: app.currentBpm(), min: 30, max: 300, label: 'andamento', onChange: (v) => app.setBpm(v) });
  offs.push(app.on('tempo', (e) => bpmCtl.setValue(e.detail)));
  const swingOut = h('output', { class: 'range-out' }, `${s.drums.swing}%`);
  const transport = h('div', { class: 'drum-transport' },
    playButton(app),
    h('div', { class: 'strip-field' }, h('span', { class: 'field-label' }, 'Andamento'), bpmCtl),
    h('button', { class: 'btn', type: 'button', onclick: () => app.tap(), title: 'Tecla T' }, icon('tap'), 'Tap'),
    swingAllowed
      ? h('label', { class: 'strip-field range-field' },
        h('span', { class: 'field-label' }, 'Swing ', swingOut),
        h('input', {
          type: 'range', min: 0, max: 100, value: s.drums.swing, 'aria-label': 'Swing',
          oninput: (e) => { const v = Number(e.target.value); swingOut.textContent = `${v}%`; app.setSwing(v); },
        }))
      : null,
    h('button', { class: 'btn', type: 'button', disabled: !app.engine.playing || app.rt.mode !== 'loop', onclick: () => app.queueFill(), title: 'Tecla V' }, icon('fill'), 'Virada'),
    leds);
  offs.push(app.onEngine('step', (e) => {
    const ev = e.detail;
    if (ev.isBeat) leds.light(ev.beat, ev.bar.pattern.beatsPerBar, ev.beat === 0);
  }));
  offs.push(app.onEngine('state', (e) => { if (!e.detail) leds.clear(); }));

  // ---- Editor de passos ----
  const mode = h('div', { class: 'segmented', role: 'tablist', 'aria-label': 'O que editar' },
    h('button', { type: 'button', role: 'tab', 'aria-selected': String(!editFill), class: editFill ? '' : 'on', onclick: () => { editFill = false; app.rerender(); } }, 'Ritmo'),
    h('button', { type: 'button', role: 'tab', 'aria-selected': String(editFill), class: editFill ? 'on' : '', onclick: () => { editFill = true; app.rerender(); } }, 'Virada'));

  const spb = stepsPerBar(p);
  const total = editFill ? spb : totalSteps(p);
  const source = editFill ? (p.fill || genericFill(p, 0)) : p.tracks;
  const rows = editable
    ? INSTRUMENTS.filter((i) => i.id !== 'click' || (source.click && /[^.]/.test(source.click)))
    : INSTRUMENTS.filter((i) => source[i.id] && /[^.]/.test(source[i.id]));

  const grid = h('div', { class: 'seq', style: { '--steps': total } });
  const columns = Array.from({ length: total }, () => []);
  for (const inst of rows) {
    const track = (source[inst.id] || '').padEnd(total, '.');
    const cells = [];
    for (let i = 0; i < total; i++) {
      const ch = track[i];
      const beatIdx = Math.floor(i / p.stepsPerBeat);
      const cell = h('button', {
        type: 'button',
        class: `cell v-${CELL_CLASS[ch] || 'off'} ${beatIdx % 2 ? 'alt' : ''} ${i % p.stepsPerBeat === 0 ? 'beat' : ''} ${i && i % spb === 0 ? 'bar' : ''}`,
        'aria-label': `${inst.label}, passo ${i + 1}: ${CELL_WORD[ch] || 'vazio'}`,
        disabled: !editable,
        onclick: () => cycleCell(app, p.id, inst, i, total, cell, 1),
        oncontextmenu: (e) => { e.preventDefault(); if (editable) cycleCell(app, p.id, inst, i, total, cell, 0); },
      });
      cells.push(cell);
      columns[i].push(cell);
    }
    grid.append(h('div', { class: 'seq-row' },
      h('button', { class: 'seq-label', type: 'button', onclick: () => app.engine.preview(inst.id), title: 'Ouvir' }, inst.label),
      cells));
  }

  let lit = -1;
  const light = (col) => {
    if (lit >= 0 && columns[lit]) columns[lit].forEach((c) => c.classList.remove('now'));
    lit = col;
    if (col >= 0 && columns[col]) columns[col].forEach((c) => c.classList.add('now'));
  };
  offs.push(app.onEngine('step', (e) => {
    const { bar, step } = e.detail;
    if (bar.pattern.id !== p.id || bar.countIn || bar.ending) return light(-1);
    if (editFill) return light(bar.fill ? step : -1);
    return light(bar.fill ? -1 : bar.patternBar * spb + step);
  }));
  offs.push(app.onEngine('state', (e) => { if (!e.detail) light(-1); }));

  const actions = h('div', { class: 'pattern-actions' },
    editable
      ? [
        h('button', {
          class: 'btn', type: 'button',
          onclick: () => {
            const cp = copyPattern(p, `c-${uid()}`);
            app.store.update((st) => { st.customPatterns.unshift(cp); });
            app.selectPattern(cp.id);
          },
        }, icon('copy'), 'Duplicar'),
        h('button', {
          class: 'btn danger-ghost', type: 'button',
          onclick: async () => {
            if (!(await confirmAsk(`Excluir o ritmo "${p.name}"? Músicas que usam esse ritmo passam a usar o Rock básico.`, { title: 'Excluir ritmo', confirm: 'Excluir', danger: true }))) return;
            app.store.update((st) => {
              st.customPatterns = st.customPatterns.filter((x) => x.id !== p.id);
              for (const song of st.songs) {
                if (song.patternId === p.id) song.patternId = 'rock-8';
                for (const sec of song.sections) if (sec.patternId === p.id) sec.patternId = '';
              }
            });
            app.selectPattern('rock-8');
          },
        }, icon('trash'), 'Excluir ritmo'),
      ]
      : h('button', {
        class: 'btn primary', type: 'button',
        onclick: () => {
          const cp = copyPattern(p, `c-${uid()}`);
          app.store.update((st) => { st.customPatterns.unshift(cp); });
          app.selectPattern(cp.id);
        },
      }, icon('copy'), 'Criar cópia para editar'));

  const editorHint = editable
    ? 'Clique num passo para alternar entre normal, acento, leve e vazio. Botão direito apaga. Clique no nome do instrumento para ouvir.'
    : 'Ritmo pronto, só para tocar. Crie uma cópia para mudar as batidas.';

  const editor = h('section', { class: 'block seq-block' },
    h('div', { class: 'block-head' }, mode, h('div', { class: 'legend', 'aria-hidden': 'true' },
      h('span', { class: 'lg on' }, 'normal'), h('span', { class: 'lg acc' }, 'acento'), h('span', { class: 'lg ghost' }, 'leve'))),
    editFill && !p.fill ? h('p', { class: 'muted' }, 'Este ritmo usa a virada automática. Edite um passo para criar uma virada própria.') : null,
    h('div', { class: 'seq-wrap' }, grid),
    h('p', { class: 'muted small' }, editorHint),
    actions);

  const el = h('div', { class: 'view drums' },
    library,
    h('div', { class: 'drums-main' }, compactPicker, head, h('section', { class: 'block' }, transport), editor));
  return { el, destroy: () => offs.forEach((off) => off()) };
}

function cycleCell(app, pid, inst, i, total, cell, dir) {
  let next = '.';
  app.store.update((st) => {
    const cp = st.customPatterns.find((x) => x.id === pid);
    if (!cp) return;
    let target = cp.tracks;
    if (editFill) {
      if (!cp.fill) cp.fill = genericFill(cp, 0);
      target = cp.fill;
    }
    const tr = (target[inst.id] || '').padEnd(total, '.');
    next = dir ? NEXT_CELL[tr[i]] || 'x' : '.';
    target[inst.id] = tr.slice(0, i) + next + tr.slice(i + 1);
  }, { render: false });
  cell.classList.remove('v-off', 'v-on', 'v-acc', 'v-ghost');
  cell.classList.add(`v-${CELL_CLASS[next]}`);
  cell.setAttribute('aria-label', cell.getAttribute('aria-label').replace(/: .*$/, `: ${CELL_WORD[next]}`));
  if (next !== '.') app.engine.preview(inst.id, velocityOf(next));
}
