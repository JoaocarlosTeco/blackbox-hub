// Como ler os 92 bytes de um preset da ANNBLACK BOX.
//
// 00-01  volume do preset (0 a 100)
// 02-07  ordem dos blocos na corrente (0 FX, 1 AMP, 2 MOD, 3 DLY, 4 REV, 5 CAB)
// 08-0D  liga/desliga de FX, AMP, MOD, DLY, REV, CAB
// 0E-13  modelo escolhido em cada bloco
// 14-5B  6 ajustes (0 a 100) por bloco, 2 bytes cada

import { PRESET_SIZE } from './protocol.js';

export const AMP_FACTORY = [
  'J900_CL', 'FD_CL', 'JC120_CL', 'BLUE_OD', 'RAT_OD', 'M-VAVE_OD', 'SUPA_OD', 'DARKS_DS', 'J900_DS', 'JHS_DS',
  'EVH_5150', 'FRIMAN', 'XC_DS', 'ROOM40', 'JVM', 'AgDb750_BS', 'ApSVT_BS', 'PjBuddy_BS', 'DgXu_BS', 'MarkLm_BS',
];
export const CAB_FACTORY = [
  'AC-SeVin', 'JVM_1960_57', 'V30_MD421', 'G12-EVH_CT', 'HIFI_OK', 'WANGS212_ECM', 'VOX_AC30', 'FRMAN112', 'MeOSick-III', 'SoldSC412',
  'FD_TW1980', 'MESA_412', 'HIW412SWF', 'Recto_112', 'JC120_BOX', 'Agula410', 'AgSVT410', 'DgDG212N', 'MbSway210', 'Tace412',
];

export const BLOCKS = [
  {
    id: 'fx', label: 'FX', onAt: 0x08, modelAt: 0x0e, knobsAt: 0x14,
    models: ['Noise Gate++', 'Boost', 'Compress', 'AI Gate MS'],
    params: [['Gate'], ['Gate', 'Gain'], ['Gate', 'Sustain', 'Attack', 'Level'], ['Gate', 'Bias']],
  },
  {
    id: 'amp', label: 'AMP', onAt: 0x09, modelAt: 0x0f, knobsAt: 0x20,
    models: AMP_FACTORY,
    params: ['Gain', 'Level', 'Bass', 'Mid', 'Treble'],
  },
  {
    id: 'mod', label: 'MOD', onAt: 0x0a, modelAt: 0x10, knobsAt: 0x2c,
    models: ['Chorus', 'Phaser', 'Tremolo', 'Flanger', 'Vibrato', 'Univibe', 'Autofilter'],
    params: [
      ['Speed', 'Depth', 'Mix'], ['Speed', 'Midcut', 'Reso', 'Feedback'], ['Speed', 'Depth', 'Level'],
      ['Speed', 'Depth', 'Feedback', 'Mix'], ['Speed', 'Depth'], ['Speed', 'Depth', 'Mix'], ['Speed', 'Min', 'Max', 'Mix', 'Feedback'],
    ],
  },
  {
    id: 'dly', label: 'DLY', onAt: 0x0b, modelAt: 0x11, knobsAt: 0x38,
    models: ['Analog', 'Duck', 'Dtape', 'Dual', 'Lofi'],
    params: [
      ['Time', 'Feedback', 'Mix', 'Phaser', 'Pitch'], ['Time', 'Feedback', 'Mix', 'Unpack', 'Speed', 'Depth'],
      ['Time', 'Feedback', 'Mix', 'Grit', 'Speed', 'Depth'], ['Time', 'Feedback', 'Mix', 'T-Mode', 'Speed', 'Depth'],
      ['Time', 'Feedback', 'Mix', 'Grit', 'Speed', 'Depth'],
    ],
  },
  {
    id: 'rev', label: 'REV', onAt: 0x0c, modelAt: 0x12, knobsAt: 0x44,
    models: ['Room', 'Hall', 'Swell', 'Spring', 'Shimmer', 'Cloud'],
    params: [
      ['Decay', 'Mix', 'High Pass', 'Low Pass', 'Depth'], ['Decay', 'Mix', 'High Pass', 'Low Pass', 'Depth'],
      ['Decay', 'Mix', 'High Pass', 'Low Pass', 'Rise-T'], ['Decay', 'Mix', 'High Pass', 'Low Pass', 'Combs'],
      ['Decay', 'Mix', 'Tone', 'Pitch', 'Amount'], ['Decay', 'Mix', 'High Pass', 'Low Pass', 'Diffusion'],
    ],
  },
  {
    id: 'cab', label: 'CAB', onAt: 0x0d, modelAt: 0x13, knobsAt: 0x50,
    models: CAB_FACTORY,
    params: ['Level', 'Low Cut', 'High Cut'],
  },
];

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const setU16 = (b, o, v) => {
  const n = Math.max(0, Math.min(100, Math.round(v)));
  b[o] = n & 0xff;
  b[o + 1] = (n >> 8) & 0xff;
};

export function paramNames(block, model) {
  if (typeof block.params[0] === 'string') return block.params;
  // Modelo que o hub não conhece (por exemplo, os efeitos novos do firmware V21): mostra os 6 ajustes crus.
  return block.params[model] || ['Ajuste 1', 'Ajuste 2', 'Ajuste 3', 'Ajuste 4', 'Ajuste 5', 'Ajuste 6'];
}

// names: { amp: [...], cab: [...] } lidos do próprio pedal, quando disponíveis.
export function decodePreset(bytes, names = {}) {
  if (!bytes || bytes.length < PRESET_SIZE) return null;
  const blocks = BLOCKS.map((block) => {
    const model = bytes[block.modelAt];
    const list = (block.id === 'amp' && names.amp && names.amp.length ? names.amp : null)
      || (block.id === 'cab' && names.cab && names.cab.length ? names.cab : null)
      || block.models;
    const params = paramNames(block, model);
    return {
      id: block.id,
      label: block.label,
      on: bytes[block.onAt] === 1,
      model,
      modelName: list[model] || `Modelo ${model + 1}`,
      knobs: params.map((name, i) => ({ name, value: u16(bytes, block.knobsAt + i * 2) })),
    };
  });
  const chain = Array.from(bytes.slice(2, 8));
  const byId = Object.fromEntries(blocks.map((b, i) => [i, b]));
  return {
    volume: u16(bytes, 0),
    chain: chain.map((i) => (byId[i] ? byId[i].label : '?')),
    blocks,
  };
}

// ---- Montar e alterar os 92 bytes ----

export const blockById = (id) => BLOCKS.find((b) => b.id === id);

export function setVolume(bytes, value) { setU16(bytes, 0, value); }
export function setBlockOn(bytes, id, on) { bytes[blockById(id).onAt] = on ? 1 : 0; }
export function setBlockModel(bytes, id, model) { bytes[blockById(id).modelAt] = model & 0xff; }
export function setKnob(bytes, id, index, value) { setU16(bytes, blockById(id).knobsAt + index * 2, value); }
// order: lista com os ids dos blocos na ordem do sinal, ex.: ['fx', 'amp', 'mod', 'dly', 'rev', 'cab']
export function setChain(bytes, order) {
  order.forEach((id, i) => { bytes[2 + i] = BLOCKS.findIndex((b) => b.id === id); });
}
export function chainIds(bytes) {
  return Array.from(bytes.slice(2, 8), (i) => (BLOCKS[i] ? BLOCKS[i].id : null));
}

// Aplica uma receita sobre um preset existente (normalmente o que já está no slot).
// sound: { volume, chain?, fx: { model: 'Compress', knobs: { Sustain: 30 } }, rev: {...} }
// Blocos que não aparecem na receita ficam desligados; o modelo e os ajustes deles não mudam.
export function buildPreset(base, sound) {
  const out = Array.from(base);
  if (out.length !== PRESET_SIZE) throw new Error('O preset precisa ter 92 bytes.');
  if (sound.volume != null) setVolume(out, sound.volume);
  if (sound.chain) setChain(out, sound.chain);
  for (const block of BLOCKS) {
    const spec = sound[block.id];
    out[block.onAt] = spec ? 1 : 0;
    if (!spec) continue;
    if (spec.model != null) {
      const model = typeof spec.model === 'number' ? spec.model : block.models.indexOf(spec.model);
      if (model < 0) throw new Error(`Modelo desconhecido no ${block.label}: ${spec.model}`);
      out[block.modelAt] = model;
    }
    const names = paramNames(block, out[block.modelAt]);
    for (const [name, value] of Object.entries(spec.knobs || {})) {
      const i = names.indexOf(name);
      if (i < 0) throw new Error(`Ajuste desconhecido no ${block.label}: ${name}`);
      setU16(out, block.knobsAt + i * 2, value);
    }
  }
  return out;
}

// Cada campo do preset, do jeito que o pedal aceita escrever no som atual.
export const FIELDS = [
  { offset: 0, size: 2 }, // volume
  { offset: 2, size: 6 }, // ordem dos blocos
  ...Array.from({ length: 12 }, (_, i) => ({ offset: 0x08 + i, size: 1 })), // liga/desliga e modelos
  ...Array.from({ length: 36 }, (_, i) => ({ offset: 0x14 + i * 2, size: 2 })), // ajustes
];

// Lista das escritas necessárias para levar o som de "from" até "to".
export function changedFields(from, to) {
  return FIELDS
    .filter((f) => { for (let i = f.offset; i < f.offset + f.size; i++) if (from[i] !== to[i]) return true; return false; })
    .map((f) => ({ offset: f.offset, data: Array.from(to.slice(f.offset, f.offset + f.size)) }));
}

// Um slot "vazio": todos os blocos desligados.
export const isEmptyPreset = (bytes) => !!bytes && BLOCKS.every((b) => bytes[b.onAt] !== 1);

// Resumo curto: "AMP J900_CL, REV Hall" (só os blocos ligados).
export function summarize(decoded) {
  if (!decoded) return '';
  const on = decoded.blocks.filter((b) => b.on).map((b) => `${b.label} ${b.modelName}`);
  return on.length ? on.join(', ') : 'Todos os blocos desligados';
}
