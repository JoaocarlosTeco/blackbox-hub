// Estado do hub, salvo no localStorage deste navegador. Nada sai do computador.

const KEY = 'blackbox-hub/v1';
export const uid = () => Math.random().toString(36).slice(2, 10);

// CC0–CC5 ligam/desligam os módulos segundo as notas de versão oficiais do firmware.
// Ficam marcados como não testados até você confirmar no seu pedal.
function moduleControls() {
  return ['FX', 'AMP', 'MOD', 'DLY', 'REV', 'CAB'].map((m, i) => ({
    id: uid(), name: `${m} liga/desliga`, module: m, cc: i, type: 'toggle', on: 127, off: 0, value: null, verified: false, source: 'firmware',
  }));
}

export function defaultState() {
  const songId = uid();
  const setlistId = uid();
  return {
    version: 1,
    midi: { channel: 15, outputName: '', anticipateMs: 20 },
    audio: { sinkId: '', sinkLabel: '', volume: 0.8, reverb: 0.18 },
    presets: {},
    currentPreset: null,
    drums: { patternId: 'rock-8', bpm: 110, swing: 0 },
    customPatterns: [],
    songs: [{
      id: songId, name: 'Música de exemplo', bpm: 110, patternId: 'rock-8', countIn: 1,
      sections: [
        { id: uid(), name: 'Intro', bars: 4, preset: 1, patternId: '', fill: true },
        { id: uid(), name: 'Verso', bars: 8, preset: 2, patternId: '', fill: false },
        { id: uid(), name: 'Refrão', bars: 8, preset: 3, patternId: 'rock-heavy', fill: true },
        { id: uid(), name: 'Solo', bars: 8, preset: 4, patternId: 'rock-heavy', fill: true },
        { id: uid(), name: 'Final', bars: 4, preset: 3, patternId: '', fill: false },
      ],
    }],
    setlists: [{ id: setlistId, name: 'Ensaio', songIds: [songId] }],
    activeSetlistId: setlistId,
    controls: moduleControls(),
    ccScan: { current: 6, results: {} },
    footswitch: [],
    ui: { songId, keepAwake: true },
  };
}

function migrate(saved) {
  const d = defaultState();
  const s = { ...d, ...saved };
  for (const k of ['midi', 'audio', 'drums', 'ccScan', 'ui']) s[k] = { ...d[k], ...(saved[k] || {}) };
  for (const k of ['customPatterns', 'songs', 'setlists', 'controls', 'footswitch']) if (!Array.isArray(s[k])) s[k] = d[k];
  if (!s.presets || typeof s.presets !== 'object') s.presets = {};
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch { /* armazenamento indisponível: começa do zero */ }
  return defaultState();
}

let state = load();
const subscribers = new Set();
let saveTimer = null;

function persistNow() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* sem espaço ou bloqueado */ }
}
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 200);
}
function notify(render) {
  for (const fn of subscribers) fn(state, { render });
}

export const get = () => state;

// render:false salva sem redesenhar a tela (útil enquanto a pessoa digita).
export function update(mutator, { render = true } = {}) {
  mutator(state);
  persist();
  notify(render);
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function exportJSON() {
  return JSON.stringify({ app: 'blackbox-hub', exportedAt: new Date().toISOString(), state }, null, 2);
}

export function importJSON(text) {
  const data = JSON.parse(text);
  const s = data && data.app === 'blackbox-hub' ? data.state : null;
  if (!s || typeof s !== 'object') throw new Error('Esse arquivo não é um backup do Black Box Hub.');
  state = migrate(s);
  persistNow();
  notify(true);
}

export function reset() {
  state = defaultState();
  persistNow();
  notify(true);
}

window.addEventListener('pagehide', persistNow);
