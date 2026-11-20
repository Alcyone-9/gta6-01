// audio.js — all sound is synthesized with WebAudio; there are no audio assets.
// A lookahead scheduler runs a 96 BPM funk loop (bassline, chord pad, hi-hats)
// whose density and tempo feel rise with the wanted level, plus one-shot SFX.

const BASSLINE = [0, -1, 0, -1, 3, -1, 0, -1, 5, -1, 3, -1, 0, -1, -2, -1];
const CHORDS = [
  [110.0, 130.81, 164.81],
  [87.31, 110.0, 130.81],
  [98.0, 123.47, 146.83],
  [130.81, 164.81, 196.0],
];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.started = false;
    this.step = 0;
    this.nextNoteTime = 0;
    this.timer = null;
    this.intensity = 0; // 0 calm .. 1 full chase
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.footAcc = 0;
  }

  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.started = true;
    this.nextNoteTime = this.ctx.currentTime + 0.06;
    this.timer = window.setInterval(() => this.schedule(), 40);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  setIntensity(v) {
    this.intensity = Math.max(0, Math.min(1, v));
  }

  // --- music scheduler -------------------------------------------------
  schedule() {
    if (!this.ctx) return;
    const bpm = 96 + this.intensity * 26;
    const stepDur = 60 / bpm / 2; // eighth notes
    while (this.nextNoteTime < this.ctx.currentTime + 0.14) {
      this.playStep(this.step, this.nextNoteTime, stepDur);
      this.nextNoteTime += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(step, when, stepDur) {
    const bar = Math.floor(step / 16) % 4;
    const inBar = step % 16;
    const bassNote = BASSLINE[inBar];
    if (bassNote >= 0) {
      const root = CHORDS[bar][0];
      const freq = root * Math.pow(2, bassNote / 12) * 0.5;
      this.tone(freq, when, stepDur * 0.9, 'triangle', 0.16);
    }
    if (inBar === 0) {
      for (const f of CHORDS[bar]) this.tone(f * 2, when, stepDur * 6, 'sine', 0.035);
    }
    // hi-hat: every eighth, busier when intense
    if (inBar % 2 === 0 || this.intensity > 0.45) {
      this.hat(when, inBar % 4 === 2 ? 0.05 : 0.028);
    }
    if (this.intensity > 0.2 && inBar % 8 === 4) this.tone(196, when, stepDur, 'square', 0.03);
  }

  tone(freq, when, dur, type, vol) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(when);
    o.stop(when + dur + 0.02);
  }

  hat(when, vol) {
    const len = 0.03;
    const buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * len), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(when);
  }

  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, vol, freq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq || 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  horn() {
    this.blip(370, 0.28, 'sawtooth', 0.1);
    this.blip(466, 0.28, 'sawtooth', 0.08);
  }
  crash(hard) {
    this.noise(hard ? 0.4 : 0.18, hard ? 0.4 : 0.2, 700);
    this.blip(90, 0.25, 'sine', 0.25, 40);
  }
  step() {
    this.noise(0.05, 0.05, 500);
  }
  shot() {
    this.noise(0.12, 0.35, 2600);
    this.blip(160, 0.1, 'square', 0.2, 60);
  }
  punch() {
    this.noise(0.08, 0.22, 800);
    this.blip(120, 0.08, 'sine', 0.2, 70);
  }
  cash() {
    this.blip(880, 0.09, 'square', 0.1);
    window.setTimeout(() => this.blip(1320, 0.14, 'square', 0.1), 70);
  }
  cassette() {
    const notes = [660, 880, 990, 1320];
    notes.forEach((f, i) => window.setTimeout(() => this.blip(f, 0.12, 'triangle', 0.14), i * 80));
  }
  dialogBlip() {
    this.blip(520 + Math.random() * 160, 0.05, 'square', 0.05);
  }
  fail() {
    this.blip(300, 0.3, 'sawtooth', 0.12, 140);
  }
  success() {
    const notes = [523, 659, 784];
    notes.forEach((f, i) => window.setTimeout(() => this.blip(f, 0.16, 'triangle', 0.12), i * 90));
  }

  footsteps(distanceMoved, dt, running) {
    this.footAcc += distanceMoved;
    const stride = running ? 3.1 : 2.1;
    if (this.footAcc > stride) {
      this.footAcc = 0;
      this.step();
    }
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = 800;
      lfo.type = 'square';
      lfo.frequency.value = 0.7;
      lfoGain.gain.value = 160;
      lfo.connect(lfoGain);
      lfoGain.connect(o.frequency);
      g.gain.value = 0.035;
      o.connect(g);
      g.connect(this.master);
      o.start();
      lfo.start();
      this.sirenOsc = o;
      this.sirenGain = g;
      this.sirenLfo = lfo;
    } else if (!on && this.sirenOsc) {
      try {
        this.sirenOsc.stop();
        this.sirenLfo.stop();
      } catch (err) { /* already stopped */ }
      this.sirenOsc = null;
      this.sirenLfo = null;
      this.sirenGain = null;
    }
  }
}
