// Self-contained patriotic audio via the Web Audio API.
//
// Music: plays the audio file at VITE_MUSIC_URL (placed in /public), looped.
// There is no synthesized fallback — if the file is missing, music simply
// won't play.
//
// SFX: a synthesized bald-eagle screech.

const MUSIC_FILE = import.meta.env.VITE_MUSIC_URL || null;

class PatriotAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicEnabled = false;
    this.fileEl = null;
  }

  // Must be called from within a user gesture to satisfy autoplay policies.
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.18;
        this.master.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if (MUSIC_FILE && !this.fileEl) this._initFile();
    return this.ctx;
  }

  _initFile() {
    try {
      const el = new Audio(MUSIC_FILE);
      el.loop = true;
      el.volume = 0.4;
      el.preload = 'auto';
      el.addEventListener('canplaythrough', () => {
        if (this.musicEnabled) el.play().catch(() => {});
      });
      this.fileEl = el;
    } catch {
      /* no audio file available */
    }
  }

  setMusicEnabled(on) {
    this.musicEnabled = on;
    if (on) this.startMusic();
    else this.stopMusic();
  }

  startMusic() {
    this.ensure();
    if (!this.musicEnabled || !this.fileEl) return;
    this.fileEl.play().catch(() => {});
  }

  stopMusic() {
    if (this.fileEl) this.fileEl.pause();
  }

  isPlaying() {
    return !!(this.fileEl && !this.fileEl.paused);
  }

  // A bald-eagle style screech: a descending whistle with a touch of noise.
  playScreech() {
    if (!this.ensure()) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    out.connect(this.master);
    out.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2300, t);
    osc.frequency.exponentialRampToValueAtTime(1100, t + 1.4);
    const warble = ctx.createOscillator();
    const warbleGain = ctx.createGain();
    warble.frequency.value = 28;
    warbleGain.gain.value = 120;
    warble.connect(warbleGain).connect(osc.frequency);

    const buffer = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2200, t);
    bp.frequency.exponentialRampToValueAtTime(1200, t + 1.4);
    bp.Q.value = 6;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.25;
    noise.connect(bp).connect(noiseGain).connect(out);

    osc.connect(out);
    osc.start(t); warble.start(t); noise.start(t);
    osc.stop(t + 1.5); warble.stop(t + 1.5); noise.stop(t + 1.5);
  }
}

export const audio = new PatriotAudio();
