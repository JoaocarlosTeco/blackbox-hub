// Conversa com a ANNBLACK BOX usando as mensagens próprias dela (SysEx pela USB).
// Lê presets, muda o som atual ao vivo (sem salvar) e grava presets nos slots,
// sempre relendo o slot depois para conferir byte a byte.

import {
  PRESET_SIZE, PRESET_COUNT, SPACE_PRESETS, SPACE_NAMES, ADDR_EDIT_BUFFER, ADDR_PRESET_INDEX,
  ADDR_AMP_NAMES, ADDR_CAB_NAMES, NAMES_SIZE,
  readRequest, writeRequest, toSysex, fromSysex, parsePacket, parseReadReply, parseNames, isAck, toHex,
} from './protocol.js';

export const sameBytes = (a, b) => !!a && !!b && a.length === b.length && Array.from(a).every((x, i) => x === b[i]);

export class LinkError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class BlackBoxLink {
  // midi: objeto com send(bytes) → boolean e que dispara eventos 'sysex' com { bytes }.
  constructor(midi) {
    this.midi = midi;
    this.pending = [];
    this.trace = [];
    // Uma conversa por vez: a confirmação de escrita (ACK) não diz a que pedido responde.
    this.queue = Promise.resolve();
    midi.addEventListener('sysex', (e) => this.onSysex(e.detail.bytes));
  }

  exclusive(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  log(direction, bytes) {
    this.trace.push(`${direction === 'out' ? '→' : '←'} ${toHex(bytes)}`);
    if (this.trace.length > 60) this.trace.shift();
  }

  onSysex(bytes) {
    this.log('in', bytes);
    const packet = parsePacket(fromSysex(bytes));
    if (!packet) return;
    const i = this.pending.findIndex((p) => p.match(packet));
    if (i < 0) return;
    const [entry] = this.pending.splice(i, 1);
    clearTimeout(entry.timer);
    entry.resolve(packet);
  }

  request(packet, match, timeout = 1500) {
    return this.exclusive(() => new Promise((resolve, reject) => {
      const entry = { match, resolve };
      entry.timer = setTimeout(() => {
        this.pending = this.pending.filter((x) => x !== entry);
        reject(new LinkError('timeout', 'O pedal não respondeu a tempo.'));
      }, timeout);
      this.pending.push(entry);
      const sysex = toSysex(packet);
      this.log('out', sysex);
      if (!this.midi.send(sysex)) {
        clearTimeout(entry.timer);
        this.pending = this.pending.filter((x) => x !== entry);
        reject(new LinkError('send', 'Não foi possível enviar a mensagem para o pedal.'));
      }
    }));
  }

  async write(space, addr, data, timeout = 3000) {
    const packet = await this.request(writeRequest(space, addr, data), isAck, timeout);
    if (!packet.checksumOk) throw new LinkError('checksum', 'A confirmação do pedal chegou corrompida.');
    if (packet.content.length && packet.content[0] !== 0) {
      throw new LinkError('refused', `O pedal recusou a gravação (código ${packet.content[0]}).`);
    }
  }

  // Muda o som que está tocando agora (não salva no slot).
  writeEdit(offset, data) {
    return this.write(SPACE_PRESETS, ADDR_EDIT_BUFFER + offset, Array.from(data), 1500);
  }

  // Grava os 92 bytes no slot (0 = P01) e relê para conferir.
  // Se a conferência não bater, tenta devolver o que estava antes.
  async saveSlot(index, bytes) {
    const data = Array.from(bytes);
    if (data.length !== PRESET_SIZE || index < 0 || index >= PRESET_COUNT) {
      throw new LinkError('invalid', 'Preset inválido para gravar.');
    }
    const before = await this.readSlot(index);
    let writeError = null;
    try {
      await this.write(SPACE_PRESETS, index * PRESET_SIZE, data);
    } catch (e) {
      writeError = e;
    }
    const after = await this.readSlot(index);
    if (sameBytes(after, data)) return { before, after };
    if (sameBytes(after, before)) {
      throw writeError || new LinkError('verify', 'O pedal respondeu, mas o preset continuou igual.');
    }
    let restored = false;
    try {
      await this.write(SPACE_PRESETS, index * PRESET_SIZE, before);
      restored = sameBytes(await this.readSlot(index), before);
    } catch { /* informa abaixo */ }
    throw Object.assign(
      new LinkError('verify', restored
        ? 'A conferência depois de gravar não bateu. O preset voltou ao que era antes.'
        : 'A conferência depois de gravar não bateu e não deu para voltar o preset ao que era. Use o backup.'),
      { before, after, restored },
    );
  }

  async read(space, addr, size, timeout) {
    const packet = await this.request(
      readRequest(space, addr, size),
      (p) => {
        const r = parseReadReply(p);
        return !!r && r.space === space && (r.addr === addr || r.data.length >= size);
      },
      timeout,
    );
    if (!packet.checksumOk) throw new LinkError('checksum', 'A resposta do pedal chegou corrompida.');
    const reply = parseReadReply(packet);
    if (reply.data.length < size) throw new LinkError('short', `Resposta incompleta: ${reply.data.length} de ${size} bytes.`);
    return reply.data.slice(0, size);
  }

  async readPresetIndex() {
    const data = await this.read(SPACE_PRESETS, ADDR_PRESET_INDEX, 4);
    return data[0];
  }

  readEditBuffer() {
    return this.read(SPACE_PRESETS, ADDR_EDIT_BUFFER, PRESET_SIZE);
  }

  readSlot(index) {
    return this.read(SPACE_PRESETS, index * PRESET_SIZE, PRESET_SIZE);
  }

  async readNames(addr) {
    return parseNames(await this.read(SPACE_NAMES, addr, NAMES_SIZE, 3000));
  }
}

// Lê os 80 presets.
// 1. Teste inofensivo: pede o número do preset atual. Sem resposta, para tudo.
// 2. Tenta ler os slots direto da memória, sem trocar o som.
// 3. Se a leitura direta não funcionar e a pessoa autorizar, troca preset por preset (Program Change)
//    e lê o som atual de cada um; no fim volta para o preset em que estava.
export async function pullAllPresets(link, {
  selectPreset, confirmSlowMode, onProgress = () => {}, isCancelled = () => false, settleMs = 600,
} = {}) {
  const result = {
    pulledAt: new Date().toISOString(), method: null, slots: {}, failed: [], names: {}, startPreset: null, cancelled: false,
  };

  let index;
  try {
    index = await link.readPresetIndex();
  } catch (e) {
    throw new LinkError('no-reply', e.message);
  }
  result.startPreset = (index % PRESET_COUNT) + 1;

  try { result.names.amp = await link.readNames(ADDR_AMP_NAMES); } catch { /* opcional */ }
  try { result.names.cab = await link.readNames(ADDR_CAB_NAMES); } catch { /* opcional */ }

  let first = null;
  try { first = await link.readSlot(0); } catch { first = null; }

  if (first) {
    result.method = 'direct';
    result.slots[1] = first;
    onProgress(1, PRESET_COUNT);
    for (let i = 1; i < PRESET_COUNT; i++) {
      if (isCancelled()) { result.cancelled = true; break; }
      try { result.slots[i + 1] = await link.readSlot(i); } catch { result.failed.push(i + 1); }
      onProgress(i + 1, PRESET_COUNT);
    }
    return result;
  }

  if (!confirmSlowMode || !(await confirmSlowMode())) {
    result.method = 'none';
    return result;
  }

  result.method = 'select';
  for (let i = 0; i < PRESET_COUNT; i++) {
    if (isCancelled()) { result.cancelled = true; break; }
    selectPreset(i + 1);
    await wait(settleMs);
    try {
      // Confere se o pedal realmente foi para o preset certo antes de guardar o som.
      let now = await link.readPresetIndex();
      if (now !== i) {
        await wait(settleMs);
        now = await link.readPresetIndex();
      }
      if (now !== i) throw new LinkError('wrong-preset', 'O pedal não trocou de preset.');
      result.slots[i + 1] = await link.readEditBuffer();
    } catch {
      result.failed.push(i + 1);
    }
    onProgress(i + 1, PRESET_COUNT);
  }
  selectPreset(result.startPreset);
  return result;
}
