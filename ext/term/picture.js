// Pictures as the terminal sees them: fetched (the extension's host
// permission for cdn.bsky.app lets its pages read the pixels), shrunk to a
// few dozen pixels a side, turned to grey, contrast-stretched between the 1st
// and 99th percentile and cut to 16 levels; or traced to outlines. Each keeps
// its input and output histograms and its average colour for the readouts.

export const LEVELS = 16;
const MAX = 112;                  // longest side, in source pixels
const cache = new Map();
let onLoad = () => {};

export function whenLoaded(fn) { onLoad = fn; }

export function picture(src) {
  let p = cache.get(src);
  if (!p) {
    p = { state: 'loading' };
    cache.set(src, p);
    source(src)
      .then(bmp => { analyse(p, bmp); p.state = 'ok'; })
      .catch(() => { p.state = 'error'; })
      .finally(() => onLoad());
  }
  return p;
}

async function source(src) {
  if (src.startsWith('demo:')) return demoPicture(src.slice(5));
  // Served by tools/serve.py for testing, pictures come through its proxy.
  const test = location.protocol === 'http:' && location.hostname === 'localhost';
  const r = await fetch(test ? `/proxy?u=${encodeURIComponent(src)}` : src);
  if (!r.ok) throw new Error(r.status);
  return createImageBitmap(await r.blob());
}

function analyse(p, bmp) {
  const s = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const n = w * h, lum = new Float32Array(n), histIn = new Uint32Array(256);
  let r = 0, gg = 0, b = 0;
  for (let i = 0; i < n; i++) {
    const R = d[i * 4], G = d[i * 4 + 1], B = d[i * 4 + 2];
    r += R; gg += G; b += B;
    const l = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    lum[i] = l;
    histIn[l | 0]++;
  }
  // Stretch: the 1st and 99th percentiles go to black and white.
  const pct = q => { let acc = 0; for (let v = 0; v < 256; v++) { acc += histIn[v]; if (acc >= q * n) return v; } return 255; };
  const lo = pct(0.01), hi = Math.max(lo + 1, pct(0.99));
  const grey = new Uint8ClampedArray(n * 4), histOut = new Uint32Array(256);
  const stretched = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, Math.max(0, (lum[i] - lo) / (hi - lo)));
    stretched[i] = t;
    const v = Math.round(Math.round(t * (LEVELS - 1)) / (LEVELS - 1) * 255);
    histOut[v]++;
    sum += lum[i];
    grey[i * 4] = grey[i * 4 + 1] = grey[i * 4 + 2] = v;
    grey[i * 4 + 3] = 255;
  }
  // Outlines: Sobel edges on the stretched picture, the strongest sixth kept.
  const mag = new Float32Array(n);
  const at = (x, y) => stretched[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      mag[y * w + x] = Math.hypot(gx, gy);
    }
  }
  const sorted = Float32Array.from(mag).sort();
  const cut = Math.max(0.35, sorted[Math.floor(n * 0.83)]);
  const lines = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const v = mag[i] >= cut ? 255 : mag[i] >= cut * 0.7 ? 90 : 0;
    lines[i * 4] = lines[i * 4 + 1] = lines[i * 4 + 2] = v;
    lines[i * 4 + 3] = 255;
  }
  p.w = w; p.h = h;
  p.grey = toCanvas(grey, w, h);
  p.lines = toCanvas(lines, w, h);
  p.histIn = histIn; p.histOut = histOut;
  p.lo = lo; p.hi = hi;
  p.mean = sum / n;
  p.rgb = [r / n, gg / n, b / n];
  const [hue, sat] = hueSat(p.rgb);
  p.hue = hue; p.sat = sat;
}

function toCanvas(px, w, h) {
  const c = new OffscreenCanvas(w, h);
  c.getContext('2d').putImageData(new ImageData(px, w, h), 0, 0);
  return c;
}

function hueSat([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return [0, 0];
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, d / mx];
}

// --- made-up pictures for the demo page (no network) ---------------------------
function demoPicture(kind) {
  const w = 160, h = kind.startsWith('face') ? 160 : 120;
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d');
  const seed = [...kind].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rnd = mulberry(seed);
  if (kind.startsWith('face')) {
    const hue = rnd() * 360;
    g.fillStyle = `hsl(${hue} 45% 55%)`; g.fillRect(0, 0, w, h);
    g.fillStyle = `hsl(${(hue + 180) % 360} 30% 75%)`;
    g.beginPath(); g.arc(80, 70, 38, 0, 7); g.fill();
    g.fillRect(30, 110, 100, 60);
    g.fillStyle = '#222'; g.fillRect(64, 62, 8, 8); g.fillRect(88, 62, 8, 8);
  } else if (kind === 'planet') {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const grd = g.createLinearGradient(20, 0, 140, 60);
    grd.addColorStop(0, '#000'); grd.addColorStop(0.6, '#8aa'); grd.addColorStop(1, '#eef');
    g.fillStyle = grd; g.beginPath(); g.arc(60, -110, 160, 0, 7); g.fill();
    g.fillStyle = '#000'; g.beginPath(); g.arc(40, -120, 160, 0, 7); g.fill();
    g.fillStyle = '#ccd'; g.beginPath(); g.arc(70, 80, 9, 0, 7); g.fill();
    g.fillStyle = '#000'; g.beginPath(); g.arc(74, 78, 9, 0, 7); g.fill();
  } else if (kind === 'hills') {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#6af'); sky.addColorStop(1, '#fdb');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fe8'; g.beginPath(); g.arc(120, 40, 14, 0, 7); g.fill();
    for (let k = 0; k < 3; k++) {
      g.fillStyle = ['#3a6', '#285', '#153'][k];
      g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) g.lineTo(x, 60 + k * 18 + Math.sin(x / (20 + k * 9) + k) * 12);
      g.lineTo(w, h); g.fill();
    }
  } else if (kind === 'cat') {
    g.fillStyle = '#c96'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#333';
    g.beginPath(); g.ellipse(80, 80, 44, 34, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(44, 64); g.lineTo(52, 26); g.lineTo(70, 54); g.fill();
    g.beginPath(); g.moveTo(116, 64); g.lineTo(108, 26); g.lineTo(90, 54); g.fill();
    g.fillStyle = '#ee4'; g.fillRect(62, 70, 10, 8); g.fillRect(88, 70, 10, 8);
  } else {
    g.fillStyle = '#223'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `hsl(${rnd() * 360} 60% ${30 + rnd() * 50}%)`;
      g.fillRect(rnd() * w, rnd() * h, 10 + rnd() * 50, 10 + rnd() * 40);
    }
  }
  return c;
}

function mulberry(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
