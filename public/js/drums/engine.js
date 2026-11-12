// Motor da bateria: agenda as batidas com antecedência no relógio do áudio (padrão "lookahead"),
// dispara as trocas de preset no tempo certo e avisa a interface em sincronia com o som.

import { Kit } from './voices.js';
import { stepsPerBar, velocityOf, genericFill } from './patterns.js';

// Timer num Worker para não atrasar quando a aba fica em segundo plano.
const TIMER_SRC = "let id=null;onmessage=(e)=>{clearInterval(id);id=null;if(e.data==='start'){id=setInterval(()=>postMessage(0),25);}};";

const humanize = (v) => Math.min(1, v * (0.94 + Math.random() * 0.08));

export class DrumEngine extends EventTarget {
  constructor() {
    super();
    this.ctx = null;
    this.playing = false;
    this.finishing = false;
    this.bpm = 100;
    this.swing = 0;
    this.volume = 0.8;
    this.reverb = 0.18;
    this.sinkId = '';
    this.lookahead = 0.12;
    this.queue = [];
    this.seq = null;
    this.draw = this.draw.bind(this);
  }

  get sinkSupported() {
    return typeof AudioContext === 'function' && 'setSinkId' in AudioContext.prototype;
  }

  async init() {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(ctx.destination);
      this.kit = new Kit(ctx, this.master);
      this.kit.setReverb(this.reverb);
      const url = URL.createObjectURL(new Blob([TIMER_SRC], { type: 'text/javascript' }));
      this.timer = new Worker(url);
      this.timer.onmessage = () => this.tick();
      if (this.sinkId) {
        try { await this.applySink(); } catch (e) { this.emit('sinkerror', e.message); }
      }
      requestAnimationFrame(this.draw);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  async setSink(id) {
    this.sinkId = id || '';
    if (this.ctx) await this.applySink();
  }

  async applySink() {
    if (this.sinkSupported) await this.ctx.setSinkId(this.sinkId || '');
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setReverb(v) {
    this.reverb = v;
    if (this.kit) this.kit.setReverb(v);
  }

  setBpm(v) { this.bpm = v; }
  setSwing(v) { this.swing = v; }

  async preview(inst, vel = 0.9) {
    await this.init();
    this.kit.play(inst, this.ctx.currentTime + 0.005, vel);
  }

  async testSound() {
    await this.init();
    const t0 = this.ctx.currentTime + 0.05;
    const beat = 0.5;
    const hits = [
      ['kick', 0], ['hhc', 0], ['hhc', 0.5], ['snare', 1], ['hhc', 1], ['hhc', 1.5],
      ['kick', 2], ['hhc', 2], ['kick', 2.5], ['hhc', 2.5], ['snare', 3], ['hhc', 3],
      ['tomHi', 3.5], ['tomLo', 3.75], ['crash', 4], ['kick', 4],
    ];
    for (const [inst, b] of hits) this.kit.play(inst, t0 + b * beat, 0.9);
  }

  async start(seq) {
    await this.init();
    if (this.playing) this.halt();
    this.seq = seq;
    this.stepIndex = 0;
    this.barNumber = 0;
    this.bar = null;
    this.queue = [];
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.playing = true;
    this.finishing = false;
    this.timer.postMessage('start');
    this.tick();
    this.emit('state', true);
  }

  halt() {
    this.playing = false;
    this.finishing = false;
    clearTimeout(this.endTimer);
    if (this.timer) this.timer.postMessage('stop');
    this.queue = [];
    this.seq = null;
    if (this.kit) this.kit.cut();
  }

  stop() {
    if (!this.playing) return;
    this.halt();
    this.emit('state', false);
  }

  tick() {
    if (!this.playing || this.finishing) return;
    const now = this.ctx.currentTime;
    if (this.nextStepTime < now - 0.25) this.nextStepTime = now + 0.03; // recupera de travadas
    const horizon = now + this.lookahead;
    let guard = 0;
    while (this.nextStepTime < horizon && guard++ < 128) {
      if (this.stepIndex === 0) {
        const bar = this.seq.nextBar(this.barNumber);
        if (!bar) {
          this.finish(this.nextStepTime);
          return;
        }
        this.bar = bar;
        this.queue.push({ t: this.nextStepTime, type: 'bar', bar });
        if (bar.preset) this.emit('preset', { preset: bar.preset, perf: this.toPerf(this.nextStepTime) });
      }
      const bar = this.bar;
      const spbt = bar.pattern.stepsPerBeat;
      const stepDur = 60 / this.bpm / spbt;
      const t = this.nextStepTime + this.swingOffset(bar, this.stepIndex, stepDur);
      this.playStep(bar, this.stepIndex, t);
      this.queue.push({
        t, type: 'step', step: this.stepIndex, beat: Math.floor(this.stepIndex / spbt), isBeat: this.stepIndex % spbt === 0, bar,
      });
      this.nextStepTime += stepDur;
      this.stepIndex += 1;
      if (this.stepIndex >= stepsPerBar(bar.pattern)) {
        this.stepIndex = 0;
        this.barNumber += 1;
      }
    }
  }

  swingOffset(bar, i, stepDur) {
    const spbt = bar.pattern.stepsPerBeat;
    const swing = bar.swing ?? this.swing;
    if ((spbt === 4 || spbt === 2) && i % 2 === 1) return (swing / 100) * (stepDur / 3);
    return 0;
  }

  playStep(bar, i, t) {
    const tr = bar.tracks;
    for (const inst in tr) {
      const v = velocityOf(tr[inst][i]);
      if (v) this.kit.play(inst, t, humanize(v));
    }
    if (i === 0 && bar.crash) {
      if (!tr.crash || tr.crash[0] === '.') this.kit.play('crash', t, 0.85);
      if (!tr.kick || tr.kick[0] === '.') this.kit.play('kick', t, 0.9);
    }
  }

  finish(t) {
    this.finishing = true;
    this.timer.postMessage('stop');
    const wait = Math.max(0, (t - this.ctx.currentTime) * 1000) + 60;
    this.endTimer = setTimeout(() => {
      this.playing = false;
      this.finishing = false;
      this.seq = null;
      this.emit('ended');
      this.emit('state', false);
    }, wait);
  }

  // Converte um tempo do relógio de áudio para o relógio do Web MIDI (performance.now),
  // já considerando a latência de saída do som.
  toPerf(t) {
    const ctx = this.ctx;
    if (ctx.getOutputTimestamp) {
      const ts = ctx.getOutputTimestamp();
      if (ts.performanceTime > 0) return ts.performanceTime + (t - ts.contextTime) * 1000;
    }
    return performance.now() + (t - ctx.currentTime + (ctx.outputLatency || ctx.baseLatency || 0)) * 1000;
  }

  draw() {
    requestAnimationFrame(this.draw);
    if (!this.ctx || !this.queue.length) return;
    const now = this.ctx.currentTime - (this.ctx.outputLatency || 0);
    // Com a aba escondida o navegador pausa a animação; descarta passos antigos e mantém só o último compasso.
    if (this.queue.length > 512) this.queue = this.queue.filter((ev) => ev.t > now - 0.05 || ev.type === 'bar').slice(-64);
    while (this.queue.length && this.queue[0].t <= now) {
      const ev = this.queue.shift();
      this.emit(ev.type, ev);
    }
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

// ---------- Sequenciadores: decidem o que toca em cada compasso ----------

function sliceBar(p, patternBar) {
  const spb = stepsPerBar(p);
  const off = patternBar * spb;
  const out = {};
  for (const k in p.tracks) out[k] = (p.tracks[k] || '').slice(off, off + spb).padEnd(spb, '.');
  return out;
}

function fillTracks(p, patternBar) {
  if (!p.fill) return genericFill(p, patternBar);
  const spb = stepsPerBar(p);
  const out = {};
  for (const k in p.fill) out[k] = p.fill[k].slice(0, spb).padEnd(spb, '.');
  return out;
}

function makeBar(p, patternBar, o = {}) {
  return {
    pattern: p,
    patternBar,
    tracks: o.fill ? fillTracks(p, patternBar) : sliceBar(p, patternBar),
    fill: !!o.fill,
    crash: !!o.crash,
    preset: o.preset || null,
    swing: o.swing ?? null,
    sectionIndex: o.sectionIndex ?? null,
    barInSection: o.barInSection ?? 0,
    sectionBars: o.sectionBars ?? 0,
    countIn: false,
    ending: false,
  };
}

function countInBar(p, preset) {
  const spbt = p.stepsPerBeat;
  let click = '';
  for (let b = 0; b < p.beatsPerBar; b++) click += (b === 0 ? 'X' : 'x') + '.'.repeat(spbt - 1);
  return {
    pattern: { id: '__count', stepsPerBeat: spbt, beatsPerBar: p.beatsPerBar, bars: 1 },
    patternBar: 0, tracks: { click }, fill: false, crash: false, preset: preset || null, swing: 0,
    sectionIndex: null, barInSection: 0, sectionBars: 0, countIn: true, ending: false,
  };
}

function endingBar(p) {
  const spbt = p.stepsPerBeat;
  const hit = 'X' + '.'.repeat(spbt - 1);
  return {
    pattern: { id: '__end', stepsPerBeat: spbt, beatsPerBar: 1, bars: 1 },
    patternBar: 0, tracks: { crash: hit, kick: hit }, fill: false, crash: false, preset: null, swing: 0,
    sectionIndex: null, barInSection: 0, sectionBars: 0, countIn: false, ending: true,
  };
}

export function loopSequencer({ getPattern, takeFill }) {
  let lastId = null;
  let cycle = 0;
  let prevFill = false;
  return {
    nextBar() {
      const p = getPattern();
      if (p.id !== lastId) {
        lastId = p.id;
        cycle = 0;
      }
      const patternBar = cycle % (p.bars || 1);
      cycle += 1;
      const fill = takeFill();
      const bar = makeBar(p, patternBar, { fill, crash: prevFill });
      prevFill = fill;
      return bar;
    },
  };
}

export function songSequencer({ song, getPattern }) {
  const sections = song.sections.filter((s) => s.bars > 0);
  const bars = [];
  const base = getPattern(song.patternId);
  const countIn = song.countIn || 0;
  for (let c = 0; c < countIn; c++) bars.push(countInBar(base, c === 0 ? sections[0]?.preset : null));
  let prevFill = false;
  let activePreset = countIn ? sections[0]?.preset || null : null;
  sections.forEach((sec, si) => {
    const p = getPattern(sec.patternId || song.patternId);
    for (let b = 0; b < sec.bars; b++) {
      const last = b === sec.bars - 1;
      let preset = null;
      if (b === 0 && sec.preset && sec.preset !== activePreset) {
        preset = sec.preset;
        activePreset = sec.preset;
      }
      bars.push(makeBar(p, b % (p.bars || 1), {
        fill: sec.fill && last,
        crash: b === 0 && (prevFill || (si === 0 && countIn > 0)),
        preset,
        swing: p.swing || 0,
        sectionIndex: si,
        barInSection: b,
        sectionBars: sec.bars,
      }));
      if (last) prevFill = !!sec.fill;
    }
  });
  const lastSection = sections[sections.length - 1];
  bars.push(endingBar(getPattern((lastSection && lastSection.patternId) || song.patternId)));
  return { bars, sections, nextBar: (n) => bars[n] || null };
}
