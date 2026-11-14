// The terminal's sounds, all synthesised with Web Audio (no samples), kept
// medium-low:
//  - room tone: a faint mains hum and tape hiss
//  - general beeps now and then, more often when the posts on the page are
//    busier (more likes on average)
//  - a reading for each post shown: three blips, pitched by its likes,
//    replies and reposts against the biggest on the page
//  - a tick per post when new posts arrive
//  - tape reels winding: when moving between posts, and idly now and then

export class Sound {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.vol = 0.35;
    this.quiet = 1;           // lower behind the feed than in full screen
    this.activity = 0;        // 0..1, how busy the page is
    this.nextBeep = 0;
    this.nextReel = 0;
  }

  // Browsers only start audio after a click or key press on the page; this
  // is tried again on every message until it works.
  wake() {
    if (!this.on) return;
    if (!this.ctx) {
      try { this.build(); } catch { return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  get ready() { return this.ctx && this.ctx.state === 'running' && this.on; }

  set({ on, vol, quiet }) {
    if (on !== undefined) this.on = on;
    if (vol !== undefined) this.vol = vol;
    if (quiet !== undefined) this.quiet = quiet;
    if (!this.ctx) return;
    const v = this.on ? this.vol * this.quiet : 0;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.15);
  }

  build() {
    const ctx = this.ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);
    this.set({});

    // Noise, shared by hiss and motors.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // Room tone: 50 Hz hum with a little second harmonic, and tape hiss.
    const hum = ctx.createGain();
    hum.gain.value = 0.035;
    hum.connect(this.master);
    for (const [f, g] of [[50, 1], [100, 0.45], [150, 0.15]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const gg = ctx.createGain();
      gg.gain.value = g;
      o.connect(gg).connect(hum);
      o.start();
    }
    const hiss = this.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 5000; bp.Q.value = 0.6;
    const hg = ctx.createGain();
    hg.gain.value = 0.012;
    hiss.connect(bp).connect(hg).connect(this.master);
    hiss.start();

    const t = ctx.currentTime;
    this.nextBeep = t + 3;
    this.nextReel = t + 20 + Math.random() * 20;
  }

  noise() {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    return s;
  }

  // One tone with a soft attack and release.
  tone(freq, at, dur, { type = 'sine', gain = 0.12, glide = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.008);
    g.gain.setValueAtTime(gain, at + Math.max(0.01, dur - 0.03));
    g.gain.linearRampToValueAtTime(0, at + dur);
    o.connect(g).connect(this.master);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  // Called a few times a second: the occasional general beep and idle reel.
  tick() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    if (t >= this.nextBeep) {
      this.idleBeep(t);
      const gap = 12 - this.activity * 8;
      this.nextBeep = t + gap * (0.6 + Math.random() * 0.8);
    }
    if (t >= this.nextReel) {
      this.wind(1.2 + Math.random() * 2, t, 0.6);
      this.nextReel = t + 30 + Math.random() * 40;
    }
  }

  idleBeep(t) {
    const r = Math.random();
    if (r < 0.45) this.tone(1180, t, 0.09, { gain: 0.07 });
    else if (r < 0.7) { this.tone(1500, t, 0.06, { gain: 0.06 }); this.tone(1500, t + 0.12, 0.06, { gain: 0.06 }); }
    else if (r < 0.88) [988, 784, 659].forEach((f, i) => this.tone(f, t + i * 0.09, 0.07, { gain: 0.05, type: 'triangle' }));
    else {
      // A short burst of telemetry chatter.
      for (let i = 0; i < 10; i++) this.tone(1400 + Math.floor(Math.random() * 4) * 400, t + i * 0.035, 0.025, { gain: 0.03, type: 'square' });
    }
  }

  // The post's reading: likes, replies, reposts, each pitched over two
  // octaves by its share of the page's biggest (log scale).
  reading(vals, maxes, delay = 0) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    vals.forEach((v, i) => {
      const k = maxes[i] ? Math.log1p(v) / Math.log1p(maxes[i]) : 0;
      this.tone(330 * 2 ** (k * 2), t + i * 0.13, 0.1, { gain: 0.09, type: i === 1 ? 'triangle' : 'sine' });
    });
  }

  // New posts came in: one quiet tick each (up to a dozen).
  data(n) {
    if (!this.ready || n <= 0) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < Math.min(12, n); i++) this.tone(2400 + (i % 3) * 300, t + i * 0.04, 0.018, { gain: 0.025, type: 'square' });
  }

  // Tape reels: a motor whine rising then settling, rumble and hiss through
  // a moving filter, and a soft clunk as the brake catches.
  wind(dur = 0.35, at = 0, level = 1) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = at || ctx.currentTime;
    const end = t + dur;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.07 * level, t + Math.min(0.08, dur / 3));
    out.gain.setValueAtTime(0.07 * level, end - Math.min(0.1, dur / 3));
    out.gain.linearRampToValueAtTime(0, end);
    out.connect(this.master);

    const motor = ctx.createOscillator();
    motor.type = 'sawtooth';
    motor.frequency.setValueAtTime(55, t);
    motor.frequency.exponentialRampToValueAtTime(170 + Math.random() * 60, t + dur * 0.6);
    motor.frequency.exponentialRampToValueAtTime(90, end);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 4;
    const mg = ctx.createGain();
    mg.gain.value = 0.5;
    motor.connect(lp).connect(mg).connect(out);
    motor.start(t);
    motor.stop(end + 0.05);

    const n = this.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(1800, t + dur * 0.6);
    bp.frequency.exponentialRampToValueAtTime(700, end);
    const ng = ctx.createGain();
    ng.gain.value = 0.8;
    n.connect(bp).connect(ng).connect(out);
    n.start(t, Math.random());
    n.stop(end + 0.05);

    this.tone(95, end - 0.01, 0.07, { gain: 0.08 * level, glide: 0.6 });
  }
}
