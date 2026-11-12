// Kit de bateria sintetizado com Web Audio: nenhum sample de terceiros, tudo gerado na hora.

const METAL_RATIOS = [2, 3, 4.16, 5.43, 6.79, 8.21];

function noiseBuffer(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function roomImpulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export class Kit {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.live = new Set();
    this.out = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.18;
    this.out.connect(this.comp);
    this.comp.connect(destination);
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.18;
    this.verb = ctx.createConvolver();
    this.verb.buffer = roomImpulse(ctx, 1.6, 3);
    this.verbIn.connect(this.verb);
    this.verb.connect(this.out);
    this.noise = noiseBuffer(ctx, 1.5);
    this.openHat = null;
  }

  setReverb(v) {
    this.verbIn.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  // Corta tudo que já foi agendado (usado ao parar).
  cut() {
    const t = this.ctx.currentTime;
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.03);
    for (const node of this.live) {
      try { node.stop(t + 0.035); } catch { /* já parado */ }
    }
    this.live.clear();
    g.setValueAtTime(1, t + 0.06);
  }

  run(node, t, dur, offset = 0) {
    node.start(t, offset);
    node.stop(t + dur);
    this.live.add(node);
    node.onended = () => this.live.delete(node);
  }

  env(t, peak, decay, attack = 0.002) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  filter(type, freq, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  noiseSrc() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    return s;
  }

  osc(type, freq) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    return o;
  }

  sendOut(node, wet = 0) {
    node.connect(this.out);
    if (wet > 0) {
      const w = this.ctx.createGain();
      w.gain.value = wet;
      node.connect(w);
      w.connect(this.verbIn);
    }
  }

  play(name, t, v) {
    switch (name) {
      case 'kick': return this.kick(t, v);
      case 'snare': return this.snare(t, v);
      case 'hhc': return this.hat(t, v, false);
      case 'hho': return this.hat(t, v, true);
      case 'crash': return this.crash(t, v);
      case 'ride': return this.ride(t, v);
      case 'clap': return this.clap(t, v);
      case 'rim': return this.rim(t, v);
      case 'tomHi': return this.tom(t, v, 210);
      case 'tomMid': return this.tom(t, v, 150);
      case 'tomLo': return this.tom(t, v, 104);
      case 'shaker': return this.shaker(t, v);
      case 'cowbell': return this.cowbell(t, v);
      case 'click': return this.click(t, v);
      default: return undefined;
    }
  }

  kick(t, v) {
    const o = this.osc('sine', 150);
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(54, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.4);
    const g = this.env(t, v * 1.1, 0.42);
    o.connect(g);
    this.sendOut(g);
    this.run(o, t, 0.5);
    const n = this.noiseSrc();
    const f = this.filter('highpass', 2500);
    const ng = this.env(t, v * 0.18, 0.012, 0.001);
    n.connect(f).connect(ng);
    this.sendOut(ng);
    this.run(n, t, 0.03, Math.random());
  }

  snare(t, v) {
    const n = this.noiseSrc();
    const hp = this.filter('highpass', 1000);
    const lp = this.filter('lowpass', 9000);
    const ng = this.env(t, v * 0.62, 0.19);
    n.connect(hp).connect(lp).connect(ng);
    this.sendOut(ng, 0.25);
    this.run(n, t, 0.25, Math.random());
    const body = this.osc('triangle', 190);
    body.frequency.setValueAtTime(190, t);
    body.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    const bg = this.env(t, v * 0.5, 0.09);
    body.connect(bg);
    this.sendOut(bg, 0.15);
    this.run(body, t, 0.14);
    const ring = this.osc('sine', 330);
    const rg = this.env(t, v * 0.16, 0.05);
    ring.connect(rg);
    this.sendOut(rg);
    this.run(ring, t, 0.08);
  }

  metal(t, dur, base, into) {
    for (const r of METAL_RATIOS) {
      const o = this.osc('square', base * r);
      o.connect(into);
      this.run(o, t, dur);
    }
  }

  hat(t, v, open) {
    const decay = open ? 0.36 : 0.05;
    const bp = this.filter('bandpass', 10000, 0.8);
    const hp = this.filter('highpass', 7000);
    const g = this.env(t, v * (open ? 0.3 : 0.26), decay, 0.001);
    bp.connect(hp).connect(g);
    this.sendOut(g, open ? 0.1 : 0);
    this.metal(t, decay + 0.05, 40, bp);
    const n = this.noiseSrc();
    const ng = this.ctx.createGain();
    ng.gain.value = 0.35;
    n.connect(ng).connect(bp);
    this.run(n, t, decay + 0.05, Math.random());
    if (open) {
      this.openHat = { g, t };
    } else if (this.openHat && this.openHat.t < t) {
      const og = this.openHat.g.gain;
      if (og.cancelAndHoldAtTime) og.cancelAndHoldAtTime(t);
      else og.cancelScheduledValues(t);
      og.exponentialRampToValueAtTime(0.0001, t + 0.02);
      this.openHat = null;
    }
  }

  crash(t, v) {
    const hp = this.filter('highpass', 5000);
    const g = this.env(t, v * 0.32, 1.6, 0.003);
    hp.connect(g);
    this.sendOut(g, 0.3);
    this.metal(t, 1.7, 52, hp);
    const n = this.noiseSrc();
    const ng = this.ctx.createGain();
    ng.gain.value = 0.6;
    n.connect(ng).connect(hp);
    this.run(n, t, 1.5, Math.random() * 0.2);
  }

  ride(t, v) {
    const bp = this.filter('bandpass', 8500, 2.5);
    const g = this.env(t, v * 0.3, 0.7, 0.002);
    bp.connect(g);
    this.sendOut(g, 0.2);
    this.metal(t, 0.75, 46, bp);
    for (const f of [2350, 3520]) {
      const b = this.osc('sine', f);
      const bg = this.env(t, v * 0.05, 0.25);
      b.connect(bg);
      this.sendOut(bg);
      this.run(b, t, 0.3);
    }
  }

  clap(t, v) {
    const n = this.noiseSrc();
    const bp = this.filter('bandpass', 1300, 0.9);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (const d of [0, 0.011, 0.022]) {
      g.gain.setValueAtTime(v * 0.7, t + d);
      g.gain.exponentialRampToValueAtTime(0.05, t + d + 0.009);
    }
    g.gain.setValueAtTime(v * 0.55, t + 0.033);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    n.connect(bp).connect(g);
    this.sendOut(g, 0.3);
    this.run(n, t, 0.22, Math.random());
  }

  rim(t, v) {
    const a = this.osc('triangle', 1750);
    const ag = this.env(t, v * 0.32, 0.03, 0.001);
    a.connect(ag);
    this.sendOut(ag, 0.12);
    this.run(a, t, 0.05);
    const b = this.osc('square', 480);
    const bp = this.filter('bandpass', 480, 2);
    const bg = this.env(t, v * 0.25, 0.025, 0.001);
    b.connect(bp).connect(bg);
    this.sendOut(bg);
    this.run(b, t, 0.05);
  }

  tom(t, v, f) {
    const o = this.osc('sine', f * 1.5);
    o.frequency.setValueAtTime(f * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    const g = this.env(t, v * 0.85, 0.38);
    o.connect(g);
    this.sendOut(g, 0.25);
    this.run(o, t, 0.45);
    const n = this.noiseSrc();
    const bp = this.filter('bandpass', f * 2, 1);
    const ng = this.env(t, v * 0.1, 0.05);
    n.connect(bp).connect(ng);
    this.sendOut(ng);
    this.run(n, t, 0.08, Math.random());
  }

  shaker(t, v) {
    const n = this.noiseSrc();
    const bp = this.filter('bandpass', 6500, 1.2);
    const g = this.env(t, v * 0.32, 0.06, 0.012);
    n.connect(bp).connect(g);
    this.sendOut(g);
    this.run(n, t, 0.1, Math.random());
  }

  cowbell(t, v) {
    const bp = this.filter('bandpass', 800, 1.5);
    const g = this.env(t, v * 0.3, 0.22, 0.001);
    bp.connect(g);
    this.sendOut(g, 0.1);
    for (const f of [545, 815]) {
      const o = this.osc('square', f);
      o.connect(bp);
      this.run(o, t, 0.26);
    }
  }

  click(t, v) {
    const o = this.osc('sine', v >= 0.95 ? 1760 : 1320);
    const g = this.env(t, v * 0.5, 0.04, 0.001);
    o.connect(g);
    this.sendOut(g);
    this.run(o, t, 0.06);
  }
}
