// 程序化音效: WebAudio 合成, 零资源文件。首次用户手势后初始化。
const SFX = {
  ctx: null, master: null, muted: false,
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    } catch (e) { /* 无音频环境 */ }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  toggle() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.35; return this.muted; },

  _tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur);
  },
  _noise(dur, vol, filterFreq) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  },

  shoot()   { this._tone(880 + Math.random() * 120, 0.07, 'square', 0.12, 220); },
  enemyShoot() { this._tone(320, 0.09, 'square', 0.07, 140); },
  hit()     { this._noise(0.08, 0.25, 2500); },
  hitEnemy(){ this._noise(0.06, 0.15, 3200); },
  explosion(big) { this._noise(big ? 0.6 : 0.35, big ? 0.7 : 0.45, big ? 900 : 1400); this._tone(big ? 90 : 120, big ? 0.5 : 0.3, 'sine', 0.4, 35); },
  grenadeThrow() { this._tone(500, 0.12, 'sine', 0.15, 900); },
  throw_()  { this.grenadeThrow(); },
  pickup()  { this._tone(660, 0.09, 'sine', 0.2); setTimeout(() => this._tone(990, 0.12, 'sine', 0.2), 80); },
  rescue()  { [523, 659, 784].forEach((f, i) => setTimeout(() => this._tone(f, 0.15, 'triangle', 0.25), i * 90)); },
  playerHit() { this._tone(160, 0.2, 'sawtooth', 0.3, 60); },
  playerDown() { this._noise(0.7, 0.6, 700); this._tone(110, 0.6, 'sawtooth', 0.35, 40); },
  enemyDown() { this._noise(0.25, 0.35, 1200); },
  buildingDown() { this._noise(0.5, 0.55, 800); this._tone(140, 0.4, 'triangle', 0.3, 50); },
  bossShoot() { this._tone(180, 0.18, 'sawtooth', 0.22, 90); },
  bossWarn() { [220, 220, 220].forEach((f, i) => setTimeout(() => this._tone(f, 0.22, 'square', 0.25), i * 220)); },
  phaseShift() { [440, 440, 560, 560, 700].forEach((f, i) => setTimeout(() => this._tone(f, 0.16, 'square', 0.22), i * 130)); },
  upgrade() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this._tone(f, 0.14, 'triangle', 0.25), i * 70)); },
  rocket() { this._noise(0.25, 0.3, 2000); this._tone(200, 0.25, 'sawtooth', 0.16, 800); },
  bossDown() { this._noise(1.0, 0.7, 600); [330, 262, 196, 131].forEach((f, i) => setTimeout(() => this._tone(f, 0.3, 'sawtooth', 0.25), i * 150)); },
  denied()  { this._tone(200, 0.15, 'square', 0.2, 120); },
  start()   { this._tone(392, 0.12, 'triangle', 0.25); setTimeout(() => this._tone(587, 0.18, 'triangle', 0.25), 110); },
  win()     { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this._tone(f, 0.25, 'triangle', 0.3), i * 140)); },
  lose()    { [400, 300, 220, 150].forEach((f, i) => setTimeout(() => this._tone(f, 0.3, 'sawtooth', 0.2), i * 160)); },
};
