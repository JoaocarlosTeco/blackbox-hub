// Ritmos prontos e utilitários. Cada trilha é uma string, um caractere por passo:
// '.' silêncio, 'x' batida normal, 'X' acento, 'o' nota fantasma (bem leve).

export const INSTRUMENTS = [
  { id: 'crash', label: 'Prato de ataque' },
  { id: 'ride', label: 'Prato de condução' },
  { id: 'hho', label: 'Chimbal aberto' },
  { id: 'hhc', label: 'Chimbal fechado' },
  { id: 'shaker', label: 'Ganzá' },
  { id: 'cowbell', label: 'Cowbell' },
  { id: 'clap', label: 'Palmas' },
  { id: 'rim', label: 'Aro' },
  { id: 'snare', label: 'Caixa' },
  { id: 'tomHi', label: 'Tom agudo' },
  { id: 'tomMid', label: 'Tom médio' },
  { id: 'tomLo', label: 'Surdo' },
  { id: 'kick', label: 'Bumbo' },
  { id: 'click', label: 'Clique' },
];

export const TIME_SIGNATURES = [
  { id: '4/4', label: '4/4', beatsPerBar: 4, stepsPerBeat: 4 },
  { id: '4/4T', label: '4/4 em tercinas (shuffle)', beatsPerBar: 4, stepsPerBeat: 3 },
  { id: '3/4', label: '3/4', beatsPerBar: 3, stepsPerBeat: 4 },
  { id: '6/8', label: '6/8', beatsPerBar: 2, stepsPerBeat: 6 },
];

export const NEXT_CELL = { '.': 'x', x: 'X', X: 'o', o: '.' };

export const stepsPerBar = (p) => p.beatsPerBar * p.stepsPerBeat;
export const totalSteps = (p) => stepsPerBar(p) * (p.bars || 1);

export function velocityOf(ch) {
  switch (ch) {
    case 'X': return 1;
    case 'x': return 0.78;
    case 'o': return 0.36;
    default: return 0;
  }
}

export function signatureOf(p) {
  return TIME_SIGNATURES.find((t) => t.beatsPerBar === p.beatsPerBar && t.stepsPerBeat === p.stepsPerBeat) || TIME_SIGNATURES[0];
}

const P = (id, name, style, bpm, [beatsPerBar, stepsPerBeat], tracks, extra = {}) => ({
  id, name, style, bpm, beatsPerBar, stepsPerBeat,
  bars: extra.bars || 1,
  swing: extra.swing || 0,
  tracks,
  fill: extra.fill || null,
  builtin: true,
});

export const BUILTIN_PATTERNS = [
  P('rock-8', 'Rock básico', 'Rock', 110, [4, 4], {
    hhc: 'X.x.X.x.X.x.X.x.',
    snare: '....X.......X...',
    kick: 'x.......x.x.....',
  }, {
    fill: {
      hhc: 'X.x.X.x.........',
      snare: '....X...xxXX....',
      tomHi: '............Xx..',
      tomLo: '..............xX',
      kick: 'x.......x.......',
    },
  }),
  P('rock-heavy', 'Rock pesado', 'Rock', 120, [4, 4], {
    ride: 'X.x.X.x.X.x.X.x.',
    snare: '....X.......X...',
    kick: 'x.x.....x.x..x..',
  }, {
    fill: {
      ride: 'X.x.X.x.........',
      snare: '....X...xxXX....',
      tomHi: '............XX..',
      tomLo: '..............XX',
      kick: 'x.x.....x.......',
    },
  }),
  P('punk', 'Punk', 'Rock', 172, [4, 4], {
    hhc: 'x.x.x.x.x.x.x.x.',
    snare: '..X...X...X...X.',
    kick: 'x...x...x...x...',
  }),
  P('metal', 'Metal com bumbo duplo', 'Metal', 150, [4, 4], {
    hhc: 'X...X...X...X...',
    snare: '....X.......X...',
    kick: 'xxxxxxxxxxxxxxxx',
  }),
  P('pop', 'Pop', 'Pop', 100, [4, 4], {
    hhc: 'x.x.x.x.x.x.x.x.',
    clap: '....x.......x...',
    snare: '....X.......X...',
    kick: 'x.....x.x.......',
  }),
  P('disco', 'Disco', 'Pop', 118, [4, 4], {
    hhc: 'x...x...x...x...',
    hho: '..x...x...x...x.',
    clap: '....x.......x...',
    snare: '....X.......X...',
    kick: 'x...x...x...x...',
  }),
  P('funk', 'Funk', 'Funk e groove', 96, [4, 4], {
    hhc: 'XxxxXxx.XxxxXxxx',
    hho: '.......x........',
    snare: '....X..o.o..X..o',
    kick: 'x.x...x...x..x..',
  }),
  P('hiphop', 'Hip-hop', 'Funk e groove', 88, [4, 4], {
    hhc: 'x.x.x.x.x.x.x.x.',
    snare: '....X.......X...',
    kick: 'x......x..x.....',
  }, { swing: 45 }),
  P('reggae', 'Reggae one drop', 'Funk e groove', 76, [4, 4], {
    hhc: 'x.x.x.x.x.x.x.x.',
    rim: '........X.......',
    kick: '........x.......',
  }, { swing: 35 }),
  P('blues-shuffle', 'Blues shuffle', 'Blues', 84, [4, 3], {
    ride: 'x.xx.xx.xx.x',
    snare: '...X.....X..',
    kick: 'x.....x.....',
  }, {
    fill: {
      ride: 'x.xx.x......',
      snare: '...X..xxx...',
      tomHi: '.........xx.',
      tomLo: '...........X',
      kick: 'x.....x.....',
    },
  }),
  P('ballad-68', 'Balada 6/8', 'Balada', 56, [2, 6], {
    hhc: 'x.x.x.x.x.x.',
    snare: '......X.....',
    kick: 'x.........x.',
  }),
  P('waltz', 'Valsa 3/4', 'Balada', 90, [3, 4], {
    hhc: 'x.x.x.x.x.x.',
    snare: '....x...x...',
    kick: 'x...........',
  }),
  P('bossa', 'Bossa nova', 'Brasil', 130, [4, 4], {
    hhc: 'x.o.x.o.x.o.x.o.x.o.x.o.x.o.x.o.',
    rim: 'x..x..x...x..x....x..x...x..x...',
    kick: 'x..x....x..x....x..x....x..x....',
  }, { bars: 2 }),
  P('samba', 'Samba', 'Brasil', 96, [4, 4], {
    shaker: 'xxxXxxxXxxxXxxxX',
    rim: 'x.x..x.x.x..x.x.',
    tomLo: '....X.......X...',
    kick: 'x..xx..xx..xx..x',
  }),
  P('baiao', 'Baião', 'Brasil', 110, [4, 4], {
    hhc: 'x.X.x.X.x.X.x.X.',
    rim: '....X.......X...',
    kick: 'x..x....x..x....',
  }),
  P('metronome', 'Metrônomo', 'Metrônomo', 100, [4, 4], {
    click: 'X...x...x...x...',
  }, { fill: { click: 'X...x...x...x...' } }),
];

// Virada automática para ritmos sem virada própria: metade do compasso normal,
// depois caixa e tons descendo.
export function genericFill(p, patternBar = 0) {
  const spb = stepsPerBar(p);
  const off = patternBar * spb;
  const half = Math.floor(spb / 2);
  const n = spb - half;
  const tracks = {};
  for (const [k, s] of Object.entries(p.tracks)) {
    if (k === 'crash') continue;
    tracks[k] = s.slice(off, off + half).padEnd(spb, '.');
  }
  if (p.tracks.click) return tracks;
  const sn = Math.ceil(n / 2);
  const hi = Math.floor((n - sn) / 2);
  const lo = n - sn - hi;
  const run = (len) => (len > 0 ? 'x'.repeat(len - 1) + 'X' : '');
  const head = (k) => (tracks[k] || '.'.repeat(spb)).slice(0, half);
  tracks.snare = head('snare') + run(sn).padEnd(n, '.');
  tracks.tomHi = '.'.repeat(half + sn) + 'x'.repeat(hi) + '.'.repeat(lo);
  tracks.tomLo = '.'.repeat(half + sn + hi) + run(lo);
  tracks.kick = head('kick') + 'x' + '.'.repeat(n - 1);
  return tracks;
}

export function blankPattern(id) {
  return {
    id, name: 'Novo ritmo', style: 'Meus ritmos', bpm: 100, beatsPerBar: 4, stepsPerBeat: 4, bars: 1, swing: 0,
    tracks: { hhc: 'x.x.x.x.x.x.x.x.', snare: '....x.......x...', kick: 'x.......x.......' },
    fill: null, builtin: false,
  };
}

export function copyPattern(p, id) {
  const c = JSON.parse(JSON.stringify(p));
  c.id = id;
  c.name = `${p.name} (meu)`;
  c.style = 'Meus ritmos';
  c.builtin = false;
  return c;
}

// Muda compasso e/ou número de compassos de um ritmo editável, cortando ou completando as trilhas.
export function reshapePattern(p, sigId, bars) {
  const sig = TIME_SIGNATURES.find((t) => t.id === sigId) || signatureOf(p);
  p.beatsPerBar = sig.beatsPerBar;
  p.stepsPerBeat = sig.stepsPerBeat;
  p.bars = bars;
  const total = totalSteps(p);
  const spb = stepsPerBar(p);
  for (const k of Object.keys(p.tracks)) p.tracks[k] = p.tracks[k].slice(0, total).padEnd(total, '.');
  if (p.fill) for (const k of Object.keys(p.fill)) p.fill[k] = p.fill[k].slice(0, spb).padEnd(spb, '.');
  if (sig.stepsPerBeat !== 4 && sig.stepsPerBeat !== 2) p.swing = 0;
  return p;
}
