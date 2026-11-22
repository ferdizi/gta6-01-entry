// Laguna Azul — synthesized sound and music. One job: every sound in the game
// comes from WebAudio oscillators and noise, no audio files anywhere.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicOn = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
    this.started = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.started = true;
      return true;
    } catch {
      return false;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  _noiseBuffer(seconds = 1) {
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  _blip(freq, duration, type = 'sine', volume = 0.25, slideTo = null) {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  _noiseBurst(duration, volume, filterFreq, filterType = 'lowpass') {
    if (!this.ensure()) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(duration + 0.1);
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  gunshot() {
    this._noiseBurst(0.14, 0.5, 1800);
    this._blip(160, 0.1, 'square', 0.2, 50);
  }

  hit() {
    this._blip(220, 0.08, 'triangle', 0.2, 110);
  }

  pickup() {
    this._blip(660, 0.1, 'sine', 0.25);
    setTimeout(() => this._blip(990, 0.16, 'sine', 0.25), 90);
  }

  cash() {
    this._blip(880, 0.09, 'triangle', 0.22);
    setTimeout(() => this._blip(1174, 0.09, 'triangle', 0.22), 80);
    setTimeout(() => this._blip(1568, 0.2, 'triangle', 0.22), 160);
  }

  missionComplete() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._blip(f, 0.22, 'triangle', 0.25), i * 110));
  }

  missionFail() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => this._blip(f, 0.25, 'sawtooth', 0.15), i * 130));
  }

  crash() {
    this._noiseBurst(0.3, 0.4, 500);
  }

  horn() {
    this._blip(370, 0.28, 'square', 0.12);
    this._blip(466, 0.28, 'square', 0.1);
  }

  jump() {
    this._blip(300, 0.35, 'sine', 0.2, 900);
  }

  nearMiss() {
    this._blip(1200, 0.12, 'sine', 0.2, 1800);
  }

  startEngineLoop() {
    if (!this.ensure() || this.engineOsc) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineGain = this.ctx.createGain();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc2.type = 'square';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2.frequency.value = 110;
    this.engineGain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineOsc.connect(filter);
    this.engineOsc2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  setEngine(speedKmh, inCar) {
    if (!this.engineOsc || !this.ctx) return;
    const t = this.ctx.currentTime;
    const rpm = 50 + Math.abs(speedKmh) * 1.15;
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(rpm * 2, t, 0.08);
    this.engineGain.gain.setTargetAtTime(inCar ? 0.045 + Math.abs(speedKmh) * 0.0004 : 0, t, 0.1);
  }

  startSiren() {
    if (!this.ensure() || this.sirenOn) return;
    this.sirenOn = true;
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenGain = this.ctx.createGain();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 750;
    this.sirenGain.gain.value = 0.05;
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.6;
    lfoGain.gain.value = 320;
    lfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    lfo.start();
    this._sirenLfo = lfo;
  }

  stopSiren() {
    if (!this.sirenOn) return;
    this.sirenOn = false;
    try {
      this.sirenOsc?.stop();
      this._sirenLfo?.stop();
    } catch { /* already stopped */ }
    this.sirenOsc = null;
  }

  // Golden-hour cruise music: a slow Am–F–C–G bass walk with a plucky arpeggio.
  startMusic() {
    if (!this.ensure() || this.musicOn) return;
    this.musicOn = true;
    const bassNotes = [110, 87.31, 130.81, 98];
    const arpNotes = [220, 261.63, 329.63, 440, 329.63, 261.63];
    const stepMs = 210;
    this.musicTimer = setInterval(() => {
      if (this.muted) return;
      const bar = Math.floor(this.musicStep / 8) % 4;
      const step = this.musicStep % 8;
      if (step === 0) this._blip(bassNotes[bar], 0.5, 'triangle', 0.16);
      if (step % 2 === 0) {
        const note = arpNotes[(this.musicStep * 5 + bar) % arpNotes.length];
        this._blip(note, 0.16, 'sine', 0.07);
      }
      if (step === 4) this._blip(bassNotes[bar] * 2, 0.3, 'sine', 0.06);
      this.musicStep++;
    }, stepMs);
  }

  stopMusic() {
    this.musicOn = false;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}
