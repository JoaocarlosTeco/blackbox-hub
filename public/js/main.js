// Ponto de entrada: monta a casca do app, liga MIDI + bateria + estado e cuida da navegação.

import { h, icon, toast, pad2, clamp } from './ui.js';
import * as store from './store.js';
import { Midi, describeMessage } from './midi.js';
import { DrumEngine, loopSequencer, songSequencer } from './drums/engine.js';
import { BUILTIN_PATTERNS } from './drums/patterns.js';
import * as stageView from './views/stage.js';
import * as presetsView from './views/presets.js';
import * as drumsView from './views/drums.js';
import * as songsView from './views/songs.js';
import * as controlsView from './views/controls.js';
import * as settingsView from './views/settings.js';

const TOTAL_PRESETS = 80;

const VIEWS = [
  { id: 'stage', label: 'Palco', icon: 'stage', mod: stageView },
  { id: 'presets', label: 'Presets', icon: 'presets', mod: presetsView },
  { id: 'drums', label: 'Bateria', icon: 'drums', mod: drumsView },
  { id: 'songs', label: 'Músicas', icon: 'songs', mod: songsView },
  { id: 'controls', label: 'Controles', icon: 'controls', mod: controlsView },
  { id: 'settings', label: 'Ajustes', icon: 'settings', mod: settingsView },
];

const midi = new Midi();
const engine = new DrumEngine();
const bus = new EventTarget();
let lastOfflineWarning = 0;

const app = {
  store,
  midi,
  engine,
  total: TOTAL_PRESETS,
  rt: { mode: null, songId: null, fillQueued: false, learn: null, taps: [] },
  footActions: [
    { id: 'toggle-play', label: 'Tocar ou parar a bateria' },
    { id: 'preset-prev', label: 'Preset anterior' },
    { id: 'preset-next', label: 'Próximo preset' },
    { id: 'fill', label: 'Virada' },
    { id: 'tap', label: 'Tap tempo' },
    { id: 'song-next', label: 'Tocar a próxima música do setlist' },
  ],

  emit(type, detail) { bus.dispatchEvent(new CustomEvent(type, { detail })); },
  on(type, fn) { bus.addEventListener(type, fn); return () => bus.removeEventListener(type, fn); },
  onEngine(type, fn) { engine.addEventListener(type, fn); return () => engine.removeEventListener(type, fn); },
  go(view) { location.hash = `#/${view}`; },
  rerender() { scheduleMount(); },

  patterns() { return [...store.get().customPatterns, ...BUILTIN_PATTERNS]; },
  pattern(id) { return this.patterns().find((p) => p.id === id) || BUILTIN_PATTERNS[0]; },
  presetInfo(n) { return (n && store.get().presets[n]) || {}; },

  currentBpm() {
    if (engine.playing) return engine.bpm;
    return store.get().drums.bpm;
  },

  // ---- Presets ----
  selectPreset(n, { at, auto = false } = {}) {
    const preset = ((Math.round(n) - 1) % TOTAL_PRESETS + TOTAL_PRESETS) % TOTAL_PRESETS + 1;
    const sent = midi.programChange(preset, at);
    const apply = () => store.update((s) => { s.currentPreset = preset; });
    const delay = at ? at - performance.now() : 0;
    if (delay > 5) setTimeout(apply, delay);
    else apply();
    if (!sent && !auto && Date.now() - lastOfflineWarning > 6000) {
      lastOfflineWarning = Date.now();
      toast('O pedal não está conectado. O preset foi marcado só no hub.', 'warn');
    }
    return sent;
  },
  stepPreset(dir) {
    const cur = store.get().currentPreset;
    if (!cur) return this.selectPreset(dir > 0 ? 1 : TOTAL_PRESETS);
    return this.selectPreset(cur + dir);
  },

  // ---- Bateria ----
  selectPattern(id) {
    const p = this.pattern(id);
    const keepTempo = engine.playing && this.rt.mode === 'loop';
    store.update((s) => {
      s.drums.patternId = p.id;
      s.drums.swing = p.swing || 0;
      if (!keepTempo) s.drums.bpm = p.bpm;
    });
    engine.setSwing(p.swing || 0);
    if (!keepTempo) {
      engine.setBpm(p.bpm);
      this.emit('tempo', p.bpm);
    }
  },
  async playLoop() {
    const s = store.get();
    engine.setBpm(s.drums.bpm);
    engine.setSwing(s.drums.swing);
    this.rt.fillQueued = false;
    await engine.start(loopSequencer({
      getPattern: () => this.pattern(store.get().drums.patternId),
      takeFill: () => {
        const f = this.rt.fillQueued;
        this.rt.fillQueued = false;
        return f;
      },
    }));
    this.rt.mode = 'loop';
    this.rt.songId = null;
    this.emit('runtime');
  },
  async playSong(id) {
    const song = store.get().songs.find((x) => x.id === id);
    if (!song) return;
    if (!song.sections.some((x) => x.bars > 0)) {
      toast('Adicione pelo menos uma seção à música.', 'warn');
      return;
    }
    if (midi.status !== 'connected') toast('A bateria vai tocar, mas o pedal não está conectado para trocar os presets.', 'warn');
    engine.setBpm(song.bpm);
    this.emit('tempo', song.bpm);
    await engine.start(songSequencer({ song, getPattern: (pid) => this.pattern(pid) }));
    this.rt.mode = 'song';
    this.rt.songId = song.id;
    store.update((s) => { s.ui.songId = song.id; }, { render: false });
    this.emit('runtime');
  },
  stop() { engine.stop(); },
  togglePlay() {
    if (engine.playing) this.stop();
    else this.playLoop();
  },
  queueFill() {
    if (!engine.playing || this.rt.mode !== 'loop') return;
    this.rt.fillQueued = true;
  },
  setBpm(v) {
    const bpm = clamp(Math.round(v), 30, 300);
    engine.setBpm(bpm);
    if (this.rt.mode !== 'song') store.update((s) => { s.drums.bpm = bpm; }, { render: false });
    this.emit('tempo', bpm);
  },
  setSwing(v) {
    engine.setSwing(v);
    store.update((s) => { s.drums.swing = v; }, { render: false });
  },
  tap() {
    const now = performance.now();
    const taps = this.rt.taps.filter((t) => now - t < 2500);
    taps.push(now);
    this.rt.taps = taps.slice(-6);
    if (this.rt.taps.length >= 2) {
      let sum = 0;
      for (let i = 1; i < this.rt.taps.length; i++) sum += this.rt.taps[i] - this.rt.taps[i - 1];
      this.setBpm(60000 / (sum / (this.rt.taps.length - 1)));
    }
  },
  nextSong() {
    const s = store.get();
    const sl = s.setlists.find((x) => x.id === s.activeSetlistId);
    const ids = sl ? sl.songIds : s.songs.map((x) => x.id);
    if (!ids.length) return;
    const curId = this.rt.songId || s.ui.songId;
    const next = ids[(ids.indexOf(curId) + 1) % ids.length];
    this.playSong(next);
  },
  async setSink(id, label) {
    try {
      await engine.setSink(id);
      store.update((s) => { s.audio.sinkId = id; s.audio.sinkLabel = label || ''; });
      toast(id ? `Bateria saindo em: ${label}` : 'Bateria na saída padrão do Windows.', 'ok');
    } catch (e) {
      toast(`Não deu para usar essa saída: ${e.message}`, 'warn');
    }
  },

  // ---- Controles CC ----
  sendCC(cc, value) {
    const ok = midi.controlChange(cc, value);
    if (!ok) toast('O pedal não está conectado.', 'warn');
    return ok;
  },
  setControl(id, value, { render = true } = {}) {
    const c = store.get().controls.find((x) => x.id === id);
    if (!c) return;
    if (this.sendCC(c.cc, value)) store.update((s) => { const x = s.controls.find((y) => y.id === id); if (x) x.value = value; }, { render });
  },
  toggleControl(id) {
    const c = store.get().controls.find((x) => x.id === id);
    if (!c) return;
    const isOn = c.value != null && c.value >= 64;
    this.setControl(id, isOn ? c.off : c.on);
  },

  // ---- Footswitch externo ----
  learnFoot(actionId) {
    this.rt.learn = actionId;
    scheduleMount();
  },
  runFootAction(id) {
    switch (id) {
      case 'toggle-play': return this.togglePlay();
      case 'preset-prev': return this.stepPreset(-1);
      case 'preset-next': return this.stepPreset(1);
      case 'fill': return this.queueFill();
      case 'tap': return this.tap();
      case 'song-next': return this.nextSong();
      default: return undefined;
    }
  },

  applyStoreToDevices() {
    const s = store.get();
    midi.channel = s.midi.channel;
    if (s.midi.outputName) midi.selectOutput(s.midi.outputName);
    engine.setVolume(s.audio.volume);
    engine.setReverb(s.audio.reverb);
    engine.setBpm(s.drums.bpm);
    engine.setSwing(s.drums.swing);
    engine.setSink(s.audio.sinkId).catch(() => {});
    this.emit('tempo', s.drums.bpm);
  },
};

// ---------- Eventos do motor e do MIDI ----------

engine.addEventListener('preset', (e) => {
  const at = e.detail.perf - store.get().midi.anticipateMs;
  app.selectPreset(e.detail.preset, { at: at > performance.now() + 2 ? at : undefined, auto: true });
});
engine.addEventListener('state', (e) => {
  if (!e.detail) {
    app.rt.mode = null;
    app.rt.songId = null;
    app.rt.fillQueued = false;
    app.emit('tempo', store.get().drums.bpm);
  }
  app.emit('runtime');
});
engine.addEventListener('step', (e) => {
  if (e.detail.isBeat) {
    railLed.classList.remove('blink');
    void railLed.offsetWidth;
    railLed.classList.add('blink');
  }
});
engine.addEventListener('sinkerror', (e) => toast(`Saída de som indisponível: ${e.detail}. Usando a padrão.`, 'warn'));

midi.addEventListener('change', () => {
  renderRail();
  if (['stage', 'settings'].includes(currentView())) scheduleMount();
});
midi.addEventListener('failure', (e) => toast(`Falha ao enviar MIDI: ${e.detail}`, 'warn'));
midi.addEventListener('message', (e) => {
  const msg = describeMessage(e.detail.bytes);
  if (!msg) return;
  if (app.rt.learn) {
    const action = app.rt.learn;
    app.rt.learn = null;
    store.update((s) => {
      s.footswitch = s.footswitch.filter((m) => m.action !== action && m.sig !== msg.sig);
      s.footswitch.push({ action, sig: msg.sig });
    });
    toast(`Associado: ${msg.label}`, 'ok');
    return;
  }
  if (!msg.press) return;
  const map = store.get().footswitch.find((m) => m.sig === msg.sig);
  if (map) app.runFootAction(map.action);
});

// ---------- Casca: barra superior, navegação e área principal ----------

const root = document.getElementById('app');
const rail = h('header', { class: 'rail' });
const nav = h('nav', { class: 'nav', 'aria-label': 'Seções' });
const main = h('main', { class: 'main', id: 'main', tabindex: '-1' });
const railLed = h('span', { class: 'rail-led', 'aria-hidden': 'true' });
root.append(h('a', { class: 'skip', href: '#main' }, 'Pular para o conteúdo'), h('div', { class: 'shell' }, rail, nav, main));

const CONN = {
  connected: ['ok', 'Pedal conectado'],
  'no-device': ['bad', 'Pedal não encontrado'],
  denied: ['bad', 'MIDI bloqueado'],
  unsupported: ['bad', 'Navegador sem MIDI'],
  idle: ['idle', 'Conectar pedal'],
};

function renderRail() {
  const s = store.get();
  const cur = s.currentPreset;
  const info = app.presetInfo(cur);
  const [tone, text] = CONN[midi.status] || CONN.idle;
  const playing = engine.playing;
  const song = app.rt.mode === 'song' ? s.songs.find((x) => x.id === app.rt.songId) : null;
  const nowLabel = song ? song.name : app.pattern(s.drums.patternId).name;
  rail.replaceChildren(
    h('a', { class: 'brand', href: '#/stage', 'aria-label': 'Black Box Hub: ir para o palco' },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), h('span', { class: 'brand-name' }, 'Black Box Hub')),
    h('button', {
      class: `conn ${tone}`, type: 'button',
      onclick: () => (midi.status === 'idle' || midi.status === 'no-device' ? midi.connect() : app.go('settings')),
    }, h('span', { class: 'conn-dot' }), h('span', { class: 'conn-label' }, text)),
    h('button', { class: 'rail-preset', type: 'button', style: { '--pc': info.color || null }, onclick: () => app.go('presets'), title: 'Preset atual' },
      h('span', { class: 'rail-p' }, cur ? `P${pad2(cur)}` : 'P--'),
      h('span', { class: 'rail-pname' }, cur ? info.name || 'Sem nome' : 'Nenhum preset')),
    h('div', { class: 'transport' },
      h('button', {
        class: `play-key sm ${playing ? 'is-playing' : ''}`, type: 'button',
        'aria-label': playing ? 'Parar bateria' : 'Tocar bateria', title: 'Barra de espaço',
        onclick: () => app.togglePlay(),
      }, icon(playing ? 'stop' : 'play')),
      railLed,
      h('div', { class: 'rail-bpm' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Diminuir andamento', onclick: () => app.setBpm(app.currentBpm() - 1) }, '−'),
        h('span', { class: 'bpm-val' }, h('b', { id: 'rail-bpm' }, String(app.currentBpm())), h('small', {}, 'BPM')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Aumentar andamento', onclick: () => app.setBpm(app.currentBpm() + 1) }, '+')),
      h('button', { class: 'btn small', type: 'button', onclick: () => app.tap(), title: 'Tap tempo (tecla T)' }, 'Tap'),
      h('span', { class: 'now-label', title: nowLabel }, nowLabel)));
}

function renderNav(active) {
  nav.replaceChildren(...VIEWS.map((v) => h('a', {
    href: `#/${v.id}`,
    'aria-current': v.id === active ? 'page' : null,
  }, icon(v.icon), h('span', {}, v.label))));
}

function currentView() {
  const id = location.hash.replace(/^#\/?/, '');
  return VIEWS.some((v) => v.id === id) ? id : 'stage';
}

let mounted = null;
let pending = false;

function mount() {
  pending = false;
  const id = currentView();
  const view = VIEWS.find((v) => v.id === id);
  const sameView = mounted && mounted.id === id;
  const scrollY = sameView ? window.scrollY : 0;
  if (mounted && mounted.destroy) mounted.destroy();
  const res = view.mod.render(app);
  mounted = { id, destroy: res.destroy };
  main.replaceChildren(res.el);
  renderNav(id);
  document.title = `${view.label} | Black Box Hub`;
  window.scrollTo(0, scrollY);
}

// Junta várias atualizações seguidas num único redesenho (microtarefa, funciona mesmo com a aba em segundo plano).
function scheduleMount() {
  if (pending) return;
  pending = true;
  queueMicrotask(mount);
}

store.subscribe((s, { render }) => {
  renderRail();
  if (render) scheduleMount();
});
app.on('runtime', () => { renderRail(); scheduleMount(); });
app.on('tempo', (e) => {
  const el = document.getElementById('rail-bpm');
  if (el) el.textContent = String(e.detail);
});
window.addEventListener('hashchange', () => {
  mount();
  main.focus({ preventScroll: true });
});

// ---------- Atalhos de teclado ----------

document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
  if (document.querySelector('dialog[open]')) return;
  const key = e.key.toLowerCase();
  if (e.code === 'Space') {
    e.preventDefault();
    app.togglePlay();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    app.stepPreset(1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    app.stepPreset(-1);
  } else if (key === 't') app.tap();
  else if (key === 'v') app.queueFill();
});

// ---------- Tela sempre ligada (celular no palco) ----------

let wakeLock = null;
app.keepAwake = async (on) => {
  if (!('wakeLock' in navigator)) return false;
  try {
    if (on && !wakeLock && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
    return true;
  } catch {
    return false;
  }
};
app.wakeLockSupported = 'wakeLock' in navigator;
// O sistema solta a trava quando a tela fica escondida; pede de novo ao voltar.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && store.get().ui.keepAwake) app.keepAwake(true);
});

// ---------- Funcionar sem internet ----------

if ('serviceWorker' in navigator) {
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  // No computador de desenvolvimento fica desligado para sempre carregar o código novo (?sw=1 liga para testar).
  if (!isLocal || new URLSearchParams(location.search).has('sw')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ---------- Início ----------

app.applyStoreToDevices();
if (store.get().ui.keepAwake) app.keepAwake(true);
midi.preferredName = store.get().midi.outputName;
renderRail();
mount();
midi.autoConnect();

window.blackboxHub = app; // útil para inspecionar pelo console do navegador
