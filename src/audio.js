export class AudioWorld {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.listener = null;
    this.sources = [];
    this.ducked = 1;
    this.enabled = false;
  }

  async start() {
    if (this.ctx) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.28;
    this.master.connect(ctx.destination);
    this.listener = ctx.listener;
    this.enabled = true;
    this._ambience();
  }

  _ambience() {
    const ctx = this.ctx;
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuf;
    wind.loop = true;
    const windF = ctx.createBiquadFilter();
    windF.type = "bandpass";
    windF.frequency.value = 420;
    const windG = ctx.createGain();
    windG.gain.value = 0.04;
    wind.connect(windF).connect(windG).connect(this.master);
    wind.start();
    this.windFilter = windF;
    this.windGain = windG;
  }

  addDrone(x, y, z, freqs, gain = 0.04) {
    if (!this.ctx) return null;
    const panner = this.ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 6;
    panner.maxDistance = 90;
    panner.rolloffFactor = 0.9;
    panner.setPosition(x, y, z);
    const g = this.ctx.createGain();
    g.gain.value = gain;
    for (const f of freqs) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const og = this.ctx.createGain();
      og.gain.value = 0.25;
      o.connect(og).connect(panner);
      o.start();
    }
    panner.connect(g).connect(this.master);
    const src = { panner, g, x, y, z, kind: "drone" };
    this.sources.push(src);
    return src;
  }

  addBell(x, y, z) {
    return this.addPulse(x, y, z, 740, 2.8, 0.08);
  }

  addPulse(x, y, z, freq, interval, gain) {
    if (!this.ctx) return null;
    const panner = this.ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.refDistance = 5;
    panner.maxDistance = 70;
    panner.setPosition(x, y, z);
    const g = this.ctx.createGain();
    g.gain.value = 0;
    panner.connect(g).connect(this.master);
    const tick = () => {
      if (!this.ctx) return;
      const o = this.ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = freq * (0.97 + Math.random() * 0.06);
      const og = this.ctx.createGain();
      const t = this.ctx.currentTime;
      og.gain.setValueAtTime(gain * this.ducked, t);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      o.connect(og).connect(panner);
      o.start(t);
      o.stop(t + 1.7);
      setTimeout(tick, interval * 1000 + Math.random() * 400);
    };
    tick();
    const src = { panner, g, x, y, z, kind: "bell" };
    this.sources.push(src);
    return src;
  }

  flute(x, y, z, seconds = 6) {
    if (!this.ctx) return;
    const panner = this.ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.refDistance = 4;
    panner.maxDistance = 80;
    panner.setPosition(x, y, z);
    const melody = [523.25, 587.33, 659.25, 784.0, 659.25, 587.33, 523.25, 440.0];
    let t = this.ctx.currentTime;
    melody.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09 * this.ducked, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      o.connect(g).connect(panner);
      panner.connect(this.master);
      o.start(t);
      o.stop(t + 0.6);
      t += 0.42 + (i % 3) * 0.05;
    });
  }

  setListener(pos, forward) {
    if (!this.listener || !this.ctx) return;
    const l = this.listener;
    if (l.positionX) {
      l.positionX.value = pos.x;
      l.positionY.value = pos.y + 1.5;
      l.positionZ.value = pos.z;
      l.forwardX.value = forward.x;
      l.forwardY.value = forward.y;
      l.forwardZ.value = forward.z;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(pos.x, pos.y + 1.5, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
    if (this.windGain) {
      this.windGain.gain.value = 0.03 + Math.max(0, pos.z) * 0.0004;
    }
  }

  duck(amount) {
    this.ducked = amount;
    if (this.master) this.master.gain.value = 0.28 * amount;
  }

  setFestival(level) {
    if (this.master) this.master.gain.value = 0.28 + level * 0.06;
  }
}
