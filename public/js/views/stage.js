// Palco: a "cara" do pedal na tela, com footswitches, tela de preset, favoritos, bateria e música atual.

import { h, icon, pad2, stepper, MODULES, moduleColor, formatDuration } from '../ui.js';
import { playButton, patternSelect, beatLeds, presetLabel } from './common.js';
import { songDuration } from './songs.js';

let booted = false;

function bpmRing(bpm) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, Math.max(0, (bpm - 30) / (240 - 30)));
  const wrap = h('div', { class: 'bpm-ring', 'aria-label': `${bpm} batidas por minuto` });
  wrap.innerHTML = `<svg viewBox="0 0 80 80" aria-hidden="true">
      <circle cx="40" cy="40" r="${r}" class="ring-track"/>
      <circle cx="40" cy="40" r="${r}" class="ring-arc" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}" transform="rotate(-90 40 40)"/>
    </svg>`;
  const value = h('span', { class: 'ring-value' }, String(bpm));
  wrap.append(h('div', { class: 'ring-text' }, value, h('span', { class: 'ring-unit' }, 'BPM')));
  wrap.set = (v) => {
    value.textContent = String(v);
    const f = Math.min(1, Math.max(0, (v - 30) / (240 - 30)));
    wrap.querySelector('.ring-arc').setAttribute('stroke-dashoffset', String(c * (1 - f)));
  };
  return wrap;
}

function footswitch(app, dir) {
  return h('div', { class: `fs-wrap ${dir < 0 ? 'left' : 'right'}` },
    h('button', {
      class: 'footswitch',
      type: 'button',
      'aria-label': dir < 0 ? 'Preset anterior' : 'Próximo preset',
      title: dir < 0 ? 'Preset anterior (seta para a esquerda)' : 'Próximo preset (seta para a direita)',
      onclick: () => app.stepPreset(dir),
    }, h('span', { class: 'footswitch-cap' })),
    h('span', { class: `fs-caption ${dir < 0 ? 'down' : 'up'}` }, dir < 0 ? 'Anterior' : 'Próximo'));
}

export function render(app) {
  const s = app.store.get();
  const cur = s.currentPreset;
  const info = app.presetInfo(cur);
  const offs = [];

  const toggles = s.controls.filter((c) => c.type === 'toggle' && MODULES.includes(c.module));
  const moduleRow = h('div', { class: 'screen-modules' },
    MODULES.map((m) => {
      const c = toggles.find((t) => t.module === m);
      const state = !c || c.value == null ? 'unknown' : c.value >= 64 ? 'on' : 'off';
      return h('button', {
        class: `mod-chip ${state}`,
        type: 'button',
        style: { '--mc': moduleColor(m) },
        disabled: !c,
        title: c ? `${m}: ${state === 'on' ? 'ligado' : state === 'off' ? 'desligado' : 'estado desconhecido'} (CC ${c.cc})` : `${m}: sem controle mapeado`,
        'aria-label': c ? `Alternar ${m}` : `${m} sem controle`,
        onclick: () => c && app.toggleControl(c.id),
      }, m);
    }));

  const ring = bpmRing(app.currentBpm());
  offs.push(app.on('tempo', (e) => ring.set(e.detail)));

  const screen = h('div', { class: `screen ${booted ? '' : 'boot'}`, style: { '--pc': info.color || null } },
    h('div', { class: 'screen-head' }, moduleRow,
      h('span', { class: `screen-conn ${app.midi.status === 'connected' ? 'ok' : ''}` }, icon('usb'), app.midi.status === 'connected' ? 'USB' : 'Sem pedal')),
    h('div', { class: 'screen-main' },
      h('div', { class: 'preset-box' }, h('span', { class: 'preset-p' }, 'P'), h('span', { class: 'preset-num' }, cur ? pad2(cur) : '--')),
      ring),
    h('div', { class: 'screen-name' }, cur ? info.name || 'Preset sem nome' : 'Escolha um preset'),
    info.notes ? h('div', { class: 'screen-notes' }, info.notes) : null);
  booted = true;

  const pedal = h('section', { class: 'pedal', 'aria-label': 'Pedal' }, footswitch(app, -1), screen, footswitch(app, 1));

  // Favoritos
  const favs = Object.entries(s.presets).filter(([, p]) => p && p.favorite).map(([n]) => Number(n)).sort((a, b) => a - b);
  const favBlock = h('section', { class: 'block' },
    h('div', { class: 'block-head' }, h('h2', {}, 'Favoritos')),
    favs.length
      ? h('div', { class: 'fav-row' }, favs.map((n) => {
        const p = app.presetInfo(n);
        return h('button', {
          class: `fav ${n === cur ? 'on' : ''}`,
          type: 'button',
          style: { '--pc': p.color || null },
          onclick: () => app.selectPreset(n),
        }, h('span', { class: 'fav-num' }, pad2(n)), h('span', { class: 'fav-name' }, p.name || 'Sem nome'));
      }))
      : h('p', { class: 'muted' }, 'Marque presets com a estrela na página Presets e eles aparecem aqui para troca rápida.'));

  // Bateria
  const pattern = app.pattern(s.drums.patternId);
  const leds = beatLeds(pattern.beatsPerBar);
  offs.push(app.onEngine('step', (e) => {
    const ev = e.detail;
    if (ev.isBeat) leds.light(ev.beat, ev.bar.pattern.beatsPerBar, ev.beat === 0);
  }));
  offs.push(app.onEngine('state', (e) => { if (!e.detail) leds.clear(); }));
  const bpmCtl = stepper({ value: app.currentBpm(), min: 30, max: 300, label: 'andamento', onChange: (v) => app.setBpm(v) });
  offs.push(app.on('tempo', (e) => bpmCtl.setValue(e.detail)));

  const drumBlock = h('section', { class: 'block drum-strip' },
    h('div', { class: 'block-head' }, h('h2', {}, 'Bateria'), leds),
    h('div', { class: 'strip-row' },
      playButton(app),
      h('div', { class: 'strip-field grow' }, h('span', { class: 'field-label' }, 'Ritmo'),
        patternSelect(app, s.drums.patternId, (id) => app.selectPattern(id))),
      h('div', { class: 'strip-field' }, h('span', { class: 'field-label' }, 'Andamento'), bpmCtl),
      h('button', { class: 'btn', type: 'button', onclick: () => app.tap(), title: 'Tecla T' }, icon('tap'), 'Tap'),
      h('button', { class: 'btn', type: 'button', disabled: !app.engine.playing || app.rt.mode !== 'loop', onclick: () => app.queueFill(), title: 'Tecla V' }, icon('fill'), 'Virada')));

  // Música
  const songBlock = renderSongBlock(app, s, offs);

  const el = h('div', { class: 'view stage' }, pedal, h('div', { class: 'stage-grid' }, drumBlock, favBlock), songBlock);
  return { el, destroy: () => offs.forEach((off) => off()) };
}

function renderSongBlock(app, s, offs) {
  if (app.rt.mode === 'song') {
    const song = s.songs.find((x) => x.id === app.rt.songId);
    if (!song) return null;
    const total = song.sections.reduce((a, x) => a + x.bars, 0) || 1;
    const segs = song.sections.map((sec, i) => h('div', {
      class: 'tl-seg', 'data-sec': i, style: { flexGrow: sec.bars, '--pc': app.presetInfo(sec.preset).color || null },
    }, h('span', { class: 'tl-name' }, sec.name || `Seção ${i + 1}`), h('span', { class: 'tl-meta' }, sec.preset ? `P${pad2(sec.preset)}` : 'mantém')));
    const cursor = h('div', { class: 'tl-cursor' });
    const status = h('p', { class: 'song-status' }, 'Contagem');
    const timeline = h('div', { class: 'timeline' }, segs, cursor);
    offs.push(app.onEngine('bar', (e) => {
      const bar = e.detail.bar;
      if (bar.countIn) { status.textContent = 'Contagem'; return; }
      if (bar.ending) { status.textContent = 'Fim'; cursor.style.left = '100%'; return; }
      if (bar.sectionIndex == null) return;
      segs.forEach((sg, i) => sg.classList.toggle('now', i === bar.sectionIndex));
      const before = song.sections.slice(0, bar.sectionIndex).reduce((a, x) => a + x.bars, 0);
      cursor.style.left = `${((before + bar.barInSection) / total) * 100}%`;
      const sec = song.sections[bar.sectionIndex];
      status.textContent = `${sec.name || `Seção ${bar.sectionIndex + 1}`}, compasso ${bar.barInSection + 1} de ${bar.sectionBars}`;
    }));
    return h('section', { class: 'block now-playing' },
      h('div', { class: 'block-head' }, h('h2', {}, song.name), h('button', { class: 'btn', type: 'button', onclick: () => app.stop() }, icon('stop'), 'Parar música')),
      status, timeline);
  }
  const setlist = s.setlists.find((x) => x.id === s.activeSetlistId);
  const songs = setlist ? setlist.songIds.map((id) => s.songs.find((x) => x.id === id)).filter(Boolean) : s.songs;
  return h('section', { class: 'block' },
    h('div', { class: 'block-head' }, h('h2', {}, setlist ? setlist.name : 'Músicas'),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => app.go('songs') }, 'Editar músicas')),
    songs.length
      ? h('ol', { class: 'stage-songs' }, songs.map((song) => h('li', {},
        h('button', { class: 'stage-song', type: 'button', onclick: () => app.playSong(song.id) },
          icon('play'),
          h('span', { class: 'stage-song-name' }, song.name),
          h('span', { class: 'muted' }, `${song.bpm} BPM, ${formatDuration(songDuration(app, song))}`),
          h('span', { class: 'stage-song-first' }, song.sections[0]?.preset ? presetLabel(app, song.sections[0].preset) : '')))))
      : h('p', { class: 'muted' }, 'Nenhuma música neste setlist. Crie uma na página Músicas.'));
}
