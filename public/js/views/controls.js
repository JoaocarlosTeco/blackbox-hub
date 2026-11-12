// Controles: comandos CC que ligam efeitos e mexem em parâmetros, mais a varredura guiada para descobrir novos.

import { h, icon, stepper, openDialog, field, confirmAsk, MODULES, moduleColor } from '../ui.js';
import { uid } from '../store.js';

const SCAN_MAX = 119; // 120–127 são mensagens de modo do MIDI, não controles
const KNOWN_ELSEWHERE = {
  1: 'Em muitos aparelhos, o CC 1 é modulação.',
  7: 'Em muitos aparelhos, o CC 7 é volume.',
  11: 'Em muitos aparelhos, o CC 11 é pedal de expressão.',
  64: 'Em muitos aparelhos, o CC 64 é um interruptor (sustain).',
};
const TYPE_LABEL = { toggle: 'Liga/desliga', knob: 'Botão giratório (0 a 127)', trigger: 'Botão de ação' };

let explorerCc = 7;
let explorerVal = 64;

function controlDialog(app, initial) {
  const c = { id: uid(), name: '', module: 'FX', cc: 0, type: 'toggle', on: 127, off: 0, value: null, verified: true, ...initial };
  const name = h('input', { class: 'input', value: c.name, placeholder: 'Ex.: Delay liga/desliga', maxlength: 40, 'aria-label': 'Nome' });
  const module = h('select', { class: 'input', 'aria-label': 'Grupo', value: c.module }, [...MODULES, 'GERAL'].map((m) => h('option', { value: m }, m === 'GERAL' ? 'Geral' : m)));
  const type = h('select', { class: 'input', 'aria-label': 'Tipo', value: c.type }, Object.entries(TYPE_LABEL).map(([k, v]) => h('option', { value: k }, v)));
  let cc = c.cc;
  let on = c.on;
  let off = c.off;
  const isNew = !initial || !initial.id;
  openDialog({
    title: isNew ? 'Novo controle' : 'Editar controle',
    body: h('div', { class: 'form' },
      field('Nome', name),
      h('div', { class: 'form-row' }, field('Grupo', module), field('Tipo', type)),
      h('div', { class: 'form-row' },
        field('Número do CC', stepper({ value: cc, min: 0, max: 127, label: 'número do CC', onChange: (v) => { cc = v; } })),
        field('Valor ligado', stepper({ value: on, min: 0, max: 127, label: 'valor ligado', onChange: (v) => { on = v; } })),
        field('Valor desligado', stepper({ value: off, min: 0, max: 127, label: 'valor desligado', onChange: (v) => { off = v; } })))),
    actions: [
      { label: 'Cancelar' },
      {
        label: 'Salvar controle', kind: 'primary',
        onClick: () => app.store.update((st) => {
          const data = { ...c, name: name.value.trim() || `CC ${cc}`, module: module.value, type: type.value, cc, on, off };
          const i = st.controls.findIndex((x) => x.id === c.id);
          if (i >= 0) st.controls[i] = data;
          else st.controls.push(data);
        }),
      },
    ],
  });
  setTimeout(() => name.focus(), 30);
}

function controlCard(app, c) {
  const tools = h('div', { class: 'ctl-tools' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Editar ${c.name}`, onclick: () => controlDialog(app, c) }, icon('edit')),
    h('button', {
      class: 'icon-btn', type: 'button', 'aria-label': `Excluir ${c.name}`,
      onclick: async () => {
        if (await confirmAsk(`Excluir o controle "${c.name}"?`, { title: 'Excluir controle', confirm: 'Excluir', danger: true })) {
          app.store.update((st) => { st.controls = st.controls.filter((x) => x.id !== c.id); });
        }
      },
    }, icon('trash')));

  let body;
  if (c.type === 'toggle') {
    const state = c.value == null ? 'unknown' : c.value >= 64 ? 'on' : 'off';
    body = h('div', { class: 'ctl-body' },
      h('button', {
        class: `led-btn ${state}`, type: 'button', 'aria-pressed': state === 'on' ? 'true' : 'false',
        onclick: () => app.toggleControl(c.id),
      }, h('span', { class: 'led-dot' }), state === 'on' ? 'Ligado' : state === 'off' ? 'Desligado' : 'Alternar'),
      h('div', { class: 'ctl-quick' },
        h('button', { class: 'btn small', type: 'button', onclick: () => app.setControl(c.id, c.on) }, 'Ligar'),
        h('button', { class: 'btn small', type: 'button', onclick: () => app.setControl(c.id, c.off) }, 'Desligar')));
  } else if (c.type === 'knob') {
    const out = h('output', { class: 'range-out' }, String(c.value ?? 0));
    let timer = null;
    body = h('div', { class: 'ctl-body knob' },
      h('input', {
        type: 'range', min: 0, max: 127, value: c.value ?? 0, 'aria-label': c.name,
        oninput: (e) => {
          const v = Number(e.target.value);
          out.textContent = String(v);
          clearTimeout(timer);
          timer = setTimeout(() => app.setControl(c.id, v, { render: false }), 25);
        },
      }), out);
  } else {
    body = h('div', { class: 'ctl-body' }, h('button', { class: 'btn primary', type: 'button', onclick: () => app.setControl(c.id, c.on) }, 'Acionar'));
  }

  return h('article', { class: `ctl-card ${c.verified ? '' : 'unverified'}`, style: { '--mc': moduleColor(c.module) } },
    h('div', { class: 'ctl-head' },
      h('span', { class: 'ctl-module' }, c.module === 'GERAL' ? 'Geral' : c.module),
      h('span', { class: 'ctl-cc' }, `CC ${c.cc}`),
      tools),
    h('h3', { class: 'ctl-name' }, c.name),
    body,
    c.verified ? null : h('div', { class: 'ctl-verify' },
      h('span', {}, 'Não testado ainda'),
      h('button', { class: 'btn small good', type: 'button', onclick: () => app.store.update((st) => { const x = st.controls.find((y) => y.id === c.id); if (x) x.verified = true; }) }, icon('check'), 'Funcionou')));
}

export function render(app) {
  const s = app.store.get();
  const scan = s.ccScan;
  const tested = Object.keys(scan.results).length;
  const n = scan.current;

  const send = (v) => app.sendCC(n, v);
  const advance = (mark) => app.store.update((st) => {
    st.ccScan.results[n] = mark;
    let next = n + 1;
    while (next <= SCAN_MAX && st.ccScan.results[next]) next++;
    st.ccScan.current = Math.min(next, SCAN_MAX);
  });

  const mapCells = [];
  for (let i = 0; i <= SCAN_MAX; i++) {
    const r = scan.results[i];
    const known = s.controls.some((c) => c.cc === i);
    mapCells.push(h('button', {
      type: 'button',
      class: `map-cell ${r || ''} ${known ? 'known' : ''} ${i === n ? 'cur' : ''}`,
      title: `CC ${i}${r === 'found' ? ': mudou algo' : r === 'none' ? ': nada mudou' : ''}${known ? ' (tem controle)' : ''}`,
      'aria-label': `Ir para CC ${i}`,
      onclick: () => app.store.update((st) => { st.ccScan.current = i; }),
    }));
  }

  const scanner = h('section', { class: 'block scan' },
    h('div', { class: 'block-head' },
      h('h2', {}, 'Descobrir comandos'),
      h('span', { class: 'muted' }, `${tested} de ${SCAN_MAX + 1} testados`)),
    h('p', { class: 'muted' }, 'O hub manda um comando de cada vez. Olhe o pedal (tela, LEDs e o som) e responda se algo mudou. Faça os testes num preset que você não usa: alguns pedais salvam alterações sozinhos.'),
    h('div', { class: 'scan-body' },
      h('div', { class: 'scan-now' },
        h('span', { class: 'scan-num' }, `CC ${n}`),
        KNOWN_ELSEWHERE[n] ? h('span', { class: 'muted small' }, KNOWN_ELSEWHERE[n]) : null,
        scan.results[n] ? h('span', { class: `tag ${scan.results[n]}` }, scan.results[n] === 'found' ? 'Mudou algo' : 'Nada mudou') : null),
      h('div', { class: 'scan-send' },
        h('span', { class: 'field-label' }, 'Enviar valor'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => send(127) }, '127 (alto)'),
          h('button', { class: 'btn', type: 'button', onclick: () => send(64) }, '64'),
          h('button', { class: 'btn', type: 'button', onclick: () => send(0) }, '0 (baixo)'))),
      h('div', { class: 'scan-answer' },
        h('span', { class: 'field-label' }, 'O pedal mudou?'),
        h('div', { class: 'btn-row' },
          h('button', {
            class: 'btn good', type: 'button',
            onclick: () => { advance('found'); controlDialog(app, { cc: n, name: `CC ${n}`, module: 'GERAL', type: 'toggle', verified: true }); },
          }, 'Mudou algo'),
          h('button', { class: 'btn', type: 'button', onclick: () => advance('none') }, 'Nada mudou')))),
    h('div', { class: 'cc-map', role: 'group', 'aria-label': 'Mapa dos comandos testados' }, mapCells),
    h('div', { class: 'map-legend muted small' },
      h('span', { class: 'lg-cell found' }), 'mudou algo',
      h('span', { class: 'lg-cell none' }), 'nada mudou',
      h('span', { class: 'lg-cell known' }), 'já tem controle'));

  // Explorador livre
  const out = h('output', { class: 'range-out big' }, String(explorerVal));
  let timer = null;
  const explorer = h('section', { class: 'block' },
    h('div', { class: 'block-head' }, h('h2', {}, 'Explorador livre')),
    h('div', { class: 'explorer' },
      h('div', { class: 'strip-field' }, h('span', { class: 'field-label' }, 'Número do CC'),
        stepper({ value: explorerCc, min: 0, max: 127, label: 'número do CC', onChange: (v) => { explorerCc = v; } })),
      h('label', { class: 'strip-field grow range-field' }, h('span', { class: 'field-label' }, 'Valor (envia ao arrastar)'),
        h('input', {
          type: 'range', min: 0, max: 127, value: explorerVal, 'aria-label': 'Valor do CC',
          oninput: (e) => {
            explorerVal = Number(e.target.value);
            out.textContent = String(explorerVal);
            clearTimeout(timer);
            timer = setTimeout(() => app.sendCC(explorerCc, explorerVal), 30);
          },
        })),
      out,
      h('button', { class: 'btn', type: 'button', onclick: () => controlDialog(app, { cc: explorerCc, name: `CC ${explorerCc}`, module: 'GERAL', type: 'knob', verified: true }) }, icon('plus'), 'Salvar como controle')));

  const fromFirmware = s.controls.some((c) => c.source === 'firmware');
  const el = h('div', { class: 'view controls' },
    h('header', { class: 'view-head' },
      h('div', {},
        h('h1', {}, 'Controles'),
        h('p', { class: 'lede' }, 'Ligue e desligue módulos e mexa em parâmetros com comandos MIDI (CC). O estado mostrado é o último que o hub enviou: mudanças feitas direto no pedal não aparecem aqui.')),
      h('button', { class: 'btn', type: 'button', onclick: () => controlDialog(app, null) }, icon('plus'), 'Novo controle')),
    fromFirmware ? h('p', { class: 'note' }, 'Os CCs 0 a 5 (FX, AMP, MOD, DLY, REV e CAB) vêm das notas de versão oficiais do firmware da ANNBLACK BOX. Teste cada um e marque "Funcionou" quando confirmar.') : null,
    s.controls.length
      ? h('div', { class: 'ctl-grid' }, s.controls.map((c) => controlCard(app, c)))
      : h('p', { class: 'muted' }, 'Nenhum controle ainda. Use "Descobrir comandos" abaixo ou crie um manualmente.'),
    scanner,
    explorer);
  return { el };
}
