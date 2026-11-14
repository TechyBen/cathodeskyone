// Draws the terminal into a 2D canvas (the CRT pass in crt.js glows it up).
// Laid out after the old planetary image-processing screens: a header, a grey
// step wedge, the main frame with tick marks and reseau crosses holding the
// post (picture, name, text, images), three boxes of bars down the right
// (likes, replies, reposts: one bar per post on the page), and readouts
// along the bottom.
//
// Two layouts: `full` (a 1000x750 screen, letterboxed) and `behind` (the
// viewport's shape, 750 high, laid out around Bluesky's feed column).

import { picture, LEVELS } from './picture.js';

const FONT = '"Consolas", "Lucida Console", "Courier New", monospace';
const FG = '#eef2ef', MID = '#a9b0ab', DIM = '#6d736f', FAINT = '#353936';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export const BARS = [['LIKES', 'likes'], ['REPLIES', 'replies'], ['REPOSTS', 'reposts']];

let g = null;
// Clickable test cards drawn this frame: where, and which post they open.
let cards = [];
// Pictures drawn this frame, which can be clicked to zoom them.
let pics = [];

function font(size, weight = '') { g.font = `${weight} ${Math.round(size)}px ${FONT}`; }
function text(s, x, y, size, color = FG, align = 'left') {
  font(size);
  g.fillStyle = color;
  g.textAlign = align;
  g.fillText(s, x, y);
}
const pad = (v, n) => String(Math.max(0, Math.round(v))).padStart(n, '0');

// A box with a double edge and tick marks every `step` px along its sides.
function frame(x, y, w, h, step = 26, color = FG) {
  g.strokeStyle = color;
  g.lineWidth = 1.5;
  g.strokeRect(x + 0.5, y + 0.5, w, h);
  g.lineWidth = 1;
  g.strokeRect(x + 4.5, y + 4.5, w - 8, h - 8);
  g.beginPath();
  for (let t = step; t < w - 6; t += step) {
    g.moveTo(x + t + 0.5, y + 4); g.lineTo(x + t + 0.5, y + 9);
    g.moveTo(x + t + 0.5, y + h - 4); g.lineTo(x + t + 0.5, y + h - 9);
  }
  for (let t = step; t < h - 6; t += step) {
    g.moveTo(x + 4, y + t + 0.5); g.lineTo(x + 9, y + t + 0.5);
    g.moveTo(x + w - 4, y + t + 0.5); g.lineTo(x + w - 9, y + t + 0.5);
  }
  g.stroke();
}

// Little crosses in a grid, like the reseau marks etched on the camera's
// faceplate, drawn over the pictures.
function reseau(x, y, w, h, step) {
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.lineWidth = 2;
  g.beginPath();
  for (let yy = y + step / 2; yy < y + h; yy += step) {
    for (let xx = x + step / 2; xx < x + w; xx += step) {
      g.moveTo(xx - 2, yy); g.lineTo(xx + 2, yy);
      g.moveTo(xx, yy - 2); g.lineTo(xx, yy + 2);
    }
  }
  g.stroke();
}

// The grey step wedge: the 16 levels pictures are cut to, brightest on top,
// with a marker at the shown picture's average level.
function wedge(x, y, w, h, mark) {
  const bh = h / LEVELS;
  for (let i = 0; i < LEVELS; i++) {
    const v = Math.round((1 - i / (LEVELS - 1)) * 235 + 10);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(x + 4, y + i * bh + 3, w - 8, bh - 6);
  }
  g.strokeStyle = MID;
  g.strokeRect(x + 0.5, y + 0.5, w, h);
  if (mark >= 0) {
    const yy = y + (LEVELS - 1 - mark + 0.5) * bh;
    g.fillStyle = FG;
    g.beginPath(); g.moveTo(x + w + 2, yy); g.lineTo(x + w + 9, yy - 5); g.lineTo(x + w + 9, yy + 5); g.fill();
  }
}

// One box of bars: one row per post, its length the post's count on a log
// scale against the biggest on the page. The selected post is bright, with
// a marker; posts not fetched yet are a dim dot.
function barBox(x, y, w, h, label, field, keys, feed, sel, size) {
  text(label, x + w / 2, y - 6, size, MID, 'center');
  frame(x, y, w, h, 20, MID);
  const ix = x + 14, iy = y + 10, iw = w - 30, ih = h - 20;
  let max = 0;
  for (const k of keys) max = Math.max(max, feed.get(k)?.[field] || 0);
  const n = keys.length;
  let first = 0, count = n, row = n ? ih / n : ih;
  if (row < 3) {            // too many to fit: a window round the selected post
    count = Math.floor(ih / 3);
    row = ih / count;
    first = Math.min(Math.max(0, sel - (count >> 1)), n - count);
  }
  g.strokeStyle = DIM;
  g.beginPath(); g.moveTo(ix + 0.5, iy); g.lineTo(ix + 0.5, iy + ih); g.stroke();
  const scale = v => (max ? Math.log1p(v) / Math.log1p(max) : 0) * iw;
  const thick = Math.max(1, Math.min(row * 0.6, 7));
  for (let i = 0; i < count; i++) {
    const k = keys[first + i], p = feed.get(k);
    const yy = iy + (i + 0.5) * row - thick / 2;
    const on = first + i === sel;
    if (!p || p.error) {
      g.fillStyle = p ? FAINT : DIM;
      g.fillRect(ix + 2, yy, 2, thick);
    } else {
      g.fillStyle = on ? FG : (i + first) % 2 ? '#767c78' : '#8c928e';
      g.fillRect(ix + 1, yy, Math.max(2, scale(p[field])), on ? Math.max(thick, 3) : thick);
    }
    if (on) {
      const yc = iy + (i + 0.5) * row;
      g.fillStyle = FG;
      g.beginPath(); g.moveTo(x + w - 5, yc); g.lineTo(x + w + 3, yc - 5); g.lineTo(x + w + 3, yc + 5); g.fill();
    }
  }
  const p = feed.get(keys[sel]);
  const val = p && !p.error ? String(p[field]) : '---';
  text(`SEL=${val}`, x + 12, y + h + size + 2, size * 0.8, MID);
  text(`MAX=${max}`, x + w - 4, y + h + size + 2, size * 0.8, DIM, 'right');
  return { x, y: iy, w, h: ih, first, row, count };
}

// Word wrap by measured width; long words are broken.
function wrap(s, width, size, maxLines) {
  font(size);
  const out = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (let word of para.split(/\s+/)) {
      if (!word) continue;
      while (g.measureText(word).width > width) {
        let cut = word.length - 1;
        while (cut > 1 && g.measureText(word.slice(0, cut)).width > width) cut--;
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const t = line ? `${line} ${word}` : word;
      if (g.measureText(t).width > width) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  while (out.length && !out[out.length - 1]) out.pop();
  if (out.length > maxLines) {
    out.length = Math.max(0, maxLines);
    if (maxLines > 0) out[maxLines - 1] = `${out[maxLines - 1].replace(/.{0,3}$/, '')}...`;
  }
  return out;
}

// A test card: what the terminal shows where it can't show the thing itself
// (a picture that wouldn't load, a quoted post it can't see, a feed or a
// list). Grid, a ring with a grey scale through it, a crosshair and a label.
// In the full terminal it can be clicked to open the post on Bluesky.
function testCard(x, y, w, h, label, sub, size, target) {
  if (w < 20 || h < 20) return;
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = '#000'; g.fillRect(x, y, w, h);
  const step = Math.max(8, h / 8);
  g.strokeStyle = FAINT; g.lineWidth = 1;
  g.beginPath();
  for (let xx = x + (w / 2) % step; xx < x + w; xx += step) { g.moveTo(xx + 0.5, y); g.lineTo(xx + 0.5, y + h); }
  for (let yy = y + (h / 2) % step; yy < y + h; yy += step) { g.moveTo(x, yy + 0.5); g.lineTo(x + w, yy + 0.5); }
  g.stroke();
  const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.42;
  g.save();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
  const bars = 8, bw = (2 * r) / bars, bh = r * 0.55;
  for (let i = 0; i < bars; i++) {
    const v = Math.round(240 - i * 220 / (bars - 1));
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(cx - r + i * bw, cy - bh, bw + 0.5, bh);
  }
  g.fillStyle = '#000'; g.fillRect(cx - r, cy, 2 * r, r);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = i % 2 ? '#000' : MID;
    g.fillRect(cx - r + i * (2 * r / 6), cy + r * 0.3, 2 * r / 6 + 0.5, r * 0.12);
  }
  g.restore();
  g.strokeStyle = FG; g.lineWidth = 1.5;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(cx - r * 1.15, cy + 0.5); g.lineTo(cx + r * 1.15, cy + 0.5);
  g.moveTo(cx + 0.5, cy - r * 1.15); g.lineTo(cx + 0.5, cy + r * 1.15);
  g.stroke();
  font(size);
  const tw = Math.min(w - 8, Math.max(g.measureText(label).width, sub ? g.measureText(sub).width * 0.8 : 0) + 16);
  const th = sub ? size * 2.4 : size * 1.5, ty = Math.min(cy + r * 0.48, y + h - th - 3);
  g.fillStyle = '#000'; g.fillRect(cx - tw / 2, ty, tw, th);
  g.strokeStyle = FG; g.strokeRect(cx - tw / 2 + 0.5, ty + 0.5, tw, th);
  text(wrap(label, tw - 8, size, 1)[0] || '', cx, ty + size * 1.1, size, FG, 'center');
  if (sub) text(wrap(sub, tw - 8, size * 0.8, 1)[0] || '', cx, ty + size * 2.05, size * 0.8, MID, 'center');
  g.restore();
  g.strokeStyle = MID;
  g.strokeRect(x + 0.5, y + 0.5, w, h);
  if (target) cards.push({ x, y, w, h, ...target });
}

// A picture in its line-bound box, fitted to the box with chunky pixels.
function pictureBox(src, x, y, w, h, lines, size, blink, target) {
  g.strokeStyle = MID;
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, w, h);
  const c = 5;
  g.strokeStyle = FG;
  g.beginPath();
  for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    g.moveTo(cx - dx * 3, cy + dy * c); g.lineTo(cx - dx * 3, cy - dy * 3); g.lineTo(cx + dx * c, cy - dy * 3);
  }
  g.stroke();
  const p = src ? picture(src) : { state: 'none' };
  if (p.state === 'error' && target) {
    testCard(x + 2, y + 2, w - 4, h - 4, 'NO SIGNAL', 'CLICK TO OPEN POST', size, target);
    return null;
  }
  if (p.state !== 'ok') {
    const msg = p.state === 'loading' ? `SCANNING${blink ? '_' : ' '}` : p.state === 'none' ? 'NO IMAGE' : 'NO SIGNAL';
    text(msg, x + w / 2, y + h / 2 + size * 0.35, size, DIM, 'center');
    return null;
  }
  const s = Math.min((w - 4) / p.w, (h - 4) / p.h);
  const dw = p.w * s, dh = p.h * s;
  g.imageSmoothingEnabled = false;
  g.drawImage(lines ? p.lines : p.grey, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  pics.push({ x, y, w, h, src });
  return p;
}

// A clicked picture, large, over the main frame: processed again at about
// four times the size, still cut to 16 grey levels (or traced). Clicking
// anywhere goes back.
function zoomView(src, alt, x, y, w, h, lines, blink) {
  g.fillStyle = '#000';
  g.fillRect(x, y, w, h);
  frame(x, y, w, h);
  const p = picture(src, 420);
  text('IMAGE ZOOM', x + 16, y + 30, 16, MID);
  text('CLICK TO RETURN', x + w - 16, y + 30, 13, DIM, 'right');
  const ix = x + 16, iy = y + 44, iw = w - 32, ih = h - 44 - (alt ? 56 : 16);
  if (p.state !== 'ok') {
    const msg = p.state === 'loading' ? `SCANNING${blink ? '_' : ' '}` : 'NO SIGNAL';
    text(msg, x + w / 2, iy + ih / 2, 20, MID, 'center');
  } else {
    const s = Math.min(iw / p.w, ih / p.h);
    const dw = p.w * s, dh = p.h * s, dx = ix + (iw - dw) / 2, dy = iy + (ih - dh) / 2;
    g.imageSmoothingEnabled = false;
    g.drawImage(lines ? p.lines : p.grey, dx, dy, dw, dh);
    g.strokeStyle = MID;
    g.strokeRect(dx - 3.5, dy - 3.5, dw + 7, dh + 7);
    text(`${p.w}x${p.h}  L${pad(p.lo, 3)}=000 H${pad(p.hi, 3)}=255`, x + w - 16, y + h - 14, 12, DIM, 'right');
  }
  if (alt) wrap(`ALT: ${alt}`, iw, 14, 2).forEach((l, i) => text(l, ix, y + h - 40 + i * 17, 14, MID));
  reseau(x + 6, y + 6, w - 12, h - 12, 54);
  return p.state === 'ok' ? p : null;
}

// A quoted post in its own box: who, their first picture and their words.
// What can't be shown here (a feed, a list, a deleted or blocked post, or a
// quote with nothing to show) becomes a test card instead.
function quoteBox(q, post, x, y, w, h, s, lines, blink) {
  const z = (v, min) => Math.max(v * s, min);
  const size = z(14, 11), hdr = size * 1.7;
  g.strokeStyle = MID; g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, w, h);
  g.strokeRect(x + 3.5, y + 3.5, w - 6, h - 6);
  const own = { did: post.did, rkey: post.rkey, handle: post.handle };
  const theirs = q.kind === 'post' && (q.did || '').startsWith('did:') && q.rkey ? { did: q.did, rkey: q.rkey, handle: q.handle } : own;
  const who = q.kind === 'post' ? `@${q.handle}` : q.kind.toUpperCase();
  text(wrap(`QUOTE >> ${who}`, w - 16, size, 1)[0] || '', x + 9, y + size * 1.25, size, MID);
  const ix = x + 8, iy = y + hdr, iw = w - 16, ih = h - hdr - 8;
  if (q.kind !== 'post') {
    const label = { missing: 'POST NOT FOUND', blocked: 'BLOCKED', detached: 'DETACHED' }[q.kind] ||
      `${q.kind.toUpperCase()}${q.title ? `: ${q.title.toUpperCase()}` : ''}`;
    testCard(ix, iy, iw, ih, label, 'CLICK TO OPEN POST', size, own);
    return null;
  }
  const imgs = q.images || [];
  if (!q.text && !imgs.length) {
    testCard(ix, iy, iw, ih, q.nested ? 'QUOTES A QUOTE' : 'QUOTED POST', 'CLICK TO OPEN', size, theirs);
    return null;
  }
  let pic = null, tx = ix, tw = iw;
  if (imgs.length) {
    const side = q.text ? Math.min(ih, iw * 0.45) : iw;
    pic = pictureBox(imgs[0].src, ix, iy, side, ih, lines, size * 0.9, blink, theirs);
    if (imgs.length > 1) text(`+${imgs.length - 1}`, ix + side - 6, iy + ih - 6, size * 0.9, FG, 'right');
    tx = ix + side + 10; tw = iw - side - 10;
  }
  const tsize = z(16, 11), lh = tsize * 1.3;
  const flags = [q.video && 'VIDEO', q.link && 'LINK', q.nested && 'QUOTE'].filter(Boolean);
  const room = Math.floor((ih - (flags.length ? lh : 0)) / lh);
  let ty = iy + tsize;
  if (tw > 40) {
    for (const line of wrap(q.text || '', tw, tsize, room)) { text(line, tx, ty, tsize, FG); ty += lh; }
    if (flags.length) text(flags.map(f => `[+${f}]`).join(' '), tx, iy + ih - 4, z(12, 10), MID);
  }
  cards.push({ x, y, w, h, ...theirs, quote: true });
  return pic;
}

// The post: picture and name at the top, the text, then its images and the
// post it quotes.
function postPanel(post, x, y, w, h, s, lines, blink) {
  const z = (v, min) => Math.max(v * s, min);
  frame(x, y, w, h, Math.round(26 * s));
  const m = 18 * s, ix = x + m, iw = w - 2 * m, bottom = y + h - m;
  if (!post || post.error) {
    const msg = !post ? `AWAITING TELEMETRY${blink ? '_' : ''}` : 'SIGNAL LOST';
    text(msg, x + w / 2, y + h / 2, 22 * s, MID, 'center');
    return null;
  }
  const av = 112 * s;
  const avPic = pictureBox(post.avatar, ix, y + m, av, av, lines, 12 * s, blink);
  const tx = ix + av + 16 * s, tw = x + w - m - tx;
  text(wrap(post.name || post.handle, tw, z(22, 15), 1)[0] || '', tx, y + m + z(24, 16), z(22, 15), FG);
  text(wrap(`@${post.handle}`, tw, z(16, 12), 1)[0] || '', tx, y + m + z(48, 33), z(16, 12), MID);
  const when = post.created ? new Date(post.created) : null;
  if (when && !isNaN(when)) text(`${when.toISOString().slice(0, 16).replace('T', ' ')} UTC`, tx, y + m + z(70, 49), z(14, 11), DIM);
  const flags = [post.reply && 'REPLY', post.quote && 'QUOTE', post.video && 'VIDEO', post.link && 'LINK'].filter(Boolean);
  if (flags.length) text(flags.map(f => `[${f}]`).join(' '), tx, y + m + z(92, 65), z(14, 11), MID);

  const imgs = post.images || [];
  const q = post.quote && typeof post.quote === 'object' ? post.quote : null;
  const imgH = imgs.length || q ? Math.min(240 * s, h * 0.4) : 0;
  const imgTop = bottom - imgH;
  const size = z(19, 13), lh = size * 1.3;
  let ty = y + m + av + 34 * s;
  const room = Math.floor((imgTop - (imgH ? 14 * s : 0) - ty + lh * 0.7) / lh);
  let body = post.text || '';
  if (post.link) body += `${body ? '\n' : ''}>> ${post.link.title}`;
  for (const line of wrap(body || '(no text)', iw, size, room)) {
    text(line, ix, ty, size, body ? FG : DIM);
    ty += lh;
  }
  let main = null;
  const gap = 12 * s, own = { did: post.did, rkey: post.rkey, handle: post.handle };
  const imgW = q ? (imgs.length ? (iw - gap) * 0.5 : 0) : iw;
  if (imgs.length) {
    const cw = (imgW - gap * (imgs.length - 1)) / imgs.length;
    imgs.forEach((im, i) => {
      const p = pictureBox(im.src, ix + i * (cw + gap), imgTop, cw, imgH, lines, 12 * s, blink, own);
      if (i === 0) main = p;
    });
  }
  let quotePic = null;
  if (q) {
    const qx = imgs.length ? ix + imgW + gap : ix;
    quotePic = quoteBox(q, post, qx, imgTop, ix + iw - qx, imgH, s, lines, blink);
  }
  reseau(x + 6, y + 6, w - 12, h - 12, Math.round(54 * s));
  return main || quotePic || avPic;
}

// The - and + buttons, and where Bluesky is: which feed (where they go round
// the feed tabs), or how deep into threads (where they zoom).
function zoomButtons(x, y, ctx, can, hits) {
  const bw = 30, bh = 24;
  [[-1, '-'], [1, '+']].forEach(([dir, label], i) => {
    const bx = x + i * (bw + 6);
    const live = ctx?.kind === 'feed' || dir < 0 || can;
    g.strokeStyle = live ? FG : FAINT;
    g.lineWidth = 1.5;
    g.strokeRect(bx + 0.5, y + 0.5, bw, bh);
    g.lineWidth = 1;
    g.strokeRect(bx + 3.5, y + 3.5, bw - 6, bh - 6);
    g.fillStyle = live ? FG : FAINT;
    g.fillRect(bx + bw / 2 - 6, y + bh / 2 - 1, 12, 2);
    if (dir > 0) g.fillRect(bx + bw / 2 - 1, y + bh / 2 - 6, 2, 12);
    hits.zoom.push({ x: bx, y, w: bw, h: bh, dir });
  });
  let where = 'NO LINK';
  if (ctx?.kind === 'feed') where = `FEED: ${ctx.name}`;
  else if (ctx?.kind === 'thread') where = `THREAD ${'>'.repeat(Math.min(6, ctx.depth))}`;
  else if (ctx?.kind === 'page') where = `PAGE: ${ctx.name}`;
  text(wrap(where.toUpperCase(), 160, 13, 1)[0] || '', x + 2 * bw + 16, y + 17, 13, MID);
}

function readouts(post, pic, x, y, size, cols) {
  const words = post?.text ? post.text.trim().split(/\s+/).filter(Boolean).length : 0;
  const rows = [
    [`CHARS = ${post?.text ? [...post.text].length : 0}`, `WORDS = ${words}`, `LINKS = ${post?.links ?? 0}`],
    [`TAGS  = ${post?.tags ?? 0}`, `MENT  = ${post?.mentions ?? 0}`, `LANG  = ${(post?.langs?.[0] || '--').toUpperCase()}`],
    [`MEAN = ${pic ? pad(pic.mean, 3) : '---'}`, `HUE  = ${pic ? pad(pic.hue, 3) : '---'}`, `SAT  = ${pic ? pic.sat.toFixed(2) : '---'}`],
  ];
  rows.slice(0, cols.length).forEach((col, c) => col.forEach((s, r) => text(s, x + cols[c], y + r * size * 1.2, size, MID)));
}

function clock(post) {
  const d = post?.created ? new Date(post.created) : null;
  if (!d || isNaN(d)) return ['---:--:--', '--------'];
  const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
  return [`${pad(doy, 3)}:${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`,
    `${pad(d.getDate(), 2)}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`];
}

// --- the layouts -------------------------------------------------------------
export function draw(ctx, st) {
  g = ctx;
  const { W, H } = st;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.textBaseline = 'alphabetic';
  const keys = st.keys, n = keys.length, sel = st.sel;
  const post = n ? st.feed.get(keys[sel]) : null;
  cards = [];
  pics = [];
  const hits = { bars: [], cards, pics, zoom: [] };
  const header = st.mode === 'full' || st.col;

  if (st.mode === 'full') {
    text('CTL BSKY-1 RPLA', 6, 30, 27);
    text(post?.handle ? post.handle.toUpperCase().slice(0, 18) : 'NO SIGNAL', 470, 30, 27, FG, 'center');
    text(n ? `${pad(sel + 1, 5)}.${pad(n, 2)}(1)` : '00000.00(0)', 994, 30, 27, FG, 'right');
    text(post?.rkey ? post.rkey.toUpperCase().slice(0, 13) : '', 994, 58, 22, FG, 'right');
    let pic = postPanel(n ? post : null, 62, 44, 650, 640, 1, st.lines, st.blink);
    if (st.zoomImg) {
      const all = [...(post?.images || []), ...(post?.quote?.images || [])];
      pic = zoomView(st.zoomImg, all.find(i => i.src === st.zoomImg)?.alt || '', 62, 44, 650, 640, st.lines, st.blink) || pic;
    }
    wedge(8, 44, 40, 640, pic ? Math.round(Math.min(1, Math.max(0, (pic.mean - pic.lo) / (pic.hi - pic.lo))) * (LEVELS - 1)) : -1);
    const bx = 742, bw = 236;
    zoomButtons(bx, 68, st.context, !!post && !post.error && !post.demo, hits);
    hits.frame = { x: 62, y: 44, w: 650, h: 640 };
    BARS.forEach(([label, field], i) => {
      hits.bars.push(barBox(bx, 122 + i * 194, bw, 146, label, field, keys, st.feed, sel, 16));
    });
    readouts(post, pic, 6, 708, 15, [0, 165, 330]);
    const [t, date] = clock(post);
    text(t, 520, 742, 36, FG);
    text(`${date} BSKY RKA1`, 994, 742, 14, MID, 'right');
    if (pic) {
      text('DC SUBTRACT OK', 742, 706, 14, MID);
      text(`STRETCH- AUTO  L${pad(pic.lo, 3)}=000 H${pad(pic.hi, 3)}=255`, 742, 724, 12, MID);
    }
    if (!n) text('SCROLL YOUR FEED TO LOAD TAPE', 387, 400, 18, DIM, 'center');
    return hits;
  }

  // Behind the feed: bars to the right of the column, the post to its left.
  if (!st.col) return hits;
  const colL = st.col.l, colR = st.col.l + st.col.w;
  const rw = Math.min(300, W - colR - 48);
  if (rw >= 140) {
    const rx = colR + 28, top = 70, bh = (H - top - 40) / 3;
    BARS.forEach(([label, field], i) => {
      hits.bars.push(barBox(rx, top + i * bh + 22, rw, bh - 62, label, field, keys, st.feed, sel, 15));
    });
  }
  const lw = Math.min(600, colL - 48);
  if (lw >= 220 && header) {
    const lx = colL - 28 - lw, s = Math.max(0.55, Math.min(1, lw / 650));
    text('CTL BSKY-1 RPLA', lx, 40, 20, MID);
    text(n ? `${pad(sel + 1, 5)}.${pad(n, 2)}(1)` : '', lx + lw, 40, 20, MID, 'right');
    const pic = postPanel(n ? post : null, lx, 56, lw, H - 56 - 130, s, st.lines, st.blink);
    const [t, date] = clock(post);
    text(t, lx, H - 96, 30, FG);
    text(`${date} BSKY RKA1`, lx + lw, H - 76, 13, MID, 'right');
    readouts(post, pic, lx, H - 56, 13, lw >= 420 ? [0, lw / 3, lw * 2 / 3] : [0, lw / 2]);
  }
  return hits;
}
