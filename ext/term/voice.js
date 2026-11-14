// The voice that reads posts aloud: CHIMERA, a physically modelled voice
// synthesiser (https://github.com/jamesondh/chimera-vocal-synth, MIT) — a
// simulated airway, vocal folds, tongue and lips, no samples. Its engine is
// Rust compiled to WebAssembly (voice/chimera.wasm, built by
// tools/build_voice.sh); one instance here plans the speech (English text to
// phonemes through the CMU dictionary, then to articulatory gestures) and the
// AudioWorklet (voice/worklet.js) runs the airway.
//
// Who speaks (`who`): each author their own body (male, female or child mix)
// and pitch from a hash of their DID, so the same person always sounds the
// same; or voice low (an adult male body) or voice high (an adult female
// body) for every post.
// Style: natural speech, or robotic: flat, steady pitch with no accents,
// a touch slower (CHIMERA has no Vocaloid preset; this is the nearest). The voice
// goes through a band-pass like a small monitor speaker. Its AudioContext is
// suspended between posts, so the airway costs nothing while nobody speaks.

const BASE = new URL('./voice/', import.meta.url);
const MAX_CHARS = 320;

const enc = new TextEncoder(), dec = new TextDecoder();

export class Voice {
  constructor() {
    this.on = true;
    this.who = 'author';      // 'author', 'a' or 'b'
    this.style = 'natural';   // or 'robotic'
    this.vol = 0.35;
    this.quiet = 1;
    this.loading = null;
    this.ctx = null;
    this.idle = 0;
    this.id = 0;
    this.current = '';
  }

  set({ on, vol, quiet, who, style }) {
    if (on !== undefined) this.on = on;
    if (who !== undefined) this.who = who;
    if (style !== undefined) this.style = style;
    if (vol !== undefined) this.vol = vol;
    if (quiet !== undefined) this.quiet = quiet;
    if (this.out) this.out.gain.setTargetAtTime(this.on ? this.vol * this.quiet * 1.1 : 0, this.ctx.currentTime, 0.1);
    if (!this.on) this.stop();
  }

  // Engine, dictionary and audio graph, once. Needs a click or key press on
  // the page first (browsers hold audio back until then).
  load() {
    if (!this.loading) {
      this.loading = (async () => {
        const mod = await WebAssembly.compile(await (await fetch(new URL('chimera.wasm', BASE))).arrayBuffer());
        this.x = (await WebAssembly.instantiate(mod, {})).exports;
        const gz = await (await fetch(new URL('cmudict.txt.gz', BASE))).arrayBuffer();
        const text = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
        this.call('g2pLoad', { text });
        this.defaultF0 = this.call('catalog').defaultSource?.f0 || 110;

        const ctx = this.ctx = new AudioContext({ latencyHint: 'playback', sampleRate: 48000 });
        await ctx.audioWorklet.addModule(new URL('worklet.js', BASE));
        this.node = new AudioWorkletNode(ctx, 'chimera', {
          numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { module: mod },
        });
        this.node.port.postMessage({ type: 'telemetry', enabled: false });
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass'; hp.frequency.value = 220;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 4200;
        const mid = ctx.createBiquadFilter();
        mid.type = 'peaking'; mid.frequency.value = 1800; mid.Q.value = 0.9; mid.gain.value = 4;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -24; comp.ratio.value = 4;
        this.out = ctx.createGain();
        this.out.gain.value = 0;
        this.node.connect(hp).connect(lp).connect(mid).connect(comp).connect(this.out).connect(ctx.destination);
        this.set({});
        await ctx.suspend();
      })();
      this.loading.catch(() => { this.loading = null; });
    }
    return this.loading;
  }

  // The engine's JSON interface (crates/chimera-wasm/src/api.rs).
  call(fn, args = {}) {
    const x = this.x;
    const bytes = enc.encode(JSON.stringify({ fn, ...args }));
    const p = x.chimera_alloc(bytes.length);
    new Uint8Array(x.memory.buffer, p, bytes.length).set(bytes);
    const status = x.chimera_call(p, bytes.length);
    x.chimera_free(p, bytes.length);
    const v = JSON.parse(dec.decode(new Uint8Array(x.memory.buffer, x.chimera_result_ptr(), x.chimera_result_len())));
    if (status !== 0) throw new Error(`voice ${fn}: ${v.error}`);
    return v;
  }

  // Read a post: `who` (a DID) picks the voice. `delay` leaves room for the
  // reading blips first. A newer post cuts off the one being read.
  async say(text, who = '', delay = 0) {
    const id = ++this.id;
    this.stop();
    const clean = tidy(text);
    if (!this.on || !clean) return;
    try { await this.load(); } catch { return; }
    if (id !== this.id || !this.on) return;
    let h = 2166136261;
    for (const ch of who) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    const pick = (h >>> 0) % 7;
    let body = [{ female: 0, child: 0 }, { female: 1, child: 0 }, { female: 0.5, child: 0 }, { female: 0.2, child: 0 },
      { female: 0.8, child: 0 }, { female: 0, child: 0.6 }, { female: 1, child: 0.3 }][pick];
    let wobble = 0.92 + ((h >>> 8) % 17) / 100;
    if (this.who === 'a') { body = { female: 0, child: 0 }; wobble = 1; }
    if (this.who === 'b') { body = { female: 1, child: 0 }; wobble = 1; }
    const f0 = this.defaultF0 * (1 + body.female * 0.85 + body.child * 0.9) * wobble;
    const robotic = this.style === 'robotic';
    let plan;
    try {
      const phrases = this.call('g2pPhrases', { text: clean });
      if (!phrases.length) return;
      this.node.port.postMessage({ type: 'body', body });
      plan = this.call('planPhrases', {
        phrases: phrases.map(p => ({ segments: p.segments, intonation: robotic ? 'flat' : p.intonation, pause: p.pause })),
        options: robotic ? { body, t0: 0, rate: 0.95, f0, intonation: 'flat', accent: 0 } : { body, t0: 0, rate: 1.05, f0 },
      });
    } catch { return; }
    await new Promise(r => setTimeout(r, delay * 1000));
    if (id !== this.id || !this.on) return;
    clearTimeout(this.idle);
    await this.ctx.resume().catch(() => {});
    if (this.ctx.state !== 'running') return;
    this.node.port.postMessage({ type: 'schedule', gestures: plan.gestures, segments: plan.segments, end: plan.end, id, replace: true });
    this.idle = setTimeout(() => { if (id === this.id) this.ctx.suspend(); }, (plan.end + 0.8) * 1000);
  }

  // Stop now and forget any post still being prepared.
  hush() {
    this.id++;
    this.stop();
  }

  stop() {
    clearTimeout(this.idle);
    if (!this.node) return;
    this.node.port.postMessage({ type: 'stopSpeech' });
    this.idle = setTimeout(() => this.ctx.suspend(), 600);
  }
}

// What's read: the post's words without links, handles' @, hashtags' #,
// emoji or other symbols, cut at a sentence end near the limit.
function tidy(text) {
  let t = (text || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b[\w-]+\.(com|org|net|social|app|io|co|uk)\S*/gi, ' ')
    .replace(/[@#]/g, ' ')
    .replace(/[^\p{L}\p{N}\s.,!?;:'"()&%$£€-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > MAX_CHARS) {
    const cut = t.slice(0, MAX_CHARS);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    t = end > MAX_CHARS / 3 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')}.`;
  }
  return /\p{L}/u.test(t) ? t : '';
}
