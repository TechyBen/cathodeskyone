// The terminal page. Behind bsky.app (?saver, inside the content script's
// iframe) it shows the post the mouse rests on and bars for every post on the
// page; in full screen it takes the keyboard: up and down through the posts,
// Enter to open one, Esc to go back.
//
// On its own: ?demo=1 makes up labelled placeholder posts and pictures (no
// network); add &behind=1 to see the layout used behind the feed.

import { Crt } from './crt.js';
import { Feed } from './feed.js';
import { whenLoaded } from './picture.js';
import { draw, BARS } from './screen.js';
import { demoPosts } from './demo.js';

const q = new URLSearchParams(location.search);
const saver = q.has('saver');
const PARENT = q.get('parent') || '';
const view = document.getElementById('view');

const st = {
  mode: saver || q.has('behind') ? 'behind' : 'full',
  keys: [], sel: 0, feed: null, lines: q.has('lines'), blink: false,
  col: null, light: false, W: 1000, H: 750,
};
const cfg = { glow: 55, lines: st.lines, fps: 20 };
let dirty = true, hits = { bars: [] };

const buffer = document.createElement('canvas');
const ctx = buffer.getContext('2d');
let crt = null;
try { crt = new Crt(view); } catch { /* no WebGL: the plain 2D screen is shown instead */ }
if (!crt) {
  view.replaceWith(buffer);
  buffer.id = 'view';
}

st.feed = new Feed(() => { dirty = true; });
whenLoaded(() => { dirty = true; });

function send(msg) {
  if (saver && PARENT && window.parent !== window) window.parent.postMessage(msg, PARENT);
}

// --- the post list ------------------------------------------------------------
function setKeys(keys) {
  const cur = st.keys[st.sel];
  st.keys = keys.slice(0, 200);
  const i = st.keys.indexOf(cur);
  st.sel = i >= 0 ? i : Math.min(st.sel, Math.max(0, st.keys.length - 1));
  st.feed.want(st.keys);
  dirty = true;
}
function select(key) {
  let i = st.keys.indexOf(key);
  if (i < 0) { setKeys([...st.keys, key]); i = st.keys.indexOf(key); }
  st.sel = i;
  st.feed.want([key]);
  dirty = true;
}
function step(d) {
  if (!st.keys.length) return;
  st.sel = (st.sel + d + st.keys.length) % st.keys.length;
  dirty = true;
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
  if (m === 'cathodesky:full') setMode('full');
  else if (m === 'cathodesky:calm') setMode('behind');
  else if (m?.type === 'cathodesky:posts' && Array.isArray(m.keys)) setKeys(m.keys.filter(k => typeof k === 'string'));
  else if (m?.type === 'cathodesky:select' && typeof m.key === 'string') select(m.key);
  else if (m?.type === 'cathodesky:layout') {
    colCss = m.l >= 0 ? { l: +m.l, w: +m.w } : null;
    st.light = !!m.light;
    layoutCol();
    dirty = true;
  } else if (m?.type === 'cathodesky:cfg' && m.cfg) {
    Object.assign(cfg, m.cfg);
    st.lines = !!cfg.lines;
    dirty = true;
  }
});

function setMode(mode) {
  if (st.mode === mode) return;
  st.mode = mode;
  resize();
}

// --- full screen controls -----------------------------------------------------------
addEventListener('keydown', e => {
  if (st.mode !== 'full') return;
  const k = e.code;
  if (k === 'ArrowUp' || k === 'KeyW') step(-1);
  else if (k === 'ArrowDown' || k === 'KeyS') step(1);
  else if (k === 'PageUp') step(-10);
  else if (k === 'PageDown') step(10);
  else if (k === 'Home') { st.sel = 0; dirty = true; }
  else if (k === 'End') { st.sel = Math.max(0, st.keys.length - 1); dirty = true; }
  else if (k === 'KeyL') { st.lines = !st.lines; dirty = true; }
  else if (k === 'Enter') {
    const p = st.feed.get(st.keys[st.sel]);
    if (p && !p.error && !p.demo) send({ type: 'cathodesky:open', did: p.did, rkey: p.rkey, handle: p.handle });
  } else if (k === 'Escape') send({ type: 'cathodesky:leave' });
  else return;
  e.preventDefault();
});

let wheelAcc = 0;
addEventListener('wheel', e => {
  if (st.mode !== 'full') return;
  wheelAcc += e.deltaY;
  while (Math.abs(wheelAcc) >= 60) { step(Math.sign(wheelAcc)); wheelAcc -= Math.sign(wheelAcc) * 60; }
}, { passive: true });

// Clicking a bar picks its post.
addEventListener('pointerdown', e => {
  if (st.mode !== 'full') return;
  const dpr = view.width / innerWidth;
  const x = (e.clientX * dpr - rect.x) / rect.w * st.W;
  const y = (e.clientY * dpr - (view.height - rect.y - rect.h)) / rect.h * st.H;
  for (const b of hits.bars) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      st.sel = Math.min(st.keys.length - 1, b.first + Math.floor((y - b.y) / b.row));
      dirty = true;
    }
  }
});

// --- loop ------------------------------------------------------------------------
let last = 0, readySent = false, blinkAt = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const fps = st.mode === 'full' ? 60 : Math.max(5, cfg.fps);
  if (now - last < 1000 / fps - 2) return;
  last = now;
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
window.__cathode = { st, cfg, BARS, setKeys, select, setMode, testLayout };
