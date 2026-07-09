/**
 * utils.js
 * Small, dependency-free helper functions shared across modules.
 * Nothing here touches state or the DOM directly (except DOM helpers below).
 */

/** Clamp a number between min and max. */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Integer floor-division friendly pixel index from (x, y, width). */
export function idx(x, y, width) {
  return y * width + x;
}

/** Pack r,g,b,a (0-255) into a single 32-bit integer (RGBA order in memory via Uint32Array + little-endian). */
export function packRGBA(r, g, b, a) {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** Unpack a 32-bit int back into [r,g,b,a]. */
export function unpackRGBA(n) {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

/** Convert a #rrggbb / #rrggbbaa hex string to packed RGBA int. */
export function hexToPacked(hex, alpha = 255) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const a = hex.length >= 8 ? parseInt(hex.substring(6, 8), 16) : alpha;
  return packRGBA(r, g, b, a);
}

/** Convert packed RGBA int to a #rrggbb hex string (ignores alpha, for swatches). */
export function packedToHex(n) {
  const [r, g, b] = unpackRGBA(n);
  return (
    '#' +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

/** Convert packed RGBA int to css rgba() string, respecting alpha. */
export function packedToRgba(n) {
  const [r, g, b, a] = unpackRGBA(n);
  return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
}

/** Convert r,g,b (0-255 each) to [h, s, v] where h is 0-360 and s,v are 0-1.
 *  Used by the HSV color picker; kept here so any module can reuse it
 *  without duplicating the math. */
export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const v = max;
  const s = max === 0 ? 0 : d / max;
  return [h, s, v];
}

/** Convert [h(0-360), s(0-1), v(0-1)] to [r, g, b] (0-255 integers). */
export function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/** Convert a packed RGBA int to [h, s, v, a] (h 0-360, s/v 0-1, a 0-255). */
export function packedToHsv(n) {
  const [r, g, b, a] = unpackRGBA(n);
  const [h, s, v] = rgbToHsv(r, g, b);
  return [h, s, v, a];
}

/** Convert [h(0-360), s(0-1), v(0-1)] + alpha(0-255) to a packed RGBA int. */
export function hsvToPacked(h, s, v, a = 255) {
  const [r, g, b] = hsvToRgb(h, s, v);
  return packRGBA(r, g, b, a);
}

/** Simple debounce. */
export function debounce(fn, wait) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/** Generate a short unique id (not cryptographically strong, fine for local ids). */
export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Query helper. */
export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/** Create an element with optional class list and attributes. */
export function el(tag, opts = {}) {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text) node.textContent = opts.text;
  if (opts.html) node.innerHTML = opts.html;
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  }
  return node;
}

/** Bresenham line algorithm, returns list of {x,y} integer points. */
export function bresenhamLine(x0, y0, x1, y1) {
  const points = [];
  x0 = Math.round(x0); y0 = Math.round(y0);
  x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0, y = y0;
  while (true) {
    points.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return points;
}

/** Midpoint circle algorithm (filled or outline), returns list of {x,y}. */
export function circlePoints(cx, cy, radius, filled) {
  const points = [];
  const seen = new Set();
  const add = (x, y) => {
    const key = x + ',' + y;
    if (!seen.has(key)) { seen.add(key); points.push({ x, y }); }
  };
  let x = radius, y = 0, err = 0;
  while (x >= y) {
    if (filled) {
      for (let ix = cx - x; ix <= cx + x; ix++) { add(ix, cy + y); add(ix, cy - y); }
      for (let ix = cx - y; ix <= cx + y; ix++) { add(ix, cy + x); add(ix, cy - x); }
    } else {
      add(cx + x, cy + y); add(cx + y, cy + x);
      add(cx - y, cy + x); add(cx - x, cy + y);
      add(cx - x, cy - y); add(cx - y, cy - x);
      add(cx + y, cy - x); add(cx + x, cy - y);
    }
    y += 1;
    if (err <= 0) { err += 2 * y + 1; }
    if (err > 0) { x -= 1; err -= 2 * x + 1; }
  }
  return points;
}

/** Rectangle outline or filled points. */
export function rectPoints(x0, y0, x1, y1, filled) {
  const points = [];
  const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
  if (filled) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) points.push({ x, y });
    }
  } else {
    for (let x = minX; x <= maxX; x++) { points.push({ x, y: minY }); points.push({ x, y: maxY }); }
    for (let y = minY; y <= maxY; y++) { points.push({ x: minX, y }); points.push({ x: maxX, y }); }
  }
  return points;
}

/** Format bytes-ish size label, e.g. "32 x 32". */
export function sizeLabel(w, h) {
  return `${w} × ${h}`;
}
