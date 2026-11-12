// Presets: os 80 presets do pedal com nome, cor, anotações e favoritos guardados no hub.

import { h, icon, pad2, openDialog, field, PRESET_COLORS } from '../ui.js';

let query = '';
let onlyFavorites = false;

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
    h('div', { class: 'toolbar' },
      h('input', {
        class: 'input search', type: 'search', placeholder: 'Buscar por número, nome ou anotação', 'aria-label': 'Buscar presets', value: query,
        oninput: (e) => { query = e.target.value.trim().toLowerCase(); draw(); },
      }),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: onlyFavorites, onchange: (e) => { onlyFavorites = e.target.checked; draw(); } }),
        'Só favoritos')),
    grid);
  return { el };
}
