// Ponto de entrada: monta a casca do app, liga MIDI + bateria + estado e cuida da navegação.

import { h, icon, toast, pad2, clamp, confirmAsk } from './ui.js';
import * as store from './store.js';
import { Midi, describeMessage } from './midi.js';
import { BlackBoxLink, pullAllPresets, sameBytes } from './blackbox/link.js';
import { toHex, fromHex } from './blackbox/protocol.js';
import { buildPreset } from './blackbox/preset.js';
import { slotNotes } from './packs.js';
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
const link = new BlackBoxLink(midi);
const bus = new EventTarget();

// ?simulador=1 liga um pedal de mentira (para testar sem o aparelho); ?simulador=lento obriga a leitura preset por preset.
const simulatorParam = new URLSearchParams(location.search).get('simulador');
if (simulatorParam !== null) {
  const { FakePedal } = await import('./blackbox/fake-pedal.js');
  midi.useSimulator(new FakePedal({ directSlotRead: simulatorParam !== 'lento' }));
}
let lastOfflineWarning = 0;

const app = {
  store,
  midi,
  engine,
  link,
  total: TOTAL_PRESETS,
  pullState: { running: false, done: 0, total: TOTAL_PRESETS, phase: '', error: null, errorMessage: '', cancelRequested: false },
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
      toast(id ? `Bateria saindo em: ${label}` : 'Bateria na saída padrão do aparelho.', 'ok');
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

  // ---- Conversa própria com o pedal (SysEx) ----
  async ensureSysex() {
    const granted = await midi.connect({ sysex: true });
    if (!granted || !midi.sysex) throw Object.assign(new Error(midi.error), { code: 'no-sysex' });
    if (midi.status !== 'connected') throw Object.assign(new Error(''), { code: 'no-device' });
  },

  // Grava os 92 bytes no P<n>, confere relendo e guarda o que havia antes (para desfazer).
  async saveSlot(n, bytes, { label = 'Editor', keepHistory = true } = {}) {
    await this.ensureSysex();
    const { before, after } = await link.saveSlot(n - 1, bytes);
    store.update((s) => {
      if (!s.deviceDump) s.deviceDump = { pulledAt: new Date().toISOString(), method: 'direct', slots: {}, failed: [], names: {} };
      s.deviceDump.slots[n] = toHex(after);
      if (keepHistory && !sameBytes(before, after)) {
        s.slotHistory[n] = [...(s.slotHistory[n] || []), { at: new Date().toISOString(), hex: toHex(before), label }].slice(-5);
      }
    });
    return { before, after };
  },

  lastSaved(n) {
    const list = store.get().slotHistory[n];
    return list && list.length ? list[list.length - 1] : null;
  },

  // Volta o P<n> para o que havia antes da última gravação feita pelo hub.
  async restoreSlot(n) {
    const prev = this.lastSaved(n);
    if (!prev) return false;
    await this.saveSlot(n, fromHex(prev.hex), { keepHistory: false });
    store.update((s) => { s.slotHistory[n] = (s.slotHistory[n] || []).slice(0, -1); });
    return true;
  },

  // Grava os ajustes de um pacote nos slots dele e aplica nomes e legendas.
  async writePack(pack, onProgress = () => {}) {
    if (engine.playing) this.stop();
    await this.ensureSysex();
    const label = `Pacote ${pack.name}`;
    const written = [];
    for (const slot of pack.slots) {
      onProgress(written.length, pack.slots.length, slot);
      const base = await link.readSlot(slot.preset - 1);
      await this.saveSlot(slot.preset, buildPreset(base, slot.sound), { label });
      written.push(slot.preset);
    }
    store.update((s) => {
      for (const slot of pack.slots) {
        s.presets[slot.preset] = { ...(s.presets[slot.preset] || {}), name: slot.name, color: slot.color, notes: slotNotes(slot) };
      }
    });
    onProgress(written.length, pack.slots.length, null);
    // O pedal passa a tocar o primeiro preset do pacote, já com o som novo.
    this.selectPreset(pack.slots[0].preset);
    return written;
  },

  // Desfaz a gravação de um pacote nos slots em que ela foi a última feita pelo hub.
  async undoPack(pack) {
    await this.ensureSysex();
    const label = `Pacote ${pack.name}`;
    const restored = [];
    for (const slot of pack.slots) {
      const prev = this.lastSaved(slot.preset);
      if (prev && prev.label === label && await this.restoreSlot(slot.preset)) restored.push(slot.preset);
    }
    const cur = store.get().currentPreset;
    if (restored.includes(cur)) this.selectPreset(cur);
    return restored;
  },

  // ---- Ler os presets gravados no pedal (só leitura) ----
  async pullPresets() {
    const st = this.pullState;
    if (st.running) return;
    if (engine.playing) this.stop();
    Object.assign(st, { running: true, done: 0, total: TOTAL_PRESETS, phase: 'Pedindo permissão ao navegador', error: null, errorMessage: '', cancelRequested: false });
    this.emit('pull');
    try {
      await this.ensureSysex();
      st.phase = 'Conversando com o pedal';
      this.emit('pull');
      const result = await pullAllPresets(link, {
        selectPreset: (n) => midi.programChange(n),
        confirmSlowMode: () => confirmAsk(
          'A leitura direta da memória não funcionou. Dá para ler trocando de preset um por um: o pedal passa pelos 80 sons (cerca de 1 minuto) e no fim volta para o preset em que estava. Ajustes não salvos no preset atual do pedal se perdem. Abaixe o volume antes de continuar.',
          { title: 'Ler trocando os presets?', confirm: 'Ler trocando os presets' },
        ),
        onProgress: (done, total) => {
          st.done = done;
          st.total = total;
          st.phase = `Lendo P${pad2(done)} de ${total}`;
          this.emit('pull');
        },
        isCancelled: () => st.cancelRequested,
      });
      if (result.method === 'none') {
        toast('Leitura cancelada. Nada foi alterado no pedal.', 'warn');
      } else {
        const slots = Object.fromEntries(Object.entries(result.slots).map(([n, bytes]) => [n, toHex(bytes)]));
        store.update((s) => {
          s.deviceDump = {
            pulledAt: result.pulledAt, method: result.method, slots, failed: result.failed,
            names: result.names, startPreset: result.startPreset, cancelled: result.cancelled,
          };
          // O pedal informou em que preset está: o hub passa a mostrar o mesmo.
          if (result.startPreset) s.currentPreset = result.startPreset;
        });
        const count = Object.keys(slots).length;
        toast(`${count} de ${TOTAL_PRESETS} presets lidos do pedal.`, count === TOTAL_PRESETS ? 'ok' : 'warn');
      }
    } catch (e) {
      st.error = e.code || 'error';
      st.errorMessage = e.message || '';
    } finally {
      st.running = false;
      this.emit('pull');
    }
  },
  cancelPull() {
    this.pullState.cancelRequested = true;
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

// [tom, texto, texto curto para o celular]
const CONN = {
  connected: ['ok', 'Pedal conectado', ''],
  'no-device': ['bad', 'Pedal não encontrado', 'Sem pedal'],
  denied: ['bad', 'MIDI bloqueado', 'Bloqueado'],
  unsupported: ['bad', 'Navegador sem MIDI', 'Sem MIDI'],
  idle: ['idle', 'Conectar pedal', 'Conectar'],
};

function renderRail() {
  const s = store.get();
  const cur = s.currentPreset;
  const info = app.presetInfo(cur);
  const [tone, text, short] = midi.simulator ? ['ok', 'Pedal simulado', ''] : CONN[midi.status] || CONN.idle;
  const playing = engine.playing;
  const song = app.rt.mode === 'song' ? s.songs.find((x) => x.id === app.rt.songId) : null;
  const nowLabel = song ? song.name : app.pattern(s.drums.patternId).name;
  rail.replaceChildren(
    h('a', { class: 'brand', href: '#/stage', 'aria-label': 'Black Box Hub: ir para o palco' },
      h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), h('span', { class: 'brand-name' }, 'Black Box Hub')),
    h('button', {
      class: `conn ${tone}`, type: 'button', 'aria-label': text, title: text,
      onclick: () => (midi.status === 'idle' || midi.status === 'no-device' ? midi.connect() : app.go('settings')),
    }, h('span', { class: 'conn-dot' }), h('span', { class: 'conn-label', 'aria-hidden': 'true' }, text),
    short ? h('span', { class: 'conn-short', 'aria-hidden': 'true' }, short) : null),
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
