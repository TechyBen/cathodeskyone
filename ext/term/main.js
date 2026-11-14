// The terminal page. Behind bsky.app (?saver, inside the content script's
// iframe) it shows the post the mouse rests on and bars for every post on the
// page; in full screen it takes the keyboard: up and down through the posts,
// Enter to open one, Esc to go back.
//
// Sounds (sound.js) follow the feed: each shown post's reading, ticks for
// new posts, tape reels between posts, and quiet general beeps. The voice
// (voice.js, the CHIMERA synthesiser) then reads the post aloud.
//
// On its own: ?demo=1 makes up labelled placeholder posts and pictures (no
// network); add &behind=1 to see the layout used behind the feed.

import { Crt } from './crt.js';
import { Feed } from './feed.js';
import { whenLoaded } from './picture.js';
import { draw, BARS } from './screen.js';
import { demoPosts } from './demo.js';
import { Sound } from './sound.js';
import { Voice } from './voice.js';

const q = new URLSearchParams(location.search);
const saver = q.has('saver');
const PARENT = q.get('parent') || '';
const view = document.getElementById('view');

const st = {
  mode: saver || q.has('behind') ? 'behind' : 'full',
  keys: [], sel: 0, feed: null, voice: null, lines: q.has('lines'), blink: false,
  col: null, light: false, W: 1000, H: 750,
  zoomImg: '',             // a picture clicked to see it large
  context: null,          // where Bluesky is: { kind: 'feed', name } or { kind: 'thread', depth }
};
const cfg = { glow: 55, lines: st.lines, fps: 20, sound: true, voice: true, voiceWho: q.get('who') || 'author', voiceStyle: q.get('style') || 'natural', vol: 35 };
const sound = new Sound();
sound.set({ on: cfg.sound, vol: cfg.vol / 100, quiet: st.mode === 'full' ? 1 : 0.7 });
const voice = new Voice();
voice.onStatus = () => { dirty = true; };
st.voice = voice;
voice.set({ on: cfg.voice, who: cfg.voiceWho, style: cfg.voiceStyle, vol: cfg.vol / 100, quiet: st.mode === 'full' ? 1 : 0.7 });
let dirty = true, hits = { bars: [] };

const buffer = document.createElement('canvas');
const ctx = buffer.getContext('2d');
let crt = null;
try { crt = new Crt(view); } catch { /* no WebGL: the plain 2D screen is shown instead */ }
if (!crt) {
  view.replaceWith(buffer);
  buffer.id = 'view';
}

st.feed = new Feed(() => { dirty = true; busy(); playReading(); });
whenLoaded(() => { dirty = true; });

function send(msg) {
  if (saver && PARENT && window.parent !== window) window.parent.postMessage(msg, PARENT);
}

// --- sounds that follow the feed ---------------------------------------------------
// The shown post's reading (three blips for likes, replies, reposts) plays
// once it has settled and been fetched; new posts tick as they arrive; the
// general beeps come faster the busier the page is.
const heard = new Set();
let readingKey = '', readingTimer = 0;
function queueReading(wait = 0) {
  voice.hush();
  readingKey = st.keys[st.sel] || '';
  clearTimeout(readingTimer);
  readingTimer = setTimeout(playReading, wait);
}
function playReading() {
  const p = readingKey && st.feed.get(readingKey);
  if (!p || p.error || readingKey !== st.keys[st.sel]) return;
  readingKey = '';
  const fields = BARS.map(b => b[1]);
  const maxes = fields.map(f => Math.max(0, ...st.keys.map(k => st.feed.get(k)?.[f] || 0)));
  sound.reading(fields.map(f => p[f]), maxes);
  voice.say(p.text, p.did, sound.ready ? 0.45 : 0);
}
function busy() {
  const likes = st.keys.map(k => st.feed.get(k)).filter(p => p && !p.error).map(p => Math.log1p(p.likes));
  sound.activity = likes.length ? Math.min(1, likes.reduce((a, b) => a + b, 0) / likes.length / Math.log1p(2000)) : 0;
}

// --- the post list ------------------------------------------------------------
// Zoom (Bluesky does the navigating, see content.js). On the home feed + and
// - go round the feed tabs; clicking the main frame zooms into the shown
// post's thread; in a thread + zooms into the selected reply's thread and -
// backs out. Coming back out, the post zoomed from is selected again once
// it's in the list.
const zoomStack = [];
let returnTo = '';
function plusMinus(dir) {
  if (st.mode !== 'full') return;
  if (st.context?.kind === 'feed') {
    send({ type: 'cathodesky:tab', dir });
    voice.hush();
    sound.wind(0.45);
  } else zoom(dir);
}
function zoom(dir) {
  if (st.mode !== 'full') return;
  if (dir > 0) {
    const p = st.feed.get(st.keys[st.sel]);
    if (!p || p.error || p.demo) return;
    zoomStack.push(st.keys[st.sel]);
    send({ type: 'cathodesky:zoom', dir: 1, did: p.did, rkey: p.rkey, handle: p.handle });
  } else {
    returnTo = st.context?.kind === 'thread' ? zoomStack.pop() || '' : '';
    send({ type: 'cathodesky:zoom', dir: -1 });
  }
  voice.hush();
  sound.wind(0.6);
}

// READOUT: read the shown post now (or stop it if it's being read), whether
// or not automatic reading is on. The R key, the button in the full
// terminal, and the popup's button.
function readout() {
  sound.wake();
  if (voice.status === 'speaking') { voice.hush(); return; }
  const p = st.feed.get(st.keys[st.sel]);
  if (!p || p.error) return;
  voice.say(p.text, p.did, 0, true);
}

function setKeys(keys) {
  const fresh = keys.filter(k => !heard.has(k));
  fresh.forEach(k => heard.add(k));
  if (fresh.length && heard.size > fresh.length) sound.data(fresh.length);
  const cur = st.keys[st.sel];
  st.keys = keys.slice(0, 200);
  const back = returnTo ? st.keys.indexOf(returnTo) : -1;
  if (back >= 0) returnTo = '';
  const i = back >= 0 ? back : st.keys.indexOf(cur);
  st.sel = i >= 0 ? i : Math.min(st.sel, Math.max(0, st.keys.length - 1));
  if (back >= 0 || (i < 0 && st.mode === 'full')) queueReading(300);
  st.feed.want(st.keys);
  busy();
  dirty = true;
}
function select(key) {
  let i = st.keys.indexOf(key);
  if (i < 0) { setKeys([...st.keys, key]); i = st.keys.indexOf(key); }
  st.sel = i;
  st.zoomImg = '';
  st.feed.want([key]);
  dirty = true;
  sound.wind(0.3);
  queueReading(320);
}
function step(d) {
  if (!st.keys.length) return;
  st.zoomImg = '';
  st.sel = (st.sel + d + st.keys.length) % st.keys.length;
  dirty = true;
  sound.wind(Math.abs(d) > 1 ? 0.5 : 0.22);
  queueReading(Math.abs(d) > 1 ? 520 : 260);
}

if (q.has('demo')) {
  const posts = demoPosts();
  posts.forEach(p => st.feed.put(p));
  setKeys(posts.map(p => p.key));
}

// --- size and layout ------------------------------------------------------------
let rect = { x: 0, y: 0, w: 1, h: 1 }, scale = 1;
function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const vw = innerWidth, vh = innerHeight;
  view.width = Math.round(vw * dpr);
  view.height = Math.round(vh * dpr);
  if (st.mode === 'full') {
    st.W = 1000; st.H = 750;
    const s = Math.min(vw / 1000, vh / 750) * 0.96;
    const w = 1000 * s, h = 750 * s;
    rect = { x: (vw - w) / 2 * dpr, y: (vh - h) / 2 * dpr, w: w * dpr, h: h * dpr };
    scale = s;
  } else {
    st.H = 750;
    st.W = Math.max(400, Math.round(vw * 750 / vh));
    rect = { x: 0, y: 0, w: view.width, h: view.height };
    scale = vh / 750;
  }
  if (buffer.width !== st.W || buffer.height !== st.H) { buffer.width = st.W; buffer.height = st.H; }
  layoutCol();
  dirty = true;
}
let colCss = null;
function layoutCol() {
  st.col = colCss && colCss.l >= 0 ? { l: colCss.l / scale, w: colCss.w / scale } : null;
}

// --- messages from the content script ------------------------------------------
addEventListener('message', e => {
  if (!saver || e.source !== window.parent || e.origin !== PARENT) return;
  const m = e.data;
  sound.wake();
  if (m === 'cathodesky:full') setMode('full');
  else if (m === 'cathodesky:calm') setMode('behind');
  else if (m?.type === 'cathodesky:posts' && Array.isArray(m.keys)) setKeys(m.keys.filter(k => typeof k === 'string'));
  else if (m?.type === 'cathodesky:select' && typeof m.key === 'string') select(m.key);
  else if (m?.type === 'cathodesky:key' && typeof m.code === 'string') onKey(m.code);
  else if (m === 'cathodesky:read') readout();
  else if (m?.type === 'cathodesky:context') {
    st.context = { kind: String(m.kind), name: String(m.name || ''), depth: +m.depth || 0, rkey: String(m.rkey || '') };
    if (st.context.kind !== 'thread') zoomStack.length = 0;
    dirty = true;
  }
  else if (m?.type === 'cathodesky:layout') {
    colCss = m.l >= 0 ? { l: +m.l, w: +m.w } : null;
    st.light = !!m.light;
    layoutCol();
    dirty = true;
  } else if (m?.type === 'cathodesky:cfg' && m.cfg) {
    Object.assign(cfg, m.cfg);
    st.lines = !!cfg.lines;
    sound.set({ on: !!cfg.sound, vol: (+cfg.vol || 0) / 100 });
    voice.set({ on: !!cfg.voice, who: String(cfg.voiceWho), style: String(cfg.voiceStyle), vol: (+cfg.vol || 0) / 100 });
    dirty = true;
  }
});

function setMode(mode) {
  if (st.mode === mode) return;
  st.mode = mode;
  sound.set({ quiet: mode === 'full' ? 1 : 0.7 });
  voice.set({ quiet: mode === 'full' ? 1 : 0.7 });
  sound.wind(0.7);
  resize();
}

// --- full screen controls -----------------------------------------------------------
// Audio may only start after a click or key press.
addEventListener('pointerdown', () => sound.wake(), true);
addEventListener('keydown', () => sound.wake(), true);

addEventListener('keydown', e => onKey(e.code, e));
function onKey(k, e) {
  if (st.mode !== 'full') return;
  if (k === 'ArrowUp' || k === 'KeyW') step(-1);
  else if (k === 'ArrowDown' || k === 'KeyS') step(1);
  else if (k === 'PageUp') step(-10);
  else if (k === 'PageDown') step(10);
  else if (k === 'Home') { st.sel = 0; dirty = true; }
  else if (k === 'End') { st.sel = Math.max(0, st.keys.length - 1); dirty = true; }
  else if (k === 'KeyL') { st.lines = !st.lines; dirty = true; }
  else if (k === 'Equal' || k === 'NumpadAdd') plusMinus(1);
  else if (k === 'Minus' || k === 'NumpadSubtract') plusMinus(-1);
  else if (k === 'Backspace') zoom(-1);
  else if (k === 'KeyR') readout();
  else if (k === 'KeyQ') open(hits.cards?.find(c => c.quote));
  else if (k === 'Enter') {
    const p = st.feed.get(st.keys[st.sel]);
    if (p && !p.error && !p.demo) send({ type: 'cathodesky:open', did: p.did, rkey: p.rkey, handle: p.handle });
  } else if (k === 'Escape') {
    if (st.zoomImg) { st.zoomImg = ''; dirty = true; } else send({ type: 'cathodesky:leave' });
  }
  else return;
  e?.preventDefault();
}

let wheelAcc = 0;
addEventListener('wheel', e => {
  if (st.mode !== 'full') return;
  wheelAcc += e.deltaY;
  while (Math.abs(wheelAcc) >= 60) { step(Math.sign(wheelAcc)); wheelAcc -= Math.sign(wheelAcc) * 60; }
}, { passive: true });

// Clicking a bar picks its post; clicking a quote or a test card opens that
// post on Bluesky.
function toScreen(e) {
  const dpr = view.width / innerWidth;
  return [(e.clientX * dpr - rect.x) / rect.w * st.W, (e.clientY * dpr - (view.height - rect.y - rect.h)) / rect.h * st.H];
}
const cardAt = (x, y) => hits.cards?.findLast(c => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
function open(t) {
  if (t && /^did:[a-z]+:/.test(t.did) && !t.did.startsWith('did:demo:')) send({ type: 'cathodesky:open', did: t.did, rkey: t.rkey, handle: t.handle || '' });
}
addEventListener('pointermove', e => {
  if (st.mode !== 'full') return;
  const [x, y] = toScreen(e);
  const inside = b => b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  const onFrame = inside(hits.frame) && st.context?.kind !== 'thread' || inside(hits.frame) && !isAnchor();
  document.body.style.cursor = st.zoomImg ? 'zoom-out' : hits.zoom?.some(inside) || inside(hits.readout) ? 'pointer' : hits.pics?.some(inside) || onFrame ? 'zoom-in' : cardAt(x, y) ? 'pointer' : '';
});
addEventListener('pointerdown', e => {
  if (st.mode !== 'full') return;
  const [x, y] = toScreen(e);
  if (st.zoomImg) { st.zoomImg = ''; dirty = true; sound.wind(0.2); return; }
  const z = hits.zoom?.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  if (z) { plusMinus(z.dir); return; }
  const ro = hits.readout;
  if (ro && x >= ro.x && x <= ro.x + ro.w && y >= ro.y && y <= ro.y + ro.h) { readout(); return; }
  const pic = hits.pics?.findLast(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  if (pic) { st.zoomImg = pic.src; dirty = true; sound.wind(0.25); return; }
  const card = cardAt(x, y);
  if (card) { open(card); return; }
  for (const b of hits.bars) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      st.sel = Math.min(st.keys.length - 1, b.first + Math.floor((y - b.y) / b.row));
      dirty = true;
      return;
    }
  }
  const f = hits.frame;
  if (f && x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h && !isAnchor()) zoom(1);
});

// Is the shown post the open thread's own post? (Then there's nothing to
// zoom into.)
function isAnchor() {
  const p = st.feed.get(st.keys[st.sel]);
  return st.context?.kind === 'thread' && !!p && st.context.rkey === p.rkey;
}

// --- loop ------------------------------------------------------------------------
let last = 0, readySent = false, blinkAt = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const fps = st.mode === 'full' ? 60 : Math.max(5, cfg.fps);
  if (now - last < 1000 / fps - 2) return;
  last = now;
  sound.tick();
  const blink = Math.floor(now / 500) % 2 === 0;
  if (blink !== st.blink && now - blinkAt > 400) { st.blink = blink; blinkAt = now; dirty = true; }
  if (dirty) {
    dirty = false;
    hits = draw(ctx, st);
    crt?.upload(buffer);
  }
  crt?.render({
    rect, time: now / 1000,
    bright: st.mode === 'full' ? 1.05 : cfg.glow / 100 * 1.2,
    curve: st.mode === 'full' ? 0.045 : 0,
    invert: st.mode !== 'full' && st.light,
  });
  if (!readySent) { readySent = true; send({ type: 'cathodesky:ready' }); }
}

addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);
// For testing the page on its own: lay out as if behind a feed column.
function testLayout(l, w, light) {
  colCss = { l, w };
  st.light = !!light;
  layoutCol();
  dirty = true;
}
window.__cathode = { st, cfg, sound, voice, BARS, setKeys, select, setMode, testLayout };
