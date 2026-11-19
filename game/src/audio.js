// Coral City Heat — every sound is synthesised with WebAudio; there are no audio files.
// Short one-shots (punch, shot, pickup, stings) are built from oscillators and filtered
// noise bursts. Two loops run while they matter: the engine, whose pitch follows speed,
// and the police siren, a slow two-tone wail that only exists when a patrol is close.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type = 'square', vol = 0.2, slideTo = null, delay = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.25, freq = 1200, delay = 0) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
  }

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
    punch() { noise(0.09, 0.3, 500); tone(90, 0.08, 'sine', 0.25, 45); },
    shot() { noise(0.14, 0.5, 2600); tone(160, 0.1, 'square', 0.2, 60); },
    dryFire() { tone(1200, 0.04, 'square', 0.08); },
    pickup() { tone(660, 0.09, 'sine', 0.22); tone(990, 0.14, 'sine', 0.22, null, 0.08); },
    cash() { tone(880, 0.07, 'triangle', 0.2); tone(1320, 0.1, 'triangle', 0.18, null, 0.06); },
    door() { tone(140, 0.09, 'sine', 0.2, 80); noise(0.05, 0.12, 700, 0.02); },
    crash(intensity = 1) { noise(0.22, 0.3 * intensity, 500); tone(70, 0.2, 'sine', 0.25 * intensity, 40); },
    hurt() { tone(220, 0.12, 'sawtooth', 0.16, 110); },
    sting(win = true) {
      const notes = win ? [523, 659, 784, 1046] : [392, 330, 262, 196];
      notes.forEach((n, i) => tone(n, 0.22, 'triangle', 0.22, null, i * 0.11));
    },
    phoneBuzz() { tone(440, 0.07, 'square', 0.1); tone(440, 0.07, 'square', 0.1, null, 0.12); },
    /** Per-frame loop control: engine pitch from speed, siren loudness from distance. */
    update(dt, driving, speedRatio, nearestCop) {
      if (!ctx) return;
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
