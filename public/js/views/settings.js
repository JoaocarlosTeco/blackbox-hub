// Ajustes: conexão MIDI, saída de som, footswitch externo e backup.

import { h, icon, stepper, toast, confirmAsk, downloadText } from '../ui.js';

const STATUS_TEXT = {
  idle: 'Ainda não conectado. Clique em "Conectar ao pedal" e permita o acesso MIDI.',
  connected: 'Pedal conectado pela USB.',
  'no-device': 'MIDI liberado, mas o pedal não apareceu. Confira o cabo USB-C e se o pedal está ligado.',
  denied: 'O navegador bloqueou o MIDI. Clique no cadeado da barra de endereço, permita "Dispositivos MIDI" e conecte de novo.',
  unsupported: 'Este navegador não tem Web MIDI. Use Chrome ou Edge no computador.',
};

async function listOutputs() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'audiooutput');
}

export function render(app) {
  const s = app.store.get();
  const midi = app.midi;

  // ---- Pedal ----
  const outs = midi.outputs();
  const pedal = h('section', { class: 'block' },
    h('div', { class: 'block-head' }, h('h2', {}, 'Pedal'), h('span', { class: `status-dot ${midi.status}` }, midi.status === 'connected' ? 'Conectado' : 'Desconectado')),
    h('p', { class: 'muted' }, STATUS_TEXT[midi.status] || ''),
    h('div', { class: 'settings-row' },
      h('button', { class: 'btn primary', type: 'button', onclick: () => midi.connect() }, icon('usb'), midi.access ? 'Procurar de novo' : 'Conectar ao pedal'),
      outs.length ? h('div', { class: 'strip-field' }, h('span', { class: 'field-label' }, 'Saída MIDI'),
        h('select', {
          class: 'input', 'aria-label': 'Saída MIDI', value: midi.output ? midi.output.name : '',
          onchange: (e) => { midi.selectOutput(e.target.value); app.store.update((st) => { st.midi.outputName = e.target.value; }); },
        }, outs.map((o) => h('option', { value: o.name }, o.name)))) : null,
      h('div', { class: 'strip-field' }, h('span', { class: 'field-label' }, 'Canal MIDI'),
        h('select', {
          class: 'input', 'aria-label': 'Canal MIDI', value: String(s.midi.channel),
          onchange: (e) => { const ch = Number(e.target.value); midi.channel = ch; app.store.update((st) => { st.midi.channel = ch; }); },
        }, Array.from({ length: 16 }, (_, i) => h('option', { value: String(i) }, `Canal ${i + 1}`)))),
      h('div', { class: 'strip-field' }, h('span', { class: 'field-label' }, 'Antecipar troca de preset (ms)'),
        stepper({ value: s.midi.anticipateMs, min: 0, max: 200, step: 5, label: 'antecipação em milissegundos', onChange: (v) => app.store.update((st) => { st.midi.anticipateMs = v; }, { render: false }) }))),
    h('p', { class: 'muted small' }, 'No teste, o pedal respondeu no canal 16 e em outro canal (provavelmente está em OMNI). A antecipação envia a troca de preset um pouco antes do tempo 1 para compensar o tempo que o pedal leva para carregar o som.'));

  // ---- Áudio ----
  const sinkSelect = h('select', { class: 'input', 'aria-label': 'Saída de som da bateria', disabled: !app.engine.sinkSupported },
    h('option', { value: '' }, 'Saída padrão do Windows'));
  const fillSinks = async () => {
    const devices = await listOutputs();
    const opts = devices.filter((d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
    sinkSelect.replaceChildren(h('option', { value: '' }, 'Saída padrão do Windows'),
      ...opts.map((d, i) => h('option', { value: d.deviceId }, d.label || `Saída ${i + 1}`)));
    sinkSelect.value = s.audio.sinkId && opts.some((d) => d.deviceId === s.audio.sinkId) ? s.audio.sinkId : '';
    const pedalOut = opts.find((d) => /usb-?audio/i.test(d.label));
    usePedal.disabled = !pedalOut;
    usePedal.onclick = () => pedalOut && app.setSink(pedalOut.deviceId, pedalOut.label);
    labelsHint.hidden = opts.some((d) => d.label);
  };
  sinkSelect.addEventListener('change', () => {
    const opt = sinkSelect.selectedOptions[0];
    app.setSink(sinkSelect.value, opt ? opt.textContent : '');
  });
  const usePedal = h('button', { class: 'btn', type: 'button', disabled: true }, icon('speaker'), 'Usar o pedal');
  const labelsHint = h('div', { class: 'note', hidden: true },
    h('p', {}, 'O navegador só mostra os nomes das saídas de som depois que você permite o microfone. O hub não grava nada: a permissão serve só para listar os aparelhos.'),
    h('button', {
      class: 'btn small', type: 'button',
      onclick: async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
          await fillSinks();
        } catch (e) {
          toast(`Permissão negada: ${e.message}`, 'warn');
        }
      },
    }, 'Mostrar nomes das saídas'));
  fillSinks().catch(() => {});

  const volOut = h('output', { class: 'range-out' }, `${Math.round(s.audio.volume * 100)}%`);
  const verbOut = h('output', { class: 'range-out' }, `${Math.round(s.audio.reverb * 100)}%`);
  const audio = h('section', { class: 'block' },
    h('div', { class: 'block-head' }, h('h2', {}, 'Som da bateria')),
    h('p', { class: 'muted' }, 'O pedal também é uma placa de som USB. Escolha "Alto-falantes (USB-Audio)" para a bateria sair no fone ou amplificador ligado ao pedal, junto com a guitarra.'),
    app.engine.sinkSupported ? null : h('p', { class: 'note' }, 'Este navegador não deixa escolher a saída por aqui. No celular Android, o som normalmente vai sozinho para o pedal quando ele está ligado pela USB. No Windows, mude a saída padrão para "Alto-falantes (USB-Audio)".'),
    h('div', { class: 'settings-row' },
      h('div', { class: 'strip-field grow' }, h('span', { class: 'field-label' }, 'Saída de som'), sinkSelect),
      usePedal,
      h('button', { class: 'btn primary', type: 'button', onclick: () => app.engine.testSound() }, icon('play'), 'Tocar som de teste')),
    labelsHint,
    h('div', { class: 'settings-row' },
      h('label', { class: 'strip-field grow range-field' }, h('span', { class: 'field-label' }, 'Volume da bateria ', volOut),
        h('input', {
          type: 'range', min: 0, max: 100, value: Math.round(s.audio.volume * 100), 'aria-label': 'Volume da bateria',
          oninput: (e) => { const v = Number(e.target.value) / 100; volOut.textContent = `${e.target.value}%`; app.engine.setVolume(v); app.store.update((st) => { st.audio.volume = v; }, { render: false }); },
        })),
      h('label', { class: 'strip-field grow range-field' }, h('span', { class: 'field-label' }, 'Ambiência ', verbOut),
        h('input', {
          type: 'range', min: 0, max: 60, value: Math.round(s.audio.reverb * 100), 'aria-label': 'Ambiência da bateria',
          oninput: (e) => { const v = Number(e.target.value) / 100; verbOut.textContent = `${e.target.value}%`; app.engine.setReverb(v); app.store.update((st) => { st.audio.reverb = v; }, { render: false }); },
        }))),
    h('p', { class: 'muted small' }, 'O volume do PC que chega ao pedal é controlado pelo volume do Windows; o knob MASTER do pedal controla só a guitarra.'));

  // ---- Footswitch externo ----
  const foot = h('section', { class: 'block' },
    h('div', { class: 'block-head' }, h('h2', {}, 'Footswitch MIDI externo')),
    h('p', { class: 'muted' }, 'Os footswitches da Black Box não avisam o computador quando você pisa. Para controlar o hub com o pé (tocar a bateria, trocar de música), ligue um controlador MIDI USB ou Bluetooth e associe cada botão a uma ação. Use o controlador no modo momentâneo.'),
    h('div', { class: 'foot-list' }, app.footActions.map((a) => {
      const m = s.footswitch.find((x) => x.action === a.id);
      const learning = app.rt.learn === a.id;
      return h('div', { class: 'foot-row' },
        h('span', { class: 'foot-action' }, a.label),
        h('span', { class: `foot-sig ${m ? '' : 'muted'}` }, learning ? 'Pise no footswitch...' : m ? sigLabel(m.sig) : 'Sem botão'),
        h('div', { class: 'btn-row' },
          h('button', { class: `btn small ${learning ? 'primary' : ''}`, type: 'button', onclick: () => app.learnFoot(learning ? null : a.id) }, learning ? 'Cancelar' : 'Associar'),
          m ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => app.store.update((st) => { st.footswitch = st.footswitch.filter((x) => x.action !== a.id); }) }, 'Limpar') : null));
    })));

  // ---- Backup ----
  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        app.store.importJSON(await file.text());
        app.applyStoreToDevices();
        toast('Backup restaurado.', 'ok');
      } catch (err) {
        toast(err.message, 'warn');
      }
    },
  });
  const backup = h('section', { class: 'block' },
    h('div', { class: 'block-head' }, h('h2', {}, 'Backup')),
    h('p', { class: 'muted' }, 'Tudo fica salvo neste navegador. Exporte um arquivo para guardar ou levar para outro computador.'),
    h('div', { class: 'settings-row' },
      h('button', {
        class: 'btn', type: 'button',
        onclick: () => {
          const d = new Date();
          const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          downloadText(`blackbox-hub-${stamp}.json`, app.store.exportJSON());
          toast('Backup exportado.', 'ok');
        },
      }, icon('download'), 'Exportar backup'),
      h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, icon('upload'), 'Restaurar backup'),
      fileInput,
      h('button', {
        class: 'btn danger-ghost', type: 'button',
        onclick: async () => {
          if (!(await confirmAsk('Apagar nomes de presets, músicas, setlists, ritmos e controles deste navegador? Isso não mexe nos presets guardados no pedal.', { title: 'Recomeçar do zero', confirm: 'Apagar tudo', danger: true }))) return;
          app.stop();
          app.store.reset();
          app.applyStoreToDevices();
        },
      }, icon('trash'), 'Recomeçar do zero')));

  // ---- Sobre ----
  const about = h('section', { class: 'block about' },
    h('div', { class: 'block-head' }, h('h2', {}, 'O que o hub sabe sobre a ANNBLACK BOX')),
    h('ul', { class: 'facts' },
      h('li', {}, h('b', {}, 'Confirmado no seu pedal: '), 'aparece no Windows como "USB-Audio" e "USB-Midi" (VID 4C4A, PID C755) e troca de preset por Program Change (programa 0 = P01).'),
      h('li', {}, h('b', {}, 'Confirmado no seu pedal: '), 'não envia nada pela USB quando você mexe nele, então o hub não consegue saber o preset atual se você trocar pelo pé.'),
      h('li', {}, h('b', {}, 'Pelas notas oficiais do firmware: '), 'CC 0 a 5 ligam e desligam FX, AMP, MOD, DLY, REV e CAB; a versão V21 acrescentou escolha de canal (1 a 16 ou OMNI), controle de modelos, parâmetros e tap tempo, sem publicar os números.'),
      h('li', {}, h('b', {}, 'Pelas notas oficiais do firmware: '), 'o som que sai do computador pela USB toca na saída do pedal, com volume controlado pelo computador.'),
      h('li', {}, h('b', {}, 'Ainda não implementado: '), 'editar cada parâmetro dos efeitos, fazer backup dos 80 presets e carregar IRs. Isso usa um protocolo próprio da M-VAVE (SysEx), documentado só por engenharia reversa da comunidade, e fica para uma próxima etapa feita com cuidado.')));

  // ---- Celular e palco ----
  const mobile = h('section', { class: 'block' },
    h('div', { class: 'block-head' }, h('h2', {}, 'Celular e palco')),
    h('label', { class: 'check' },
      h('input', {
        type: 'checkbox', checked: !!s.ui.keepAwake, disabled: !app.wakeLockSupported,
        onchange: (e) => {
          const on = e.target.checked;
          app.store.update((st) => { st.ui.keepAwake = on; }, { render: false });
          app.keepAwake(on);
        },
      }),
      'Manter a tela ligada enquanto o hub estiver aberto'),
    app.wakeLockSupported ? null : h('p', { class: 'muted small' }, 'Este navegador não permite segurar a tela ligada.'),
    h('ul', { class: 'facts' },
      h('li', {}, h('b', {}, 'Celular Android: '), 'ligue o pedal na entrada USB-C do celular (cabo USB-C dos dois lados ou adaptador OTG), abra o hub no Chrome e toque em "Instalar app" ou "Adicionar à tela inicial".'),
      h('li', {}, h('b', {}, 'Sem internet: '), 'depois de abrir uma vez com internet, o hub funciona offline. Para receber uma versão nova, abra uma vez com internet.'),
      h('li', {}, h('b', {}, 'Levar o que você montou no computador: '), 'exporte o backup aqui no computador, mande o arquivo para o celular e use "Restaurar backup" no celular. Cada aparelho guarda os próprios dados.')));

  const el = h('div', { class: 'view settings' },
    h('header', { class: 'view-head' }, h('div', {}, h('h1', {}, 'Ajustes'))),
    pedal, audio, mobile, foot, backup, about);
  return { el };
}

function sigLabel(sig) {
  const [kind, ch, num] = sig.split(':');
  const chn = Number(ch) + 1;
  if (kind === 'cc') return `CC ${num}, canal ${chn}`;
  if (kind === 'pc') return `Program Change ${num}, canal ${chn}`;
  return `Nota ${num}, canal ${chn}`;
}
