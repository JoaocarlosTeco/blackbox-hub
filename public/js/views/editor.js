// Editor de presets: muda o som do pedal ao vivo (sem salvar) e grava no slot quando a pessoa toca em Salvar.
// Antes de abrir, o hub lê o slot direto do pedal; ao salvar, relê para conferir e guarda o que havia antes.

import { h, icon, pad2, openDialog, toast, confirmAsk, moduleColor } from '../ui.js';
import {
  BLOCKS, paramNames, setVolume, setBlockOn, setBlockModel, setKnob, setChain, chainIds,
  changedFields, decodePreset, summarize, isEmptyPreset,
} from '../blackbox/preset.js';
import { fromHex } from '../blackbox/protocol.js';
import { sameBytes } from '../blackbox/link.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const u16 = (b, o) => b[o] | (b[o + 1] << 8);

export const WRITE_ERRORS = {
  'no-sysex': 'O navegador não liberou o controle do pedal. Nas configurações do site (cadeado ao lado do endereço; no app instalado, Configurações do Chrome > Configurações do site > Dispositivos MIDI), permita o controle total e tente de novo.',
  'no-device': 'O pedal não foi encontrado. Ligue o pedal, confira o cabo USB-C e tente de novo.',
  timeout: 'O pedal não respondeu a tempo. Confira o cabo e se outro programa está usando o pedal.',
  verify: 'A conferência depois de gravar não bateu.',
};
export const writeErrorText = (e) => (e && e.code === 'verify' ? e.message : (WRITE_ERRORS[e && e.code] || `Não deu para falar com o pedal: ${e && e.message}`));

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function modelOptions(app, block, current) {
  const names = app.store.get().deviceDump?.names || {};
  const list = (block.id === 'amp' && names.amp && names.amp.length ? names.amp : null)
    || (block.id === 'cab' && names.cab && names.cab.length ? names.cab : null)
    || block.models;
  const opts = list.map((name, i) => ({ value: i, label: name }));
  // Modelo que o hub não conhece (por exemplo, os efeitos novos do firmware V21): mantém como está.
  if (current >= list.length) opts.push({ value: current, label: `Modelo ${current + 1}` });
  return opts;
}

export async function openPresetEditor(app, n) {
  try {
    await app.ensureSysex();
  } catch (e) {
    toast(writeErrorText(e), 'warn');
    return;
  }
  if (app.engine.playing) app.stop();

  let stored;
  try {
    stored = await app.link.readSlot(n - 1);
  } catch (e) {
    toast(`Não deu para ler o P${pad2(n)} do pedal. ${writeErrorText(e)}`, 'warn');
    return;
  }

  // O pedal passa a tocar este preset; as mudanças vão para o som atual dele.
  app.selectPreset(n);
  let live = false;
  let sent = stored.slice();
  try {
    await wait(120);
    if (await app.link.readPresetIndex() === n - 1) {
      sent = await app.link.readEditBuffer();
      live = true;
    }
  } catch { /* segue sem ouvir ao vivo */ }

  let working = stored.slice();
  let savedTo = null;
  let syncing = false;

  const liveNote = h('p', { class: 'note small' });
  const showLive = () => {
    liveNote.className = `note small ${live ? '' : 'warn'}`;
    liveNote.textContent = live
      ? `O pedal está tocando o P${pad2(n)}: cada mudança aparece no som na hora. Nada fica gravado até você tocar em Salvar.`
      : 'Não deu para mandar as mudanças ao vivo para o pedal. Dá para editar e salvar, mas você só ouve o resultado depois de salvar.';
  };
  showLive();

  async function sync() {
    if (!live || syncing) return;
    syncing = true;
    try {
      for (;;) {
        const next = changedFields(sent, working)[0];
        if (!next) break;
        await app.link.writeEdit(next.offset, next.data);
        next.data.forEach((b, i) => { sent[next.offset + i] = b; });
      }
    } catch (e) {
      live = false;
      showLive();
      toast(`Parei de mandar as mudanças ao vivo. ${writeErrorText(e)}`, 'warn');
    } finally {
      syncing = false;
    }
  }

  const dirtyBadge = h('span', { class: 'ed-dirty', hidden: true }, 'Mudanças não salvas');
  const changed = () => {
    dirtyBadge.hidden = sameBytes(working, stored);
    sync();
  };

  // ---- Volume ----
  const volOut = h('output', { class: 'range-out big' }, String(u16(working, 0)));
  const volume = h('div', { class: 'ed-row' },
    h('label', { class: 'ed-label', for: 'ed-vol' }, 'Volume do preset'),
    h('input', {
      id: 'ed-vol', type: 'range', min: 0, max: 100, value: u16(working, 0),
      oninput: (e) => { setVolume(working, Number(e.target.value)); volOut.textContent = e.target.value; changed(); },
    }),
    volOut);

  // ---- Ordem dos blocos ----
  const chainRow = h('div', { class: 'ed-chain', role: 'list', 'aria-label': 'Ordem dos blocos' });
  const drawChain = () => {
    const order = chainIds(working);
    if (order.some((id) => !id)) {
      chainRow.replaceChildren(h('p', { class: 'muted small' }, 'Ordem dos blocos em formato desconhecido; ela fica como está.'));
      return;
    }
    const move = (i, dir) => {
      const next = order.slice();
      [next[i], next[i + dir]] = [next[i + dir], next[i]];
      setChain(working, next);
      drawChain();
      changed();
    };
    chainRow.replaceChildren(...order.map((id, i) => {
      const block = BLOCKS.find((b) => b.id === id);
      const on = working[block.onAt] === 1;
      return h('div', { class: 'ed-chain-item', role: 'listitem' },
        h('button', { class: 'icon-btn sm', type: 'button', disabled: i === 0, 'aria-label': `Mover ${block.label} para antes`, onclick: () => move(i, -1) }, '‹'),
        h('span', { class: `chip ${on ? '' : 'off'}`, style: { '--mc': moduleColor(block.label) } }, block.label),
        h('button', { class: 'icon-btn sm', type: 'button', disabled: i === order.length - 1, 'aria-label': `Mover ${block.label} para depois`, onclick: () => move(i, 1) }, '›'));
    }));
  };
  drawChain();

  // ---- Blocos ----
  const blockCards = BLOCKS.map((block) => {
    const knobArea = h('div', { class: 'ed-knobs' });
    const drawKnobs = () => {
      const names = paramNames(block, working[block.modelAt]);
      knobArea.replaceChildren(...names.map((name, i) => {
        const id = `ed-${block.id}-${i}`;
        const value = u16(working, block.knobsAt + i * 2);
        const out = h('output', { class: 'range-out', for: id }, String(value));
        return h('div', { class: 'ed-knob' },
          h('label', { class: 'ed-knob-name', for: id }, name),
          h('input', {
            id, type: 'range', min: 0, max: 100, value,
            oninput: (e) => { setKnob(working, block.id, i, Number(e.target.value)); out.textContent = e.target.value; changed(); },
          }),
          out);
      }));
    };
    drawKnobs();

    const card = h('section', { class: `ed-block ${working[block.onAt] === 1 ? '' : 'is-off'}`, style: { '--mc': moduleColor(block.label) } });
    const toggle = h('input', {
      type: 'checkbox', role: 'switch', checked: working[block.onAt] === 1, 'aria-label': `${block.label} ligado`,
      onchange: (e) => {
        setBlockOn(working, block.id, e.target.checked);
        card.classList.toggle('is-off', !e.target.checked);
        drawChain();
        changed();
      },
    });
    const current = working[block.modelAt];
    const select = h('select', {
      class: 'input', 'aria-label': `Modelo do ${block.label}`,
      onchange: (e) => { setBlockModel(working, block.id, Number(e.target.value)); drawKnobs(); changed(); },
    }, modelOptions(app, block, current).map((o) => h('option', { value: o.value, selected: o.value === current }, o.label)));
    card.append(
      h('header', { class: 'ed-block-head' },
        h('label', { class: 'switch' }, toggle, h('span', { class: 'switch-track', 'aria-hidden': 'true' }), h('span', { class: 'chip', style: { '--mc': moduleColor(block.label) } }, block.label)),
        select),
      knobArea);
    return card;
  });

  // ---- Onde salvar ----
  const s = app.store.get();
  const target = h('select', { class: 'input', 'aria-label': 'Salvar em' },
    Array.from({ length: app.total }, (_, i) => {
      const p = i + 1;
      const name = (s.presets[p] && s.presets[p].name) || '';
      return h('option', { value: p, selected: p === n }, `P${pad2(p)}${name ? ` ${name}` : ''}${p === n ? ' (este)' : ''}`);
    }));

  const prev = app.lastSaved(n);
  const undo = prev ? h('div', { class: 'ed-undo' },
    h('p', { class: 'muted small' }, `Antes da última gravação pelo hub (${prev.label}, ${formatDate(prev.at)}), o P${pad2(n)} tinha: ${summarize(decodePreset(fromHex(prev.hex), s.deviceDump?.names || {}))}.`),
    h('button', {
      class: 'btn small', type: 'button',
      onclick: async () => {
        const ok = await confirmAsk(`O P${pad2(n)} volta a ser como era antes da última gravação. As mudanças desta tela se perdem.`, { title: 'Voltar à versão anterior?', confirm: 'Voltar' });
        if (!ok) return;
        try {
          await app.restoreSlot(n);
          savedTo = n;
          app.selectPreset(n);
          toast(`P${pad2(n)} voltou à versão anterior.`, 'ok');
          dlg.close();
        } catch (e) {
          toast(writeErrorText(e), 'warn');
        }
      },
    }, icon('upload'), 'Voltar à versão anterior')) : null;

  const body = h('div', { class: 'editor' },
    liveNote,
    volume,
    h('div', { class: 'ed-row' }, h('span', { class: 'ed-label' }, 'Ordem do sinal'), chainRow),
    h('div', { class: 'ed-blocks' }, blockCards),
    h('div', { class: 'ed-save' }, h('label', { class: 'ed-label' }, 'Salvar em', target), dirtyBadge),
    undo);

  let saving = false;
  const save = async () => {
    if (saving) return;
    const to = Number(target.value);
    const dump = app.store.get().deviceDump;
    if (to !== n && dump && dump.slots[to] && !isEmptyPreset(fromHex(dump.slots[to]))) {
      const what = summarize(decodePreset(fromHex(dump.slots[to]), dump.names || {}));
      const ok = await confirmAsk(`O P${pad2(to)} tem som gravado (${what}) e vai ser substituído. O hub guarda o que estava lá, então dá para voltar depois.`, { title: `Substituir o P${pad2(to)}?`, confirm: 'Substituir' });
      if (!ok) return;
    }
    saving = true;
    try {
      await app.saveSlot(to, working, { label: 'Editor' });
      savedTo = to;
      if (to === n) stored = working.slice();
      toast(`P${pad2(to)} gravado no pedal e conferido.`, 'ok');
      dlg.close();
    } catch (e) {
      toast(writeErrorText(e), 'warn');
    } finally {
      saving = false;
    }
  };

  const info = app.presetInfo(n);
  const dlg = openDialog({
    title: `Editar o som do P${pad2(n)}${info.name ? ` ${info.name}` : ''}`,
    body,
    wide: true,
    actions: [
      { label: 'Fechar sem salvar' },
      { label: 'Salvar no pedal', kind: 'primary', onClick: () => { save(); return false; } },
    ],
    onClose: () => {
      if (savedTo && savedTo !== n) {
        // Salvou em outro slot: o pedal passa a tocar o slot novo (e descarta as mudanças do atual).
        app.selectPreset(savedTo);
        return;
      }
      if (!sameBytes(working, stored)) {
        // Desfaz no som atual o que não foi salvo.
        working = stored.slice();
        sync();
        toast('Mudanças descartadas. O pedal voltou ao som gravado.', 'info');
      }
    },
  });
}
