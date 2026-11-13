// Testes do protocolo da ANNBLACK BOX. Rodar com: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checksum, buildPacket, readRequest, writeRequest, pack7, unpack7, toSysex, fromSysex, parsePacket, fromHex, toHex,
  SPACE_PRESETS, ADDR_EDIT_BUFFER, PRESET_SIZE,
} from '../public/js/blackbox/protocol.js';
import {
  decodePreset, summarize, buildPreset, changedFields, setBlockOn, setKnob, setVolume, setChain,
} from '../public/js/blackbox/preset.js';
import { PACKS } from '../public/js/packs.js';
import { FakePedal } from '../public/js/blackbox/fake-pedal.js';
import { BlackBoxLink, pullAllPresets } from '../public/js/blackbox/link.js';

const content = (packet) => packet.slice(6, -1);

test('checksum bate com os pacotes documentados', () => {
  const cases = {
    E1: '00 59 22 09 00 00 04 08 00 00 10 01 00 00 01 E1',
    '8F': '00 59 23 08 00 00 04 00 00 00 10 5C 00 00 8F',
    '0B': '00 59 22 08 00 00 04 00 00 00 F0 00 00 00 0B',
    D4: '00 59 22 0E 00 00 04 02 00 00 10 06 00 00 00 01 02 03 04 05 D4',
  };
  for (const [expected, hex] of Object.entries(cases)) {
    assert.equal(checksum(content(fromHex(hex))), parseInt(expected, 16), hex);
  }
});

test('pedido de leitura do som atual é igual ao documentado', () => {
  assert.equal(toHex(readRequest(SPACE_PRESETS, ADDR_EDIT_BUFFER, PRESET_SIZE)), '00 59 23 08 00 00 04 00 00 00 10 5C 00 00 8F');
});

test('pedidos de escrita são iguais aos documentados', () => {
  // Ligar o FX no som atual
  assert.equal(toHex(writeRequest(SPACE_PRESETS, ADDR_EDIT_BUFFER + 0x08, [1])), '00 59 22 09 00 00 04 08 00 00 10 01 00 00 01 E1');
  // Ordem dos blocos
  assert.equal(toHex(writeRequest(SPACE_PRESETS, ADDR_EDIT_BUFFER + 0x02, [0, 1, 2, 3, 4, 5])), '00 59 22 0E 00 00 04 02 00 00 10 06 00 00 00 01 02 03 04 05 D4');
  // Volume do preset (2 bytes) no zero
  assert.equal(toHex(writeRequest(SPACE_PRESETS, ADDR_EDIT_BUFFER, [0, 0])), '00 59 22 0A 00 00 04 00 00 00 10 02 00 00 00 00 E9');
  // Salvar no P60: cabeçalho de 14 bytes, 92 de dados e o checksum (107 no total)
  const data = Array.from({ length: PRESET_SIZE }, (_, i) => i);
  const save = writeRequest(SPACE_PRESETS, 59 * PRESET_SIZE, data);
  assert.equal(save.length, 107);
  assert.equal(toHex(save.slice(0, 14)), '00 59 22 64 00 00 04 34 15 00 00 5C 00 00');
  assert.deepEqual(save.slice(14, 106), data);
});

test('empacotamento USB (8 para 7 bits)', () => {
  assert.equal(
    toHex(toSysex(fromHex('00 59 23 08 00 00 04 00 00 00 10 5C 00 00 8F'))),
    'F0 00 32 0D 41 00 00 00 02 00 00 00 00 41 0B 00 00 0F 01 F7',
  );
  assert.equal(
    toHex(toSysex(fromHex('00 59 22 09 00 00 04 08 00 00 10 01 00 00 01 E1'))),
    'F0 00 32 09 49 00 00 00 02 08 00 00 00 11 00 00 00 01 42 03 F7',
  );
  // Leitura do P01 e do P80 direto da memória
  assert.equal(toHex(toSysex(readRequest(SPACE_PRESETS, 0, PRESET_SIZE))), 'F0 00 32 0D 41 00 00 00 02 00 00 00 00 40 0B 00 00 1F 01 F7');
  assert.equal(toHex(toSysex(readRequest(SPACE_PRESETS, 79 * PRESET_SIZE, PRESET_SIZE))), 'F0 00 32 0D 41 00 00 00 02 64 38 00 00 40 0B 00 00 1F 00 F7');
  // Consulta de nome/versão no formato do app oficial (sem byte extra no fim)
  assert.equal(toHex(toSysex(buildPacket(0x11, []))), 'F0 00 32 45 00 00 00 40 7F F7');
  // Confirmação (ACK) capturada de outro pedal da M-VAVE
  const ack = parsePacket(fromSysex(fromHex('F0 00 32 01 08 00 00 00 00 7F 01 F7')));
  assert.equal(ack.type, 0x00);
  assert.ok(ack.checksumOk);
});

test('empacotar e desempacotar devolve os mesmos bytes', () => {
  const packet = buildPacket(0x22, Array.from({ length: 100 }, (_, i) => (i * 37 + 11) & 0xff));
  assert.deepEqual(unpack7(pack7(packet)).slice(0, packet.length), packet);
});

class FakeMidi extends EventTarget {
  constructor(pedal) {
    super();
    this.pedal = pedal;
  }

  send(bytes) {
    if (!this.pedal) return true;
    for (const reply of this.pedal.handle(Array.from(bytes))) {
      setTimeout(() => this.dispatchEvent(new CustomEvent('sysex', { detail: { bytes: reply } })), 1);
    }
    return true;
  }
}

test('lê os 80 presets direto da memória', async () => {
  const pedal = new FakePedal();
  pedal.current = 11;
  const midi = new FakeMidi(pedal);
  const link = new BlackBoxLink(midi);
  const result = await pullAllPresets(link, { selectPreset: () => assert.fail('não deve trocar preset') });
  assert.equal(result.method, 'direct');
  assert.equal(result.startPreset, 12);
  assert.equal(Object.keys(result.slots).length, 80);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.slots[7], pedal.slots[6]);
  assert.equal(result.names.amp[0], 'J900_CL');
  assert.equal(result.names.cab[13], 'Recto_112');
});

test('sem leitura direta, troca preset por preset e volta para o inicial', async () => {
  const pedal = new FakePedal({ directSlotRead: false });
  pedal.current = 4;
  const midi = new FakeMidi(pedal);
  const link = new BlackBoxLink(midi);
  const result = await pullAllPresets(link, {
    selectPreset: (n) => midi.send([0xcf, n - 1]),
    confirmSlowMode: async () => true,
    settleMs: 5,
  });
  assert.equal(result.method, 'select');
  assert.equal(Object.keys(result.slots).length, 80);
  assert.deepEqual(result.slots[80], pedal.slots[79]);
  assert.equal(pedal.current, 4);
});

test('sem leitura direta e sem autorização, não troca nada', async () => {
  const pedal = new FakePedal({ directSlotRead: false });
  const link = new BlackBoxLink(new FakeMidi(pedal));
  const result = await pullAllPresets(link, { selectPreset: () => assert.fail('não deve trocar preset'), confirmSlowMode: async () => false });
  assert.equal(result.method, 'none');
});

test('pedal que não responde gera erro "no-reply"', async () => {
  const link = new BlackBoxLink(new FakeMidi(null));
  await assert.rejects(pullAllPresets(link, {}), (e) => e.code === 'no-reply');
});

test('grava um preset num slot e confere relendo', async () => {
  const pedal = new FakePedal();
  const link = new BlackBoxLink(new FakeMidi(pedal));
  const original = pedal.slots[79].slice();
  const novo = original.slice();
  novo[0x0c] = 1;
  const { before, after } = await link.saveSlot(79, novo);
  assert.deepEqual(before, original);
  assert.deepEqual(after, novo);
  assert.deepEqual(pedal.slots[79], novo);
});

test('se o slot não muda depois de gravar, avisa e não mexe em mais nada', async () => {
  const pedal = new FakePedal();
  pedal.write = () => [toSysex(buildPacket(0x00, [0]))]; // confirma, mas não grava
  const link = new BlackBoxLink(new FakeMidi(pedal));
  const original = pedal.slots[10].slice();
  await assert.rejects(link.saveSlot(10, original.map((b, i) => (i === 0 ? 0 : b))), (e) => e.code === 'verify');
  assert.deepEqual(pedal.slots[10], original);
});

test('se a conferência não bate, devolve o que estava no slot', async () => {
  const pedal = new FakePedal();
  const real = pedal.write.bind(pedal);
  let first = true;
  pedal.write = (space, addr, data) => {
    if (first && data.length === PRESET_SIZE) {
      first = false;
      return real(space, addr, data.map((b, i) => (i === 5 ? b ^ 1 : b))); // grava um byte errado
    }
    return real(space, addr, data);
  };
  const link = new BlackBoxLink(new FakeMidi(pedal));
  const original = pedal.slots[3].slice();
  await assert.rejects(link.saveSlot(3, original.map((b, i) => (i === 0x0c ? 1 - (b & 1) : b))), (e) => e.code === 'verify' && e.restored === true);
  assert.deepEqual(pedal.slots[3], original);
});

test('muda o som atual ao vivo sem tocar nos slots', async () => {
  const pedal = new FakePedal();
  const link = new BlackBoxLink(new FakeMidi(pedal));
  const slots = pedal.slots.map((s) => s.slice());
  const target = pedal.edit.slice();
  setBlockOn(target, 'rev', true);
  setKnob(target, 'rev', 1, 30);
  setVolume(target, 0);
  setChain(target, ['fx', 'amp', 'mod', 'rev', 'dly', 'cab']);
  const writes = changedFields(pedal.edit, target);
  assert.ok(writes.length >= 2 && writes.length <= 4);
  for (const w of writes) await link.writeEdit(w.offset, w.data);
  assert.deepEqual(pedal.edit, target);
  assert.deepEqual(pedal.slots, slots);
  assert.deepEqual(changedFields(pedal.edit, target), []);
});

test('receitas dos pacotes viram presets válidos', () => {
  const vazio = new FakePedal().slots[0].map((b, i) => (i >= 0x08 && i <= 0x0d ? 0 : b));
  for (const pack of PACKS) {
    for (const slot of pack.slots) {
      const bytes = buildPreset(vazio, slot.sound);
      assert.equal(bytes.length, PRESET_SIZE);
      const d = decodePreset(bytes);
      const on = d.blocks.filter((b) => b.on).map((b) => b.label);
      const planned = slot.recipe.filter((r) => !r.off && r.module !== 'VOL').map((r) => r.module);
      assert.deepEqual(on.sort(), [...new Set(planned)].sort(), `P${slot.preset}`);
      assert.ok(!d.blocks.find((b) => b.id === 'amp').on && !d.blocks.find((b) => b.id === 'cab').on, `P${slot.preset} sem AMP e CAB`);
    }
  }
  const mudo = PACKS[0].slots.find((s) => s.preset === 64);
  assert.equal(decodePreset(buildPreset(vazio, mudo.sound)).volume, 0);
  const natural = decodePreset(buildPreset(vazio, PACKS[0].slots[0].sound));
  assert.equal(natural.blocks.find((b) => b.id === 'fx').modelName, 'Compress');
  assert.deepEqual(natural.blocks.find((b) => b.id === 'rev').knobs.map((k) => k.value), [30, 12, 80, 80, 40]);
  assert.throws(() => buildPreset(vazio, { rev: { model: 'Plate' } }));
});

test('decodifica um preset', () => {
  const pedal = new FakePedal();
  const decoded = decodePreset(pedal.slots[0]);
  assert.equal(decoded.blocks.length, 6);
  assert.equal(decoded.volume, pedal.slots[0][0]);
  assert.deepEqual(decoded.chain, ['FX', 'AMP', 'MOD', 'DLY', 'REV', 'CAB']);
  assert.ok(summarize(decoded).length > 0);
});
