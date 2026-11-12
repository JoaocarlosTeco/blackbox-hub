// Conexão Web MIDI com o pedal. Só usa mensagens MIDI padrão (Program Change e Control Change);
// SysEx fica desligado, então o hub não consegue regravar presets nem firmware.

const PEDAL_NAME = /usb-?midi|black ?box|m-?vave|annblack/i;
const SOFTWARE_SYNTH = /wavetable|microsoft gs|midi through/i;

export class Midi extends EventTarget {
  constructor() {
    super();
    this.access = null;
    this.output = null;
    this.status = 'idle'; // idle | connected | no-device | denied | unsupported
    this.error = '';
    this.channel = 15; // 0-based: 15 = canal 16
    this.preferredName = '';
  }

  get supported() {
    return typeof navigator.requestMIDIAccess === 'function';
  }

  async autoConnect() {
    if (!this.supported) return this.setStatus('unsupported');
    try {
      const perm = await navigator.permissions.query({ name: 'midi', sysex: false });
      if (perm.state === 'granted') await this.connect();
    } catch { /* navegador sem Permissions API para MIDI: espera o clique */ }
  }

  async connect() {
    if (!this.supported) return this.setStatus('unsupported');
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.access.onstatechange = () => this.refresh();
      this.refresh();
    } catch (e) {
      this.error = e.message;
      this.setStatus('denied');
    }
  }

  outputs() {
    return this.access ? [...this.access.outputs.values()].filter((o) => o.state === 'connected') : [];
  }

  inputs() {
    return this.access ? [...this.access.inputs.values()].filter((i) => i.state === 'connected') : [];
  }

  refresh() {
    const outs = this.outputs();
    // No Android o nome da porta pode ser diferente do Windows; se só existir um aparelho MIDI de verdade, usa ele.
    const hardware = outs.filter((o) => !SOFTWARE_SYNTH.test(o.name));
    this.output = outs.find((o) => this.preferredName && o.name === this.preferredName)
      || outs.find((o) => PEDAL_NAME.test(o.name))
      || (hardware.length === 1 ? hardware[0] : null);
    for (const input of this.inputs()) {
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
    if (!d || !d.length || d[0] === 0xf8 || d[0] === 0xfe) return; // clock e active sensing
    this.dispatchEvent(new CustomEvent('message', { detail: { bytes: Array.from(d), port: input.name } }));
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
