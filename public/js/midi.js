// Conexão Web MIDI com o pedal.
// - Mensagens padrão: Program Change (trocar preset) e Control Change (ligar/desligar módulos).
// - SysEx (mensagens próprias da Black Box) só é pedido quando a pessoa lê, edita ou grava presets;
//   o navegador mostra uma permissão separada para isso.

const PEDAL_NAME = /usb-?midi|black ?box|m-?vave|annblack/i;
const SOFTWARE_SYNTH = /wavetable|microsoft gs|midi through/i;

function pickPort(ports, preferredName) {
  const hardware = ports.filter((p) => !SOFTWARE_SYNTH.test(p.name));
  // No Android o nome da porta pode ser diferente do Windows; se só existir um aparelho MIDI de verdade, usa ele.
  return ports.find((p) => preferredName && p.name === preferredName)
    || ports.find((p) => PEDAL_NAME.test(p.name))
    || (hardware.length === 1 ? hardware[0] : null);
}

export class Midi extends EventTarget {
  constructor() {
    super();
    this.access = null;
    this.output = null;
    this.input = null;
    this.status = 'idle'; // idle | connected | no-device | denied | unsupported
    this.error = '';
    this.channel = 15; // 0-based: 15 = canal 16
    this.preferredName = '';
    this.sysex = false;
    this.simulator = null;
    this.sysexBuffer = null;
  }

  get supported() {
    return !!this.simulator || typeof navigator.requestMIDIAccess === 'function';
  }

  async autoConnect() {
    if (this.simulator) return;
    if (!this.supported) {
      this.setStatus('unsupported');
      return;
    }
    try {
      const full = await navigator.permissions.query({ name: 'midi', sysex: true });
      if (full.state === 'granted') {
        await this.connect({ sysex: true });
        return;
      }
      const basic = await navigator.permissions.query({ name: 'midi', sysex: false });
      if (basic.state === 'granted') await this.connect();
    } catch { /* navegador sem Permissions API para MIDI: espera o clique */ }
  }

  // Devolve true se o acesso pedido foi liberado.
  async connect({ sysex = false } = {}) {
    if (this.simulator) return true;
    if (!this.supported) {
      this.setStatus('unsupported');
      return false;
    }
    if (this.access && (this.sysex || !sysex)) {
      this.refresh();
      return true;
    }
    try {
      const access = await navigator.requestMIDIAccess({ sysex });
      if (this.access) {
        this.access.onstatechange = null;
        for (const input of this.access.inputs.values()) input.onmidimessage = null;
      }
      this.access = access;
      this.sysex = sysex;
      access.onstatechange = () => this.refresh();
      this.refresh();
      return true;
    } catch (e) {
      this.error = e.message;
      if (!this.access) this.setStatus('denied');
      return false;
    }
  }

  useSimulator(pedal) {
    this.simulator = pedal;
    this.sysex = true;
    this.input = { name: 'Pedal simulado' };
    this.output = {
      name: 'Pedal simulado',
      send: (bytes) => {
        for (const reply of pedal.handle(Array.from(bytes))) {
          setTimeout(() => this.receive({ data: reply }, this.input), 15);
        }
      },
    };
    this.setStatus('connected');
  }

  outputs() {
    if (this.simulator) return [this.output];
    return this.access ? [...this.access.outputs.values()].filter((o) => o.state === 'connected') : [];
  }

  inputs() {
    if (this.simulator) return [this.input];
    return this.access ? [...this.access.inputs.values()].filter((i) => i.state === 'connected') : [];
  }

  refresh() {
    if (this.simulator) return;
    const outs = this.outputs();
    const ins = this.inputs();
    this.output = pickPort(outs, this.preferredName);
    this.input = (this.output && ins.find((i) => i.name === this.output.name)) || pickPort(ins, this.preferredName);
    for (const input of ins) {
      input.onmidimessage = (e) => this.receive(e, input);
    }
    this.setStatus(this.output ? 'connected' : 'no-device');
  }

  selectOutput(name) {
    this.preferredName = name;
    if (this.access) this.refresh();
  }

  setStatus(status) {
    this.status = status;
    this.dispatchEvent(new Event('change'));
  }

  receive(e, input) {
    const d = e.data;
    if (!d || !d.length) return;
    // SysEx pode chegar em pedaços; junta até o F7.
    if (d[0] === 0xf0 || this.sysexBuffer) {
      const chunk = Array.from(d).filter((b) => b < 0xf8); // ignora mensagens de tempo real misturadas
      this.sysexBuffer = this.sysexBuffer ? this.sysexBuffer.concat(chunk) : chunk;
      if (chunk[chunk.length - 1] === 0xf7) {
        const bytes = this.sysexBuffer;
        this.sysexBuffer = null;
        this.dispatchEvent(new CustomEvent('sysex', { detail: { bytes, port: input && input.name } }));
      }
      return;
    }
    if (d[0] === 0xf8 || d[0] === 0xfe) return; // clock e active sensing
    this.dispatchEvent(new CustomEvent('message', { detail: { bytes: Array.from(d), port: input && input.name } }));
  }

  send(bytes, at) {
    if (!this.output) return false;
    try {
      if (at) this.output.send(bytes, at);
      else this.output.send(bytes);
      this.dispatchEvent(new CustomEvent('sent', { detail: { bytes, at } }));
      return true;
    } catch (e) {
      this.error = e.message;
      this.dispatchEvent(new CustomEvent('failure', { detail: e.message }));
      return false;
    }
  }

  // preset 1..80 → programa 0..79 (o pedal mostra programa + 1)
  programChange(preset, at) {
    return this.send([0xc0 | this.channel, (preset - 1) & 0x7f], at);
  }

  controlChange(cc, value, at) {
    return this.send([0xb0 | this.channel, cc & 0x7f, value & 0x7f], at);
  }
}

export function describeMessage(bytes) {
  const [s, a, b] = bytes;
  const ch = (s & 0x0f) + 1;
  switch (s & 0xf0) {
    case 0xb0: return { kind: 'cc', label: `CC ${a} = ${b} (canal ${ch})`, sig: `cc:${s & 0x0f}:${a}`, press: b >= 64 };
    case 0xc0: return { kind: 'pc', label: `Program Change ${a} (canal ${ch})`, sig: `pc:${s & 0x0f}:${a}`, press: true };
    case 0x90: return b > 0 ? { kind: 'note', label: `Nota ${a} (canal ${ch})`, sig: `note:${s & 0x0f}:${a}`, press: true } : null;
    default: return null;
  }
}
