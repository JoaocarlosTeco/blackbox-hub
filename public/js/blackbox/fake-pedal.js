// Pedal simulado: responde às mesmas mensagens que a ANNBLACK BOX, para testar o hub sem o aparelho.
// Abra o app com ?simulador=1 (leitura direta) ou ?simulador=lento (obriga o modo que troca preset por preset).

import {
  PRESET_SIZE, PRESET_COUNT, TYPE_ACK, TYPE_READ, TYPE_WRITE, SPACE_PRESETS, SPACE_NAMES, ADDR_EDIT_BUFFER, ADDR_PRESET_INDEX,
  ADDR_AMP_NAMES, ADDR_CAB_NAMES, buildPacket, toSysex, fromSysex, parsePacket, readLE,
} from './protocol.js';
import { AMP_FACTORY, CAB_FACTORY } from './preset.js';

function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makePreset(rand) {
  const b = new Array(PRESET_SIZE).fill(0);
  const pick = (n) => Math.floor(rand() * n);
  b[0] = 60 + pick(31);
  [0, 1, 2, 3, 4, 5].forEach((v, i) => { b[2 + i] = v; });
  b[0x08] = rand() < 0.6 ? 1 : 0;
  b[0x09] = rand() < 0.9 ? 1 : 0;
  b[0x0a] = rand() < 0.4 ? 1 : 0;
  b[0x0b] = rand() < 0.5 ? 1 : 0;
  b[0x0c] = rand() < 0.8 ? 1 : 0;
  b[0x0d] = rand() < 0.9 ? 1 : 0;
  b[0x0e] = pick(4);
  b[0x0f] = pick(20);
  b[0x10] = pick(7);
  b[0x11] = pick(5);
  b[0x12] = pick(6);
  b[0x13] = pick(20);
  for (let k = 0x14; k < PRESET_SIZE; k += 2) b[k] = pick(101);
  return b;
}

function encodeNames(list, size) {
  const out = [];
  list.forEach((name, i) => {
    for (const ch of `${i + 1}${name}`) out.push(ch.charCodeAt(0));
    out.push(0);
  });
  return out.concat(new Array(Math.max(0, size - out.length)).fill(0)).slice(0, size);
}

export class FakePedal {
  constructor({ directSlotRead = true, seed = 2026 } = {}) {
    const rand = random(seed);
    this.directSlotRead = directSlotRead;
    this.slots = Array.from({ length: PRESET_COUNT }, () => makePreset(rand));
    this.current = 0;
    this.edit = this.slots[0].slice();
  }

  // Recebe uma mensagem MIDI completa e devolve a lista de respostas.
  handle(bytes) {
    if ((bytes[0] & 0xf0) === 0xc0) {
      this.current = bytes[1] % PRESET_COUNT;
      this.edit = this.slots[this.current].slice();
      return [];
    }
    if (bytes[0] !== 0xf0) return [];
    const packet = parsePacket(fromSysex(bytes));
    if (!packet || !packet.checksumOk) return [];
    const c = packet.content;
    const space = c[0];
    const addr = readLE(c, 1, 4);
    const size = readLE(c, 5, 3);
    if (packet.type === TYPE_WRITE) return this.write(space, addr, c.slice(8, 8 + size));
    if (packet.type !== TYPE_READ) return [];
    let data = null;
    if (space === SPACE_PRESETS && addr === ADDR_PRESET_INDEX) data = [this.current, 0, 0, 0];
    else if (space === SPACE_PRESETS && addr === ADDR_EDIT_BUFFER) data = this.edit;
    else if (space === SPACE_PRESETS && this.directSlotRead && addr % PRESET_SIZE === 0 && addr < PRESET_SIZE * PRESET_COUNT) data = this.slots[addr / PRESET_SIZE];
    else if (space === SPACE_NAMES && addr === ADDR_AMP_NAMES) data = encodeNames(AMP_FACTORY, size);
    else if (space === SPACE_NAMES && addr === ADDR_CAB_NAMES) data = encodeNames(CAB_FACTORY, size);
    if (!data) return [];
    return [toSysex(buildPacket(TYPE_READ, [...c.slice(0, 8), ...data]))];
  }

  // Como o pedal de verdade: escreve no som atual ou num slot e confirma com 00 59 00 01 00 00 00 FF.
  write(space, addr, data) {
    if (space !== SPACE_PRESETS) return [];
    const editOffset = addr - ADDR_EDIT_BUFFER;
    if (editOffset >= 0 && editOffset + data.length <= PRESET_SIZE) {
      data.forEach((b, i) => { this.edit[editOffset + i] = b; });
    } else if (addr % PRESET_SIZE === 0 && addr < PRESET_SIZE * PRESET_COUNT && data.length === PRESET_SIZE) {
      this.slots[addr / PRESET_SIZE] = data.slice();
      this.writes = (this.writes || 0) + 1;
    } else {
      return [];
    }
    return [toSysex(buildPacket(TYPE_ACK, [0]))];
  }
}
