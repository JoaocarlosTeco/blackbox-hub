// Formato das mensagens próprias da ANNBLACK BOX (o mesmo usado pelo app oficial).
//
// Pacote:  00 59 <tipo> <tamanho: 3 bytes, little-endian> <conteúdo> <checksum>
// checksum = 0xFF - (soma do conteúdo & 0xFF)
// Pela USB o pacote inteiro vai dentro de um SysEx (F0 ... F7), sem ID de fabricante,
// reempacotado de 8 em 8 bits para 7 em 7 bits (bits menos significativos primeiro).
//
// Referência: engenharia reversa da comunidade (github.com/jvsobrinho/mvave-blackbox-ble).
// Esta implementação é própria do Black Box Hub.

export const PRESET_SIZE = 92;
export const PRESET_COUNT = 80;

export const TYPE_ACK = 0x00;
export const TYPE_WRITE = 0x22;
export const TYPE_READ = 0x23;

export const SPACE_PRESETS = 0x04;
export const SPACE_NAMES = 0x05;

export const ADDR_EDIT_BUFFER = 0x10000000; // som atual (o que está tocando)
export const ADDR_PRESET_INDEX = 0x20000000; // número do preset atual (0 = P01)
export const ADDR_AMP_NAMES = 0x90000000;
export const ADDR_CAB_NAMES = 0x80000000;
export const NAMES_SIZE = 0x118; // 20 nomes terminados em zero

export function checksum(bytes) {
  let sum = 0;
  for (const b of bytes) sum = (sum + b) & 0xff;
  return 0xff - sum;
}

const littleEndian = (value, count) => Array.from({ length: count }, (_, i) => (value >>> (8 * i)) & 0xff);
export const readLE = (bytes, offset, count) => {
  let v = 0;
  for (let i = count - 1; i >= 0; i--) v = v * 256 + bytes[offset + i];
  return v;
};

export function buildPacket(type, content) {
  const len = content.length;
  return [0x00, 0x59, type, len & 0xff, (len >> 8) & 0xff, (len >> 16) & 0xff, ...content, checksum(content)];
}

// Pedido de leitura: <espaço> <endereço: 4 bytes LE> <quantidade: 3 bytes LE>
export function readRequest(space, addr, size) {
  return buildPacket(TYPE_READ, [space, ...littleEndian(addr, 4), ...littleEndian(size, 3)]);
}

// Pedido de escrita: <espaço> <endereço: 4 bytes LE> <quantidade: 3 bytes LE> <dados>
// No som atual (ADDR_EDIT_BUFFER + posição) muda o que está tocando, sem salvar.
// Num slot (número do slot × 92) grava o preset na memória do pedal.
export function writeRequest(space, addr, data) {
  return buildPacket(TYPE_WRITE, [space, ...littleEndian(addr, 4), ...littleEndian(data.length, 3), ...data]);
}

export function pack7(bytes) {
  const out = [];
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc |= (b & 0xff) << bits;
    bits += 8;
    while (bits >= 7) {
      out.push(acc & 0x7f);
      acc >>>= 7;
      bits -= 7;
    }
  }
  if (bits > 0) out.push(acc & 0x7f);
  return out;
}

export function unpack7(bytes) {
  const out = [];
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc |= (b & 0x7f) << bits;
    bits += 7;
    if (bits >= 8) {
      out.push(acc & 0xff);
      acc >>>= 8;
      bits -= 8;
    }
  }
  return out;
}

export const toSysex = (packet) => [0xf0, ...pack7(packet), 0xf7];

export function fromSysex(sysex) {
  const start = sysex[0] === 0xf0 ? 1 : 0;
  const end = sysex[sysex.length - 1] === 0xf7 ? sysex.length - 1 : sysex.length;
  return unpack7(sysex.slice(start, end));
}

// Lê um pacote já desempacotado. Devolve null se não for uma mensagem da Black Box.
export function parsePacket(raw) {
  if (!raw || raw.length < 7 || raw[0] !== 0x00 || raw[1] !== 0x59) return null;
  const len = readLE(raw, 3, 3);
  if (raw.length < 7 + len) return null;
  const content = raw.slice(6, 6 + len);
  return { type: raw[2], content, checksumOk: checksum(content) === raw[6 + len] };
}

// Resposta de leitura: o pedal repete <espaço> <endereço> <quantidade> e manda os dados em seguida.
export function parseReadReply(packet) {
  if (!packet || packet.type !== TYPE_READ || packet.content.length < 8) return null;
  const c = packet.content;
  return { space: c[0], addr: readLE(c, 1, 4), size: readLE(c, 5, 3), data: c.slice(8) };
}

export function isAck(packet) {
  return !!packet && packet.type === TYPE_ACK;
}

export const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ').toUpperCase();
export const fromHex = (text) => (text.trim() ? text.trim().split(/\s+/).map((h) => parseInt(h, 16)) : []);

// Os nomes vêm como "<número><nome>\0" repetido, ex.: "14Recto_112".
export function parseNames(data) {
  const names = [];
  let current = [];
  for (const b of data) {
    if (b === 0) {
      if (current.length) names.push(String.fromCharCode(...current));
      current = [];
    } else {
      current.push(b);
    }
  }
  if (current.length) names.push(String.fromCharCode(...current));
  return names.map((n, i) => {
    const prefix = String(i + 1);
    return n.startsWith(prefix) ? n.slice(prefix.length) : n;
  });
}
