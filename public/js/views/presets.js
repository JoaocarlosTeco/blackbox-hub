// Presets: os 80 presets do pedal com nome, cor, anotações e favoritos guardados no hub.

import { h, icon, pad2, openDialog, field, toast, confirmAsk, moduleColor, downloadText, PRESET_COLORS } from '../ui.js';
import { PACKS, GLOSSARY, slotNotes } from '../packs.js';
import { decodePreset, summarize, buildPreset, isEmptyPreset } from '../blackbox/preset.js';
import { fromHex } from '../blackbox/protocol.js';
import { sameBytes } from '../blackbox/link.js';
import { openPresetEditor, writeErrorText } from './editor.js';

const PULL_ERRORS = {
  'no-sysex': 'O navegador não liberou a permissão para ler o pedal. Nas configurações do site (cadeado ao lado do endereço; no app instalado, Configurações do Chrome > Configurações do site > Dispositivos MIDI), permita o controle total e tente de novo.',
  'no-device': 'O pedal não foi encontrado. Ligue o pedal, confira o cabo USB-C e tente de novo.',
  'no-reply': 'O pedal não respondeu ao pedido de leitura pela USB. A troca de preset continua funcionando; só a leitura não. Pode ser que o pedal só aceite esses comandos pelo Bluetooth ou depois de uma conexão com o app oficial. Copie os detalhes técnicos abaixo para investigar.',
};

function decodedSlot(app, n) {
  const dump = app.store.get().deviceDump;
  if (!dump || !dump.slots || !dump.slots[n]) return null;
  return decodePreset(fromHex(dump.slots[n]), dump.names || {});
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function hexLines(hex) {
  const parts = hex.split(' ');
  const lines = [];
  for (let i = 0; i < parts.length; i += 16) lines.push(`${(i).toString(16).padStart(2, '0').toUpperCase()}  ${parts.slice(i, i + 16).join(' ')}`);
  return lines.join('\n');
}

function showPresetDetail(app, n) {
  const decoded = decodedSlot(app, n);
  if (!decoded) return;
  const info = app.presetInfo(n);
  const ordered = decoded.chain.map((label) => decoded.blocks.find((b) => b.label === label)).filter(Boolean);
  const body = h('div', { class: 'detail' },
    h('p', { class: 'muted' }, `Volume do preset: ${decoded.volume} de 100. Ordem dos blocos: ${decoded.chain.join(' › ')}.`),
    h('div', { class: 'detail-blocks' }, ordered.map((b) => h('div', { class: `detail-row ${b.on ? '' : 'off'}` },
      h('span', { class: `chip ${b.on ? '' : 'off'}`, style: { '--mc': moduleColor(b.label) } }, b.label),
      h('div', { class: 'detail-main' },
        h('strong', {}, b.on ? b.modelName : `${b.modelName} (desligado)`),
        h('div', { class: 'knobs' }, b.knobs.map((k) => h('span', { class: 'knob' }, h('span', { class: 'knob-name' }, k.name), h('b', {}, String(k.value))))))))),
    h('details', { class: 'hex-details' },
      h('summary', {}, 'Bytes lidos do pedal'),
      h('pre', { class: 'hex' }, hexLines(app.store.get().deviceDump.slots[n]))));
  openDialog({
    title: `P${pad2(n)}${info.name ? ` ${info.name}` : ''}`,
    body,
    wide: true,
    actions: [
      { label: 'Fechar' },
      { label: 'Ativar no pedal', onClick: () => { app.selectPreset(n); } },
      { label: 'Editar o som', kind: 'primary', onClick: () => { openPresetEditor(app, n); } },
    ],
  });
}

function deviceBlock(app, offs) {
  const s = app.store.get();
  const dump = s.deviceDump;
  const st = app.pullState;
  const count = dump ? Object.keys(dump.slots || {}).length : 0;

  const bar = h('div', { class: 'progress-bar', style: { width: `${Math.round((st.done / st.total) * 100)}%` } });
  const phase = h('span', { class: 'progress-text' }, st.phase);
  const progress = h('div', { class: 'progress', hidden: !st.running, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': st.total, 'aria-valuenow': st.done }, bar, phase);
  let wasRunning = st.running;
  offs.push(app.on('pull', () => {
    if (st.running !== wasRunning) {
      wasRunning = st.running;
      app.rerender();
      return;
    }
    bar.style.width = `${Math.round((st.done / st.total) * 100)}%`;
    phase.textContent = st.phase;
    progress.setAttribute('aria-valuenow', st.done);
  }));

  const download = () => {
    const stamp = new Date(dump.pulledAt).toISOString().slice(0, 10);
    const payload = {
      app: 'blackbox-hub', kind: 'pedal-presets', device: 'M-VAVE ANNBLACK BOX', pulledAt: dump.pulledAt, method: dump.method,
      presetSize: 92, slots: dump.slots, names: dump.names || {},
    };
    downloadText(`presets-annblackbox-${stamp}.json`, JSON.stringify(payload, null, 2));
    toast('Backup dos presets baixado.', 'ok');
  };

  let description;
  if (dump) {
    const how = dump.method === 'select' ? ', lidos trocando de preset' : '';
    description = `Última leitura: ${formatDate(dump.pulledAt)}, ${count} de ${app.total} presets${how}${dump.cancelled ? ' (leitura interrompida)' : ''}.`;
  } else {
    description = 'Leia os 80 presets do pedal para ver o que cada um tem (amp, efeitos e volume), guardar um backup e editar o som pelo hub. A leitura não grava nada.';
  }

  const errorBox = st.error ? h('div', { class: 'note error' },
    h('p', {}, PULL_ERRORS[st.error] || `Não deu para ler os presets: ${st.errorMessage}`),
    app.link.trace.length ? h('details', { class: 'hex-details' },
      h('summary', {}, 'Detalhes técnicos'),
      h('pre', { class: 'hex' }, [st.errorMessage, ...app.link.trace].filter(Boolean).join('\n')),
      h('button', {
        class: 'btn small', type: 'button',
        onclick: async () => {
          try {
            await navigator.clipboard.writeText([st.errorMessage, ...app.link.trace].filter(Boolean).join('\n'));
            toast('Detalhes copiados.', 'ok');
          } catch {
            toast('Não deu para copiar automaticamente. Selecione o texto e copie.', 'warn');
          }
        },
      }, icon('copy2'), 'Copiar detalhes')) : null) : null;

  return h('section', { class: 'block device' },
    h('div', { class: 'block-head' },
      h('div', { class: 'pack-title' },
        h('h2', {}, 'Presets gravados no pedal'),
        h('p', { class: 'muted small' }, description),
        dump && dump.failed && dump.failed.length ? h('p', { class: 'muted small' }, `Não deu para ler: ${dump.failed.map((n) => `P${pad2(n)}`).join(', ')}.`) : null),
      h('div', { class: 'btn-row' },
        st.running
          ? h('button', { class: 'btn', type: 'button', onclick: () => app.cancelPull() }, icon('stop'), 'Parar')
          : h('button', { class: `btn ${dump ? '' : 'primary'}`, type: 'button', onclick: () => app.pullPresets() }, icon('download'), dump ? 'Ler de novo' : 'Puxar presets do pedal'),
        dump && !st.running ? h('button', { class: 'btn', type: 'button', onclick: download }, icon('download'), 'Baixar backup dos presets') : null)),
    progress,
    !dump && !st.running && !st.error ? h('p', { class: 'muted small' }, 'Na primeira vez o Chrome pede permissão para "controlar e reprogramar dispositivos MIDI". É essa permissão que deixa o hub ler e, quando você mandar, gravar presets.') : null,
    errorBox);
}

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

let packBusy = null; // id do pacote sendo gravado agora

// Situação do pacote no pedal, pela última leitura: quais slots já têm o som do pacote, quais têm outro som.
function packState(app, pack) {
  const dump = app.store.get().deviceDump;
  const label = `Pacote ${pack.name}`;
  const slots = pack.slots.map((slot) => {
    const hex = dump && dump.slots && dump.slots[slot.preset];
    const bytes = hex ? fromHex(hex) : null;
    return {
      slot, bytes,
      written: !!bytes && sameBytes(buildPreset(bytes, slot.sound), bytes),
      empty: bytes ? isEmptyPreset(bytes) : null,
    };
  });
  return {
    hasDump: !!dump,
    slots,
    written: slots.every((x) => x.written),
    anyWritten: slots.some((x) => x.written),
    undoable: pack.slots.filter((slot) => {
      const prev = app.lastSaved(slot.preset);
      return prev && prev.label === label;
    }),
  };
}

async function writePackToPedal(app, pack) {
  const st = packState(app, pack);
  const first = pad2(pack.slots[0].preset);
  const last = pad2(pack.slots[pack.slots.length - 1].preset);
  if (!st.hasDump) {
    toast('Leia os presets do pedal primeiro, no botão "Puxar presets do pedal".', 'warn');
    return;
  }
  const names = app.store.get().deviceDump.names || {};
  const withSound = st.slots.filter((x) => x.bytes && !x.empty && !x.written);
  let text = `O hub vai gravar os ${pack.slots.length} presets do pacote em P${first} a P${last}, conferir um por um e aplicar os nomes e legendas. Antes de gravar, ele guarda o que havia em cada slot: o botão "Desfazer gravação" volta tudo como era.`;
  text += withSound.length
    ? ` Atenção, estes presets têm som e vão ser substituídos: ${withSound.map((x) => `P${pad2(x.slot.preset)} (${summarize(decodePreset(x.bytes, names))})`).join('; ')}.`
    : ` Pela última leitura, os slots P${first} a P${last} estão vazios no pedal.`;
  text += ` No fim, o pedal fica tocando o P${first}.`;
  const ok = await confirmAsk(text, { title: `Gravar o pacote ${pack.name} no pedal?`, confirm: 'Gravar no pedal', danger: withSound.length > 0 });
  if (!ok) return;
  packBusy = pack.id;
  app.rerender();
  try {
    await app.writePack(pack);
    toast(`Pacote ${pack.name} gravado de P${first} a P${last} e conferido. O pedal está no P${first}.`, 'ok');
  } catch (e) {
    toast(`A gravação parou. ${writeErrorText(e)} O que já foi gravado pode ser desfeito.`, 'warn');
  } finally {
    packBusy = null;
    app.rerender();
  }
}

async function undoPackOnPedal(app, pack) {
  const st = packState(app, pack);
  const list = st.undoable.map((slot) => `P${pad2(slot.preset)}`).join(', ');
  const ok = await confirmAsk(`Estes presets voltam a ser como eram antes de o pacote ser gravado: ${list}. Os nomes e legendas no hub continuam.`, { title: 'Desfazer a gravação do pacote?', confirm: 'Desfazer gravação' });
  if (!ok) return;
  packBusy = pack.id;
  app.rerender();
  try {
    const restored = await app.undoPack(pack);
    toast(`${restored.length} presets voltaram ao que eram antes.`, 'ok');
  } catch (e) {
    toast(`Não deu para desfazer tudo. ${writeErrorText(e)}`, 'warn');
  } finally {
    packBusy = null;
    app.rerender();
  }
}

function packBlock(app, pack) {
  const s = app.store.get();
  const applied = pack.slots.every((slot) => s.presets[slot.preset] && s.presets[slot.preset].name === slot.name);
  const first = pack.slots[0].preset;
  const last = pack.slots[pack.slots.length - 1].preset;
  const st = packState(app, pack);
  const busy = packBusy === pack.id;
  let note;
  if (!st.hasDump) note = `Para gravar os ajustes no pedal, leia os presets primeiro (botão "Puxar presets do pedal", acima). Enquanto isso, o pacote só dá nome, cor e legenda aos presets P${pad2(first)} a P${pad2(last)} aqui no hub.`;
  else if (st.written) note = `Os ${pack.slots.length} presets estão gravados no pedal, de P${pad2(first)} a P${pad2(last)}. Para ajustar algum, use o botão de som no card dele.`;
  else note = `"Gravar no pedal" grava os ajustes de cada preset em P${pad2(first)} a P${pad2(last)}, confere um por um e guarda o que havia antes, para dar para desfazer.`;
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
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', disabled: busy, onclick: () => applyPack(app, pack) },
          icon(applied ? 'check' : 'plus'), applied ? 'Nomes aplicados' : 'Usar nomes e legendas'),
        st.undoable.length ? h('button', { class: 'btn danger-ghost', type: 'button', disabled: busy, onclick: () => undoPackOnPedal(app, pack) },
          icon('upload'), 'Desfazer gravação') : null,
        h('button', {
          class: `btn ${st.written ? 'good' : 'primary'}`, type: 'button', disabled: busy || st.written,
          onclick: () => writePackToPedal(app, pack),
        }, icon(st.written ? 'check' : 'usb'), busy ? 'Gravando…' : st.written ? 'Gravado no pedal' : st.anyWritten ? 'Gravar de novo no pedal' : 'Gravar no pedal'))),
    h('p', { class: 'note' }, note),
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

// Menu de ações de um preset (no celular os botões do card viram este menu).
function presetActions(app, n) {
  const info = app.presetInfo(n);
  const decoded = decodedSlot(app, n);
  const item = (iconName, title, text, run, primary = false) => h('button', {
    class: `action-item ${primary ? 'primary' : ''}`, type: 'button',
    onclick: () => { dlg.close(); run(); },
  }, icon(iconName), h('strong', {}, title), text ? h('span', {}, text) : null);
  const summary = decoded ? summarize(decoded) : '';
  const dlg = openDialog({
    title: `P${pad2(n)}${info.name ? ` ${info.name}` : ''}`,
    body: h('div', { class: 'action-list' },
      decoded
        ? item('sliders', 'Editar o som', `Muda no pedal enquanto você mexe. Agora: ${summary}.`, () => openPresetEditor(app, n), true)
        : h('p', { class: 'note small' }, 'Para ver e editar o som deste preset, leia os presets do pedal primeiro ("Puxar presets do pedal", no topo desta tela).'),
      item('play', 'Tocar no pedal', 'Troca o pedal para este preset.', () => app.selectPreset(n)),
      decoded ? item('info', 'Ver o que tem neste preset', 'Volume, ordem dos blocos e todos os ajustes.', () => showPresetDetail(app, n)) : null,
      item('edit', 'Nome, cor e anotações', 'Ficam guardados aqui no hub.', () => editPreset(app, n))),
    actions: [{ label: 'Fechar' }],
  });
}

const BANKS = [1, 11, 21, 31, 41, 51, 61, 71];

export function render(app) {
  const s = app.store.get();
  const cur = s.currentPreset;
  const offs = [];
  const grid = h('div', { class: 'preset-grid' });

  const draw = () => {
    const tiles = [];
    for (let n = 1; n <= app.total; n++) {
      const info = app.presetInfo(n);
      if (onlyFavorites && !info.favorite) continue;
      const decoded = decodedSlot(app, n);
      if (query) {
        const hay = `p${pad2(n)} ${n} ${info.name || ''} ${info.notes || ''} ${summarize(decoded)}`.toLowerCase();
        if (!hay.includes(query)) continue;
      }
      const chain = decoded ? h('span', { class: 'tile-chain', title: summarize(decoded) },
        decoded.chain.map((label) => {
          const b = decoded.blocks.find((x) => x.label === label);
          if (!b) return null;
          return h('span', { class: `mini ${b.on ? 'on' : ''}`, style: { '--mc': moduleColor(label) } }, label);
        })) : null;
      tiles.push(h('div', { class: `tile ${n === cur ? 'is-current' : ''}`, style: { '--pc': info.color || null }, 'data-n': n },
        h('button', { class: 'tile-main', type: 'button', onclick: () => app.selectPreset(n), 'aria-label': `Ativar preset ${n}${info.name ? `, ${info.name}` : ''}` },
          h('span', { class: 'tile-num' }, pad2(n)),
          h('span', { class: `tile-name ${info.name ? '' : 'dim'}` }, info.name || 'Sem nome'),
          info.notes ? h('span', { class: 'tile-notes' }, info.notes) : null,
          chain),
        h('div', { class: 'tile-tools' },
          decoded ? h('button', { class: 'icon-btn tool-info', type: 'button', 'aria-label': `Ver o que tem no P${pad2(n)}`, title: 'Ver o que tem neste preset', onclick: () => showPresetDetail(app, n) }, icon('info')) : null,
          decoded ? h('button', { class: 'icon-btn tool-sound', type: 'button', 'aria-label': `Editar o som do P${pad2(n)}`, title: 'Editar o som no pedal', onclick: () => openPresetEditor(app, n) }, icon('sliders')) : null,
          h('button', {
            class: `icon-btn star ${info.favorite ? 'on' : ''}`,
            type: 'button',
            'aria-pressed': String(!!info.favorite),
            'aria-label': info.favorite ? `Tirar P${pad2(n)} dos favoritos` : `Marcar P${pad2(n)} como favorito`,
            onclick: () => app.store.update((st) => { st.presets[n] = { ...(st.presets[n] || {}), favorite: !info.favorite }; }),
          }, icon('star')),
          h('button', { class: 'icon-btn tool-edit', type: 'button', 'aria-label': `Nome, cor e anotações do P${pad2(n)}`, title: 'Nome, cor e anotações', onclick: () => editPreset(app, n) }, icon('edit')),
          h('button', { class: 'icon-btn tool-more', type: 'button', 'aria-label': `Mais opções do P${pad2(n)}`, onclick: () => presetActions(app, n) }, icon('more')))));
    }
    grid.replaceChildren(...(tiles.length ? tiles : [h('p', { class: 'muted' }, 'Nenhum preset encontrado com esse filtro.')]));
  };
  draw();

  const named = Object.values(s.presets).filter((p) => p && p.name).length;

  const search = h('input', {
    class: 'input search', type: 'search', placeholder: 'Buscar por número, nome ou anotação', 'aria-label': 'Buscar presets', value: query,
    enterkeyhint: 'search',
    oninput: (e) => { query = e.target.value.trim().toLowerCase(); draw(); },
  });
  const favCheck = h('input', { type: 'checkbox', checked: onlyFavorites, onchange: (e) => { onlyFavorites = e.target.checked; draw(); } });
  // Atalhos para ir direto a uma faixa de presets (útil no celular, com 80 presets na lista).
  const jump = (start) => {
    let tile = grid.querySelector(`[data-n="${start}"]`);
    if (!tile && (query || onlyFavorites)) {
      query = '';
      onlyFavorites = false;
      search.value = '';
      favCheck.checked = false;
      draw();
      tile = grid.querySelector(`[data-n="${start}"]`);
    }
    if (tile) tile.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const toolbar = h('div', { class: 'toolbar' },
    search,
    h('label', { class: 'check' }, favCheck, 'Só favoritos'),
    h('div', { class: 'bank-jump', role: 'group', 'aria-label': 'Ir para os presets' },
      BANKS.map((b) => h('button', {
        class: `bank ${cur && cur >= b && cur < b + 10 ? 'has-current' : ''}`, type: 'button',
        'aria-label': `Ir para P${pad2(b)} a P${pad2(b + 9)}`, onclick: () => jump(b),
      }, pad2(b)))));

  const el = h('div', { class: 'view presets' },
    h('header', { class: 'view-head' },
      h('div', {},
        h('h1', {}, 'Presets'),
        h('p', { class: 'lede' }, `Escolha um preset para trocar no pedal. O pedal não guarda nomes, então os nomes e anotações ficam aqui no hub (${named} de ${app.total} com nome).`))),
    deviceBlock(app, offs),
    PACKS.map((pack) => packBlock(app, pack)),
    toolbar,
    grid,
    glossaryBlock());
  return { el, destroy: () => offs.forEach((off) => off()) };
}
