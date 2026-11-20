// Coral City Heat v2 — every sound is synthesised with WebAudio; there are no
// audio files. Two layers share one master bus:
//
//   1. A procedural city-funk MUSIC LOOP. A lookahead scheduler walks 8th-note
//      steps at 96 BPM through an Am7 – Fmaj7 – Cmaj7 – G6 progression: a
//      syncopated bassline on a lowpassed saw, warm chord pads on detuned
//      triangles, and a hi-hat made of highpassed noise. An `intensity`
//      value (0..1, driven by wanted stars and how close the chase is) fades
//      in a kick, busier hats, extra bass ghost notes and a brighter pad
//      filter, so cruising sounds lazy and a three-star chase sounds urgent.
//      The loop only starts after the first user gesture, and M mutes the
//      whole master bus.
//
//   2. One-shot SFX (punch, gunshot, crash, horn, footsteps, pickups, stings)
//      plus two continuous loops: the engine, whose pitch follows speed, and
//      the police siren, a two-tone wail that swells as patrols close in.

const BPM = 96;
const STEP = 60 / BPM / 2; // 8th notes
// Chord roots (Hz) and chord tones for Am7, Fmaj7, Cmaj7, G6.
const BARS = [
  { root: 55.0, chord: [220.0, 261.63, 329.63, 392.0] },   // A1 / Am7
  { root: 43.65, chord: [174.61, 220.0, 261.63, 329.63] }, // F1 / Fmaj7
  { root: 65.41, chord: [196.0, 261.63, 329.63, 493.88] }, // C2 / Cmaj7
  { root: 49.0, chord: [196.0, 246.94, 293.66, 329.63] },  // G1 / G6
];
// Funk bassline per bar, as scale steps in 8ths: 0 = rest, otherwise semitone
// offset from the bar root. Syncopation is the whole point.
const BASS_PATTERN = [0, -1, 0, 12, -1, 0, 7, -1, 0, -1, 12, 10, -1, 7, 0, -1];

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let muted = false;
  let musicOn = false;
  let stepIndex = 0;
  let nextStepAt = 0;
  let intensity = 0; // smoothed 0..1
  let stepSide = false;
  let noiseBuffer = null; // one shared decaying-noise buffer, built lazily

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0.6;
      musicBus.connect(master);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type = 'square', vol = 0.2, slideTo = null, delay = 0, dest = null) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(dest || master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function getNoiseBuffer() {
    // The hat fires up to sixteen times a bar; allocating a fresh buffer per
    // hit was the loop's biggest per-frame cost. One 0.3 s decaying-noise
    // buffer serves every hit — the per-hit envelope shapes the rest.
    if (noiseBuffer) return noiseBuffer;
    const len = Math.floor(ctx.sampleRate * 0.3);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    return noiseBuffer;
  }

  function noiseHit(t0, dur, vol, freq, type = 'lowpass', q = 0.8, dest = null) {
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(dest || master);
    src.start(t0);
  }

  function noise(dur, vol = 0.25, freq = 1200, delay = 0) {
    if (!ensure()) return;
    noiseHit(ctx.currentTime + delay, dur, vol, freq);
  }

  // ---------------------------------------------------------- music engine
  function scheduleStep(step, t0) {
    const bar = BARS[Math.floor(step / 16) % BARS.length];
    const inBar = step % 16;
    const hot = intensity; // read at schedule time; close enough for feel

    // Chord pad: whole-bar swell at the top of each bar.
    if (inBar === 0) {
      for (const f of bar.chord) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 600 + hot * 1400;
        const gain = ctx.createGain();
        const barDur = STEP * 16;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.045, t0 + barDur * 0.3);
        gain.gain.setValueAtTime(0.045, t0 + barDur * 0.7);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + barDur);
        osc.connect(filter).connect(gain).connect(musicBus);
        osc.start(t0);
        osc.stop(t0 + barDur + 0.05);
      }
    }

    // Bassline: the pattern, with ghost notes appearing as intensity rises.
    const semi = BASS_PATTERN[inBar];
    if (semi >= 0) {
      const f = bar.root * Math.pow(2, semi / 12) * 2; // play in the A2 range
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300 + hot * 500;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.16, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + STEP * 0.92);
      osc.connect(filter).connect(gain).connect(musicBus);
      osc.start(t0);
      osc.stop(t0 + STEP);
    } else if (hot > 0.55 && inBar % 4 === 3) {
      // Ghost note: a soft octave pop that only exists in a chase.
      const f = bar.root * 4;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.05, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + STEP * 0.6);
      osc.connect(gain).connect(musicBus);
      osc.start(t0);
      osc.stop(t0 + STEP * 0.7);
    }

    // Hi-hat: closed ticks on off-8ths, open sizzle on bar ends; busier hot.
    if (inBar % 2 === 1 || (hot > 0.4 && inBar % 2 === 0)) {
      const open = inBar === 14;
      noiseHit(t0, open ? 0.16 : 0.045, open ? 0.07 : 0.05, 7500, 'highpass', 0.7, musicBus);
    }
    // Kick: four on the floor, only once the heat is on.
    if (hot > 0.25 && inBar % 4 === 0) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, t0);
      osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.11);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.22 * hot, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.13);
      osc.connect(gain).connect(musicBus);
      osc.start(t0);
      osc.stop(t0 + 0.15);
    }
  }

  function startMusic() {
    if (!ensure() || musicOn) return;
    musicOn = true;
    stepIndex = 0;
    nextStepAt = ctx.currentTime + 0.06;
  }

  function pumpMusic() {
    if (!musicOn || !ctx) return;
    // Lookahead scheduler: keep ~0.15 s of steps queued.
    while (nextStepAt < ctx.currentTime + 0.15) {
      scheduleStep(stepIndex, nextStepAt);
      stepIndex += 1;
      nextStepAt += STEP;
    }
  }

  // ---------------------------------------------------------- loop voices
  function startEngine() {
    if (!ensure() || engineOsc) return;
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineOsc.connect(filter).connect(engineGain).connect(master);
    engineOsc.start();
  }

  function startSiren() {
    if (!ensure() || sirenOsc) return;
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 660;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0.0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
  }

  return {
    unlock() { ensure(); },
    /** Begin the music loop — call only after a genuine user gesture. */
    startMusic,
    get musicStarted() { return musicOn; },
    get muted() { return muted; },
    /** Toggle the master mute (M key). Returns the new muted state. */
    toggleMute() {
      muted = !muted;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.03);
      return muted;
    },
    punch() { noise(0.09, 0.3, 500); tone(90, 0.08, 'sine', 0.25, 45); },
    shot() { noise(0.14, 0.5, 2600); tone(160, 0.1, 'square', 0.2, 60); tone(1200, 0.05, 'square', 0.1, 300, 0.01); },
    dryFire() { tone(1200, 0.04, 'square', 0.08); },
    pickup() { tone(660, 0.09, 'sine', 0.22); tone(990, 0.14, 'sine', 0.22, null, 0.08); },
    cash() { tone(880, 0.07, 'triangle', 0.2); tone(1320, 0.1, 'triangle', 0.18, null, 0.06); },
    door() { tone(140, 0.09, 'sine', 0.2, 80); noise(0.05, 0.12, 700, 0.02); },
    crash(intensityIn = 1) { noise(0.22, 0.3 * intensityIn, 500); tone(70, 0.2, 'sine', 0.25 * intensityIn, 40); noise(0.1, 0.12 * intensityIn, 3000, 0.02); },
    hurt() { tone(220, 0.12, 'sawtooth', 0.16, 110); },
    horn(dist = 10) {
      // Two-tone car horn, quieter with distance; traffic uses it when blocked.
      const vol = Math.max(0.02, 0.14 * (1 - dist / 45));
      tone(370, 0.22, 'square', vol);
      tone(466, 0.22, 'square', vol * 0.8);
    },
    step() {
      // Alternating soft footfalls while walking or sprinting.
      stepSide = !stepSide;
      noise(0.05, 0.07, stepSide ? 420 : 360);
    },
    sting(win = true) {
      const notes = win ? [523, 659, 784, 1046] : [392, 330, 262, 196];
      notes.forEach((n, i) => tone(n, 0.22, 'triangle', 0.22, null, i * 0.11));
    },
    fanfare() {
      // CITY CLEARED: a longer, brighter run than a single job sting.
      const notes = [392, 523, 659, 784, 1046, 784, 1046, 1318];
      notes.forEach((n, i) => tone(n, 0.3, 'triangle', 0.22, null, i * 0.13));
    },
    phoneBuzz() { tone(440, 0.07, 'square', 0.1); tone(440, 0.07, 'square', 0.1, null, 0.12); },
    /**
     * Per-frame control. `heat` is 0..1 of wanted pressure; engine pitch comes
     * from speed, siren loudness from the nearest patrol, and the music
     * intensity eases toward the heat so chases swell instead of snapping.
     */
    update(dt, driving, speedRatio, nearestCop, heat = 0) {
      if (!ctx) return;
      pumpMusic();
      intensity += (Math.min(1, heat) - intensity) * Math.min(1, dt * 1.6);
      if (driving) {
        startEngine();
        engineOsc.frequency.value = 50 + speedRatio * 130;
        engineGain.gain.value = 0.05 + speedRatio * 0.06;
      } else if (engineGain) {
        engineGain.gain.value = 0;
      }
      if (nearestCop !== null && nearestCop < 70) {
        startSiren();
        sirenTimer += dt;
        sirenOsc.frequency.value = sirenTimer % 1.1 < 0.55 ? 660 : 880;
        sirenGain.gain.value = 0.045 * (1 - nearestCop / 70);
      } else if (sirenGain) {
        sirenGain.gain.value = 0;
      }
    },
  };
}
