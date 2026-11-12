// Presets: os 80 presets do pedal com nome, cor, anotações e favoritos guardados no hub.

import { h, icon, pad2, openDialog, field, toast, confirmAsk, moduleColor, PRESET_COLORS } from '../ui.js';
import { PACKS, GLOSSARY, slotNotes } from '../packs.js';

let query = '';
let onlyFavorites = false;
const openPacks = new Set();

async function applyPack(app, pack) {
  const s = app.store.get();
  const taken = pack.slots.filter((slot) => {
    const cur = s.presets[slot.preset];
    return cur && cur.name && cur.name !== slot.name;
  });
  if (taken.length) {
    const list = taken.map((slot) => `P${pad2(slot.preset)} (${s.presets[slot.preset].name})`).join(', ');
    const ok = await confirmAsk(`Estes presets já têm nome no hub e vão ser renomeados: ${list}. Os sons gravados no pedal não mudam.`, { title: `Usar o pacote ${pack.name}`, confirm: 'Renomear' });
    if (!ok) return;
  }
  app.store.update((st) => {
    for (const slot of pack.slots) {
      const prev = st.presets[slot.preset] || {};
      st.presets[slot.preset] = { ...prev, name: slot.name, color: slot.color, notes: slotNotes(slot) };
    }
  });
  const first = pack.slots[0].preset;
  const last = pack.slots[pack.slots.length - 1].preset;
  toast(`Nomes e legendas aplicados de P${pad2(first)} a P${pad2(last)}.`, 'ok');
}

function packBlock(app, pack) {
  const s = app.store.get();
  const applied = pack.slots.every((slot) => s.presets[slot.preset] && s.presets[slot.preset].name === slot.name);
  const first = pack.slots[0].preset;
  const last = pack.slots[pack.slots.length - 1].preset;
  const details = h('details', { class: 'pack-details', open: openPacks.has(pack.id) },
    h('summary', {}, `Ver os ${pack.slots.length} presets e o que cada um faz`),
    h('ol', { class: 'pack-list' }, pack.slots.map((slot) => h('li', { class: 'pack-item', style: { '--pc': slot.color || null } },
      h('button', { class: 'pack-num', type: 'button', onclick: () => app.selectPreset(slot.preset), title: `Ativar P${pad2(slot.preset)} no pedal` }, `P${pad2(slot.preset)}`),
      h('div', { class: 'pack-body' },
        h('h3', {}, slot.name),
        h('p', {}, slot.use),
        h('ul', { class: 'recipe' }, slot.recipe.map((r) => h('li', {},
          h('span', { class: `chip ${r.off ? 'off' : ''}`, style: { '--mc': moduleColor(r.module) } }, r.module),
          h('span', {}, r.text)))))))));
  details.addEventListener('toggle', () => {
    if (details.open) openPacks.add(pack.id);
    else openPacks.delete(pack.id);
  });
  return h('section', { class: 'block pack' },
    h('div', { class: 'block-head' },
      h('div', { class: 'pack-title' },
        h('h2', {}, `Pacote ${pack.name}`),
        h('p', { class: 'muted small' }, `${pack.summary} Instrumento: ${pack.instrument.toLowerCase()}.`)),
      h('button', { class: `btn ${applied ? '' : 'primary'}`, type: 'button', onclick: () => applyPack(app, pack) },
        icon(applied ? 'check' : 'plus'), applied ? 'Nomes aplicados' : 'Usar nomes e legendas')),
    h('p', { class: 'note' }, `Por enquanto o pacote dá nome, cor e legenda aos presets P${pad2(first)} a P${pad2(last)} aqui no hub. Gravar os ajustes no pedal vai estar disponível quando o editor de presets ficar pronto; até lá, os sons do pedal não mudam.`),
    details);
}

function glossaryBlock() {
  return h('section', { class: 'block glossary' },
    h('details', {},
      h('summary', {}, 'O que é cada parte do som'),
      h('dl', {}, GLOSSARY.map((g) => [
        h('dt', {}, h('span', { class: 'chip', style: { '--mc': moduleColor(g.term) } }, g.term)),
        h('dd', {}, g.text),
      ]))));
}

function editPreset(app, n) {
  const info = app.presetInfo(n);
  let color = info.color || '';
  const name = h('input', { class: 'input', value: info.name || '', placeholder: 'Ex.: Clean com chorus', maxlength: 40, 'aria-label': 'Nome' });
  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Cor' },
    PRESET_COLORS.map((c) => h('button', {
      type: 'button',
      class: `swatch ${c === color ? 'on' : ''} ${c ? '' : 'none'}`,
      style: { '--sw': c || null },
      role: 'radio',
      'aria-checked': String(c === color),
      'aria-label': c ? `Cor ${c}` : 'Sem cor',
      onclick: (e) => {
        color = c;
        for (const b of swatches.children) {
          const on = b === e.currentTarget;
          b.classList.toggle('on', on);
          b.setAttribute('aria-checked', String(on));
        }
      },
    })));
  const notes = h('textarea', { class: 'input', rows: 4, placeholder: 'Amp, efeitos ligados, em que música usar...', 'aria-label': 'Anotações' }, info.notes || '');
  const save = () => app.store.update((st) => {
    st.presets[n] = { ...(st.presets[n] || {}), name: name.value.trim(), color, notes: notes.value.trim() };
  });
  const dlg = openDialog({
    title: `Preset P${pad2(n)}`,
    body: h('div', { class: 'form' }, field('Nome', name), field('Cor', swatches), field('Anotações', notes)),
    actions: [{ label: 'Cancelar' }, { label: 'Salvar preset', kind: 'primary', onClick: save }],
  });
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      save();
      dlg.close();
    }
  });
  setTimeout(() => name.focus(), 30);
}

export function render(app) {
  const s = app.store.get();
  const cur = s.currentPreset;
  const grid = h('div', { class: 'preset-grid' });

  const draw = () => {
    const tiles = [];
    for (let n = 1; n <= app.total; n++) {
      const info = app.presetInfo(n);
      if (onlyFavorites && !info.favorite) continue;
      if (query) {
        const hay = `p${pad2(n)} ${n} ${info.name || ''} ${info.notes || ''}`.toLowerCase();
        if (!hay.includes(query)) continue;
      }
      tiles.push(h('div', { class: `tile ${n === cur ? 'is-current' : ''}`, style: { '--pc': info.color || null } },
        h('button', { class: 'tile-main', type: 'button', onclick: () => app.selectPreset(n), 'aria-label': `Ativar preset ${n}${info.name ? `, ${info.name}` : ''}` },
          h('span', { class: 'tile-num' }, pad2(n)),
          h('span', { class: `tile-name ${info.name ? '' : 'dim'}` }, info.name || 'Sem nome'),
          info.notes ? h('span', { class: 'tile-notes' }, info.notes) : null),
        h('div', { class: 'tile-tools' },
          h('button', {
            class: `icon-btn star ${info.favorite ? 'on' : ''}`,
            type: 'button',
            'aria-pressed': String(!!info.favorite),
            'aria-label': info.favorite ? `Tirar P${pad2(n)} dos favoritos` : `Marcar P${pad2(n)} como favorito`,
            onclick: () => app.store.update((st) => { st.presets[n] = { ...(st.presets[n] || {}), favorite: !info.favorite }; }),
          }, icon('star')),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Editar P${pad2(n)}`, onclick: () => editPreset(app, n) }, icon('edit')))));
    }
    grid.replaceChildren(...(tiles.length ? tiles : [h('p', { class: 'muted' }, 'Nenhum preset encontrado com esse filtro.')]));
  };
  draw();

  const named = Object.values(s.presets).filter((p) => p && p.name).length;

  const el = h('div', { class: 'view presets' },
    h('header', { class: 'view-head' },
      h('div', {},
        h('h1', {}, 'Presets'),
        h('p', { class: 'lede' }, `Clique para trocar o preset no pedal. O pedal não informa os nomes dos presets, então os nomes e anotações ficam guardados aqui (${named} de ${app.total} com nome).`))),
    PACKS.map((pack) => packBlock(app, pack)),
    h('div', { class: 'toolbar' },
      h('input', {
        class: 'input search', type: 'search', placeholder: 'Buscar por número, nome ou anotação', 'aria-label': 'Buscar presets', value: query,
        oninput: (e) => { query = e.target.value.trim().toLowerCase(); draw(); },
      }),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: onlyFavorites, onchange: (e) => { onlyFavorites = e.target.checked; draw(); } }),
        'Só favoritos')),
    grid,
    glossaryBlock());
  return { el };
}
