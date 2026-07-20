// ==== PixStar bundled build (no ES modules) - works via file:// ====

"use strict";


// ---- js/utils.js ----

/**
 * utils.js
 * Small, dependency-free helper functions shared across modules.
 * Nothing here touches state or the DOM directly (except DOM helpers below).
 */

/** Clamp a number between min and max. */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Integer floor-division friendly pixel index from (x, y, width). */
function idx(x, y, width) {
  return y * width + x;
}

/** Pack r,g,b,a (0-255) into a single 32-bit integer (RGBA order in memory via Uint32Array + little-endian). */
function packRGBA(r, g, b, a) {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** Unpack a 32-bit int back into [r,g,b,a]. */
function unpackRGBA(n) {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

/** Convert a #rrggbb / #rrggbbaa hex string to packed RGBA int. */
function hexToPacked(hex, alpha = 255) {
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
function packedToHex(n) {
  const [r, g, b] = unpackRGBA(n);
  return (
    '#' +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

/** Convert packed RGBA int to css rgba() string, respecting alpha. */
function packedToRgba(n) {
  const [r, g, b, a] = unpackRGBA(n);
  return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
}

/** Convert r,g,b (0-255 each) to [h, s, v] where h is 0-360 and s,v are 0-1.
 *  Used by the HSV color picker; kept here so any module can reuse it
 *  without duplicating the math. */
function rgbToHsv(r, g, b) {
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
function hsvToRgb(h, s, v) {
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
function packedToHsv(n) {
  const [r, g, b, a] = unpackRGBA(n);
  const [h, s, v] = rgbToHsv(r, g, b);
  return [h, s, v, a];
}

/** Convert [h(0-360), s(0-1), v(0-1)] + alpha(0-255) to a packed RGBA int. */
function hsvToPacked(h, s, v, a = 255) {
  const [r, g, b] = hsvToRgb(h, s, v);
  return packRGBA(r, g, b, a);
}

/** Simple debounce. */
function debounce(fn, wait) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/** Generate a short unique id (not cryptographically strong, fine for local ids). */
function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Query helper. */
function qs(selector, root = document) {
  return root.querySelector(selector);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/** Create an element with optional class list and attributes. */
function el(tag, opts = {}) {
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
function bresenhamLine(x0, y0, x1, y1) {
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
function circlePoints(cx, cy, radius, filled) {
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
function rectPoints(x0, y0, x1, y1, filled) {
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
function sizeLabel(w, h) {
  return `${w} × ${h}`;
}


// ---- js/state.js ----

/**
 * state.js
 * Single source of truth for the whole app. Other modules read/mutate
 * state through the functions exported here and subscribe to changes
 * instead of poking at a shared object directly.
 *
 * Pixel data storage: each layer stores its pixels as a Uint32Array of
 * length (width*height), one packed RGBA value per pixel. This keeps
 * memory compact and access O(1) even at 256x256.
 */



const listeners = new Set();

function makeLayer(name, width, height) {
  return {
    id: uid('layer'),
    name,
    visible: true,
    locked: false,
    opacity: 1,
    // Transparent by default (alpha = 0)
    data: new Uint32Array(width * height),
  };
}

// Add to the state object
const state = {
  canvas: {
    width: 32,
    height: 32,
  },
  layers: [],
  activeLayerId: null,

  tool: 'pencil',
  toolOptions: {
    brushSize: 1,
    shapeFilled: false,
  },

  primaryColor: packRGBA(30, 30, 30, 255),
  secondaryColor: packRGBA(255, 255, 255, 255),

  view: {
    zoom: 16,
    panX: 0,
    panY: 0,
    gridVisible: true,
  },

  palette: {
    custom: [],
    recent: [],
    favorites: [],
  },

  project: {
    name: 'untitled',
    dirty: false,
    galleryId: null,
  },
  
  animation: {
  enabled: false,
  frames: [], // each frame: { layers: [layer snapshot] }
  currentFrame: 0,
  fps: 12,
  isPlaying: false, // UI-only flag, not persisted - suppresses onion skin during playback
},

  // Transform box state. The layer's un-transformed rect is always
  // [0,0,canvas.width,canvas.height] (layers are always canvas-sized),
  // so `x`/`y` below is simply the translation applied to that rect's
  // center - there is no separate "layer position" to track.
  //
  // All fields are plain numbers (no derived/cached values) so there is
  // exactly one source of truth: the interactive overlay (handles),
  // the rasterizer (layers.js applyTransformToLayer) and the numeric
  // panel in the UI all read/write these same fields.
  transform: {
    active: false,
    layerId: null,
    mode: 'move', // 'move' | 'scale' | 'rotate' - cosmetic only, kept for the status toast
    originalData: null,
    hasMoved: false,

    x: 0,          // translation X, canvas px
    y: 0,          // translation Y, canvas px
    rotation: 0,   // radians, continuous/unwrapped (never snapped to 0-360)
    scaleX: 1,
    scaleY: 1,
    aspectLocked: false, // persists across activations (user preference)
  },
  
  bg: {
    type: 'theme', // 'theme' | 'solid' | 'checkerboard'
    color: '#1e1e1e',
  },
};

/** Subscribe to any state change. Returns an unsubscribe function. */
function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Notify subscribers that something changed. `topic` is an optional hint
 *  (e.g. 'canvas', 'layers', 'tool') so listeners can skip irrelevant work. */
function emit(topic = 'all') {
  for (const fn of listeners) fn(topic);
}

function getActiveLayer() {
  return state.layers.find((l) => l.id === state.activeLayerId) || null;
}

/** Reset the whole document to a fresh canvas of the given size. */
function resetDocument(width, height) {
  state.canvas.width = width;
  state.canvas.height = height;
  const layer = makeLayer('Layer 1', width, height);
  state.layers = [layer];
  state.activeLayerId = layer.id;
  state.project.dirty = false;
  state.project.galleryId = null;
  
  state.animation.enabled = false;
  state.animation.frames = [];
  state.animation.currentFrame = 0;
  state.animation.fps = 12;
  state.animation.isPlaying = false;
  
  emit('document');
}

function stateAddLayer(name) {
  const { width, height } = state.canvas;
  const layer = makeLayer(name || `Layer ${state.layers.length + 1}`, width, height);
  state.layers.push(layer);
  state.activeLayerId = layer.id;
  emit('layers');
  return layer;
}

function stateRemoveLayer(layerId) {
  if (state.layers.length <= 1) return false; // never remove the last layer
  const i = state.layers.findIndex((l) => l.id === layerId);
  if (i === -1) return false;
  state.layers.splice(i, 1);
  if (state.activeLayerId === layerId) {
    state.activeLayerId = state.layers[Math.max(0, i - 1)].id;
  }
  emit('layers');
  return true;
}

function markDirty() {
  state.project.dirty = true;
  emit('dirty');
}

/** Serialize the document to a plain JSON-friendly object (for save/export). */
function serializeDocument() {
  return {
    version: 1,
    name: state.project.name,
    canvas: { ...state.canvas },
    layers: state.layers.map((l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      locked: l.locked,
      opacity: l.opacity,
      // Store as regular array for JSON safety
      data: Array.from(l.data),
    })),
    activeLayerId: state.activeLayerId,
    palette: state.palette,
    bg: { ...state.bg },
    animation: {
      enabled: state.animation.enabled,
      fps: state.animation.fps,
      currentFrame: state.animation.currentFrame,
      frames: state.animation.frames.map((f) => ({
        layers: f.layers.map((l) => ({
          id: l.id,
          name: l.name,
          visible: l.visible,
          locked: l.locked,
          opacity: l.opacity,
          data: Array.from(l.data),
        })),
      })),
    },
  };
}

/** Load a previously serialized document back into state. */
function loadDocument(doc) {
  state.canvas.width = doc.canvas.width;
  state.canvas.height = doc.canvas.height;
  state.layers = doc.layers.map((l) => ({
    id: l.id,
    name: l.name,
    visible: l.visible !== false,
    locked: !!l.locked,
    opacity: typeof l.opacity === 'number' ? l.opacity : 1,
    data: Uint32Array.from(l.data),
  }));
  state.activeLayerId = doc.activeLayerId || (state.layers[0] && state.layers[0].id);
  state.project.name = doc.name || 'untitled';
  if (doc.palette) state.palette = doc.palette;
  if (doc.bg) state.bg = doc.bg;

  if (doc.animation && Array.isArray(doc.animation.frames) && doc.animation.frames.length) {
    state.animation.enabled = !!doc.animation.enabled;
    state.animation.fps = typeof doc.animation.fps === 'number' ? doc.animation.fps : 12;
    state.animation.frames = doc.animation.frames.map((f) => ({
      layers: f.layers.map((l) => ({
        id: l.id,
        name: l.name,
        visible: l.visible !== false,
        locked: !!l.locked,
        opacity: typeof l.opacity === 'number' ? l.opacity : 1,
        data: Uint32Array.from(l.data),
      })),
    }));
    const savedFrame = doc.animation.currentFrame;
    state.animation.currentFrame = (typeof savedFrame === 'number' && savedFrame >= 0 && savedFrame < state.animation.frames.length)
      ? savedFrame
      : 0;
  } else {
    state.animation.enabled = false;
    state.animation.frames = [];
    state.animation.currentFrame = 0;
    state.animation.fps = 12;
  }

  state.project.dirty = false;
  emit('document');
}


// ---- js/canvas.js ----

/**
 * canvas.js
 * Everything about turning pixel data into something on screen:
 *  - composites all layers into an offscreen native-resolution canvas
 *  - draws that offscreen canvas onto the visible canvas at the current
 *    zoom/pan, with nearest-neighbor scaling so pixels stay crisp
 *  - draws the optional grid overlay
 *  - draws a live shape preview (line/rect/circle) while dragging
 *  - provides screen <-> pixel coordinate mapping used by input.js
 *
 * Rendering is split so the expensive part (compositing layers) only runs
 * when pixel data actually changed, while cheap parts (pan/zoom/grid/
 * preview) can redraw every frame without recompositing.
 */




let viewCanvas, viewCtx;
let offscreen, offscreenCtx;
let compositeDirty = true;
let dirtyRect = null;   // {x0,y0,x1,y1} in canvas pixel space, or null
let fullDirty = true;   // true = next recomposite must cover the whole canvas
let previewPoints = null; // shape-tool live preview
let cursorPixel = null; // {x,y} for hover highlight (desktop only)
let viewportWidth = 0;
let viewportHeight = 0;
let dpr = 1;
let checkerboardCanvas = null;

// Modules that need to redraw something in sync with the canvas (currently
// just the transform overlay's on-screen handles) register here instead of
// canvas.js importing them directly - keeps this module unaware of
// transform-overlay.js while still guaranteeing the overlay never lags a
// frame behind pan/zoom/composite changes, no matter which of the many
// call sites triggered the render.
const afterRenderHooks = [];
function onAfterRender(fn) {
  afterRenderHooks.push(fn);
}

// Reused scratch buffers for compositing. Sized by *capacity* (n = w*h)
// rather than exact w/h, since the dirty-rect's shape changes on every
// stroke tick - matching capacity lets us reuse the same arrays (just
// using the first n slots) instead of reallocating every frame.
let scratch = { capacity: 0, r: null, g: null, b: null, a: null };
function getScratch(w, h) {
  const n = w * h;
  if (scratch.capacity < n) {
    scratch = {
      capacity: n,
      r: new Float32Array(n),
      g: new Float32Array(n),
      b: new Float32Array(n),
      a: new Float32Array(n),
    };
  } else {
    scratch.r.fill(0, 0, n);
    scratch.g.fill(0, 0, n);
    scratch.b.fill(0, 0, n);
    scratch.a.fill(0, 0, n);
  }
  return scratch;
}

function initCanvas(canvasEl) {
  viewCanvas = canvasEl;
  viewCtx = viewCanvas.getContext('2d', { alpha: true, desynchronized: true });
  offscreen = document.createElement('canvas');
  offscreenCtx = offscreen.getContext('2d', { willReadFrequently: true });
  
  // Call syncCanvasSize once up front to set the initial size.
  syncCanvasSize();
  markCompositeDirty();
}

/** Mark part (or all) of the canvas as needing recomposite.
 *  Call with no args to mark everything dirty (safe default - used by
 *  bucket fill, undo/redo, layer add/delete/merge, transforms, etc).
 *  Call with {x0,y0,x1,y1} (pixel-space, x1/y1 exclusive) to mark only
 *  that region - this is what makes drawing on a large canvas fast,
 *  since a brush stroke only touches a tiny area, not the whole image. */
function markCompositeDirty(rect) {
  compositeDirty = true;
  if (!rect) {
    fullDirty = true;
    dirtyRect = null;
    return;
  }
  if (fullDirty) return; // already doing a full recomposite next time
  if (!dirtyRect) {
    dirtyRect = { x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1 };
  } else {
    dirtyRect.x0 = Math.min(dirtyRect.x0, rect.x0);
    dirtyRect.y0 = Math.min(dirtyRect.y0, rect.y0);
    dirtyRect.x1 = Math.max(dirtyRect.x1, rect.x1);
    dirtyRect.y1 = Math.max(dirtyRect.y1, rect.y1);
  }
}

function setPreviewPoints(points) {
  previewPoints = points;
}

function setCursorPixel(p) {
  cursorPixel = p;
}

/** Recompute the composited offscreen image from all visible layers.
 *  Only touches the accumulated dirty rect (or the whole canvas the first
 *  time, or after any operation that doesn't know its bounds). */
function recomposite() {
  const { width, height } = state.canvas;
  if (offscreen.width !== width || offscreen.height !== height) {
    offscreen.width = width;
    offscreen.height = height;
    fullDirty = true;
    dirtyRect = null;
  }

  // Figure out which region actually needs recompositing.
  let rx0 = 0, ry0 = 0, rx1 = width, ry1 = height;
  if (!fullDirty && dirtyRect) {
    rx0 = Math.max(0, Math.floor(dirtyRect.x0));
    ry0 = Math.max(0, Math.floor(dirtyRect.y0));
    rx1 = Math.min(width, Math.ceil(dirtyRect.x1));
    ry1 = Math.min(height, Math.ceil(dirtyRect.y1));
    if (rx1 <= rx0 || ry1 <= ry0) {
      // Nothing in bounds (e.g. stroke happened entirely off-canvas) - skip.
      dirtyRect = null;
      compositeDirty = false;
      return;
    }
  }
  const rw = rx1 - rx0;
  const rh = ry1 - ry0;
  const rn = rw * rh;

  const imageData = offscreenCtx.createImageData(rw, rh);
  const out = imageData.data; // Uint8ClampedArray, RGBA per pixel

  // Running composited float buffers for correct alpha-over blending,
  // sized to just the dirty region (reused across calls).
  const buf = getScratch(rw, rh);
  const outR = buf.r, outG = buf.g, outB = buf.b, outA = buf.a;

  for (const layer of state.layers) {
    if (!layer.visible) continue;
    const opacity = layer.opacity;
    for (let ly = 0; ly < rh; ly++) {
      const srcRowBase = (ry0 + ly) * width + rx0;
      const dstRowBase = ly * rw;
      for (let lx = 0; lx < rw; lx++) {
        const i = dstRowBase + lx;
        const packed = layer.data[srcRowBase + lx];
        const srcA = ((packed >>> 24) & 0xff) / 255 * opacity;
        if (srcA <= 0) continue;
        const srcR = packed & 0xff;
        const srcG = (packed >>> 8) & 0xff;
        const srcB = (packed >>> 16) & 0xff;
        const prevA = outA[i];
        const newA = srcA + prevA * (1 - srcA);
        if (newA <= 0) continue;
        outR[i] = (srcR * srcA + outR[i] * prevA * (1 - srcA)) / newA;
        outG[i] = (srcG * srcA + outG[i] * prevA * (1 - srcA)) / newA;
        outB[i] = (srcB * srcA + outB[i] * prevA * (1 - srcA)) / newA;
        outA[i] = newA;
      }
    }
  }

  for (let i = 0; i < rn; i++) {
    const o = i * 4;
    out[o] = outR[i];
    out[o + 1] = outG[i];
    out[o + 2] = outB[i];
    out[o + 3] = Math.round(outA[i] * 255);
  }

  offscreenCtx.putImageData(imageData, rx0, ry0);
  compositeDirty = false;
  fullDirty = false;
  dirtyRect = null;
}

/** Resize the visible canvas's backing store to match its CSS size and DPR.
 *  Called only on resize or when a panel opens/closes - never every frame. */
function syncCanvasSize() {
  const rect = viewCanvas.getBoundingClientRect();
  const newDpr = Math.min(window.devicePixelRatio || 1, 2);
  const newW = Math.max(1, Math.round(rect.width * newDpr));
  const newH = Math.max(1, Math.round(rect.height * newDpr));
  
  if (viewCanvas.width !== newW || viewCanvas.height !== newH || dpr !== newDpr) {
    viewCanvas.width = newW;
    viewCanvas.height = newH;
    viewportWidth = rect.width;
    viewportHeight = rect.height;
    dpr = newDpr;
    return true; // เปลี่ยนขนาด
  }
  return false; // ขนาดเท่าเดิม
}

/** Main render entry point. Cheap to call often (e.g. on every pointermove). */
/** Main render entry point. Cheap to call often (e.g. on every pointermove). */
function render() {
  if (!viewCanvas) return;
  if (compositeDirty) recomposite();

  const w = viewportWidth || viewCanvas.getBoundingClientRect().width;
  const h = viewportHeight || viewCanvas.getBoundingClientRect().height;
  
  viewCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  viewCtx.imageSmoothingEnabled = false;
  viewCtx.clearRect(0, 0, w, h);

  const { zoom, panX, panY, gridVisible } = state.view;
  const { width, height } = state.canvas;
  
  const startX = Math.max(0, Math.floor(-panX / zoom));
  const endX = Math.min(width, Math.ceil((w - panX) / zoom));
  const startY = Math.max(0, Math.floor(-panY / zoom));
  const endY = Math.min(height, Math.ceil((h - panY) / zoom));

  // 1. Draw the checkerboard background first.
  drawCheckerboard(panX, panY, width * zoom, height * zoom, zoom);

  // 2. Draw the onion skin (previous frame) on top of the background.
  // Skipped during playback: onion skin exists to help trace over the
  // previous frame while "editing" that frame - if left on during preview
  // it would show a faint double image on every frame instead of a clean animation.
  if (!state.animation.isPlaying && state.animation.enabled && state.animation.frames.length > 0) {
    const frames = state.animation.frames;
    const current = state.animation.currentFrame;
    
    // Previous frame at 50% opacity.
    if (current > 0 && frames[current - 1]) {
      const prevLayers = frames[current - 1].layers;
      drawOnionSkin(prevLayers, panX, panY, width, height, zoom, 0.5);
    }
  }

  // 3. Draw the current image (visible region only) over the onion skin.
  viewCtx.save();
  viewCtx.beginPath();
  viewCtx.rect(panX, panY, width * zoom, height * zoom);
  viewCtx.clip();
  
  const visibleStartX = Math.max(0, Math.floor(-panX / zoom));
  const visibleStartY = Math.max(0, Math.floor(-panY / zoom));
  const visibleEndX = Math.min(width, Math.ceil((w - panX) / zoom));
  const visibleEndY = Math.min(height, Math.ceil((h - panY) / zoom));
  
  const srcX = visibleStartX;
  const srcY = visibleStartY;
  const srcW = visibleEndX - visibleStartX;
  const srcH = visibleEndY - visibleStartY;
  
  if (srcW > 0 && srcH > 0) {
    viewCtx.drawImage(
      offscreen,
      srcX, srcY, srcW, srcH,
      panX + srcX * zoom, panY + srcY * zoom,
      srcW * zoom, srcH * zoom
    );
  }
  viewCtx.restore();

  // ✅ 4. Grid, Border, Preview, Cursor
  if (gridVisible && zoom >= 1.5) {
    drawGrid(panX, panY, width, height, zoom, w, h, startX, endX, startY, endY);
  }

  drawCanvasBorder(panX, panY, width * zoom, height * zoom);

  if (previewPoints && previewPoints.length) {
    drawPreview(previewPoints, panX, panY, zoom, startX, endX, startY, endY);
  }

  if (cursorPixel) {
    drawCursorHighlight(cursorPixel, panX, panY, zoom);
  }

  for (const hook of afterRenderHooks) hook();
}

function drawCheckerboard(panX, panY, w, h, zoom) {
  const { type, color } = state.bg;
  viewCtx.save();
  
  if (type === 'theme') {
    const isDark = !document.body.classList.contains('light-mode');
    viewCtx.fillStyle = isDark ? '#1e1e1e' : '#e8e8e8';
    viewCtx.fillRect(panX, panY, w, h);
  } 
  else if (type === 'solid') {
    viewCtx.fillStyle = color;
    viewCtx.fillRect(panX, panY, w, h);
  } 
  else { // 'checkerboard'
    // Only rebuild the pattern when it doesn't exist yet or the canvas
    // size changed (not every frame - redrawing the whole pattern on every
    //  pan/zoom used to stall on large canvases). rebuildCheckerboard() can
    //  still force a rebuild directly when truly needed, e.g. toggling dark mode.
    if (!checkerboardCanvas ||
        checkerboardCanvas.width !== state.canvas.width ||
        checkerboardCanvas.height !== state.canvas.height) {
      buildCheckerboard();
    }
    
    // Draw the cached checkerboard, scaled by the current zoom and pan.
    viewCtx.drawImage(
      checkerboardCanvas,
      0, 0, state.canvas.width, state.canvas.height,  // source
      panX, panY, state.canvas.width * zoom, state.canvas.height * zoom  // dest
    );
  }
  viewCtx.restore();
}

/**
 * Builds a checkerboard pattern sized to exactly match the canvas.
 * Tile size is 8x8 pixels (adjustable).
 */
function buildCheckerboard() {
  const { width, height } = state.canvas;
  
  // Create the canvas if it doesn't exist yet, or if the size changed.
  if (!checkerboardCanvas || checkerboardCanvas.width !== width || checkerboardCanvas.height !== height) {
    checkerboardCanvas = document.createElement('canvas');
    checkerboardCanvas.width = width;
    checkerboardCanvas.height = height;
  }
  
  const ctx = checkerboardCanvas.getContext('2d');
  
  // Colors based on the current theme.
  const isDark = document.body.classList.contains('light-mode') ? false : true;
  const color1 = isDark ? '#2a2a2a' : '#e0e0e0';
  const color2 = isDark ? '#3a3a3a' : '#d0d0d0';
  
  const size = 8; // ขนาดช่องตาราง 8x8 (ปรับเป็น 4 หรือ 16 ได้)
  
  // Fill the background with the first color.
  ctx.fillStyle = color1;
  ctx.fillRect(0, 0, width, height);
  
  // Draw the darker tiles.
  ctx.fillStyle = color2;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      // Check whether this tile is the darker one (alternating).
      if ((Math.floor(x / size) + Math.floor(y / size)) % 2 === 0) {
        ctx.fillRect(x, y, size, size);
      }
    }
  }
}

function drawGrid(panX, panY, width, height, zoom, cssWidth, cssHeight, startX, endX, startY, endY) {
  viewCtx.save();
  viewCtx.strokeStyle = 'rgba(255,255,255,0.15)';
  viewCtx.lineWidth = 1;
  viewCtx.beginPath();
  
  // Only draw grid lines within the visible viewport.
  const xStart = Math.max(0, startX);
  const xEnd = Math.min(width, endX);
  const yStart = Math.max(0, startY);
  const yEnd = Math.min(height, endY);
  
  // Vertical lines (x axis).
  for (let x = xStart; x <= xEnd; x++) {
    const sx = Math.round(panX + x * zoom) + 0.5;
    // Skip lines that are actually off-screen.
    if (sx < -2 || sx > cssWidth + 2) continue;
    viewCtx.moveTo(sx, Math.max(0, panY));
    viewCtx.lineTo(sx, Math.min(cssHeight, panY + height * zoom));
  }
  // Horizontal lines (y axis).
  for (let y = yStart; y <= yEnd; y++) {
    const sy = Math.round(panY + y * zoom) + 0.5;
    if (sy < -2 || sy > cssHeight + 2) continue;
    viewCtx.moveTo(Math.max(0, panX), sy);
    viewCtx.lineTo(Math.min(cssWidth, panX + width * zoom), sy);
  }
  viewCtx.stroke();
  viewCtx.restore();
}

function drawCanvasBorder(panX, panY, w, h) {
  viewCtx.save();
  viewCtx.strokeStyle = 'rgba(255,255,255,0.4)';
  viewCtx.lineWidth = 1;
  viewCtx.strokeRect(panX + 0.5, panY + 0.5, w - 1, h - 1);
  viewCtx.restore();
}

function drawPreview(points, panX, panY, zoom, startX, endX, startY, endY) {
  viewCtx.save();
  const [r, g, b, a] = unpackRGBA(state.primaryColor);
  viewCtx.fillStyle = `rgba(${r},${g},${b},${Math.max(0.5, a / 255)})`;
  for (const p of points) {
    // Only draw points that fall within the visible viewport.
    if (p.x >= startX && p.x <= endX && p.y >= startY && p.y <= endY) {
      viewCtx.fillRect(panX + p.x * zoom, panY + p.y * zoom, zoom, zoom);
    }
  }
  viewCtx.restore();
}

function drawCursorHighlight(p, panX, panY, zoom) {
  viewCtx.save();
  viewCtx.strokeStyle = 'rgba(255,255,255,0.9)';
  viewCtx.lineWidth = 1;
  viewCtx.strokeRect(panX + p.x * zoom + 0.5, panY + p.y * zoom + 0.5, zoom - 1, zoom - 1);
  viewCtx.restore();
}

/** Convert a client (CSS pixel) coordinate to integer canvas pixel coords. */
function screenToPixel(clientX, clientY) {
  const rect = viewCanvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const { zoom, panX, panY } = state.view;
  return {
    x: Math.floor((x - panX) / zoom),
    y: Math.floor((y - panY) / zoom),
  };
}

/** Get the canvas's on-screen bounding rect (for input hit-testing). */
function getCanvasRect() {
  return viewCanvas.getBoundingClientRect();
}

/**
 * DOMMatrix mapping canvas-pixel space -> screen (client/CSS pixel) space,
 * i.e. the current pan+zoom, expressed with getBoundingClientRect() as the
 * origin. This is the single place pan/zoom get turned into a matrix, so
 * the transform overlay and the input handlers can never disagree about
 * where the canvas actually is on screen.
 */
function getViewMatrix() {
  const rect = viewCanvas.getBoundingClientRect();
  const { zoom, panX, panY } = state.view;
  return new DOMMatrix()
    .translate(rect.left, rect.top)
    .translate(panX, panY)
    .scale(zoom);
}

/** Convert a client (CSS pixel) coordinate to FLOAT canvas-pixel coords
 *  (no flooring). Used by the transform system, where sub-pixel precision
 *  during a drag avoids the "jumps" caused by snapping to an integer grid
 *  at low zoom levels. `screenToPixel` above is kept as-is for painting,
 *  where snapping to the pixel grid is exactly what's wanted. */
function screenToCanvasFloat(clientX, clientY) {
  const inv = getViewMatrix().inverse();
  const p = inv.transformPoint(new DOMPoint(clientX, clientY));
  return { x: p.x, y: p.y };
}

/** Produce a standalone canvas with the final composited image, optionally
 *  scaled up by an integer factor and/or flattened onto an opaque background.
 *  Used by export.js so exporting never depends on the live view's zoom/pan. */
function exportCanvas(scale = 1, background = null) {
  if (compositeDirty) recomposite();
  const { width, height } = state.canvas;
  const out = document.createElement('canvas');
  out.width = width * scale;
  out.height = height * scale;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.drawImage(offscreen, 0, 0, width, height, 0, 0, out.width, out.height);
  return out;
}

/** Center the canvas in the viewport at a given zoom (used on load/new/resize). */
function fitAndCenter() {
  const rect = viewCanvas.getBoundingClientRect();
  const { width, height } = state.canvas;
  const margin = 40; // เพิ่ม margin ให้เห็นพื้นที่รอบๆ
  
  const availW = rect.width - margin * 2;
  const availH = rect.height - margin * 2;
  
  // Compute a zoom level that fits the viewport.
  let zoom = Math.min(availW / width, availH / height);
  
  // Allow zooming out down to 0.1 (was previously 1), with finer
  // decimal precision on the zoom value.
  zoom = Math.floor(zoom * 10) / 10;
  zoom = Math.max(0.1, Math.min(zoom, 48));
  
  state.view.zoom = zoom;
  state.view.panX = (rect.width - width * zoom) / 2;
  state.view.panY = (rect.height - height * zoom) / 2;
  
  markCompositeDirty();
  syncCanvasSize();
}

/** Called when the layout changes (tool options shown/hidden) so the canvas resizes to match the UI. */
function resizeViewport() {
  syncCanvasSize();
  render();
}

function rebuildCheckerboard() {
  if (state.bg.type === 'checkerboard') {
    buildCheckerboard();
  }
}

/**
 * Draws an onion-skin frame at the given opacity (0-1).
 */
function drawOnionSkin(layersData, panX, panY, canvasW, canvasH, zoom, opacity) {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvasW;
  tempCanvas.height = canvasH;
  const tempCtx = tempCanvas.getContext('2d');
  
  const imageData = tempCtx.createImageData(canvasW, canvasH);
  const out = imageData.data;
  const n = canvasW * canvasH;
  
  const outR = new Float32Array(n);
  const outG = new Float32Array(n);
  const outB = new Float32Array(n);
  const outA = new Float32Array(n);
  
  for (const layer of layersData) {
    if (!layer.visible) continue;
    const layerOpacity = layer.opacity;
    for (let i = 0; i < n; i++) {
      const packed = layer.data[i];
      const srcA = ((packed >>> 24) & 0xff) / 255 * layerOpacity * opacity;
      if (srcA <= 0) continue;
      const srcR = packed & 0xff;
      const srcG = (packed >>> 8) & 0xff;
      const srcB = (packed >>> 16) & 0xff;
      const prevA = outA[i];
      const newA = srcA + prevA * (1 - srcA);
      if (newA <= 0) continue;
      outR[i] = (srcR * srcA + outR[i] * prevA * (1 - srcA)) / newA;
      outG[i] = (srcG * srcA + outG[i] * prevA * (1 - srcA)) / newA;
      outB[i] = (srcB * srcA + outB[i] * prevA * (1 - srcA)) / newA;
      outA[i] = newA;
    }
  }
  
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[o] = outR[i];
    out[o + 1] = outG[i];
    out[o + 2] = outB[i];
    out[o + 3] = Math.round(outA[i] * 255);
  }
  
  tempCtx.putImageData(imageData, 0, 0);
  
  // Use globalAlpha to fade the onion skin frame.
  viewCtx.save();
  viewCtx.globalAlpha = opacity;  // 0.5 = 50%
  viewCtx.imageSmoothingEnabled = false;
  viewCtx.drawImage(
    tempCanvas,
    0, 0, canvasW, canvasH,
    panX, panY, canvasW * zoom, canvasH * zoom
  );
  viewCtx.restore();
}

// ---- js/palette.js ----

/**
 * palette.js
 * Manages the user's color palette: a custom swatch list, an automatic
 * "recently used" strip, and starred favorites. Colors are stored as
 * #rrggbb hex strings here (display-friendly); tools.js/state.js work with
 * packed RGBA ints, so conversions happen at the boundary via utils.js.
 */




const MAX_RECENT = 16;

function addRecentColor(packedColor) {
  const hex = packedToHex(packedColor);
  const recent = state.palette.recent.filter((c) => c !== hex);
  recent.unshift(hex);
  state.palette.recent = recent.slice(0, MAX_RECENT);
  emit('palette');
}

function addCustomColor(hex) {
  if (!state.palette.custom.includes(hex)) {
    state.palette.custom.push(hex);
    emit('palette');
  }
}

function removeCustomColor(hex) {
  state.palette.custom = state.palette.custom.filter((c) => c !== hex);
  emit('palette');
}

function toggleFavorite(hex) {
  const favorites = state.palette.favorites;
  const i = favorites.indexOf(hex);
  if (i === -1) favorites.push(hex);
  else favorites.splice(i, 1);
  emit('palette');
}

function isFavorite(hex) {
  return state.palette.favorites.includes(hex);
}

/** Default starter swatches shown the very first time a project is created. */
const DEFAULT_SWATCHES = [
  '#000000', '#1d1d1d', '#5a5a5a', '#ffffff',
  '#ff004d', '#ff7b00', '#ffec27', '#00e436',
  '#29adff', '#83769c', '#7e2553', '#ab5236',
];

function exportPaletteJSON() {
  const payload = {
    custom: state.palette.custom,
    favorites: state.palette.favorites,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'palette.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Import a palette JSON file (as produced by exportPaletteJSON) and merge
 *  its colors into the custom swatch list. */
function importPaletteJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const incoming = Array.isArray(data.custom) ? data.custom : Array.isArray(data) ? data : [];
        for (const hex of incoming) {
          if (typeof hex === 'string' && !state.palette.custom.includes(hex)) {
            state.palette.custom.push(hex);
          }
        }
        if (Array.isArray(data.favorites)) {
          for (const hex of data.favorites) {
            if (!state.palette.favorites.includes(hex)) state.palette.favorites.push(hex);
          }
        }
        emit('palette');
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}


// ---- js/tools.js ----

/**
 * tools.js
 * All drawing-tool logic lives here, decoupled from rendering and input.
 * Every function operates on a layer's Uint32Array pixel buffer and plain
 * (x, y) integer pixel coordinates. Nothing here touches the DOM or canvas.
 */





const TOOLS = [
  'pencil',
  'eraser',
  'bucket',
  'line',
  'rect',
  'circle',
  'eyedropper',
  'pan',
];

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < state.canvas.width && y < state.canvas.height;
}

/** Set a single pixel (with optional brush size, stamping a square) on a layer. */
function stampPixel(layer, x, y, color, brushSize = 1) {
  if (!layer || layer.locked) return;
  const { width, height } = state.canvas;
  const half = Math.floor(brushSize / 2);
  for (let dy = 0; dy < brushSize; dy++) {
    for (let dx = 0; dx < brushSize; dx++) {
      const px = x - half + dx;
      const py = y - half + dy;
      if (inBounds(px, py)) {
        layer.data[idx(px, py, width)] = color;
      }
    }
  }
}

/**
 * Paint a stroke with the given brush size.
 * - If brushSize === 1: pixel‑perfect line (Bresenham, one pixel at a time)
 * - If brushSize > 1: draw solid square blocks of size brushSize, stepping
 *   every half‑brush so blocks overlap and form a continuous stroke.
 *   Each pixel is painted only if its current color differs from the new color.
 */
function paintStroke(layer, points, color, brushSize = 1) {
  if (!layer || layer.locked || points.length === 0) return;
  if (color !== 0) addRecentColor(color);

  const { width, height } = state.canvas;

  // ---- Helper: stamp a block (brushSize x brushSize) at (cx, cy) ----
  // Only overwrite pixels that are NOT already the target color.
  function stampBlock(cx, cy) {
    const half = Math.floor(brushSize / 2);
    for (let dy = 0; dy < brushSize; dy++) {
      for (let dx = 0; dx < brushSize; dx++) {
        const px = cx - half + dx;
        const py = cy - half + dy;
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const i = idx(px, py, width);
          // Only overwrite when the current color differs from the target color.
          if (layer.data[i] !== color) {
            layer.data[i] = color;
          }
        }
      }
    }
  }

  // ---- Brush size 1: use original pixel‑perfect logic ----
  if (brushSize === 1) {
    if (points.length === 1) {
      stampPixel(layer, points[0].x, points[0].y, color, 1);
      return;
    }
    let prev = points[0];
    for (let i = 1; i < points.length; i++) {
      const cur = points[i];
      const linePoints = bresenhamLine(prev.x, prev.y, cur.x, cur.y);
      for (const p of linePoints) {
        stampPixel(layer, p.x, p.y, color, 1);
      }
      prev = cur;
    }
    return;
  }

  // ---- Brush size > 1: block‑based stroke ----
  const step = Math.max(1, Math.floor(brushSize / 2)); // half‑brush step

  if (points.length === 1) {
    stampBlock(points[0].x, points[0].y);
    return;
  }

  let prev = points[0];
  stampBlock(prev.x, prev.y);

  for (let i = 1; i < points.length; i++) {
    const cur = points[i];
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    if (dist === 0) continue;

    const steps = Math.max(1, Math.floor(dist / step));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const px = Math.round(prev.x + dx * t);
      const py = Math.round(prev.y + dy * t);
      stampBlock(px, py);
    }
    prev = cur;
  }
}

/** Flood fill starting at (x, y) with `color`. 4-directional, tolerant of
 *  exact-color matching (pixel art doesn't need fuzzy thresholds). */
function floodFill(layer, x, y, color) {
  if (!layer || layer.locked) return;
  
  // Save the last-used color.
  if (color !== 0) {
    addRecentColor(color);
  }
  
  const { width, height } = state.canvas;
  if (!inBounds(x, y)) return;
  const start = idx(x, y, width);
  const target = layer.data[start];
  if (target === color) return; // nothing to do

  const stack = [[x, y]];
  const visited = new Uint8Array(width * height);
  visited[start] = 1;

  while (stack.length) {
    const [cx, cy] = stack.pop();
    const i = idx(cx, cy, width);
    if (layer.data[i] !== target) continue;
    layer.data[i] = color;

    const neighbors = [
      [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (!inBounds(nx, ny)) continue;
      const ni = idx(nx, ny, width);
      if (!visited[ni] && layer.data[ni] === target) {
        visited[ni] = 1;
        stack.push([nx, ny]);
      }
    }
  }
}

/** Compute preview points for a shape tool without mutating the layer.
 *  `shape` is 'line' | 'rect' | 'circle'. 
 *  `brushSize` controls the stroke thickness. */
function shapePreviewPoints(shape, x0, y0, x1, y1, filled, brushSize = 1) {
  if (shape === 'line') {
    // Straight line: bresenham + thickness.
    const points = bresenhamLine(x0, y0, x1, y1);
    if (brushSize === 1) return points;
    // Expand to the requested thickness.
    return expandPoints(points, brushSize);
  }
  if (shape === 'rect') {
    const points = rectPoints(x0, y0, x1, y1, filled);
    if (brushSize === 1 || filled) return points;
    return expandPoints(points, brushSize);
  }
  if (shape === 'circle') {
    const radius = Math.round(Math.hypot(x1 - x0, y1 - y0));
    const points = circlePoints(x0, y0, radius, filled);
    if (brushSize === 1 || filled) return points;
    return expandPoints(points, brushSize);
  }
  return [];
}

/** Expands a set of points to the given stroke thickness. */
function expandPoints(points, brushSize) {
  if (brushSize <= 1 || points.length === 0) return points;
  const result = [];
  const half = Math.floor(brushSize / 2);
  const seen = new Set();
  
  for (const p of points) {
    for (let dy = -half; dy < brushSize - half; dy++) {
      for (let dx = -half; dx < brushSize - half; dx++) {
        const px = p.x + dx;
        const py = p.y + dy;
        const key = px + ',' + py;
        if (!seen.has(key) && inBounds(px, py)) {
          seen.add(key);
          result.push({ x: px, y: py });
        }
      }
    }
  }
  return result;
}

/** Commit a shape's points onto the layer with the given color. */
function stampPoints(layer, points, color) {
  if (!layer || layer.locked) return;
  
  // Save the last-used color.
  if (color !== 0 && points.length > 0) {
    addRecentColor(color);
  }

  const { width } = state.canvas;
  for (const p of points) {
    if (inBounds(p.x, p.y)) layer.data[idx(p.x, p.y, width)] = color;
  }
}

/** Eyedropper: read the composited color visible at (x, y) across all
 *  visible layers (topmost non-transparent wins), used to set the active color. */
function pickColor(layers, x, y) {
  const { width, height } = state.canvas;
  if (!inBounds(x, y)) return null;
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!layer.visible) continue;
    const c = layer.data[idx(x, y, width)];
    const alpha = (c >>> 24) & 0xff;
    if (alpha > 0) return c;
  }
  return 0; // fully transparent
}

/** Convenience: mark the project as modified after a tool action commits. */
function afterMutation() {
  markDirty();
}

// ===== Pixel Perfect Streaming State (brushSize === 1 only) =====
let pp = null;

function ppReset() {
  pp = { confirmed: null, pending: null, pendingPrevColor: 0, pendingInBounds: false };
}

function isRedundantElbow(a, b, c) {
  if (a.x === c.x || a.y === c.y) return false;
  return (b.x === a.x && b.y === c.y) || (b.x === c.x && b.y === a.y);
}

function ppStampProvisional(layer, p, color, width) {
  const within = inBounds(p.x, p.y);
  pp.pending = p;
  pp.pendingInBounds = within;
  if (within) {
    const i = idx(p.x, p.y, width);
    pp.pendingPrevColor = layer.data[i];
    layer.data[i] = color;
  }
}

function ppRetractPending(layer, width) {
  if (pp.pendingInBounds) {
    layer.data[idx(pp.pending.x, pp.pending.y, width)] = pp.pendingPrevColor;
  }
}

function ppFeed(layer, point, color, width) {
  if (pp.pending === null) {
    ppStampProvisional(layer, point, color, width);
    return;
  }
  const a = pp.confirmed;
  const b = pp.pending;
  const c = point;
  if (a && isRedundantElbow(a, b, c)) {
    ppRetractPending(layer, width);
  } else {
    pp.confirmed = b;
  }
  ppStampProvisional(layer, c, color, width);
}

// ---- js/history.js ----

/**
 * history.js
 * Snapshot-based undo/redo. We snapshot the full layer stack's pixel data
 * (cheap enough at pixel-art resolutions, even 256x256 with several layers)
 * before a mutation begins, and can restore it on undo. This is far simpler
 * and less bug-prone than per-pixel diffing, at a small memory cost that is
 * bounded by MAX_HISTORY.
 */



const MAX_HISTORY = 40;

let undoStack = [];
let redoStack = [];
let pendingSnapshot = null;

function snapshotLayers() {
  return state.layers.map((l) => ({
    id: l.id,
    name: l.name,
    visible: l.visible,
    locked: l.locked,
    opacity: l.opacity,
    data: l.data.slice(),
  }));
}

function restoreLayers(snapshot) {
  state.layers = snapshot.map((l) => ({
    id: l.id,
    name: l.name,
    visible: l.visible,
    locked: l.locked,
    opacity: l.opacity,
    data: l.data.slice(),
  }));
  if (!state.layers.find((l) => l.id === state.activeLayerId)) {
    state.activeLayerId = state.layers[0] ? state.layers[0].id : null;
  }
}

/** Call before a stroke/operation starts mutating pixels. */
function beginAction() {
  pendingSnapshot = snapshotLayers();
}

/** Call after a stroke/operation finishes. Pushes the *pre*-action state
 *  onto the undo stack so it can be restored later. */
function commitAction() {
  if (!pendingSnapshot) return;
  undoStack.push(pendingSnapshot);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
  pendingSnapshot = null;
  emit('history');
}

/** Abort a stroke/operation that was already begun (beginAction) but should
 *  not be kept - e.g. a single-finger stroke that turns into a two-finger
 *  pan/zoom gesture partway through. Restores pixel data to exactly how it
 *  was before the action started, so the pixels painted during that first
 *  instant (before the second finger landed) don't get left behind as
 *  stray dots. Discarding the snapshot without restoring would leave
 *  whatever pixels were already mutated in place, which is the bug this
 *  guards against. */
function cancelAction() {
  if (pendingSnapshot) {
    restoreLayers(pendingSnapshot);
    emit('document');
  }
  pendingSnapshot = null;
}

function canUndo() {
  return undoStack.length > 0;
}

function canRedo() {
  return redoStack.length > 0;
}

function undo() {
  if (!undoStack.length) return false;
  const prev = undoStack.pop();
  redoStack.push(snapshotLayers());
  restoreLayers(prev);
  emit('document');
  return true;
}

function redo() {
  if (!redoStack.length) return false;
  const next = redoStack.pop();
  undoStack.push(snapshotLayers());
  restoreLayers(next);
  emit('document');
  return true;
}

/** Clear all history (e.g. after loading a new document). */
function resetHistory() {
  undoStack = [];
  redoStack = [];
  pendingSnapshot = null;
  emit('history');
}


// ---- js/storage.js ----

/**
 * storage.js
 * All localStorage read/write lives here. Two concerns:
 *  1. Autosave - a single always-current slot, debounced so rapid strokes
 *     don't hammer localStorage.
 *  2. Named projects - an explicit "Save As" library the user can browse
 *     and reopen, stored as a name -> serialized-document map.
 */




const AUTOSAVE_KEY = 'pixelEditor.autosave.v1';
const PROJECTS_KEY = 'pixelEditor.projects.v1';

function safeGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('Storage read failed for', key, err);
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn('Storage write failed for', key, err);
    return false;
  }
}

const autosaveListeners = new Set();

/** Register a callback to run every time an autosave happens (immediate or
 *  debounced). Used by the gallery system to keep its saved copy in sync
 *  with whatever the user is currently drawing. Returns an unsubscribe fn. */
function onAutosave(fn) {
  autosaveListeners.add(fn);
  return () => autosaveListeners.delete(fn);
}

function saveAutosave() {
  const doc = serializeDocument();
  doc.savedAt = Date.now();
  const ok = safeSet(AUTOSAVE_KEY, doc);
  for (const fn of autosaveListeners) fn();
  return ok;
}

const scheduleAutosave = debounce(saveAutosave, 700);

function loadAutosave() {
  return safeGet(AUTOSAVE_KEY);
}

function clearAutosave() {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch (err) {
    /* ignore */
  }
}

function readProjects() {
  return safeGet(PROJECTS_KEY) || {};
}

/** Save the current document under a project name (overwrites if it exists). */
function saveProjectAs(name) {
  const projects = readProjects();
  const doc = serializeDocument();
  doc.name = name;
  doc.savedAt = Date.now();
  projects[name] = doc;
  state.project.name = name;
  return safeSet(PROJECTS_KEY, projects);
}

/** List saved projects with light metadata, newest first. */
function listProjects() {
  const projects = readProjects();
  return Object.values(projects)
    .map((p) => ({
      name: p.name,
      savedAt: p.savedAt || 0,
      width: p.canvas ? p.canvas.width : 0,
      height: p.canvas ? p.canvas.height : 0,
    }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

function loadProject(name) {
  const projects = readProjects();
  return projects[name] || null;
}

function deleteProject(name) {
  const projects = readProjects();
  delete projects[name];
  return safeSet(PROJECTS_KEY, projects);
}

/** Wipe every saved project (used by Settings > clear all data). */
function clearAllProjects() {
  try {
    localStorage.removeItem(PROJECTS_KEY);
  } catch (err) {
    /* ignore */
  }
}


// ---- js/layers.js ----

/**
 * layers.js
 * Higher-level layer operations that build on the primitives in state.js
 * (addLayer/removeLayer). Anything that rearranges or combines layers
 * lives here, keeping state.js focused on plain data storage.
 *
 * Transform functions: move/scale/rotate a layer interactively.
 */





// Hard bounds so a drag/pinch gesture can never produce a zero, negative,
// or absurdly large scale (spec bugs #10/#11: "negative scale",
// "size becomes 0"). Chosen so the layer stays visible/manipulable at both ends.
// Exported so every gesture handler (single-finger handles, two-finger
// pinch) clamps to the exact same bounds - one source of truth.
const TRANSFORM_MIN_SCALE = 0.02;
const TRANSFORM_MAX_SCALE = 40;
const MIN_SCALE = TRANSFORM_MIN_SCALE;
const MAX_SCALE = TRANSFORM_MAX_SCALE;

// ============================================================
// BASIC LAYER OPERATIONS
// ============================================================

function addLayer(name) {
  const layer = addLayerBase(name);
  markCompositeDirty();
  markDirty();
  return layer;
}

function removeLayer(layerId) {
  const ok = removeLayerBase(layerId);
  if (ok) { markCompositeDirty(); markDirty(); }
  return ok;
}

function renameLayer(layerId, name) {
  const layer = state.layers.find((l) => l.id === layerId);
  if (!layer) return;
  layer.name = name;
  emit('layers');
  markDirty();
}

function toggleVisibility(layerId) {
  const layer = state.layers.find((l) => l.id === layerId);
  if (!layer) return;
  layer.visible = !layer.visible;
  markCompositeDirty();
  emit('layers');
  markDirty();
}

function toggleLock(layerId) {
  const layer = state.layers.find((l) => l.id === layerId);
  if (!layer) return;
  layer.locked = !layer.locked;
  emit('layers');
}

function setOpacity(layerId, opacity) {
  const layer = state.layers.find((l) => l.id === layerId);
  if (!layer) return;
  layer.opacity = Math.max(0, Math.min(1, opacity));
  markCompositeDirty();
  emit('layers');
  markDirty();
}

function moveLayer(layerId, direction) {
  const i = state.layers.findIndex((l) => l.id === layerId);
  if (i === -1) return;
  const j = i + direction;
  if (j < 0 || j >= state.layers.length) return;
  const [layer] = state.layers.splice(i, 1);
  state.layers.splice(j, 0, layer);
  markCompositeDirty();
  emit('layers');
  markDirty();
}

function duplicateLayer(layerId) {
  const i = state.layers.findIndex((l) => l.id === layerId);
  if (i === -1) return null;
  const src = state.layers[i];
  const copy = {
    id: uid('layer'),
    name: `${src.name} copy`,
    visible: src.visible,
    locked: false,
    opacity: src.opacity,
    data: src.data.slice(),
  };
  state.layers.splice(i + 1, 0, copy);
  state.activeLayerId = copy.id;
  markCompositeDirty();
  emit('layers');
  markDirty();
  return copy;
}

function mergeDown(layerId) {
  const i = state.layers.findIndex((l) => l.id === layerId);
  if (i <= 0) return false;
  const top = state.layers[i];
  const bottom = state.layers[i - 1];
  const n = top.data.length;
  for (let p = 0; p < n; p++) {
    const src = top.data[p];
    const srcA = ((src >>> 24) & 0xff) / 255 * top.opacity;
    if (srcA <= 0) continue;
    const dst = bottom.data[p];
    const dstA = ((dst >>> 24) & 0xff) / 255;
    const srcR = src & 0xff, srcG = (src >>> 8) & 0xff, srcB = (src >>> 16) & 0xff;
    const dstR = dst & 0xff, dstG = (dst >>> 8) & 0xff, dstB = (dst >>> 16) & 0xff;
    const outA = srcA + dstA * (1 - srcA);
    const outR = outA > 0 ? (srcR * srcA + dstR * dstA * (1 - srcA)) / outA : 0;
    const outG = outA > 0 ? (srcG * srcA + dstG * dstA * (1 - srcA)) / outA : 0;
    const outB = outA > 0 ? (srcB * srcA + dstB * dstA * (1 - srcA)) / outA : 0;
    bottom.data[p] =
      ((Math.round(outA * 255) << 24) |
        (Math.round(outB) << 16) |
        (Math.round(outG) << 8) |
        Math.round(outR)) >>> 0;
  }
  state.layers.splice(i, 1);
  if (state.activeLayerId === top.id) state.activeLayerId = bottom.id;
  markCompositeDirty();
  emit('layers');
  markDirty();
  return true;
}

// ============================================================
// TRANSFORM FUNCTIONS (Move/Scale/Rotate)
// ============================================================

// Reusable temporary canvas for transform operations
let tempCanvas = null;
let tempCtx = null;

function getTempCanvas(width, height) {
  if (!tempCanvas || tempCanvas.width !== width || tempCanvas.height !== height) {
    tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    tempCtx = tempCanvas.getContext('2d');
  }
  return { canvas: tempCanvas, ctx: tempCtx };
}

/**
 * Activate transform mode for a layer.
 * Saves a copy of the layer data to allow cancel.
 * `aspectLocked` is intentionally NOT reset here - it's a user preference
 * that should persist across layers/activations within the session.
 */
function activateTransform(layerId) {
  const layer = state.layers.find(l => l.id === layerId);
  if (!layer) return false;

  state.transform.active = true;
  state.transform.layerId = layerId;
  state.transform.mode = 'move';
  state.transform.originalData = layer.data.slice(); // deep copy
  state.transform.hasMoved = false;
  state.transform.x = 0;
  state.transform.y = 0;
  state.transform.rotation = 0;
  state.transform.scaleX = 1;
  state.transform.scaleY = 1;

  emit('transform');
  return true;
}

/**
 * Cancel transform: restore layer to original state.
 */
function cancelTransform() {
  if (state.transform.originalData && state.transform.layerId) {
    const layer = state.layers.find(l => l.id === state.transform.layerId);
    if (layer) {
      layer.data = state.transform.originalData.slice();
    }
  }
  state.transform.active = false;
  state.transform.layerId = null;
  state.transform.originalData = null;
  markCompositeDirty();
  emit('transform');
}

/**
 * Commit transform: discard the saved original data.
 */
function commitTransform() {
  state.transform.originalData = null;
  state.transform.active = false;
  state.transform.layerId = null;
  markDirty();
  emit('transform');
  emit('document');
}

/**
 * Build the DOMMatrix that maps a point in the layer's original,
 * un-transformed pixel space (0..width, 0..height) to its current
 * on-canvas position, for the given transform parameters (defaults to
 * the live state).
 *
 * This is the SINGLE source of truth for "where is the transform box
 * right now" - both the rasterizer (applyTransformToLayer, below) and
 * the interactive overlay (transform-overlay.js) build on this exact
 * matrix, so the handles the user drags always match the pixels that
 * get baked into the layer (fixes the "position drifts" / "resize goes
 * the wrong direction when rotated" class of bug that two slightly-different formulas
 * drifting apart would otherwise cause).
 *
 * Uses DOMMatrix (per spec: no guessed/ad-hoc coordinate math) and is
 * always built around the layer's fixed center - the pivot never moves
 * mid-gesture, which is what keeps the anchor point stable while
 * scaling or rotating.
 */
function getTransformMatrix(
  x = state.transform.x,
  y = state.transform.y,
  rotation = state.transform.rotation,
  scaleX = state.transform.scaleX,
  scaleY = state.transform.scaleY
) {
  const { width, height } = state.canvas;
  const cx = width / 2;
  const cy = height / 2;
  const rotationDeg = (rotation * 180) / Math.PI;
  return new DOMMatrix()
    .translate(cx + x, cy + y)
    .rotate(rotationDeg)
    .scale(scaleX, scaleY)
    .translate(-cx, -cy);
}

/**
 * Apply translation, scaling, and rotation to a layer.
 * Uses a temporary canvas to perform the transformation.
 * The transformation is applied relative to the layer's center (via
 * getTransformMatrix), never to an arbitrary/guessed origin.
 */
function applyTransformToLayer(layerId, x, y, scaleX, scaleY, rotation) {
  const layer = state.layers.find(l => l.id === layerId);
  if (!layer) return;

  // Defensive clamp: guarantees this function alone can never produce a
  // degenerate (0/negative) or runaway transform, even if a caller forgot to.
  scaleX = clamp(Number.isFinite(scaleX) ? scaleX : 1, MIN_SCALE, MAX_SCALE);
  scaleY = clamp(Number.isFinite(scaleY) ? scaleY : 1, MIN_SCALE, MAX_SCALE);
  x = Number.isFinite(x) ? x : 0;
  y = Number.isFinite(y) ? y : 0;
  rotation = Number.isFinite(rotation) ? rotation : 0;

  const { width, height } = state.canvas;
  const { canvas, ctx } = getTempCanvas(width, height);

  // 1. Draw the layer's original data (always the pre-gesture snapshot, so
  //    repeated re-rasterization during a drag never compounds resampling
  //    error) onto the temp canvas.
  const imageData = ctx.createImageData(width, height);
  const sourceData = state.transform.originalData || layer.data;
  for (let i = 0; i < width * height; i++) {
    const c = sourceData[i];
    const o = i * 4;
    imageData.data[o] = c & 0xff;
    imageData.data[o + 1] = (c >>> 8) & 0xff;
    imageData.data[o + 2] = (c >>> 16) & 0xff;
    imageData.data[o + 3] = (c >>> 24) & 0xff;
  }
  ctx.putImageData(imageData, 0, 0);

  // 2. Create a new canvas for the result
  const resultCanvas = document.createElement('canvas');
  resultCanvas.width = width;
  resultCanvas.height = height;
  const resultCtx = resultCanvas.getContext('2d');
  resultCtx.imageSmoothingEnabled = false;

  // 3. Apply the transformation matrix (identical formula to the overlay)
  const m = getTransformMatrix(x, y, rotation, scaleX, scaleY);
  resultCtx.save();
  resultCtx.setTransform(1, 0, 0, 1, 0, 0);
  resultCtx.clearRect(0, 0, width, height);
  resultCtx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
  resultCtx.drawImage(canvas, 0, 0);
  resultCtx.restore();

  // 4. Read back the transformed pixel data into the layer
  const newData = resultCtx.getImageData(0, 0, width, height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const r = newData.data[o];
    const g = newData.data[o + 1];
    const b = newData.data[o + 2];
    const a = newData.data[o + 3];
    layer.data[i] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }

  markCompositeDirty();
}

// ============================================================
// TRANSFORM FRAME SCHEDULING (requestAnimationFrame batching)
// ============================================================
// Handle drags and pinch gestures can fire many pointermove events per
// frame. Rasterizing the whole layer (applyTransformToLayer) on every one
// would be wasted work and can visibly lag, especially on mobile. Gesture
// code should just mutate state.transform.{x,y,rotation,scaleX,scaleY} and
// call scheduleTransformApply() - all mutations within the same frame
// coalesce into a single rasterize+callback, and nothing here ever uses
// setInterval.
let transformFramePending = false;
let transformFrameCallback = null;

function scheduleTransformApply(onApplied) {
  if (onApplied) transformFrameCallback = onApplied;
  if (transformFramePending) return;
  transformFramePending = true;
  requestAnimationFrame(() => {
    transformFramePending = false;
    if (!state.transform.active || !state.transform.layerId) return;
    const t = state.transform;
    applyTransformToLayer(t.layerId, t.x, t.y, t.scaleX, t.scaleY, t.rotation);
    if (transformFrameCallback) transformFrameCallback();
  });
}

// -- aliases --
const addLayerBase = stateAddLayer;
const removeLayerBase = stateRemoveLayer;


// ---- js/lang/th.js ----

const th = {
	
  home_new_project: "สร้างรูปใหม่",
  home_custom_btn: "กำหนดเอง",
  home_create_btn: "สร้าง",
  home_gallery: "โปรเจกต์ของฉัน",
  home_empty: "ยังไม่มีโปรเจกต์ที่บันทึกไว้ เริ่มสร้างกันเถอะ! 🚀",
  home_open_file: "เปิดจากไฟล์",
  home_choose_file: "เลือกไฟล์ .pxproj.json",
  home_open_hint: "เลือกไฟล์โปรเจกต์ที่ export ไว้ (.pxproj.json)",
  
  sidebar_home: "หน้าแรก",
  
  // General
  app_title: "Pixora Editor",
  project_name_untitled: "ไม่มีชื่อ",

  // Top bar
  menu_title: "เมนู",
  menu_aria_label: "เปิดเมนู",
  undo_title: "ย้อนกลับ (Ctrl+Z)",
  redo_title: "ทำซ้ำ (Ctrl+Y)",
  layers_title: "เลเยอร์",
  color_title: "สี",
  file_title: "ไฟล์",

  // Toolbar
  toolbar_aria_label: "เครื่องมือวาดภาพ",
  tool_pencil: "ดินสอ",
  tool_pencil_title: "ดินสอ (B)",
  tool_eraser_title: "ยางลบ (E)",
  tool_bucket_title: "ถังเติมสี (G)",
  tool_line_title: "เส้นตรง (L)",
  tool_rect_title: "สี่เหลี่ยม (R)",
  tool_circle_title: "วงกลม (C)",
  tool_eyedropper_title: "หลอดดูดสี (I)",
  tool_pan_title: "เลื่อนมุมมอง (H)",
  zoom_out_title: "ซูมออก (-)",
  zoom_in_title: "ซูมเข้า (+)",
  grid_title: "แสดง/ซ่อนตาราง (Ctrl+G)",
  clear_title: "ล้างภาพ",

  // Tool name label shown in the bottom status bar
  status_tool_pencil: "ดินสอ",
  status_tool_eraser: "ยางลบ",
  status_tool_bucket: "ถังเติมสี",
  status_tool_line: "เส้นตรง",
  status_tool_rect: "สี่เหลี่ยม",
  status_tool_circle: "วงกลม",
  status_tool_eyedropper: "หลอดดูดสี",
  status_tool_pan: "เลื่อนมุมมอง",

  // Color panel
  panel_color_heading: "สี",
  swatch_primary_title: "สีหลัก",
  swatch_secondary_title: "สีรอง",
  swatch_swap_title: "สลับสีหลัก-รอง",
  field_hex: "รหัสสี (Hex)",
  hex_placeholder: "#000000",
  color_picker_sv_aria: "ตัวเลือกความอิ่มสีและความสว่าง",
  color_picker_hue_aria: "แถบเลื่อนสีฐาน (Hue)",
  field_alpha: "ความโปร่งใส",
  swatches_default_heading: "สีพื้นฐาน",
  swatches_custom_heading: "สีที่กำหนดเอง",
  btn_add_custom: "+ เพิ่มสีที่ใช้อยู่",
  swatches_recent_heading: "ใช้ล่าสุด",
  swatches_favorites_heading: "รายการโปรด",
  btn_export_palette: "ส่งออกชุดสี",
  btn_import_palette: "นำเข้าชุดสี",
  swatch_hint_remove: " (แตะสองครั้งเพื่อลบ กดค้างเพื่อบันทึกเป็นรายการโปรด)",
  swatch_hint_favorite: " (กดค้างเพื่อบันทึกเป็นรายการโปรด)",

  // Layers panel
  panel_layers_heading: "เลเยอร์",
  btn_layer_add: "+ เลเยอร์ใหม่",
  btn_layer_dup: "คัดลอก",
  btn_layer_merge: "รวมกับเลเยอร์ล่าง",
  btn_layer_delete: "ลบ",
  layers_hint: "เลเยอร์ใหม่จะเด้งไปอยู่บนสุดเสมอ คัดลอกไว้กันพัง รวมกับเลเยอร์ล่างเมื่อต้องการ ลบอันรกโลก ปรับความใสด้วยแถบเลื่อน 👁 = ซ่อน 🔒 = ห้ามวาด ⋮ = ของดีอยู่ในนี้ ย้าย หมุน ย่อ ขยาย และอีกเพียบ ปล. เลือกเลเยอร์ให้ถูกก่อน นะจ๊ะ",
  layer_default_name: "เลเยอร์",
  layer_opacity_title: "ความทึบของเลเยอร์",
  layer_toggle_visibility_title: "ซ่อน/แสดงเลเยอร์",
  layer_toggle_lock_title: "ล็อก/ปลดล็อกเลเยอร์",
  layer_options_title: "ตัวเลือกเลเยอร์",
  layer_move_up_title: "ย้ายเลเยอร์ขึ้น",
  layer_move_down_title: "ย้ายเลเยอร์ลง",
  layer_transform_title: "ปรับรูปเลเยอร์ (ย้าย/ย่อขยาย/หมุน)",

  // Transform box (move/resize/rotate)
  transform_aspect_lock: "ล็อกสัดส่วน",
  transform_apply_btn: "ยืนยัน",
  transform_cancel_btn: "ยกเลิก",
  transform_close_title: "ปิด (ยกเลิกการแปลงรูป)",
  toast_transform_active: "กำลังปรับรูป:",
  toast_transform_applied: "ปรับรูปเรียบร้อย",
  toast_transform_cancelled: "ยกเลิกการปรับรูป",
  toast_aspect_locked: "ล็อกสัดส่วนแล้ว",
  toast_aspect_unlocked: "ปลดล็อกสัดส่วนแล้ว",

  // File panel / menu
  panel_file_heading: "ไฟล์",
  file_language_heading: "ภาษา",
  file_project_heading: "โปรเจกต์",
  btn_new_canvas: "สร้างรูปใหม่…",
  btn_open_canvas: "เปิดโปรเจกต์…",
  btn_save_as: "บันทึกเป็น…",
  autosave_hint: "ระบบบันทึกงานอัตโนมัติไว้ในเครื่องแล้ว",

  file_export_heading: "ส่งออกไฟล์",
  field_filename: "ชื่อไฟล์",
  field_scale: "ขนาดขยาย",
  field_transparent: "พื้นหลังโปร่งใส",
  btn_export_png: "ส่งออกเป็น PNG",
  btn_export_sheet: "สไปรต์ชีต (รวมทุกเลเยอร์)",
  btn_export_meta: "ส่งออกข้อมูล JSON",
  btn_export_project: "ส่งออกไฟล์โปรเจกต์",
  btn_import_project: "นำเข้าไฟล์โปรเจกต์",

  file_appearance_heading: "การแสดงผล",
  field_dark_mode: "โหมดมืด",

  // Tool options (brush/fill)
  field_brush: "ขนาดหัวแปรง",
  field_filled: "ระบายเต็มรูป",

  // Dialog: new canvas
  field_preset_size: "ขนาดมาตรฐาน",
  preset_custom: "กำหนดเอง…",
  btn_create: "สร้าง",

  // Dialog: clear canvas
  dialog_clear_heading: "ล้างภาพทั้งหมด?",
  clear_canvas_hint: "จะล้างเฉพาะเลเยอร์ที่กำลังใช้งานอยู่เท่านั้น กดย้อนกลับได้ทันทีถ้าเปลี่ยนใจ",
  btn_clear_confirm: "ล้างภาพ",

  // Dialog: save as
  dialog_save_as_heading: "บันทึกเป็น",
  field_project_name: "ชื่อโปรเจกต์",
  save_as_placeholder: "my-sprite",
  btn_save: "บันทึก",

  // Dialog: open project
  dialog_open_heading: "เปิดโปรเจกต์",
  open_empty_hint: "ยังไม่มีโปรเจกต์ที่บันทึกไว้",
  btn_close: "ปิด",
  project_open_button: "เปิด",
  project_delete_button: "ลบ",

  // Toast notifications
  toast_palette_exported: "ส่งออกชุดสีแล้ว",
  toast_palette_imported: "นำเข้าชุดสีแล้ว",
  toast_palette_import_error: "อ่านไฟล์ชุดสีไม่ได้",
  toast_color_picked: "เลือกสีแล้ว",
  toast_layer_added: "เพิ่มเลเยอร์ใหม่แล้ว",
  toast_frame_added: "เพิ่มเฟรมแล้ว",
  toast_frame_duplicated: "ทำสำเนาเฟรมแล้ว",
  toast_frame_deleted: "ลบเฟรมแล้ว",
  toast_frame_delete_error: "ลบไม่ได้ ต้องมีอย่างน้อย 1 เฟรม",
  toast_layer_merged: "รวมเลเยอร์แล้ว",
  toast_layer_merge_error: "ไม่มีเลเยอร์ด้านล่างให้รวมด้วย",
  toast_layer_delete_error: "ลบไม่ได้ เพราะเหลือเลเยอร์เดียว",
  toast_png_exported: "ส่งออก PNG แล้ว",
  toast_export_error: "ส่งออกไม่สำเร็จ",
  toast_sprite_sheet_exported: "ส่งออกสไปรต์ชีตแล้ว",
  toast_metadata_exported: "ส่งออกข้อมูล JSON แล้ว",
  toast_project_exported: "ส่งออกไฟล์โปรเจกต์แล้ว",
  toast_project_imported: "นำเข้าโปรเจกต์แล้ว",
  toast_project_import_error: "อ่านไฟล์โปรเจกต์ไม่ได้",
  toast_project_opened: 'เปิด "{name}" แล้ว',
  toast_project_name_required: "กรุณาตั้งชื่อโปรเจกต์ก่อน",
  toast_project_saved: 'บันทึกเป็น "{name}" แล้ว',
  toast_canvas_created: "สร้างรูปขนาด {size} แล้ว",
  toast_canvas_cleared: "ล้างภาพแล้ว",
  
  layer_popup_transform: "ปรับแต่งรูป",
  layer_popup_move_up: "เลื่อนขึ้น",
  layer_popup_move_down: "เลื่อนลง",
  layer_popup_duplicate: "คัดลอกเลเยอร์",
  layer_popup_merge_down: "รวมกับเลเยอร์ล่าง",
  layer_popup_delete: "ลบเลเยอร์",
  layer_popup_options: "ตัวเลือกเลเยอร์",
  
  file_background_heading: "พื้นหลัง Canvas",
  btn_change_background: "เปลี่ยนพื้นหลัง…",
  panel_background_heading: "พื้นหลัง Canvas",
  bg_hint: "เลือกพื้นหลังของ canvas (แสดงใต้เลเยอร์)",
  bg_type_theme: "ตามธีม",
  bg_type_solid: "สีทึบ",
  bg_type_checkerboard: "โปร่งใส (ตารางหมากรุก)",
  bg_choose_color: "เลือกสี",
  
  dialog_new_heading: "สร้างรูปใหม่",
  new_canvas_select_hint: "เลือกขนาดที่ต้องการ:",
  new_canvas_custom_btn: "กำหนดเอง",
  new_canvas_create_btn: "สร้าง",
  new_canvas_perf_hint: "⚠️ ขนาดใหญ่เกิน 1024×1024 อาจทำให้เครื่องช้าลง (สูงสุด 2048×2048)",
  new_canvas_hint: "กดเลือกขนาดเพื่อสร้างใหม่ งานเดิมจะถูกแทนที่",
  field_width: "กว้าง",
  field_height: "สูง",
  btn_cancel: "ยกเลิก",
  
  new_canvas_title: "สร้างรูปใหม่",
  
  sidebar_title: "เมนู",
  sidebar_placeholder: "เตรียมไว้สำหรับเมนูเพิ่มเติม",
  
  create_project_title: "สร้างโปรเจกต์ใหม่",
  create_project_name: "ชื่อโปรเจกต์",
  create_project_name_placeholder: "ชื่อโปรเจกต์ของฉัน",
  toast_project_created: 'สร้างโปรเจกต์ "{name}" แล้ว',
  
  import_warning_title: "⚠️ เปิดไฟล์จากภายนอก",
  import_warning_message: "Pixora Editor รองรับเฉพาะไฟล์ .pxproj.json ที่ส่งออกจากเว็บนี้เท่านั้น",
  import_warning_hint: "ไฟล์ .json หรือไฟล์อื่นๆ ที่ไม่ได้สร้างจาก Pixora Editor จะไม่สามารถเปิดได้",
  import_warning_dont_show: "ไม่ต้องแสดงอีก (ยกเลิกได้ในตั้งค่า)",
  import_warning_continue: "ดำเนินการต่อ",

  btn_import_image: "นำเข้ารูป",
  toast_image_imported: "📐 วางรูปแล้ว ปรับขนาด/ตำแหน่ง แล้วกด Apply",
  
  new_canvas_name: "ชื่อรูป",
  new_canvas_name_eiei:"ชื่อรูปของฉัน",
  new_canvas_recommended:"สี่เหลี่ยม",
  new_canvas_portrait:"แนวตั้ง 16:9",
  new_canvas_landscape:"แนวนอน 9:16",
  new_canvas_animation:"อนิเมชั่น",
  
  btn_export_animation:"บันทึกสำหรับอนิเมชั่น (ZIP)",

  settings_title: "ตั้งค่า",
  settings_data_heading: "ข้อมูล",
  settings_clear_data: "ล้างข้อมูลทั้งหมด",
  settings_clear_data_hint: "ลบโปรเจกต์, แกลลอรี่ และงานที่บันทึกอัตโนมัติทั้งหมดในเครื่องนี้",
  settings_clear_confirm_title: "ยืนยันการล้างข้อมูล",
  settings_clear_confirm_body: "การกระทำนี้จะลบโปรเจกต์ทั้งหมด แกลลอรี่ และงานที่บันทึกอัตโนมัติ ไม่สามารถย้อนกลับได้",
  settings_clear_confirm_btn: "ล้างข้อมูล",
  toast_data_cleared: "ล้างข้อมูลเรียบร้อยแล้ว",
  
  home_gallery_title: "แกลลอรี่",
};


// ---- js/lang/en.js ----

const en = {
  home_new_project: "New images",
  home_custom_btn: "Custom",
  home_create_btn: "Create",
  home_gallery: "My Projects",
  home_empty: "No saved projects yet. Let's create one! 🚀",
  home_open_file: "Open from File",
  home_choose_file: "Choose .pxproj.json file",
  home_open_hint: "Select a project file exported earlier (.pxproj.json)",
  
  sidebar_home: "Home",
  
  // General
  app_title: "Pixora Editor",
  project_name_untitled: "untitled",

  // Top bar
  menu_title: "Menu",
  menu_aria_label: "Open menu",
  undo_title: "Undo (Ctrl+Z)",
  redo_title: "Redo (Ctrl+Y)",
  layers_title: "Layers",
  color_title: "Color",
  file_title: "File",

  // Toolbar
  toolbar_aria_label: "Drawing tools",
  tool_pencil: "Pencil",
  tool_pencil_title: "Pencil (B)",
  tool_eraser_title: "Eraser (E)",
  tool_bucket_title: "Fill bucket (G)",
  tool_line_title: "Line (L)",
  tool_rect_title: "Rectangle (R)",
  tool_circle_title: "Circle (C)",
  tool_eyedropper_title: "Eyedropper (I)",
  tool_pan_title: "Pan / Move (H)",
  zoom_out_title: "Zoom out (-)",
  zoom_in_title: "Zoom in (+)",
  grid_title: "Toggle grid (Ctrl+G)",
  clear_title: "Clear canvas",

  // Status bar tool labels
  status_tool_pencil: "Pencil",
  status_tool_eraser: "Eraser",
  status_tool_bucket: "Fill bucket",
  status_tool_line: "Line",
  status_tool_rect: "Rectangle",
  status_tool_circle: "Circle",
  status_tool_eyedropper: "Eyedropper",
  status_tool_pan: "Pan",

  // Color panel
  panel_color_heading: "Color",
  swatch_primary_title: "Primary color",
  swatch_secondary_title: "Secondary color",
  swatch_swap_title: "Swap colors",
  field_hex: "Hex",
  hex_placeholder: "#000000",
  color_picker_sv_aria: "Saturation and value picker",
  color_picker_hue_aria: "Hue slider",
  field_alpha: "Alpha",
  swatches_default_heading: "Swatches",
  swatches_custom_heading: "Custom",
  btn_add_custom: "+ Add current",
  swatches_recent_heading: "Recent",
  swatches_favorites_heading: "Favorites",
  btn_export_palette: "Export palette",
  btn_import_palette: "Import palette",
  swatch_hint_remove: " (double-tap to remove, hold to favorite)",
  swatch_hint_favorite: " (hold to favorite)",

  // Layers panel
  panel_layers_heading: "Layers",
  btn_layer_add: "+ Layer",
  btn_layer_dup: "Duplicate",
  btn_layer_merge: "Merge down",
  btn_layer_delete: "Delete",
  layers_hint: "New layers always pop to the top. Duplicate one before doing anything risky. Merge Down when you're ready. Delete the junk. Use the slider to adjust opacity. 👁 = Hide 🔒 = No drawing allowed. ⋮ = The good stuff lives here: Move, Rotate, Resize, and more. P.S. Pick the right layer first, okay? 😏",
  layer_default_name: "Layer",
  layer_opacity_title: "Opacity",
  layer_toggle_visibility_title: "Toggle visibility",
  layer_toggle_lock_title: "Toggle lock",
  layer_options_title: "Layer options",
  layer_move_up_title: "Move up",
  layer_move_down_title: "Move down",
  layer_transform_title: "Transform layer (move/scale/rotate)",

  // Transform box (move/scale/rotate)
  transform_aspect_lock: "Lock aspect ratio",
  transform_apply_btn: "Apply",
  transform_cancel_btn: "Cancel",
  transform_close_title: "Close (cancels the transform)",
  toast_transform_active: "Transform:",
  toast_transform_applied: "Transform applied",
  toast_transform_cancelled: "Transform cancelled",
  toast_aspect_locked: "Aspect ratio locked",
  toast_aspect_unlocked: "Aspect ratio unlocked",

  // File panel / menu
  panel_file_heading: "File",
  file_language_heading: "Language",
  file_project_heading: "Project",
  btn_new_canvas: "New canvas…",
  btn_open_canvas: "Open…",
  btn_save_as: "Save as…",
  autosave_hint: "Autosaved locally.",

  file_export_heading: "Export",
  field_filename: "File name",
  field_scale: "Scale",
  field_transparent: "Transparent background",
  btn_export_png: "Export PNG",
  btn_export_sheet: "Sprite sheet (layers)",
  btn_export_meta: "Export JSON metadata",
  btn_export_project: "Export project file",
  btn_import_project: "Import project file",

  file_appearance_heading: "Appearance",
  field_dark_mode: "Dark mode",

  // Tool options (brush / filled)
  field_brush: "Brush",
  field_filled: "Filled",

  // Dialog: new canvas
  field_preset_size: "Preset size",
  preset_custom: "Custom…",
  btn_create: "Create",

  // Dialog: clear canvas
  dialog_clear_heading: "Clear canvas?",
  clear_canvas_hint: "This clears the active layer only. You can undo it right after.",
  btn_clear_confirm: "Clear",

  // Dialog: save as
  dialog_save_as_heading: "Save as",
  field_project_name: "Project name",
  save_as_placeholder: "my-sprite",
  btn_save: "Save",

  // Dialog: open project
  dialog_open_heading: "Open project",
  open_empty_hint: "No saved projects yet.",
  btn_close: "Close",
  project_open_button: "Open",
  project_delete_button: "Delete",

  // Toasts
  toast_palette_exported: "Palette exported",
  toast_palette_imported: "Palette imported",
  toast_palette_import_error: "Could not read palette file",
  toast_color_picked: "Color picked",
  toast_layer_added: "Layer added",
  toast_frame_added: "Frame added",
  toast_frame_duplicated: "Frame duplicated",
  toast_frame_deleted: "Frame deleted",
  toast_frame_delete_error: "Cannot delete - need at least 1 frame",
  toast_layer_merged: "Merged down",
  toast_layer_merge_error: "Nothing below to merge into",
  toast_layer_delete_error: "Cannot delete the only layer",
  toast_png_exported: "PNG exported",
  toast_export_error: "Export failed",
  toast_sprite_sheet_exported: "Sprite sheet exported",
  toast_metadata_exported: "Metadata exported",
  toast_project_exported: "Project file exported",
  toast_project_imported: "Project imported",
  toast_project_import_error: "Could not read project file",
  toast_project_opened: 'Opened "{name}"',
  toast_project_name_required: "Enter a project name",
  toast_project_saved: 'Saved as "{name}"',
  toast_canvas_created: "New {size} canvas",
  toast_canvas_cleared: "Canvas cleared",
  
  layer_popup_transform: "Transform",
  layer_popup_move_up: "Move up",
  layer_popup_move_down: "Move down",
  layer_popup_duplicate: "Duplicate layer",
  layer_popup_merge_down: "Merge down",
  layer_popup_delete: "Delete layer",
  layer_popup_options: "Layer options",
  
  file_background_heading: "Canvas Background",
  btn_change_background: "Change background…",
  panel_background_heading: "Canvas Background",
  bg_hint: "Choose the canvas background (displayed below layers)",
  bg_type_theme: "Follow theme",
  bg_type_solid: "Solid color",
  bg_type_checkerboard: "Transparent (checkerboard)",
  bg_choose_color: "Pick a color",
  
  // New Canvas Dialog
  dialog_new_heading: "New Canvas",
  new_canvas_select_hint: "Select size:",
  new_canvas_custom_btn: "Custom",
  new_canvas_create_btn: "Create",
  new_canvas_perf_hint: "⚠️ Sizes larger than 1024×1024 may cause performance issues (max 2048×2048)",
  new_canvas_hint: "Click a size to create a new canvas. Current work will be replaced.",
  field_width: "Width",
  field_height: "Height",
  btn_cancel: "Cancel",
  
  new_canvas_title: "New images",
  
  sidebar_title: "Menu",
  sidebar_placeholder: "Ready for future menu items",
  
  create_project_title: "New Project",
  create_project_name: "Project name",
  create_project_name_placeholder: "My project name",
  toast_project_created: 'Project "{name}" created',
  
  import_warning_title: "⚠️ Open External File",
  import_warning_message: "Pixora Editor only supports .pxproj.json files exported from this app",
  import_warning_hint: ".json or other files not created by Pixora Editor cannot be opened",
  import_warning_dont_show: "Don't show again (can be re-enabled in settings)",
  import_warning_continue: "Continue",
  
  btn_import_image: "Import Image",
  toast_image_imported: "📐 Image placed. Adjust size/position then press Apply",
  
  new_canvas_name: "Image name",
  new_canvas_name_eiei: "My image name",
  new_canvas_recommended: "Square",
  new_canvas_portrait: "Portrait 16:9",
  new_canvas_landscape: "Landscape 9:16",
  new_canvas_animation: "Animation",

  btn_export_animation:"Export animation (ZIP)",

  settings_title: "Settings",
  settings_data_heading: "Data",
  settings_clear_data: "Clear all data",
  settings_clear_data_hint: "Deletes all projects, gallery items, and autosave on this device",
  settings_clear_confirm_title: "Confirm clear data",
  settings_clear_confirm_body: "This will permanently delete all projects, gallery items, and autosave. This cannot be undone.",
  settings_clear_confirm_btn: "Clear data",
  toast_data_cleared: "All data cleared",
  
  home_gallery_title: "Gallery",
};


// ---- js/i18n.js ----




const languages = {
    th,
    en
};

let currentLanguage = "th";
const i18nListeners = [];

// Switches the active language and re-renders all translated text.
function setLanguage(lang) {
    if (languages[lang]) {
        currentLanguage = lang;
        updateTexts();
        i18nListeners.forEach((cb) => cb(currentLanguage));
    }
}

// Returns the currently active language code ('th' or 'en').
function getLanguage() {
    return currentLanguage;
}

// Lets other modules (e.g. ui.js) register to be notified when the user
// changes language, so they can update text generated in JS (e.g. toasts, default layer names).
function onLanguageChange(callback) {
    i18nListeners.push(callback);
}

// Looks up a translation by key (usable from any other module, e.g. t('tool_pencil')).
// Supports {name}-style variable substitution, e.g. t('toast_project_opened', { name: 'cat' }).
function t(key, vars) {
    let str = languages[currentLanguage][key] ?? key;
    if (vars) {
        for (const [k, v] of Object.entries(vars)) {
            str = str.replace(new RegExp(`\\{${k}\\}`, "g"), v);
        }
    }
    return str;
}

// Sweeps the whole page and updates every translatable piece of text.
function updateTexts() {
    // 1. Element inner text (e.g. <h2>, <span>, <button>).
    document.querySelectorAll("[data-i18n]").forEach(element => {
        const key = element.getAttribute("data-i18n");
        element.textContent = t(key);
    });

    // 2. 'title' attribute (tooltip shown on hover).
    document.querySelectorAll("[data-i18n-title]").forEach(element => {
        const key = element.getAttribute("data-i18n-title");
        element.setAttribute("title", t(key));
    });

    // 3. 'placeholder' attribute (faded hint text in inputs).
    document.querySelectorAll("[data-i18n-placeholder]").forEach(element => {
        const key = element.getAttribute("data-i18n-placeholder");
        element.setAttribute("placeholder", t(key));
    });

    // 4. 'aria-label' attribute (for screen readers).
    document.querySelectorAll("[data-i18n-aria-label]").forEach(element => {
        const key = element.getAttribute("data-i18n-aria-label");
        element.setAttribute("aria-label", t(key));
    });
}

// Runs once on first app start to pick the initial language.
function initI18n() {
    // Load the previously chosen language from localStorage (fall back to 'th').
    const savedLang = localStorage.getItem("app_lang") || "th";
    setLanguage(savedLang);
}


// ---- js/input.js ----

/**
 * input.js
 * Translates raw pointer/touch/mouse events into tool actions.
 * 
 * Gesture rules:
 *  - 1 finger: draw with selected tool
 *  - 2 fingers: pan + pinch-zoom (stops drawing immediately)
 *  - If 2nd finger lands within 300ms and only 1 pixel drawn, undo it
 * 
 * Transform mode:
 *  - Activated from layer panel (transform button)
 *  - Drag to move layer
 *  - Enter to confirm, Esc to cancel
 */










// ============================================================
// STATE
// ============================================================

const activePointers = new Map();
let drawState = null;
let pinchState = null;
let transformPinchState = null; // 2-finger pinch/rotate on the transform box (as opposed to view pinch)
let canvasEl = null;
let onColorPicked = null;

// Stroke timing
let strokeStartTime = 0;
let strokeSnapshot = null;
let hasDrawn = false;

// Throttle
let lastStrokeTime = 0;
const STROKE_THROTTLE = 16;
let lastPinchTime = 0;
const PINCH_THROTTLE = 16;

// Transform move-drag: float canvas-space coordinates (not the floored
// screenToPixel grid) so single-finger moves stay pixel-smooth even at
// low zoom, and stores the box's translation at gesture start so the drag
// is always relative to where the gesture actually began.
let transformMoveStart = null; // { pointerId, pointerStartCanvas:{x,y}, startX, startY }

// ============================================================
// EXPORTS
// ============================================================

function initInput(el, callbacks = {}) {
  canvasEl = el;
  onColorPicked = callbacks.onColorPicked || null;
  el.style.touchAction = 'none';

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  el.addEventListener('pointerleave', onPointerLeaveForHover);
  el.addEventListener('wheel', onWheel, { passive: false });
}

// ============================================================
// POINTER HANDLERS
// ============================================================

// Bounding rect (in canvas pixel space) touched by a stroke segment between
// two points at the given brush size, with a small safety margin. Passed to
// markCompositeDirty() so drawing on a large canvas only recomposites the
// handful of pixels actually touched instead of the whole image every tick.
function strokeDirtyRect(p1, p2, brushSize) {
  const margin = Math.ceil(brushSize / 2) + 1;
  return {
    x0: Math.min(p1.x, p2.x) - margin,
    y0: Math.min(p1.y, p2.y) - margin,
    x1: Math.max(p1.x, p2.x) + margin + 1,
    y1: Math.max(p1.y, p2.y) + margin + 1,
  };
}

function onPointerDown(e) {
  activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
  canvasEl.setPointerCapture(e.pointerId);

  const p = screenToPixel(e.clientX, e.clientY);

  // ─── 2+ FINGERS: STOP DRAWING + AUTO-UNDO ────────────────
  if (activePointers.size >= 2) {
    if (drawState && drawState.kind === 'stroke') {
      const elapsed = performance.now() - strokeStartTime;
      if (elapsed < 300 && !hasDrawn && strokeSnapshot) {
        restoreLayers(strokeSnapshot);
        markCompositeDirty();
        render();
        scheduleAutosave();
        cancelAction();
      } else {
        commitAction();
        afterMutation();
        scheduleAutosave();
      }
    } else if (drawState && drawState.kind === 'shape') {
      cancelAction();
      setPreviewPoints(null);
    }

  drawState = null;
  strokeSnapshot = null;
  hasDrawn = false;
  transformMoveStart = null;
  markCompositeDirty();
  
  // 2-finger pinch always zooms the view (no transform check needed).
  startPinch();  // จากเดิมที่มี if (state.transform.active) { startTransformPinch() } else { startPinch() }
  
  render();
  return;
}

  // ─── TRANSFORM MODE: MOVE (drag anywhere on the box) ─────
  // Handle-specific drags (scale/rotate) are handled entirely by their own
  // DOM elements in transform-overlay.js and never reach this handler,
  // since those handles sit visually above the canvas and intercept their
  // own pointer events - so any pointerdown that gets here is a move.
  if (state.transform.active && state.transform.layerId) {
    const layer = state.layers.find(l => l.id === state.transform.layerId);
    if (!layer) {
      state.transform.active = false;
      render();
      return;
    }

    transformMoveStart = {
      pointerId: e.pointerId,
      pointerStartCanvas: screenToCanvasFloat(e.clientX, e.clientY),
      startX: state.transform.x,
      startY: state.transform.y,
    };
    // Reset per-gesture; a tap that never moves will cancel on release
    // (see onPointerUp), matching the original tap-outside-to-cancel UX.
    state.transform.hasMoved = false;
    return;
  }

  // ─── 1 FINGER: START DRAWING ──────────────────────────────

  strokeSnapshot = snapshotLayers();
  strokeStartTime = performance.now();
  hasDrawn = false;
  beginAction();

  const tool = state.tool;

  if (tool === 'pan') {
    drawState = { kind: 'pan', lastX: e.clientX, lastY: e.clientY };
    return;
  }

  const layer = getActiveLayer();
  if (!layer || layer.locked) return;

  if (tool === 'eyedropper') {
    const color = pickColor(state.layers, p.x, p.y);
    if (color !== null && onColorPicked) onColorPicked(color);
    return;
  }

  if (tool === 'bucket') {
    floodFill(layer, p.x, p.y, state.primaryColor);
    commitAction();
    afterMutation();
    markCompositeDirty();
    scheduleAutosave();
    render();
    return;
  }
  
if (isShapeTool(tool)) {
  drawState = { 
    kind: 'shape', 
    tool, 
    start: p, 
    last: p,
    brushSize: state.toolOptions.brushSize // ✅ เก็บ brushSize
  };
  updateShapePreview();
  render();
  return;
}

  // Pencil / Eraser
  const color = tool === 'eraser' ? 0 : state.primaryColor;
  drawState = { kind: 'stroke', color, lastPoint: p };
  const brushSize = state.toolOptions.brushSize;
  paintStroke(layer, [p], color, brushSize);
  markCompositeDirty(strokeDirtyRect(p, p, brushSize));
  render();
}

// ─────────────────────────────────────────────────────────────

function onPointerMove(e) {
  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
  }

  // ─── 2+ FINGERS: PAN/ZOOM (normal) ──
if (activePointers.size >= 2) {
  const now = performance.now();
  if (now - lastPinchTime >= PINCH_THROTTLE) {
    lastPinchTime = now;
    // View pinch always applies here.
    if (!pinchState) startPinch(); else updatePinch();
    render();
  }
  return;
}

  const p = screenToPixel(e.clientX, e.clientY);

  if (e.pointerType === 'mouse') {
    setCursorPixel(inBoundsPixel(p) ? p : null);
  }

  // ─── TRANSFORM MODE: MOVE (drag anywhere on the box) ─────
  if (state.transform.active && state.transform.layerId) {
    if (!transformMoveStart || transformMoveStart.pointerId !== e.pointerId) return;
    const layer = state.layers.find(l => l.id === state.transform.layerId);
    if (!layer) return;

    // Float canvas-space delta (no integer-grid snapping), so the drag
    // never "jumps" from one grid cell to the next at low zoom.
    const nowCanvas = screenToCanvasFloat(e.clientX, e.clientY);
    const dx = nowCanvas.x - transformMoveStart.pointerStartCanvas.x;
    const dy = nowCanvas.y - transformMoveStart.pointerStartCanvas.y;

    state.transform.x = transformMoveStart.startX + dx;
    state.transform.y = transformMoveStart.startY + dy;
    state.transform.hasMoved = true;
    scheduleTransformApply(() => render());
    return;
  }

  if (!drawState) {
    render();
    return;
  }

  if (drawState.kind === 'pan') {
    const dx = e.clientX - drawState.lastX;
    const dy = e.clientY - drawState.lastY;
    state.view.panX += dx;
    state.view.panY += dy;
    drawState.lastX = e.clientX;
    drawState.lastY = e.clientY;
    render();
    return;
  }

  const layer = getActiveLayer();
  if (!layer) return;

  if (drawState.kind === 'stroke') {
    const currentPoint = p;

    const dx = currentPoint.x - drawState.lastPoint.x;
    const dy = currentPoint.y - drawState.lastPoint.y;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
      render();
      return;
    }

    const now = performance.now();
    if (now - lastStrokeTime < STROKE_THROTTLE) {
      render();
      return;
    }
    lastStrokeTime = now;

    hasDrawn = true;

    const brushSize = state.toolOptions.brushSize;
    paintStroke(layer, [drawState.lastPoint, currentPoint], drawState.color, brushSize);
    markCompositeDirty(strokeDirtyRect(drawState.lastPoint, currentPoint, brushSize));
    drawState.lastPoint = currentPoint;
    render();
    return;
  }

  if (drawState.kind === 'shape') {
    drawState.last = p;
    updateShapePreview();
    render();
  }
}

// ─────────────────────────────────────────────────────────────

function onPointerUp(e) {
  activePointers.delete(e.pointerId);

  if (activePointers.size >= 1) {
    if (pinchState) pinchState = null;
    if (transformPinchState) transformPinchState = null;
    return;
  }

  pinchState = null;
  transformPinchState = null;
  if (transformMoveStart && transformMoveStart.pointerId === e.pointerId) {
    transformMoveStart = null;
  }

if (state.transform.active && state.transform.layerId) {
  // Do nothing on pointer release - leave the transform active.
  // The user must press Apply or Cancel for it to finish.
  render();
  return;
}

  if (!drawState) return;

  if (drawState.kind === 'stroke') {
    commitAction();
    afterMutation();
    scheduleAutosave();
    markCompositeDirty();
  } else 
if (drawState.kind === 'shape') {
  const layer = getActiveLayer();
  const points = shapePreviewPoints(
    drawState.tool,
    drawState.start.x, drawState.start.y,
    drawState.last.x, drawState.last.y,
    state.toolOptions.shapeFilled,
    drawState.brushSize || 1 // ✅ ส่ง brushSize
  );
  stampPoints(layer, points, state.primaryColor);
  commitAction();
  afterMutation();
  markCompositeDirty();
  scheduleAutosave();
  setPreviewPoints(null);
}

  drawState = null;
  strokeSnapshot = null;
  hasDrawn = false;
  render();
}

// ─────────────────────────────────────────────────────────────

function onPointerLeaveForHover(e) {
  if (e.pointerType === 'mouse' && activePointers.size === 0) {
    setCursorPixel(null);
    render();
  }
}

// ============================================================
// HELPERS
// ============================================================

function isShapeTool(tool) {
  return tool === 'line' || tool === 'rect' || tool === 'circle';
}

function updateShapePreview() {
  const points = shapePreviewPoints(
    drawState.tool,
    drawState.start.x, drawState.start.y,
    drawState.last.x, drawState.last.y,
    state.toolOptions.shapeFilled,
    drawState.brushSize || 1 // ✅ ส่ง brushSize
  );
  setPreviewPoints(points);
}


function inBoundsPixel(p) {
  return p.x >= 0 && p.y >= 0 && 
         p.x < state.canvas.width && p.y < state.canvas.height;
}

function pointerArray() {
  return Array.from(activePointers.values());
}

// ============================================================
// PINCH / ZOOM
// ============================================================

function startPinch() {
  const pts = pointerArray();
  if (pts.length < 2) return;
  const [a, b] = pts;
  const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const midClientX = (a.clientX + b.clientX) / 2;
  const midClientY = (a.clientY + b.clientY) / 2;
  pinchState = {
    startDist: Math.max(1, dist),
    startZoom: state.view.zoom,
    startPanX: state.view.panX,
    startPanY: state.view.panY,
    startMidX: midClientX,
    startMidY: midClientY,
  };
}

function updatePinch() {
  const pts = pointerArray();
  if (pts.length < 2 || !pinchState) return;
  const [a, b] = pts;
  const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const midClientX = (a.clientX + b.clientX) / 2;
  const midClientY = (a.clientY + b.clientY) / 2;

  const scale = dist / pinchState.startDist;
  const newZoom = clamp(pinchState.startZoom * scale, 0.1, 64);

  const zoomRatio = newZoom / pinchState.startZoom;
  const rect = canvasEl.getBoundingClientRect();
  const anchorX = pinchState.startMidX - rect.left;
  const anchorY = pinchState.startMidY - rect.top;

  state.view.panX = anchorX - (anchorX - pinchState.startPanX) * zoomRatio + (midClientX - pinchState.startMidX);
  state.view.panY = anchorY - (anchorY - pinchState.startPanY) * zoomRatio + (midClientY - pinchState.startMidY);
  state.view.zoom = newZoom;
}

// ============================================================
// TWO-FINGER PINCH/ROTATE ON THE TRANSFORM BOX
// ============================================================
// Same two-pointer gesture as view pinch/pan above, but while a transform
// is active it scales+rotates the LAYER instead of the view - matching
// familiar mobile editors (ibisPaint/Canva) where pinching an object with
// a transform box open manipulates the object, not the canvas viewport.
// Pinch always scales both axes uniformly (aspect lock doesn't apply to a
// two-finger pinch - that's the standard convention) and rotation uses the
// same wrap-safe incremental technique as the single-finger rotate handle.

function startTransformPinch() {
  const pts = pointerArray();
  if (pts.length < 2) return;
  const [a, b] = pts;
  const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const angle = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
  transformPinchState = {
    startDist: Math.max(1, dist),
    startScaleX: state.transform.scaleX,
    startScaleY: state.transform.scaleY,
    prevAngle: angle,
  };
}

function updateTransformPinch() {
  const pts = pointerArray();
  if (pts.length < 2 || !transformPinchState) return;
  const [a, b] = pts;
  const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const angle = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);

  const factor = dist / transformPinchState.startDist;
  state.transform.scaleX = clamp(transformPinchState.startScaleX * factor, TRANSFORM_MIN_SCALE, TRANSFORM_MAX_SCALE);
  state.transform.scaleY = clamp(transformPinchState.startScaleY * factor, TRANSFORM_MIN_SCALE, TRANSFORM_MAX_SCALE);

  // Same per-frame-normalized incremental rotation as the rotate handle,
  // so a two-finger twist can never register as a 360° snap either.
  let step = angle - transformPinchState.prevAngle;
  step = Math.atan2(Math.sin(step), Math.cos(step));
  state.transform.rotation += step;
  transformPinchState.prevAngle = angle;

  state.transform.hasMoved = true;
  scheduleTransformApply(() => render());
}

// ============================================================
// MOUSE WHEEL ZOOM
// ============================================================

function onWheel(e) {
  e.preventDefault();
  const rect = canvasEl.getBoundingClientRect();
  const cursorX = e.clientX - rect.left;
  const cursorY = e.clientY - rect.top;
  const { zoom, panX, panY } = state.view;

  const direction = e.deltaY > 0 ? -1 : 1;
  const step = Math.max(0.5, zoom * 0.08);
  let newZoom = zoom + direction * step;
  newZoom = Math.round(newZoom * 2) / 2;
  newZoom = clamp(newZoom, 0.1, 64);

  if (newZoom === zoom) return;

  const worldX = (cursorX - panX) / zoom;
  const worldY = (cursorY - panY) / zoom;
  state.view.zoom = newZoom;
  state.view.panX = cursorX - worldX * newZoom;
  state.view.panY = cursorY - worldY * newZoom;
  render();
}



// ---- js/transform-overlay.js ----

/**
 * transform-overlay.js
 * The interactive "free transform" box: 8 resize handles (4 corners + 4
 * edges) plus 1 rotate handle, rendered as real DOM elements absolutely
 * positioned over the canvas. Positioning is driven by a single CSS
 * `transform: matrix(...)` per frame (GPU-accelerated, per spec item 9),
 * computed from DOMMatrix - never from guessed constants (spec item 10).
 *
 * Coordinate pipeline:
 *   screen (client px)
 *     <-> canvas px      canvas.js#getViewMatrix       (pan/zoom)
 *     <-> layer-local px layers.js#getTransformMatrix   (x/y/rotation/scale)
 *
 * Design notes (why it's built this way):
 *   - Handles are separate DOM elements layered above the <canvas>, with
 *     the overlay container set to `pointer-events:none` and only the
 *     handles themselves `pointer-events:auto`. This means a pointerdown
 *     that lands on a handle goes straight to that handle's own listener
 *     (no hit-test math needed to disambiguate handle-drag vs move-drag),
 *     while a pointerdown anywhere else on the box falls through to the
 *     <canvas> element underneath, which input.js already handles as the
 *     "move" gesture.
 *   - Every handle drag is anchored at the box's CURRENT center, which
 *     never moves during a scale/rotate gesture - this is what keeps the
 *     anchor point stable (spec item 4) and prevents any "jump" (item 13).
 *   - Rotation is accumulated as a sum of small per-frame deltas, each
 *     normalized into (-pi, pi], rather than recomputed as
 *     (currentAngle - startAngle). That avoids the classic wrap glitch
 *     where crossing the +-180 degree seam mid-drag registers as a
 *     near-360 degree jump.
 */






const TO_MIN_SCALE = TRANSFORM_MIN_SCALE;
const TO_MAX_SCALE = TRANSFORM_MAX_SCALE;
const ROTATE_HANDLE_DIST = 34; // fixed screen px, OUT from the top edge ("how far above")
const TANGENT_OFFSET = -9.90; // fixed screen px, ALONG the top edge ("how far left/right")

// Invisible tap-target padding + visible border, in constant SCREEN px
// (matches the old hardcoded CSS values). These get zoom-compensated the
// same way as handle size itself - see screenSizeToLocal() - so the
// clickable ring always lines up with the dot you actually see, instead of
// ballooning at high zoom or vanishing at low zoom.
const RESIZE_HIT_PAD_SCREEN = 12;
const ROTATE_HIT_PAD_SCREEN = 14;
const HANDLE_BORDER_SCREEN = 2;

// key, fractional anchor within the box (0..1), which axis this handle scales, CSS cursor
const HANDLE_DEFS = [
  { key: 'nw', ax: 0, ay: 0, axis: 'both', cursor: 'nwse-resize' },
  { key: 'n', ax: 0.5, ay: 0, axis: 'y', cursor: 'ns-resize' },
  { key: 'ne', ax: 1, ay: 0, axis: 'both', cursor: 'nesw-resize' },
  { key: 'e', ax: 1, ay: 0.5, axis: 'x', cursor: 'ew-resize' },
  { key: 'se', ax: 1, ay: 1, axis: 'both', cursor: 'nwse-resize' },
  { key: 's', ax: 0.5, ay: 1, axis: 'y', cursor: 'ns-resize' },
  { key: 'sw', ax: 0, ay: 1, axis: 'both', cursor: 'nesw-resize' },
  { key: 'w', ax: 0, ay: 0.5, axis: 'x', cursor: 'ew-resize' },
];

let wrapEl = null;
let overlayEl = null;
let boxEl = null;
const handles = {};

/** Build the overlay DOM once and wire up every handle's own pointer events. */
function initTransformOverlay(canvasWrapEl) {
  wrapEl = canvasWrapEl;

  overlayEl = document.createElement('div');
  overlayEl.className = 'transform-overlay';
  overlayEl.hidden = true;

  boxEl = document.createElement('div');
  boxEl.className = 'transform-box';
  overlayEl.appendChild(boxEl);

  for (const def of HANDLE_DEFS) {
    const h = document.createElement('div');
    h.className = `transform-handle transform-handle-${def.key}`;
    h.style.cursor = def.cursor;
    boxEl.appendChild(h);
    handles[def.key] = h;
    wireScaleHandle(h, def);
  }

  const rotateHandle = document.createElement('div');
  rotateHandle.className = 'transform-handle transform-handle-rotate';
  rotateHandle.style.cursor = 'grab';
  boxEl.appendChild(rotateHandle);
  handles.rotate = rotateHandle;
  wireRotateHandle(rotateHandle);

  document.body.appendChild(overlayEl);

  // Keep the overlay glued to the canvas no matter which call site (pan,
  // zoom, paint, undo, transform drag...) triggered the redraw.
  onAfterRender(syncTransformOverlay);
}

/** Show/hide and reposition the whole overlay to match the live transform state. */
function syncTransformOverlay() {
  if (!overlayEl) return;
  if (!state.transform.active) {
    overlayEl.hidden = true;
    return;
  }
  overlayEl.hidden = false;

  const { width, height } = state.canvas;

  // layer-local -> screen (client/viewport px). The overlay is `position:
  // fixed`, so this matrix can be used as the CSS transform directly - no
  // extra wrap-relative offset needed, and it can't be clipped by
  // canvas-wrap's `overflow: hidden` (which would otherwise hide handles
  // or the rotate-handle stalk that extend past the visible canvas area).
  const screenFromLocal = getViewMatrix().multiply(getTransformMatrix());

  boxEl.style.width = `${width}px`;
  boxEl.style.height = `${height}px`;
  boxEl.style.transformOrigin = '0 0';
  boxEl.style.transform = matrixToCss(screenFromLocal);

  positionResizeHandles();
  positionRotateHandle(screenFromLocal, width, height);
}

/** How big a handle should look ON SCREEN (css px), independent of zoom.
 *  Still takes canvas size into account (per spec) so a huge layer gets a
 *  touch-friendlier handle than a tiny one, but always within a sane range
 *  that stays comfortable to tap on any screen. */
function getHandleScreenSize(canvasSize, min, max) {
  return clamp(canvasSize / 20, min, max);
}

/** Convert a desired ON-SCREEN handle size into the canvas-local px used for
 *  the handle's own width/height style. The handle sits inside `boxEl`,
 *  which already carries the full `screenFromLocal` (view zoom * layer
 *  transform) CSS matrix - so whatever local size we set here gets
 *  multiplied by the current zoom once that matrix is applied. Dividing by
 *  zoom up front cancels that out, which is what keeps the handle's
 *  on-screen footprint constant as the user zooms in/out (spec: zoom out ->
 *  local size grows to compensate, zoom in -> local size shrinks). */
function screenSizeToLocal(screenSize) {
  const zoom = Math.max(state.view.zoom, 0.001);
  return screenSize / zoom;
}

/** Corner/edge handles: fixed percentage anchors, counter-rotated/scaled so
 *  they always render as small upright squares regardless of the layer's
 *  own rotation/scale (a squashed or spinning handle would be unusable). */
function positionResizeHandles() {
  const rotationDeg = (state.transform.rotation * 180) / Math.PI;
  const invScaleX = 1 / Math.max(Math.abs(state.transform.scaleX), TO_MIN_SCALE);
  const invScaleY = 1 / Math.max(Math.abs(state.transform.scaleY), TO_MIN_SCALE);

  // Handle size: baseline off the canvas size (factor=20, 12-20px range on
  //    screen), then divided by the current zoom so the "real on-screen" size
  //    stays constant no matter how far zoomed in/out (zooming out increases
  //    the local value to compensate, zooming in decreases it).
  const canvasSize = Math.min(state.canvas.width, state.canvas.height);
  const handleScreenSize = getHandleScreenSize(canvasSize, 12, 20);
  const handleSize = screenSizeToLocal(handleScreenSize);
  // Same compensation for the invisible hit-area expansion and the visible
  // border, so both stay the same constant on-screen size as the dot itself
  // instead of ballooning/vanishing with zoom (this is what made the hit
  // area drift away from the visible point).
  const hitPad = screenSizeToLocal(RESIZE_HIT_PAD_SCREEN);
  const borderW = screenSizeToLocal(HANDLE_BORDER_SCREEN);

  for (const def of HANDLE_DEFS) {
    const h = handles[def.key];
    h.style.left = `${def.ax * 100}%`;
    h.style.top = `${def.ay * 100}%`;
    h.style.width = `${handleSize}px`;
    h.style.height = `${handleSize}px`;
    h.style.setProperty('--hit-pad', `${hitPad}px`);
    h.style.setProperty('--handle-border', `${borderW}px`);
    h.style.transform = `translate(-50%, -50%) rotate(${-rotationDeg}deg) scale(${invScaleX}, ${invScaleY})`;
  }
}

/** Rotate handle: kept at a fixed *screen*-space distance above the box's
 *  top edge (ROTATE_HANDLE_DIST), with an optional sideways nudge along
 *  that same edge (TANGENT_OFFSET, positive = toward the "right" corner).
 *  Computed by taking the desired screen point and mapping it BACK
 *  through the inverse of the box's own CSS matrix, so the resulting
 *  left/top (in the box's local, pre-transform pixel space) lands exactly
 *  where we want on screen once the box's transform is applied - the
 *  handle stays attached and correctly oriented at any rotation/scale.
 */
function positionRotateHandle(wrapFromLocal, width, height) {
  // Top-mid point of the box, in the box's own local (pre-transform) space.
  const topMidX = width / 2;
  const topMidY = 0;

  // Map that point into screen space using the box's live CSS matrix.
  const screenTopMid = wrapFromLocal.transformPoint(new DOMPoint(topMidX, topMidY));

  // Direction vectors (linear part only, no translation) so the offset is
  // measured in true screen px regardless of the box's rotation/scale/zoom:
  //   normal  = local "up"    (0,-1) mapped to screen, then normalized
  //   tangent = local "right" (1, 0) mapped to screen, then normalized
  const normal = normalizeVec(transformVector(wrapFromLocal, 0, -1));
  const tangent = normalizeVec(transformVector(wrapFromLocal, 1, 0));

  const desiredScreen = {
    x: screenTopMid.x + normal.x * ROTATE_HANDLE_DIST + tangent.x * TANGENT_OFFSET,
    y: screenTopMid.y + normal.y * ROTATE_HANDLE_DIST + tangent.y * TANGENT_OFFSET,
  };

  // Map the desired screen point back through the inverse of the box's own
  // matrix, so setting left/top to this lands exactly on `desiredScreen`
  // once the box's transform is applied.
  const localPoint = wrapFromLocal.inverse().transformPoint(new DOMPoint(desiredScreen.x, desiredScreen.y));

  const rotationDeg = (state.transform.rotation * 180) / Math.PI;
  const invScaleX = 1 / Math.max(Math.abs(state.transform.scaleX), TO_MIN_SCALE);
  const invScaleY = 1 / Math.max(Math.abs(state.transform.scaleY), TO_MIN_SCALE);

  // Rotate handle size: same idea as the resize handles - baseline off the
  //    canvas size (factor=20, 14-22px range on screen), compensated by the
  //    current zoom so the on-screen size stays constant at any zoom level.
  const canvasSize = Math.min(state.canvas.width, state.canvas.height);
  const handleScreenSize = getHandleScreenSize(canvasSize, 14, 22);
  const handleSize = screenSizeToLocal(handleScreenSize);
  const hitPad = screenSizeToLocal(ROTATE_HIT_PAD_SCREEN);
  const borderW = screenSizeToLocal(HANDLE_BORDER_SCREEN);

  const rot = handles.rotate;
  rot.style.left = `${localPoint.x}px`;
  rot.style.top = `${localPoint.y}px`;
  rot.style.width = `${handleSize}px`;
  rot.style.height = `${handleSize}px`;
  rot.style.setProperty('--hit-pad', `${hitPad}px`);
  rot.style.setProperty('--handle-border', `${borderW}px`);
  rot.style.transform = `translate(-50%, -50%) rotate(${-rotationDeg}deg) scale(${invScaleX}, ${invScaleY})`;
}

/** Transform a direction VECTOR (not a point) through a DOMMatrix - i.e. the
 *  linear (rotation+scale) part only, ignoring translation. */
function transformVector(m, vx, vy) {
  return { x: m.a * vx + m.c * vy, y: m.b * vx + m.d * vy };
}

function normalizeVec(v) {
  const len = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / len, y: v.y / len };
}

function matrixToCss(m) {
  return `matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, ${m.e}, ${m.f})`;
}

/** Canvas-space center of the box - the fixed pivot for the whole gesture. */
function getCenterCanvas() {
  const { width, height } = state.canvas;
  return { x: width / 2 + state.transform.x, y: height / 2 + state.transform.y };
}

/** Rotate a canvas-space point into the box's un-rotated local frame,
 *  relative to `center`. Used so scale math only ever has to reason about
 *  a straight, axis-aligned rectangle regardless of current rotation. */
function unrotateRelative(point, center, rotation) {
  const relX = point.x - center.x;
  const relY = point.y - center.y;
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  return { x: relX * cos - relY * sin, y: relX * sin + relY * cos };
}

function requestFrame() {
  scheduleTransformApply(() => render()); // render()'s afterRenderHooks call syncTransformOverlay() for us
}

/** Wire a single corner/edge resize handle. Scaling is always anchored at
 *  the box's current (fixed) center - dragging a corner grows/shrinks the
 *  box symmetrically, it never lets the opposite side "jump". */
function wireScaleHandle(el, def) {
  let gesture = null;

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!state.transform.active) return;
    el.setPointerCapture(e.pointerId);
    gesture = {
      pointerId: e.pointerId,
      rotation: state.transform.rotation, // frozen for the whole gesture
      center: getCenterCanvas(),
    };
  });

  el.addEventListener('pointermove', (e) => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    const canvasPt = screenToCanvasFloat(e.clientX, e.clientY);
    const local = unrotateRelative(canvasPt, gesture.center, gesture.rotation);
    const { width, height } = state.canvas;
    const halfW = width / 2 || 1;
    const halfH = height / 2 || 1;

    let newScaleX = state.transform.scaleX;
    let newScaleY = state.transform.scaleY;

    if (state.transform.aspectLocked && def.axis === 'both') {
      // Uniform scale that follows the pointer along the diagonal.
      const distNow = Math.hypot(local.x, local.y);
      const distOrig = Math.hypot(halfW, halfH) || 1;
      const factor = clamp(distNow / distOrig, TO_MIN_SCALE, TO_MAX_SCALE);
      newScaleX = factor;
      newScaleY = factor;
    } else {
      if (def.axis === 'both' || def.axis === 'x') {
        newScaleX = clamp(Math.abs(local.x) / halfW, TO_MIN_SCALE, TO_MAX_SCALE);
      }
      if (def.axis === 'both' || def.axis === 'y') {
        newScaleY = clamp(Math.abs(local.y) / halfH, TO_MIN_SCALE, TO_MAX_SCALE);
      }
      if (state.transform.aspectLocked && def.axis !== 'both') {
        // Edge handle with lock engaged: mirror the single axis to both.
        const factor = def.axis === 'x' ? newScaleX : newScaleY;
        newScaleX = factor;
        newScaleY = factor;
      }
    }

    state.transform.scaleX = newScaleX;
    state.transform.scaleY = newScaleY;
    state.transform.hasMoved = true;
    requestFrame();
  });

  const endGesture = (e) => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    gesture = null;
  };
  el.addEventListener('pointerup', endGesture);
  el.addEventListener('pointercancel', endGesture);
}

/** Wire the rotate handle: rotates around the box's fixed center, using a
 *  continuously-accumulated (never reset/wrapped) angle so it can spin
 *  through any number of full turns without snapping. */
function wireRotateHandle(el) {
  let gesture = null;

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!state.transform.active) return;
    el.setPointerCapture(e.pointerId);
    el.style.cursor = 'grabbing';
    const center = getCenterCanvas();
    const p = screenToCanvasFloat(e.clientX, e.clientY);
    gesture = {
      pointerId: e.pointerId,
      center,
      prevAngle: Math.atan2(p.y - center.y, p.x - center.x),
    };
  });

  el.addEventListener('pointermove', (e) => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    const p = screenToCanvasFloat(e.clientX, e.clientY);
    const angleNow = Math.atan2(p.y - gesture.center.y, p.x - gesture.center.x);
    let step = angleNow - gesture.prevAngle;
    // Normalize just THIS frame's step into (-pi, pi]. Per-frame steps are
    // always small in practice, so this only ever engages to fix the rare
    // frame that crosses the atan2 seam - it never clips a legitimate
    // large rotation within a single gesture.
    step = Math.atan2(Math.sin(step), Math.cos(step));
    state.transform.rotation += step;
    state.transform.hasMoved = true;
    gesture.prevAngle = angleNow;
    requestFrame();
  });

  const endGesture = (e) => {
    if (!gesture || e.pointerId !== gesture.pointerId) return;
    gesture = null;
    el.style.cursor = 'grab';
  };
  el.addEventListener('pointerup', endGesture);
  el.addEventListener('pointercancel', endGesture);
}


// ---- js/ui/dom-refs.js ----

/**
 * ui/dom-refs.js
 * Central `els` cache (id -> element, camelCased) shared by every other
 * ui/ submodule. Populated once by cacheElements() during initUI().
 *
 * `els` is exported as a stable object reference - submodules that need
 * DOM elements import this same object and read its properties at call
 * time (after cacheElements() has run), rather than each other cloning
 * or re-querying the DOM.
 */

const els = {};

function toCamel(id) {
  return id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function cacheElements() {
  const ids = [
    // Main layout
    'view-canvas', 'canvas-wrap', 'project-name', 'dirty-dot',
    // Top bar
    'btn-undo', 'btn-redo', 'btn-menu',
    'btn-panel-layers', 'btn-panel-color', 'btn-panel-file',
    // Status bar
    'status-size', 'status-zoom', 'status-tool',
    // Toolbar
    'toolbar', 'btn-zoom-in', 'btn-zoom-out', 'btn-grid', 'btn-clear',
    // Panels
    'scrim', 'panel-color', 'panel-layers', 'panel-file',
    // Color panel
    'swatch-primary', 'swatch-secondary', 'swatch-swap',
    'hex-input', 'alpha-slider',
    'hsv-square', 'hsv-square-canvas', 'hsv-square-thumb',
    'hue-slider', 'hue-slider-canvas', 'hue-slider-thumb',
    'default-swatches', 'custom-swatches', 'recent-swatches', 'favorite-swatches',
    'btn-add-custom', 'btn-export-palette', 'import-palette-input',
    // Layers panel
    'layer-list', 'btn-layer-add', 'btn-layer-dup', 'btn-layer-merge', 'btn-layer-delete',
    // File panel
    'btn-new', 'btn-open', 'btn-save-as', 'autosave-hint',
    'export-filename', 'export-scale', 'export-transparent',
    'btn-export-png', 'btn-export-sheet', 'btn-export-meta',
    'btn-export-project', 'import-project-input', 'toggle-dark-mode',
    // Tool options
    'tool-options', 'brush-size', 'brush-size-label', 'fill-shape-row', 'shape-filled',
    // Dialogs
    'dialog-new', 'new-size-w', 'new-size-h',
    'dialog-clear', 'confirm-clear',
    'dialog-save-as', 'save-as-name', 'confirm-save-as',
    'dialog-open', 'open-project-list', 'open-empty-hint',
    // Misc
    'toast-container',
    'btn-lang-th', 'btn-lang-en',
    // Transform
    'transform-controls', 'transform-apply', 'transform-cancel', 'transform-aspect-lock',

    'btn-background',

    'panel-background',

    'bg-color-picker',

    'bg-color-input',

    'bg-type-row',

    'bg-swatch-grid',

    'confirm-new',  // ✅ เพิ่ม

  ];

  for (const id of ids) {
    els[toCamel(id)] = document.getElementById(id);
  }
}


// ---- js/ui/toast.js ----

/**
 * ui/toast.js
 * Small "toast" popup notifications shown at the bottom of the screen.
 */



function toast(message, type = 'ok') {
  const node = document.createElement('div');
  node.className = 'toast' + (type === 'error' ? ' error' : '');
  node.textContent = message;
  els.toastContainer.appendChild(node);

  requestAnimationFrame(() => node.classList.add('show'));

  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 250);
  }, 2200);
}


// ---- js/ui/panels.js ----

/**
 * ui/panels.js
 * Generic bottom-sheet / side-panel open, close, toggle behavior shared
 * by the Color / Layers / File / Background panels.
 */




const panelMap = {};

function wirePanels() {
  panelMap[els.btnPanelColor.id] = els.panelColor;
  panelMap[els.btnPanelLayers.id] = els.panelLayers;
  panelMap[els.btnPanelFile.id] = els.panelFile;

  [els.btnPanelColor, els.btnPanelLayers, els.btnPanelFile].forEach((btn) => {
    btn.addEventListener('click', () => togglePanel(panelMap[btn.id]));
  });

  els.scrim.addEventListener('click', closeAllPanels);
  document.querySelectorAll('.panel-close').forEach((btn) => {
    btn.addEventListener('click', closeAllPanels);
  });
}

function togglePanel(panel) {
  const isOpen = !panel.hidden;
  closeAllPanels();
  if (!isOpen) {
    panel.hidden = false;
    els.scrim.hidden = false;
  }
  requestAnimationFrame(() => resizeViewport());
}

function closeAllPanels() {
  if (els.panelColor) els.panelColor.hidden = true;
  if (els.panelLayers) els.panelLayers.hidden = true;
  if (els.panelFile) els.panelFile.hidden = true;
  if (els.panelBackground) els.panelBackground.hidden = true;
  if (els.scrim) els.scrim.hidden = true;
  requestAnimationFrame(() => resizeViewport());
}


// ---- js/ui/layers-panel.js ----

/**
 * ui/layers-panel.js
 * Layer list rendering (thumbnails, name, opacity, visibility, lock),
 * the add/duplicate/merge/delete layer popup menu, and the transform
 * control bar (Apply / Cancel / aspect-lock).
 */









function wireLayerPanel() {
  els.btnLayerAdd.addEventListener('click', () => {
    addLayer();
    renderLayerList();
    toast(t('toast_layer_added'));
  });

  renderLayerList();
}

function makeLayerThumbDataUrl(layer) {
  const { width, height } = state.canvas;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  const imageData = ctx.createImageData(width, height);

  for (let i = 0; i < width * height; i++) {
    const v = layer.data[i];
    const o = i * 4;
    imageData.data[o] = v & 0xff;
    imageData.data[o + 1] = (v >>> 8) & 0xff;
    imageData.data[o + 2] = (v >>> 16) & 0xff;
    imageData.data[o + 3] = (v >>> 24) & 0xff;
  }
  ctx.putImageData(imageData, 0, 0);
  return c.toDataURL();
}

function renderLayerList() {
  if (!els.layerList) return;
  els.layerList.innerHTML = '';

  for (let i = state.layers.length - 1; i >= 0; i--) {
    const layer = state.layers[i];

    const row = document.createElement('li');
    row.className = 'layer-row' + (layer.id === state.activeLayerId ? ' active' : '');

    // Wrapper for the thumbnail + name (name sits on top).
    const thumbWrapper = document.createElement('div');
    thumbWrapper.className = 'layer-thumb-wrapper';
    thumbWrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      flex: 0 0 56px;
      width: 56px;
      align-items: center;
      gap: 2px;
    `;

    // Layer name (top).
    const nameInput = document.createElement('input');
    nameInput.className = 'layer-name';
    nameInput.value = layer.name;
    nameInput.style.cssText = `
      width: 100%;
      background: transparent;
      color: var(--text-0);
      border: none;
      border-radius: 4px;
      padding: 0 2px;
      font-size: 9px;
      font-weight: 500;
      text-align: center;
      outline: none;
      box-sizing: border-box;
      font-family: inherit;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      pointer-events: auto;
    `;

    nameInput.addEventListener('change', () => {
      renameLayer(layer.id, nameInput.value || t('layer_default_name'));
    });
    nameInput.addEventListener('click', (e) => e.stopPropagation());

    thumbWrapper.appendChild(nameInput);

    // Thumbnail (bottom).
    const thumb = document.createElement('div');
    thumb.className = 'layer-thumb';
    thumb.style.cssText = `
      width: 100%;
      height: 56px;
      background-image: url(${makeLayerThumbDataUrl(layer)});
      background-size: cover;
      background-position: center;
      image-rendering: pixelated;
      border-radius: 4px;
      border: 1px solid var(--line);
      flex-shrink: 0;
    `;
    thumbWrapper.appendChild(thumb);

    row.appendChild(thumbWrapper);

    // Opacity slider
    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.className = 'opacity-slider';
    opacitySlider.min = '0';
    opacitySlider.max = '100';
    opacitySlider.value = String(Math.round(layer.opacity * 100));
    opacitySlider.title = t('layer_opacity_title');
    opacitySlider.style.cssText = `
      width: 80px;
      height: 4px;
      flex-shrink: 0;
      accent-color: var(--accent);
      cursor: pointer;
    `;
    opacitySlider.addEventListener('input', () => {
      setOpacity(layer.id, parseInt(opacitySlider.value, 10) / 100);
      render();
    });
    row.appendChild(opacitySlider);

    // Visibility
    const visBtn = document.createElement('button');
    visBtn.className = 'icon-btn';
    visBtn.innerHTML = layer.visible
      ? `<span class="material-symbols-outlined">visibility</span>`
      : `<span class="material-symbols-outlined">visibility_off</span>`;
    visBtn.title = t('layer_toggle_visibility_title');
    visBtn.style.cssText = `
      width: 34px;
      height: 34px;
      border: none;
      background: transparent;
      color: var(--text-0);
      font-size: 18px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
    `;
    visBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleVisibility(layer.id);
      renderLayerList();
      render();
    });
    row.appendChild(visBtn);

    // Lock
    const lockBtn = document.createElement('button');
    lockBtn.className = 'icon-btn';
    lockBtn.innerHTML = layer.locked
      ? `<span class="material-symbols-outlined">lock</span>`
      : `<span class="material-symbols-outlined">lock_open</span>`;
    lockBtn.title = t('layer_toggle_lock_title');
    lockBtn.style.cssText = `
      width: 34px;
      height: 34px;
      border: none;
      background: transparent;
      color: var(--text-0);
      font-size: 18px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
    `;
    lockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLock(layer.id);
      renderLayerList();
    });
    row.appendChild(lockBtn);

    // 3 dots menu
    const menuBtn = document.createElement('button');
    menuBtn.className = 'icon-btn';
    menuBtn.innerHTML = `<span class="material-symbols-outlined">more_vert</span>`;
    menuBtn.title = t('layer_options_title');
    menuBtn.style.cssText = `
      width: 34px;
      height: 34px;
      border: none;
      background: transparent;
      color: var(--text-0);
      font-size: 18px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
    `;
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showLayerPopup(e, layer.id);
    });
    row.appendChild(menuBtn);

    // Click row to select layer
    row.addEventListener('click', (e) => {
      if (
        e.target === nameInput ||
        e.target === opacitySlider ||
        e.target.tagName === 'BUTTON' ||
        e.target.closest('button')
      ) return;
      state.activeLayerId = layer.id;
      renderLayerList();
    });

    els.layerList.appendChild(row);
  }
}

// ─── TRANSFORM CONTROL BAR (Apply / Cancel / aspect-lock) ──────
function wireTransformControls() {
  if (!els.transformApply) return;

  // Apply button.
  els.transformApply.addEventListener('click', () => {
    if (!state.transform.active) return;
    commitTransform();
    toast(t('toast_transform_applied'));
    renderLayerList();
    render();
  });

  // Cancel button.
  els.transformCancel.addEventListener('click', () => {
    if (!state.transform.active) return;
    cancelTransform();
    toast(t('toast_transform_cancelled'));
    renderLayerList();
    render();
  });

  // Close (X) button - uses the ID from the HTML.
  const transformCloseBtn = document.getElementById('transform-close');
  if (transformCloseBtn) {
    transformCloseBtn.addEventListener('click', () => {
      if (!state.transform.active) return;
      cancelTransform();
      toast(t('toast_transform_cancelled'));
      renderLayerList();
      render();
    });
  }

  els.transformAspectLock.addEventListener('change', () => {
    state.transform.aspectLocked = els.transformAspectLock.checked;
  });

  syncTransformControlsVisibility();
}

function syncTransformControlsVisibility() {
  if (!els.transformControls) return;
  els.transformControls.hidden = !state.transform.active;
  syncAspectLockCheckbox();
}

function syncAspectLockCheckbox() {
  if (!els.transformAspectLock) return;
  els.transformAspectLock.checked = state.transform.aspectLocked;
}

// ─── Layer Popup Menu ───
function showLayerPopup(event, layerId) {
  // Remove the old popup if one exists.
  const oldPopup = document.querySelector('.layer-popup');
  if (oldPopup) oldPopup.remove();

  const popup = document.createElement('div');
  popup.className = 'layer-popup';
  popup.style.position = 'fixed';
  popup.style.background = 'var(--bg-2)';
  popup.style.border = '1px solid var(--line)';
  popup.style.borderRadius = '12px';
  popup.style.padding = '8px';
  popup.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
  popup.style.zIndex = '100';
  popup.style.minWidth = '160px';
  popup.style.display = 'flex';
  popup.style.flexDirection = 'column';
  popup.style.gap = '4px';

  // ─── Compute position ───
  const rect = event.target.getBoundingClientRect();
  const popupWidth = 160;
  const popupHeight = 280; // ความสูงโดยประมาณของ popup (ปรับตามจำนวนปุ่ม)

  // Compute horizontal position (left).
  let left = rect.left - popupWidth + 34; // ให้ขอบขวาชิดกับปุ่ม

  // Clamp so it doesn't overflow the left edge of the screen.
  if (left < 10) left = 10;

  // Clamp so it doesn't overflow the right edge of the screen.
  if (left + popupWidth > window.innerWidth - 10) {
    left = window.innerWidth - popupWidth - 10;
  }

  // Compute vertical position (below the button).
  let top = rect.bottom + 4;

  // Check whether it would overflow the bottom of the screen.
  if (top + popupHeight > window.innerHeight - 10) {
    // If it would, show it above the button instead.
    top = rect.top - popupHeight - 4;
  }

  // If it still overflows above, center it on the screen.
  if (top < 10) {
    top = (window.innerHeight - popupHeight) / 2;
    left = (window.innerWidth - popupWidth) / 2;
  }

  popup.style.left = left + 'px';
  popup.style.top = top + 'px';

  // ─── Transform button ───
  const transformBtn = document.createElement('button');
  transformBtn.className = 'chip-btn';
  transformBtn.innerHTML = `
<span class="material-symbols-outlined">open_with</span>
${t('layer_popup_transform')}
`;
  transformBtn.style.width = '100%';
  transformBtn.style.justifyContent = 'flex-start';
  transformBtn.addEventListener('click', () => {
    popup.remove();
    activateTransformFromLayer(layerId);
  });
  popup.appendChild(transformBtn);

  // ─── Move Up button ───
  const upBtn = document.createElement('button');
  upBtn.className = 'chip-btn';
  upBtn.innerHTML = `
<span class="material-symbols-outlined">arrow_upward</span>
${t('layer_popup_move_up')}
`;
  upBtn.style.width = '100%';
  upBtn.style.justifyContent = 'flex-start';
  upBtn.addEventListener('click', () => {
    moveLayer(layerId, 1);
    renderLayerList();
    render();
    popup.remove();
  });
  popup.appendChild(upBtn);

  // ─── Move Down button ───
  const downBtn = document.createElement('button');
  downBtn.className = 'chip-btn';
  downBtn.innerHTML = `
<span class="material-symbols-outlined">arrow_downward</span>
${t('layer_popup_move_down')}
`;
  downBtn.style.width = '100%';
  downBtn.style.justifyContent = 'flex-start';
  downBtn.addEventListener('click', () => {
    moveLayer(layerId, -1);
    renderLayerList();
    render();
    popup.remove();
  });
  popup.appendChild(downBtn);

  // ─── Duplicate button ───
  const dupBtn = document.createElement('button');
  dupBtn.className = 'chip-btn';
  dupBtn.innerHTML = `
<span class="material-symbols-outlined">content_copy</span>
${t('layer_popup_duplicate')}
`;
  dupBtn.style.width = '100%';
  dupBtn.style.justifyContent = 'flex-start';
  dupBtn.addEventListener('click', () => {
    duplicateLayer(layerId);
    renderLayerList();
    render();
    popup.remove();
  });
  popup.appendChild(dupBtn);

  // ─── Merge Down button ───
  const mergeBtn = document.createElement('button');
  mergeBtn.className = 'chip-btn';
  mergeBtn.innerHTML = `
<img class="menu-icon" src="images/icon/merge_down.png">
${t('layer_popup_merge_down')}
`;
  mergeBtn.style.width = '100%';
  mergeBtn.style.justifyContent = 'flex-start';
  mergeBtn.addEventListener('click', () => {
    const ok = mergeDown(layerId);
    if (ok) {
      renderLayerList();
      render();
      toast(t('toast_layer_merged'));
    } else {
      toast(t('toast_layer_merge_error'), 'error');
    }
    popup.remove();
  });
  popup.appendChild(mergeBtn);

  // ─── Delete button ───
  const delBtn = document.createElement('button');
  delBtn.className = 'chip-btn danger';
  delBtn.innerHTML = `
<span class="material-symbols-outlined">delete</span>
${t('layer_popup_delete')}
`;
  delBtn.style.width = '100%';
  delBtn.style.justifyContent = 'flex-start';
  delBtn.addEventListener('click', () => {
    if (state.layers.length <= 1) {
      toast(t('toast_layer_delete_error'), 'error');
      popup.remove();
      return;
    }
    removeLayer(layerId);
    renderLayerList();
    render();
    popup.remove();
  });
  popup.appendChild(delBtn);
  document.body.appendChild(popup);

  // Click outside the popup to close it.
  const closePopup = (e) => {
    if (!popup.contains(e.target)) {
      popup.remove();
      document.removeEventListener('click', closePopup);
    }
  };
  setTimeout(() => document.addEventListener('click', closePopup), 10);
}

// ─── Activate Transform from the popup ─────────────────
function activateTransformFromLayer(layerId) {
  // Cancel any other active transform first.
  if (state.transform.active) {
    cancelTransform();
  }

  const ok = activateTransform(layerId);
  if (ok) {
    const layer = state.layers.find(l => l.id === layerId);
    toast(`🔧 ${t('toast_transform_active') || 'Transform:'} ${layer ? layer.name : ''}`);
    renderLayerList();
    render();
    closeAllPanels();
  }
}


// ---- js/colorpicker.js ----

/**
 * colorpicker.js
 * A self-contained HSV color picker widget: a vertical rainbow hue slider
 * plus a saturation/value square, each with a draggable indicator.
 *
 * This module owns ONLY the widget's own rendering + drag state (current
 * h/s/v/a, canvas gradients, thumb positions). It never touches app state
 * directly - it reports changes through the `onChange(packed, { commit })`
 * callback supplied by ui.js, and ui.js decides what to do with them
 * (update state.primaryColor, palette, etc). This mirrors how input.js
 * reports gestures without owning the document.
 *
 * Color math (HSV <-> RGB, packed RGBA) is not duplicated here - it's
 * reused from utils.js so there is exactly one implementation of each
 * conversion in the whole app.
 */



let squareEl, squareCanvas, squareCtx, squareThumb;
let hueEl, hueCanvas, hueCtx, hueThumb;
let onChange = null; // (packedRGBA, { commit: boolean }) => void

// Current widget color, independent of any particular packed representation
// so hue isn't lost when saturation or value drops to 0 (packed RGBA alone
// can't represent that - e.g. pure black has no defined hue).
let h = 0, s = 0, v = 0, a = 255;

let lastDrawnHue = null; // skip re-drawing the SV square unless hue actually changed
let dragging = null; // 'square' | 'hue' | null
let pendingPointer = null; // {clientX, clientY} queued for the next animation frame
let rafHandle = 0;

/**
 * Wires up the picker. `els` must contain the DOM elements for the square
 * and hue slider (container, canvas, and thumb for each). `callbacks.onChange`
 * is invoked any time the user drags/taps a control.
 */
function initColorPicker(els, callbacks = {}) {
  squareEl = els.hsvSquare;
  squareCanvas = els.hsvSquareCanvas;
  squareThumb = els.hsvSquareThumb;
  hueEl = els.hueSlider;
  hueCanvas = els.hueSliderCanvas;
  hueThumb = els.hueSliderThumb;
  onChange = callbacks.onChange || null;

  squareCtx = squareCanvas.getContext('2d', { willReadFrequently: false });
  hueCtx = hueCanvas.getContext('2d', { willReadFrequently: false });

  // We handle the drag gesture ourselves (including outside the element's
  // bounds via pointer capture), so stop the browser from scrolling/zooming
  // the page in response to touch/pen input on these controls.
  squareEl.style.touchAction = 'none';
  hueEl.style.touchAction = 'none';

  squareEl.addEventListener('pointerdown', (e) => startDrag('square', e));
  hueEl.addEventListener('pointerdown', (e) => startDrag('hue', e));
  window.addEventListener('pointermove', cpOnPointerMove);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // Canvas backing stores are sized in device pixels for crisp gradients.
  // The color panel starts off `hidden` (display:none), so the square/hue
  // elements report 0x0 at the moment initColorPicker() runs - a plain
  // 'resize' listener would miss the panel opening later. ResizeObserver
  // catches that transition too (going from 0x0 to real dimensions), as
  // well as device rotation, so the gradients never end up stuck at a
  // stale/degenerate size.
  const resizeObserver = new ResizeObserver(() => {
    cpSyncCanvasSize();
    drawHueSlider();
    drawSquare(true);
    positionThumbs();
  });
  resizeObserver.observe(squareEl);
  resizeObserver.observe(hueEl);

  cpSyncCanvasSize();
  drawHueSlider();
  drawSquare(true);
  positionThumbs();
}

/** Push a color that changed from *outside* the picker (hex input, alpha
 *  slider, swatch click, eyedropper, undo/redo, loading a project, ...)
 *  so the picker's own controls stay in sync. Cheap to call often: the
 *  SV square gradient is only rebuilt if the hue actually changed. */
function setPickerColor(packed) {
  const [hh, ss, vv, aa] = packedToHsv(packed);
  h = hh; s = ss; v = vv; a = aa;
  drawSquare();
  positionThumbs();
}

function cpSyncCanvasSize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const [el, canvas] of [[squareEl, squareCanvas], [hueEl, hueCanvas]]) {
    const rect = el.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const hgt = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== hgt) {
      canvas.width = w;
      canvas.height = hgt;
    }
  }
}

/* ---------------------------- drag handling ---------------------------- */

function startDrag(kind, e) {
  dragging = kind;
  const el = kind === 'square' ? squareEl : hueEl;
  el.setPointerCapture(e.pointerId);
  handlePointerAt(kind, e.clientX, e.clientY);
  e.preventDefault();
}

function cpOnPointerMove(e) {
  if (!dragging) return;
  pendingPointer = { clientX: e.clientX, clientY: e.clientY };
  if (!rafHandle) {
    rafHandle = requestAnimationFrame(flushPointer);
  }
}

function flushPointer() {
  rafHandle = 0;
  if (dragging && pendingPointer) {
    handlePointerAt(dragging, pendingPointer.clientX, pendingPointer.clientY);
  }
  pendingPointer = null;
}

function endDrag() {
  if (!dragging) return;
  dragging = null;
  pendingPointer = null;
  if (rafHandle) { cancelAnimationFrame(rafHandle); rafHandle = 0; }
  notifyChange(true); // commit: this is where recent-colors etc. should update
}

function handlePointerAt(kind, clientX, clientY) {
  if (kind === 'square') {
    const rect = squareEl.getBoundingClientRect();
    s = clamp((clientX - rect.left) / rect.width, 0, 1);
    v = 1 - clamp((clientY - rect.top) / rect.height, 0, 1);
    positionSquareThumb();
  } else {
    const rect = hueEl.getBoundingClientRect();
    h = clamp((clientY - rect.top) / rect.height, 0, 1) * 360;
    positionHueThumb();
    drawSquare(); // hue changed -> the square's base gradient must be rebuilt
  }
  notifyChange(false);
}

function notifyChange(commit) {
  if (onChange) onChange(hsvToPacked(h, s, v, a), { commit });
}

/* ------------------------------ rendering ------------------------------ */

/** Vertical rainbow gradient. Hue never affects this, so it's drawn once
 *  at init (and again only on resize, since the canvas clears itself). */
function drawHueSlider() {
  const w = hueCanvas.width, hgt = hueCanvas.height;
  const grad = hueCtx.createLinearGradient(0, 0, 0, hgt);
  for (let i = 0; i <= 6; i++) {
    const [r, g, b] = hsvToRgb(i * 60, 1, 1);
    grad.addColorStop(i / 6, `rgb(${r},${g},${b})`);
  }
  hueCtx.fillStyle = grad;
  hueCtx.fillRect(0, 0, w, hgt);
}

/** Saturation/value square for the *current* hue. Skipped unless the hue
 *  actually changed (or `force` is set), per the performance requirement
 *  that gradients aren't recreated every frame while dragging the square. */
function drawSquare(force = false) {
  if (!force && lastDrawnHue === h) return;
  lastDrawnHue = h;

  const w = squareCanvas.width, hgt = squareCanvas.height;
  const [r, g, b] = hsvToRgb(h, 1, 1);

  squareCtx.fillStyle = `rgb(${r},${g},${b})`;
  squareCtx.fillRect(0, 0, w, hgt);

  const satGrad = squareCtx.createLinearGradient(0, 0, w, 0);
  satGrad.addColorStop(0, 'rgba(255,255,255,1)');
  satGrad.addColorStop(1, 'rgba(255,255,255,0)');
  squareCtx.fillStyle = satGrad;
  squareCtx.fillRect(0, 0, w, hgt);

  const valGrad = squareCtx.createLinearGradient(0, hgt, 0, 0);
  valGrad.addColorStop(0, 'rgba(0,0,0,1)');
  valGrad.addColorStop(1, 'rgba(0,0,0,0)');
  squareCtx.fillStyle = valGrad;
  squareCtx.fillRect(0, 0, w, hgt);
}

function positionThumbs() {
  positionSquareThumb();
  positionHueThumb();
}

function positionSquareThumb() {
  squareThumb.style.left = `${s * 100}%`;
  squareThumb.style.top = `${(1 - v) * 100}%`;
}

function positionHueThumb() {
  hueThumb.style.top = `${(h / 360) * 100}%`;
}


// ---- js/ui/color-panel.js ----

/**
 * ui/color-panel.js
 * Primary/secondary color swatches, hex + alpha inputs, HSV picker wiring,
 * and the default/custom/recent/favorite swatch grids.
 */









function currentAlpha() {
  return unpackRGBA(state.primaryColor)[3];
}

function wireColorPanel() {
  renderSwatchGrid(els.defaultSwatches, DEFAULT_SWATCHES, false);
  initColorPicker(els, { onChange: onPickerChange });

  els.swatchSecondary.addEventListener('click', () => {
    const tmp = state.primaryColor;
    state.primaryColor = state.secondaryColor;
    state.secondaryColor = tmp;
    updateColorUI();
  });

  els.swatchSwap.addEventListener('click', () => {
    const tmp = state.primaryColor;
    state.primaryColor = state.secondaryColor;
    state.secondaryColor = tmp;
    updateColorUI();
  });

  els.hexInput.addEventListener('change', () => {
    const val = els.hexInput.value.trim();
    if (/^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(val)) {
      setPrimaryFromHex(val, currentAlpha());
    } else {
      els.hexInput.value = packedToHex(state.primaryColor);
    }
  });

  els.alphaSlider.addEventListener('input', () => {
    const hex = packedToHex(state.primaryColor);
    setPrimaryFromHex(hex, parseInt(els.alphaSlider.value, 10));
  });

  els.btnAddCustom.addEventListener('click', () => {
    addCustomColor(packedToHex(state.primaryColor));
  });

  els.btnExportPalette.addEventListener('click', () => {
    exportPaletteJSON();
    toast(t('toast_palette_exported'));
  });

  els.importPaletteInput.addEventListener('change', async () => {
    const file = els.importPaletteInput.files[0];
    if (!file) return;
    try {
      await importPaletteJSON(file);
      toast(t('toast_palette_imported'));
    } catch (err) {
      toast(t('toast_palette_import_error'), 'error');
    }
    els.importPaletteInput.value = '';
  });

  updateColorUI();
}

function setPrimaryFromHex(hex, alpha) {
  state.primaryColor = hexToPacked(hex, alpha);
  updateColorUI();
}

function onEyedropperPick(colorInt) {
  state.primaryColor = colorInt;
  updateColorUI();
  toast(t('toast_color_picked'));
}

function onPickerChange(packed, { commit }) {
  state.primaryColor = packed;
  els.swatchPrimary.style.setProperty('--swatch-color', packedToRgbaCss(packed));
  els.hexInput.value = packedToHex(packed);
  els.alphaSlider.value = String(unpackRGBA(packed)[3]);
  if (commit) {
    renderSwatchGrid(els.recentSwatches, state.palette.recent, false);
  }
}

function updateColorUI() {
  els.swatchPrimary.style.setProperty('--swatch-color', packedToRgbaCss(state.primaryColor));
  els.swatchSecondary.style.setProperty('--swatch-color', packedToRgbaCss(state.secondaryColor));
  const hex = packedToHex(state.primaryColor);
  els.hexInput.value = hex;
  els.alphaSlider.value = String(currentAlpha());
  setPickerColor(state.primaryColor);
  renderSwatchGrid(els.customSwatches, state.palette.custom, true, removeCustomColor);
  renderSwatchGrid(els.recentSwatches, state.palette.recent, false);
  renderSwatchGrid(els.favoriteSwatches, state.palette.favorites, false);
}

function packedToRgbaCss(packed) {
  const [r, g, b, a] = unpackRGBA(packed);
  return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
}

function renderSwatchGrid(container, hexList, allowRemove, onRemove) {
  if (!container) return;
  container.innerHTML = '';

  for (const hex of hexList) {
    const cell = document.createElement('button');
    cell.className = 'swatch-cell';
    cell.style.background = hex;
    cell.title = hex;
    if (isFavorite(hex)) cell.classList.add('favorited');

    cell.addEventListener('click', () => {
      setPrimaryFromHex(hex, 255);
    });

    let pressTimer = null;
    cell.addEventListener('pointerdown', () => {
      pressTimer = setTimeout(() => {
        toggleFavorite(hex);
        updateColorUI();
      }, 550);
    });
    cell.addEventListener('pointerup', () => clearTimeout(pressTimer));
    cell.addEventListener('pointerleave', () => clearTimeout(pressTimer));

    if (allowRemove) {
      cell.addEventListener('dblclick', () => onRemove(hex));
      cell.title += t('swatch_hint_remove');
    } else {
      cell.title += t('swatch_hint_favorite');
    }

    container.appendChild(cell);
  }
}


// ---- js/ui/background-panel.js ----

/**
 * ui/background-panel.js
 * The canvas background panel: pick solid/checkerboard/transparent type,
 * pick a solid color via input or swatch grid.
 */







function wireBackgroundPanel() {
  // Button that opens the panel from the file panel.
  if (els.btnBackground) {
    els.btnBackground.addEventListener('click', openBackgroundPanel);
  }

  // Select the background type.
  if (els.bgTypeRow) {
    els.bgTypeRow.querySelectorAll('[data-bg-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.bgType;
        state.bg.type = type;
        updateBackgroundUI();
        render();
        markCompositeDirty();
      });
    });
  }

  // Change color (live, real-time).
  if (els.bgColorInput) {
    els.bgColorInput.addEventListener('input', () => {
      state.bg.color = els.bgColorInput.value;
      render();
      markCompositeDirty();
    });
  }

  // Update the UI the first time the panel opens.
  updateBackgroundUI();
}

function openBackgroundPanel() {
  // Close other panels.
  closeAllPanels();
  // Open panel-background.
  if (els.panelBackground) {
    els.panelBackground.hidden = false;
  }
  if (els.scrim) {
    els.scrim.hidden = false;
  }
  updateBackgroundUI();
  requestAnimationFrame(() => resizeViewport());
}

function updateBackgroundUI() {
  const { type, color } = state.bg;

  // Update the active class on the type buttons.
  if (els.bgTypeRow) {
    els.bgTypeRow.querySelectorAll('[data-bg-type]').forEach((btn) => {
      btn.classList.toggle('primary', btn.dataset.bgType === type);
    });
  }

  // Show/hide the color picker.
  const isSolid = type === 'solid';
  if (els.bgColorPicker) {
    els.bgColorPicker.hidden = !isSolid;
  }

  if (isSolid && els.bgColorInput) {
    els.bgColorInput.value = color;
  }

  renderBgSwatches();
}

function renderBgSwatches() {
  if (!els.bgSwatchGrid) return;

  const colors = ['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
  const grid = els.bgSwatchGrid;
  grid.innerHTML = '';

  for (const c of colors) {
    const cell = document.createElement('button');
    cell.className = 'swatch-cell';
    cell.style.background = c;
    cell.style.width = '30px';
    cell.style.height = '30px';
    cell.style.borderRadius = '6px';
    cell.style.border = '1px solid var(--line)';
    cell.style.cursor = 'pointer';
    cell.addEventListener('click', () => {
      state.bg.color = c;  // ✅ แก้จาก state.background → state.bg
      if (els.bgColorInput) els.bgColorInput.value = c;
      render();
      markCompositeDirty();
      grid.querySelectorAll('.swatch-cell').forEach(el => el.style.outline = 'none');
      cell.style.outline = '2px solid var(--accent)';
    });
    grid.appendChild(cell);
  }
}


// ---- js/ui/status.js ----

/**
 * ui/status.js
 * Status bar (size/zoom text), project name + dirty dot, viewport resize
 * handling, and the central state-change subscriber that keeps all the
 * panels in sync with each other.
 */











function wireResize() {
  const ro = new ResizeObserver(() => render());
  ro.observe(els.canvasWrap);
  window.addEventListener('orientationchange', () => setTimeout(() => render(), 200));
}

function updateStatusBar() {
  els.statusSize.textContent = sizeLabel(state.canvas.width, state.canvas.height);
  els.statusZoom.textContent = `${Math.round(state.view.zoom * 100)}%`;
}

function updateProjectNameUI() {
  els.projectName.textContent = state.project.name === 'untitled'
    ? t('project_name_untitled')
    : state.project.name;
  els.dirtyDot.hidden = !state.project.dirty;
}

function onStateChange(topic) {
  if (topic === 'history' || topic === 'document') updateUndoRedoButtons();
  if (topic === 'document') { renderLayerList(); updateColorUI(); }
  if (topic === 'layers') renderLayerList();
  if (topic === 'palette') {
    renderSwatchGrid(els.recentSwatches, state.palette.recent, false);
  }
  if (topic === 'transform') {
    renderLayerList(); // Refresh transform button states
    syncTransformControlsVisibility();
  }
  if (topic === 'dirty' || topic === 'document') updateProjectNameUI();
  updateStatusBar();

  if (topic === 'bg') {
    updateBackgroundUI();
  }
}

function refreshAll() {
  updateUndoRedoButtons();
  updateProjectNameUI();
  updateStatusBar();
  updateColorUI();
  renderLayerList();
}


// ---- js/ui/dialogs.js ----

/**
 * ui/dialogs.js
 * The modal dialogs launched from the File panel: New canvas (grid size
 * picker + custom size), Clear canvas confirm, Save As, and Open project
 * list. Also the generic openDialog/closeDialog helpers used everywhere.
 */













// ─── Selected size state ───────────────────────────────
// Kept at module level (not inside wireDialogs) because resetNewCanvasUI()
// lives outside wireDialogs() but still needs to read/write this same state.
let selectedSize = null; // { w, h } หรือ null
let isCustomMode = false;

function wireDialogs() {
  // ─── Cancel button ───────────────────────────────────
  document.querySelectorAll('[data-dialog-cancel]').forEach((btn) => {
    btn.addEventListener('click', () => closeDialog(btn.closest('.dialog-overlay')));
  });

  // ─── Grid Size Selection ─────────────────────────────
  const sizeBtns = document.querySelectorAll('.size-btn[data-size]');
  sizeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const size = parseInt(btn.dataset.size, 10);

      // Remove 'selected' from every other button.
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));

      // Add 'selected' to this button.
      btn.classList.add('selected');

      // Hide the custom row if it's open.
      const customRow = document.getElementById('custom-size-row');
      if (customRow) customRow.hidden = true;
      const customBtn = document.getElementById('size-custom-btn');
      if (customBtn) customBtn.style.display = '';

      isCustomMode = false;
      selectedSize = { w: size, h: size };

      // Hide the warning message.
      hideSizeWarning();
    });
  });

  // ─── Custom button ───────────────────────────────────
  const customBtn = document.getElementById('size-custom-btn');
  const customRow = document.getElementById('custom-size-row');

  if (customBtn) {
    customBtn.addEventListener('click', () => {
      // Remove 'selected' from every other button.
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));

      // Add 'selected' to the Custom button.
      customBtn.classList.add('selected');

      customRow.hidden = false;
      isCustomMode = true;
      selectedSize = null;

      setTimeout(() => els.newSizeW?.focus(), 100);
      checkSizeWarning();
    });
  }

  // ─── Create (confirm) button ─────────────────────────
  const confirmBtn = document.getElementById('confirm-new');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      let w, h;

      if (isCustomMode) {
        // ✅ Custom mode
        w = clamp(parseInt(els.newSizeW?.value, 10) || 32, 1, 2048);
        h = clamp(parseInt(els.newSizeH?.value, 10) || 32, 1, 2048);

        // If over 1024, just warn - still allowed to create.
        if (w > 1024 || h > 1024) {
          // The warning text is shown elsewhere; no need to block here.
        }
      } else if (selectedSize) {
        // Size chosen from a preset button.
        w = selectedSize.w;
        h = selectedSize.h;
      } else {
        // Nothing selected yet.
        toast('กรุณาเลือกขนาดก่อน', 'error');
        return;
      }

      createNewCanvas(w, h);
      closeDialog(els.dialogNew);
      resetNewCanvasUI();
    });
  }

  // ─── Size validation (real-time) ────────────────────
  if (els.newSizeW) {
    els.newSizeW.addEventListener('input', checkSizeWarning);
  }
  if (els.newSizeH) {
    els.newSizeH.addEventListener('input', checkSizeWarning);
  }

  // ─── Enter key inside the custom size fields ─────────
  if (els.newSizeW) {
    els.newSizeW.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmBtn?.click();
    });
  }
  if (els.newSizeH) {
    els.newSizeH.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmBtn?.click();
    });
  }

  // ─── Clear Canvas ─────────────────────────────────────
  els.confirmClear.addEventListener('click', () => {
    const layer = getActiveLayer();
    if (layer) {
      beginAction();
      layer.data.fill(0);
      commitAction();
      markDirty();
      markCompositeDirty();
      render();
      scheduleAutosave();
    }
    closeDialog(els.dialogClear);
    toast(t('toast_canvas_cleared'));
  });

  // ─── Save As ──────────────────────────────────────────
  els.confirmSaveAs.addEventListener('click', () => {
    const name = els.saveAsName.value.trim();
    if (!name) {
      toast(t('toast_project_name_required'), 'error');
      return;
    }
    saveProjectAs(name);
    closeDialog(els.dialogSaveAs);
    toast(t('toast_project_saved', { name }));
    updateProjectNameUI();
  });
}

// ─── Create a new canvas ─────────────────────────────────
function createNewCanvas(w, h) {
  // Hide the Home and New Canvas pages (if present).
  const homePage = document.getElementById('home-page');
  if (homePage) homePage.classList.add('hidden');

  const newCanvasPage = document.getElementById('new-canvas-page');
  if (newCanvasPage) newCanvasPage.classList.add('hidden');

  resetDocument(w, h);
  resetHistory();
  markCompositeDirty();
  fitAndCenter();
  render();
  renderLayerList();
  updateAnimationUI();
  saveAutosave();
  toast(t('toast_canvas_created', { size: sizeLabel(w, h) }));
}

// ─── Reset the UI when the dialog closes ─────────────────
function resetNewCanvasUI() {
  const customRow = document.getElementById('custom-size-row');
  const customBtn = document.getElementById('size-custom-btn');

  if (customRow) customRow.hidden = true;
  if (customBtn) customBtn.style.display = '';

  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));

  if (els.newSizeW) els.newSizeW.value = 32;
  if (els.newSizeH) els.newSizeH.value = 32;

  isCustomMode = false;
  selectedSize = null;
  hideSizeWarning();
}

// ─── Size warning check ───────────────────────────────────
function checkSizeWarning() {
  const w = parseInt(els.newSizeW?.value, 10) || 0;
  const h = parseInt(els.newSizeH?.value, 10) || 0;
  const warningEl = document.getElementById('new-size-warning-text');

  if (!warningEl) return;

  if (w > 1024 || h > 1024) {
    warningEl.hidden = false;
  } else {
    warningEl.hidden = true;
  }
}

// ─── Hide the warning message ─────────────────────────────
function hideSizeWarning() {
  const warningEl = document.getElementById('new-size-warning-text');
  if (warningEl) warningEl.hidden = true;
}

function openOpenDialog() {
  const projects = listProjects();
  els.openProjectList.innerHTML = '';
  els.openEmptyHint.hidden = projects.length > 0;

  for (const p of projects) {
    const row = document.createElement('li');
    row.className = 'project-row';

    const label = document.createElement('span');
    label.textContent = `${p.name} · ${sizeLabel(p.width, p.height)}`;
    row.appendChild(label);

    const actions = document.createElement('div');
    actions.className = 'field-row';

    const loadBtn = document.createElement('button');
    loadBtn.className = 'chip-btn primary';
    loadBtn.textContent = t('project_open_button');
    loadBtn.addEventListener('click', () => {
      const doc = loadProject(p.name);
      if (doc) {
        loadDocument(doc);
        resetHistory();
        markCompositeDirty();
        fitAndCenter();
        render();
        renderLayerList();
        updateColorUI();
        updateAnimationUI();
        closeDialog(els.dialogOpen);
        toast(t('toast_project_opened', { name: p.name }));
      }
    });
    actions.appendChild(loadBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'chip-btn danger';
    delBtn.textContent = t('project_delete_button');
    delBtn.addEventListener('click', () => {
      deleteProject(p.name);
      openOpenDialog();
    });
    actions.appendChild(delBtn);

    row.appendChild(actions);
    els.openProjectList.appendChild(row);
  }
  openDialog(els.dialogOpen);
}

function openDialog(dialog) { dialog.hidden = false; }
function closeDialog(dialog) { dialog.hidden = true; }


// ---- js/ui/toolbar.js ----

/**
 * ui/toolbar.js
 * Tool selection (pencil/eraser/bucket/...), zoom + grid toggle,
 * undo/redo buttons, and all desktop keyboard shortcuts. Grouped
 * together because the keyboard-shortcut handler drives all of them.
 */













// ============================================================
// TOOLS
// ============================================================

function wireToolbar() {
  els.toolbar.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => setActiveTool(btn.dataset.tool));
  });

els.brushSize.addEventListener('input', () => {
  state.toolOptions.brushSize = parseInt(els.brushSize.value, 10);
  els.brushSizeLabel.textContent = `${els.brushSize.value}px`;
});

  els.shapeFilled.addEventListener('change', () => {
    state.toolOptions.shapeFilled = els.shapeFilled.checked;
  });

  els.btnClear.addEventListener('click', () => openDialog(els.dialogClear));
}

function setActiveTool(tool) {
  state.tool = tool;
  els.toolbar.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
  els.statusTool.textContent = toolLabel(tool);

  // Tool options: Brush Size is always shown (every tool).
  const isPaintTool = tool === 'pencil' || tool === 'eraser';
  const isShapeTool = tool === 'line' || tool === 'rect' || tool === 'circle';

  // Show tool options for every tool except bucket, eyedropper, and pan.
  const showOptions = isPaintTool || isShapeTool;
  els.toolOptions.hidden = !showOptions;

  // Show the Filled checkbox only for shape tools.
  els.fillShapeRow.hidden = !isShapeTool;

  // Brush size is always shown (both Pencil and Shape) - no separate hide needed.

  requestAnimationFrame(() => {
    resizeViewport();
  });
}

function toolLabel(tool) {
  return t(`status_tool_${tool}`) || tool;
}

// ============================================================
// ZOOM / GRID
// ============================================================

function wireZoomAndGrid() {
  els.btnZoomIn.addEventListener('click', () => zoomBy(1.25));
  els.btnZoomOut.addEventListener('click', () => zoomBy(0.8));
  els.btnGrid.addEventListener('click', () => {
    state.view.gridVisible = !state.view.gridVisible;
    els.btnGrid.classList.toggle('active', state.view.gridVisible);
    render();
  });
  els.btnGrid.classList.toggle('active', state.view.gridVisible);
}

function zoomBy(factor) {
  const rect = els.viewCanvas.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const { zoom, panX, panY } = state.view;

  // Smaller step at lower zoom levels.
  const step = Math.max(0.05, zoom * 0.08);
  let newZoom = zoom;
  if (factor > 1) {
    newZoom = Math.min(64, zoom + step);
  } else {
    newZoom = Math.max(0.1, zoom - step); // จาก 1 → 0.1
  }
  newZoom = Math.round(newZoom * 10) / 10; // ทศนิยม 1 ตำแหน่ง

  if (newZoom === zoom) return;

  const worldX = (cx - panX) / zoom;
  const worldY = (cy - panY) / zoom;
  state.view.zoom = newZoom;
  state.view.panX = cx - worldX * newZoom;
  state.view.panY = cy - worldY * newZoom;
  render();
  updateStatusBar();
}

// ============================================================
// UNDO / REDO
// ============================================================

function wireUndoRedo() {
  els.btnUndo.addEventListener('click', () => {
    undo();
    markCompositeDirty();
    render();
    scheduleAutosave();
  });
  els.btnRedo.addEventListener('click', () => {
    redo();
    markCompositeDirty();
    render();
    scheduleAutosave();
  });
}

function updateUndoRedoButtons() {
  els.btnUndo.disabled = !canUndo();
  els.btnRedo.disabled = !canRedo();
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================

function wireKeyboardShortcuts() {
  const keyToTool = {
    b: 'pencil', e: 'eraser', g: 'bucket', l: 'line',
    r: 'rect', c: 'circle', i: 'eyedropper', h: 'pan',
  };

  window.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

    // ─── Transform shortcuts ──────────────────────────────
    if (state.transform.active) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitTransform();
        toast(t('toast_transform_applied') || '✅ Transform applied');
        renderLayerList();
        render();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelTransform();
        toast(t('toast_transform_cancelled') || '❌ Transform cancelled');
        renderLayerList();
        render();
        return;
      }
      // A = toggle aspect-ratio lock for the resize handles (spec item 5).
      // (The old M/S/R "mode switch" keys never changed actual pointer
      // behavior - onPointerMove ignored state.transform.mode entirely -
      // so they're replaced here with a toggle that does something real.)
      if (e.key === 'a' || e.key === 'A') {
        state.transform.aspectLocked = !state.transform.aspectLocked;
        toast(state.transform.aspectLocked ? t('toast_aspect_locked') : t('toast_aspect_unlocked'));
        syncAspectLockCheckbox();
        return;
      }
    }

    // ─── Undo / Redo ──────────────────────────────────────
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) { redo(); } else { undo(); }
      markCompositeDirty();
      render();
      scheduleAutosave();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
      markCompositeDirty();
      render();
      scheduleAutosave();
      return;
    }

    // ─── Grid toggle ──────────────────────────────────────
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      state.view.gridVisible = !state.view.gridVisible;
      els.btnGrid.classList.toggle('active', state.view.gridVisible);
      render();
      return;
    }

    // ─── Zoom ─────────────────────────────────────────────
    if (e.key === '+' || e.key === '=') { zoomBy(1.25); return; }
    if (e.key === '-' || e.key === '_') { zoomBy(0.8); return; }

    // ─── Tool shortcuts ──────────────────────────────────
    const tool = keyToTool[e.key.toLowerCase()];
    if (tool) setActiveTool(tool);
  });
}


// ---- js/export.js ----

/**
 * export.js
 * Turns the current document into downloadable files: PNG (with optional
 * transparent background and integer upscale), and a JSON metadata sidecar
 * useful for game engines (canvas size, layer names, palette).
 */





function triggerDownload(blobOrUrl, filename) {
  const a = document.createElement('a');
  const isUrl = typeof blobOrUrl === 'string';
  a.href = isUrl ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (!isUrl) {
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
}

/** Export the composited image as a PNG file.
 *  @param {string} filename
 *  @param {number} scale integer upscale factor (1 = native pixel size)
 *  @param {boolean} transparentBackground if false, flattens onto white */
function exportPNG(filename, scale = 1, transparentBackground = true) {
  const canvas = exportCanvas(scale, transparentBackground ? null : '#ffffff');
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('Could not create PNG blob'));
      const name = filename.endsWith('.png') ? filename : `${filename}.png`;
      triggerDownload(blob, name);
      resolve(name);
    }, 'image/png');
  });
}

/** Export a simple horizontal sprite sheet: one frame per visible layer,
 *  left to right, at native resolution times `scale`. This is a practical
 *  stand-in until true animation frames (see js/animation.js) ship in v2 -
 *  it lets layer-based "frames" (e.g. walk-cycle poses kept on layers) be
 *  exported as a sheet today. */
function exportSpriteSheetFromLayers(filename, scale = 1) {
  const { width, height } = state.canvas;
  const frames = state.layers.filter((l) => l.visible);
  const sheet = document.createElement('canvas');
  sheet.width = width * scale * frames.length;
  sheet.height = height * scale;
  const ctx = sheet.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  frames.forEach((layer, i) => {
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = width;
    frameCanvas.height = height;
    const fctx = frameCanvas.getContext('2d');
    const imageData = fctx.createImageData(width, height);
    for (let p = 0; p < width * height; p++) {
      const c = layer.data[p];
      const o = p * 4;
      imageData.data[o] = c & 0xff;
      imageData.data[o + 1] = (c >>> 8) & 0xff;
      imageData.data[o + 2] = (c >>> 16) & 0xff;
      imageData.data[o + 3] = (c >>> 24) & 0xff;
    }
    fctx.putImageData(imageData, 0, 0);
    ctx.drawImage(frameCanvas, 0, 0, width, height, i * width * scale, 0, width * scale, height * scale);
  });

  return new Promise((resolve, reject) => {
    sheet.toBlob((blob) => {
      if (!blob) return reject(new Error('Could not create sprite sheet blob'));
      const name = filename.endsWith('.png') ? filename : `${filename}.png`;
      triggerDownload(blob, name);
      resolve(name);
    }, 'image/png');
  });
}

/** Export JSON metadata describing the document: canvas size, layers,
 *  palette. Useful alongside the PNG for game-engine import pipelines. */
function exportMetadataJSON(filename) {
  const doc = serializeDocument();
  const meta = {
    name: doc.name,
    canvas: doc.canvas,
    layers: doc.layers.map((l) => ({ name: l.name, visible: l.visible, opacity: l.opacity })),
    palette: doc.palette,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });
  const name = filename.endsWith('.json') ? filename : `${filename}.json`;
  triggerDownload(blob, name);
  return name;
}

/** Export the full project (all layers, full fidelity) as a .json file the
 *  editor itself can re-open later via storage.js/loadDocument. */
function exportProjectFile(filename) {
  const doc = serializeDocument();
  const blob = new Blob([JSON.stringify(doc)], { type: 'application/json' });
  const name = filename.endsWith('.pxproj.json') ? filename : `${filename}.pxproj.json`;
  triggerDownload(blob, name);
  return name;
}

/**
 * Export all animation frames as PNG files inside a ZIP archive.
 * Requires JSZip library to be loaded globally.
 */
async function exportAnimationFrames(filename, scale = 1) {
  if (typeof JSZip === 'undefined') {
    toast('JSZip library not loaded. Please include JSZip to use ZIP export.', 'error');
    return;
  }

  const { frames } = state.animation;
  if (!frames || frames.length === 0) {
    toast('No frames to export.', 'error');
    return;
  }

  const zip = new JSZip();
  const folder = zip.folder(filename);

  // Temporarily store current layers to restore later
  const originalSnapshot = snapshotLayers();

  for (let i = 0; i < frames.length; i++) {
    // Restore frame i
    restoreLayers(frames[i].layers);
    markCompositeDirty();

    // Export as PNG
    const canvas = exportCanvas(scale, null);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) {
      const name = `${filename}_${i + 1}.png`;
      folder.file(name, blob);
    }
  }

  // Restore original layers
  restoreLayers(originalSnapshot);
  markCompositeDirty();
  render();

  // Generate zip and download
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, `${filename}.zip`);
  return `${filename}.zip`;
}


// ---- js/ui/gallery.js ----

/**
 * ui/gallery.js
 * The Gallery page: every canvas created via New Canvas gets a thumbnail
 * entry here, kept in sync with the live document on every autosave.
 * Backed entirely by localStorage (GALLERY_KEY) - no project-name concept,
 * just thumbnails + full documents.
 */









const GALLERY_KEY = 'pixora.gallery.v1';

function getGalleryItems() {
  try {
    const raw = localStorage.getItem(GALLERY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveGalleryItems(items) {
  try {
    localStorage.setItem(GALLERY_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

function addToGallery(name, layers, canvas, palette, bg) {
  const items = getGalleryItems();
  const id = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

  // Generate the thumbnail.
  const thumbDataUrl = generateThumbnail(layers, canvas.width, canvas.height);

  items.push({
    id,
    name: name || 'untitled',
    createdAt: Date.now(),
    lastModified: Date.now(),
    thumbDataUrl,
    document: {
      name: name || 'untitled',
      canvas: { width: canvas.width, height: canvas.height },
      layers: layers.map(l => ({
        id: l.id,
        name: l.name,
        visible: l.visible,
        locked: l.locked,
        opacity: l.opacity,
        data: Array.from(l.data),
      })),
      palette,
      bg,
      animation: {
        enabled: state.animation.enabled,
        fps: state.animation.fps,
        currentFrame: state.animation.currentFrame,
        frames: state.animation.frames.map((f) => ({
          layers: f.layers.map((l) => ({
            id: l.id,
            name: l.name,
            visible: l.visible,
            locked: l.locked,
            opacity: l.opacity,
            data: Array.from(l.data),
          })),
        })),
      },
    }
  });

  saveGalleryItems(items);
  return id;
}

// Updates the gallery item currently being edited so it matches what's
// actually drawn on the canvas. Called every time autosave runs (see
// onAutosave below) so the thumbnail/content loaded from the gallery doesn't stay stuck as a blank image the first time it's created.
function syncGalleryItem() {
  const id = state.project.galleryId;
  if (!id) return;

  const items = getGalleryItems();
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return;

  const { canvas, layers, palette, bg, project } = state;
  const thumbDataUrl = generateThumbnail(layers, canvas.width, canvas.height);

  items[idx] = {
    ...items[idx],
    name: project.name || items[idx].name,
    lastModified: Date.now(),
    thumbDataUrl,
    document: {
      name: project.name || items[idx].name,
      canvas: { width: canvas.width, height: canvas.height },
      layers: layers.map(l => ({
        id: l.id,
        name: l.name,
        visible: l.visible,
        locked: l.locked,
        opacity: l.opacity,
        data: Array.from(l.data),
      })),
      palette,
      bg,
      animation: {
        enabled: state.animation.enabled,
        fps: state.animation.fps,
        currentFrame: state.animation.currentFrame,
        frames: state.animation.frames.map((f) => ({
          layers: f.layers.map((l) => ({
            id: l.id,
            name: l.name,
            visible: l.visible,
            locked: l.locked,
            opacity: l.opacity,
            data: Array.from(l.data),
          })),
        })),
      },
    }
  };

  saveGalleryItems(items);
}

onAutosave(syncGalleryItem);

function generateThumbnail(layers, width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');

  // Composite layers (simplified)
  const imageData = ctx.createImageData(width, height);
  const out = imageData.data;
  const n = width * height;
  const outR = new Float32Array(n);
  const outG = new Float32Array(n);
  const outB = new Float32Array(n);
  const outA = new Float32Array(n);

  for (const layer of layers) {
    if (!layer.visible) continue;
    const opacity = layer.opacity;
    for (let i = 0; i < n; i++) {
      const packed = layer.data[i];
      const srcA = ((packed >>> 24) & 0xff) / 255 * opacity;
      if (srcA <= 0) continue;
      const srcR = packed & 0xff;
      const srcG = (packed >>> 8) & 0xff;
      const srcB = (packed >>> 16) & 0xff;
      const prevA = outA[i];
      const newA = srcA + prevA * (1 - srcA);
      if (newA <= 0) continue;
      outR[i] = (srcR * srcA + outR[i] * prevA * (1 - srcA)) / newA;
      outG[i] = (srcG * srcA + outG[i] * prevA * (1 - srcA)) / newA;
      outB[i] = (srcB * srcA + outB[i] * prevA * (1 - srcA)) / newA;
      outA[i] = newA;
    }
  }

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[o] = outR[i];
    out[o + 1] = outG[i];
    out[o + 2] = outB[i];
    out[o + 3] = Math.round(outA[i] * 255);
  }
  ctx.putImageData(imageData, 0, 0);
  return c.toDataURL('image/png');
}

function initGalleryPage() {
  const page = document.getElementById('gallery-page');
  if (!page) return;

  const backBtn = document.getElementById('gallery-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      page.classList.add('hidden');
      const homePage = document.getElementById('home-page');
      if (homePage) homePage.classList.remove('hidden');
    });
  }

  const addBtn = document.getElementById('gallery-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      page.classList.add('hidden');
      if (window.openNewCanvasPage) {
        window.openNewCanvasPage();
      }
    });
  }

  renderGallery();
}

function openGalleryPage() {
  const homePage = document.getElementById('home-page');
  if (homePage) homePage.classList.add('hidden');

  const page = document.getElementById('gallery-page');
  if (page) {
    page.removeAttribute('hidden');
    page.classList.remove('hidden');
    renderGallery();
  }
}

function renderGallery() {
  const grid = document.getElementById('gallery-grid');
  const empty = document.getElementById('gallery-empty');
  if (!grid) return;

  const items = getGalleryItems();

  if (items.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;
  grid.innerHTML = '';

  // Sort newest first.
  const sorted = items.sort((a, b) => b.createdAt - a.createdAt);

  for (const item of sorted) {
    const div = document.createElement('div');
    div.className = 'gallery-item';
    div.dataset.id = item.id;

    // Thumbnail
    const thumb = document.createElement('div');
    thumb.className = 'gallery-thumb';
    thumb.style.backgroundImage = `url(${item.thumbDataUrl})`;
    thumb.title = 'คลิกเพื่อแก้ไข';
    thumb.addEventListener('click', () => {
      loadGalleryItem(item.id);
    });
    div.appendChild(thumb);

    // Info
    const info = document.createElement('div');
    info.className = 'gallery-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'gallery-name';
    nameEl.textContent = item.name;
    info.appendChild(nameEl);

    const metaEl = document.createElement('div');
    metaEl.className = 'gallery-meta';
    metaEl.textContent = new Date(item.createdAt).toLocaleDateString('th-TH') + ' · ' +
                         item.document.canvas.width + '×' + item.document.canvas.height;
    info.appendChild(metaEl);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'gallery-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'chip-btn primary';
    editBtn.textContent = 'แก้ไข';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      loadGalleryItem(item.id);
    });
    actions.appendChild(editBtn);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'chip-btn';
    saveBtn.textContent = 'บันทึก';
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveGalleryItemAsPNG(item);
    });
    actions.appendChild(saveBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'chip-btn danger';
    delBtn.textContent = 'ลบ';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`ลบ "${item.name}" ออกจากแกลลอรี่?`)) {
        deleteGalleryItem(item.id);
        renderGallery();
        toast(`🗑️ ลบ "${item.name}" แล้ว`);
      }
    });
    actions.appendChild(delBtn);

    info.appendChild(actions);
    div.appendChild(info);
    grid.appendChild(div);
  }
}

function loadGalleryItem(id) {
  const items = getGalleryItems();
  const item = items.find(i => i.id === id);
  if (!item) {
    toast('ไม่พบรูปนี้', 'error');
    return;
  }

  // Close the gallery first, so the canvas renders into a fully visible
  // viewport - matches the same order used by New Canvas / Create Project
  // (render-before-hide can leave the canvas blank on some browsers while
  // the full-screen gallery overlay is still on top).
  const page = document.getElementById('gallery-page');
  if (page) page.classList.add('hidden');

  // Load the document into the editor.
  const doc = item.document;
  loadDocument(doc);
  state.project.galleryId = item.id;
  resetHistory();
  markCompositeDirty();
  fitAndCenter();
  render();
  renderLayerList();
  updateColorUI();
  updateAnimationUI();

  toast(`📂 เปิด "${item.name}"`);
}

function saveGalleryItemAsPNG(item) {
  // Layers need to be restored for export.
  const doc = item.document;
  const originalLayers = state.layers.map(l => l.data.slice());

  // Use exportCanvas with the document.
  const canvas = document.createElement('canvas');
  canvas.width = doc.canvas.width;
  canvas.height = doc.canvas.height;
  const ctx = canvas.getContext('2d');

  // Composite from doc.layers.
  const imageData = ctx.createImageData(doc.canvas.width, doc.canvas.height);
  const out = imageData.data;
  const n = doc.canvas.width * doc.canvas.height;
  const outR = new Float32Array(n);
  const outG = new Float32Array(n);
  const outB = new Float32Array(n);
  const outA = new Float32Array(n);

  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    const opacity = layer.opacity;
    for (let i = 0; i < n; i++) {
      const packed = layer.data[i];
      const srcA = ((packed >>> 24) & 0xff) / 255 * opacity;
      if (srcA <= 0) continue;
      const srcR = packed & 0xff;
      const srcG = (packed >>> 8) & 0xff;
      const srcB = (packed >>> 16) & 0xff;
      const prevA = outA[i];
      const newA = srcA + prevA * (1 - srcA);
      if (newA <= 0) continue;
      outR[i] = (srcR * srcA + outR[i] * prevA * (1 - srcA)) / newA;
      outG[i] = (srcG * srcA + outG[i] * prevA * (1 - srcA)) / newA;
      outB[i] = (srcB * srcA + outB[i] * prevA * (1 - srcA)) / newA;
      outA[i] = newA;
    }
  }

  for (let i = 0; i < n; i++) {
    const o = i * 4;
    out[o] = outR[i];
    out[o + 1] = outG[i];
    out[o + 2] = outB[i];
    out[o + 3] = Math.round(outA[i] * 255);
  }
  ctx.putImageData(imageData, 0, 0);

  const name = item.name + '.png';
  canvas.toBlob((blob) => {
    if (blob) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(`💾 บันทึก "${item.name}" แล้ว`);
    }
  });
}

function deleteGalleryItem(id) {
  let items = getGalleryItems();
  items = items.filter(i => i.id !== id);
  saveGalleryItems(items);
}


// ---- js/ui/language-theme.js ----

/**
 * ui/language-theme.js
 * Thai/English language switch (editor panel + home Settings dialog),
 * dark/light mode toggle (persisted + kept in sync across both toggles),
 * and the rest of the home Settings dialog (clear-all-data confirm).
 */










function wireLanguagePanel() {
  els.btnLangTh.addEventListener('click', () => switchLanguage('th'));
  els.btnLangEn.addEventListener('click', () => switchLanguage('en'));
  updateLangButtons();
}

function switchLanguage(lang) {
  setLanguage(lang);
  localStorage.setItem('app_lang', lang);
  updateLangButtons();
}

function updateLangButtons() {
  if (!els.btnLangTh || !els.btnLangEn) return;
  const current = getLanguage();
  els.btnLangTh.classList.toggle('primary', current === 'th');
  els.btnLangEn.classList.toggle('primary', current === 'en');
  updateHomeSettingsLangButtons();
}

function updateHomeSettingsLangButtons() {
  const th = document.getElementById('settings-btn-lang-th');
  const en = document.getElementById('settings-btn-lang-en');
  if (!th || !en) return;
  const current = getLanguage();
  th.classList.toggle('primary', current === 'th');
  en.classList.toggle('primary', current === 'en');
}

const DARK_MODE_KEY = 'pixora_dark_mode';

/** Swaps the home page logo image between the light-theme and dark-theme
 *  transparent variants based on the current body theme class. */
function updateHomeLogo() {
  const logo = document.getElementById('home-logo');
  if (!logo) return;
  const isDark = !document.body.classList.contains('light-mode');
  // Dark theme (dark background) needs the light-colored logo (logo-light.png).
  // Light theme (light background) needs the dark-colored logo (logo-dark.png).
  logo.src = isDark
    ? 'images/logo/pixstar-logo-light.png'
    : 'images/logo/pixstar-logo-dark.png';
}

/** Single source of truth for dark/light mode: updates the DOM, keeps both
 *  toggle checkboxes (editor panel + home settings) in sync, and persists
 *  the choice so it survives a reload. */
function applyDarkMode(isDark, { persist = true } = {}) {
  document.body.classList.toggle('light-mode', !isDark);
  if (els.toggleDarkMode) els.toggleDarkMode.checked = isDark;
  const settingsToggle = document.getElementById('settings-toggle-dark-mode');
  if (settingsToggle) settingsToggle.checked = isDark;
  if (persist) {
    try { localStorage.setItem(DARK_MODE_KEY, isDark ? '1' : '0'); } catch (err) { /* ignore */ }
  }
  if (state.bg.type === 'checkerboard') {
    rebuildCheckerboard();
    render();
  }

  // Update the home page logo to match the theme.
  updateHomeLogo();
}

function loadDarkModePreference() {
  let saved = null;
  try { saved = localStorage.getItem(DARK_MODE_KEY); } catch (err) { /* ignore */ }
  const isDark = saved === null ? true : saved === '1';
  applyDarkMode(isDark, { persist: false });
}

function wireHomeSettings() {
  const langTh = document.getElementById('settings-btn-lang-th');
  const langEn = document.getElementById('settings-btn-lang-en');
  if (langTh) langTh.addEventListener('click', () => switchLanguage('th'));
  if (langEn) langEn.addEventListener('click', () => switchLanguage('en'));

  const darkToggle = document.getElementById('settings-toggle-dark-mode');
  if (darkToggle) {
    darkToggle.addEventListener('change', () => applyDarkMode(darkToggle.checked));
  }

  const clearBtn = document.getElementById('settings-btn-clear-data');
  const confirmDialog = document.getElementById('dialog-clear-data-confirm');
  if (clearBtn && confirmDialog) {
    clearBtn.addEventListener('click', () => openDialog(confirmDialog));
  }

  const confirmClearBtn = document.getElementById('confirm-clear-data');
  if (confirmClearBtn && confirmDialog) {
    confirmClearBtn.addEventListener('click', () => {
      clearAutosave();
      clearAllProjects();
      saveGalleryItems([]);
      state.project.galleryId = null;
      closeDialog(confirmDialog);
      const dialogSettings = document.getElementById('dialog-settings');
      if (dialogSettings) closeDialog(dialogSettings);
      toast(t('toast_data_cleared'));
    });
  }
}


// ---- js/ui/file-panel.js ----

/**
 * ui/file-panel.js
 * The File panel: New / Open / Save As, PNG / sprite-sheet / metadata /
 * project-file export, project import, dark-mode toggle, and the
 * animation timeline: play/pause preview at a set FPS, add/duplicate/
 * delete frame, and drag-to-reorder via the thumbnail strip.
 */














function wireFilePanel() {
  els.btnNew.addEventListener('click', () => openDialog(els.dialogNew));
  els.btnOpen.addEventListener('click', openOpenDialog);
  els.btnSaveAs.addEventListener('click', () => {
    els.saveAsName.value = state.project.name === 'untitled' ? '' : state.project.name;
    openDialog(els.dialogSaveAs);
  });

  els.btnExportPng.addEventListener('click', async () => {
    const name = els.exportFilename.value.trim() || 'pixel-art';
    const scale = parseInt(els.exportScale.value, 10);
    try {
      await exportPNG(name, scale, els.exportTransparent.checked);
      toast(t('toast_png_exported'));
    } catch (err) {
      toast(t('toast_export_error'), 'error');
    }
  });

  els.btnExportSheet.addEventListener('click', async () => {
    const name = els.exportFilename.value.trim() || 'pixel-art';
    const scale = parseInt(els.exportScale.value, 10);
    try {
      await exportSpriteSheetFromLayers(`${name}-sheet`, scale);
      toast(t('toast_sprite_sheet_exported'));
    } catch (err) {
      toast(t('toast_export_error'), 'error');
    }
  });

  els.btnExportMeta.addEventListener('click', () => {
    const name = els.exportFilename.value.trim() || 'pixel-art';
    exportMetadataJSON(`${name}-meta`);
    toast(t('toast_metadata_exported'));
  });

  els.btnExportProject.addEventListener('click', () => {
    const name = els.exportFilename.value.trim() || 'pixel-art';
    exportProjectFile(name);
    toast(t('toast_project_exported'));
  });

  els.importProjectInput.addEventListener('change', () => {
    const file = els.importProjectInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const doc = JSON.parse(reader.result);
        loadDocument(doc);
        resetHistory();
        markCompositeDirty();
        fitAndCenter();
        render();
        renderLayerList();
        updateColorUI();
        toast(t('toast_project_imported'));
      } catch (err) {
        toast(t('toast_project_import_error'), 'error');
      }
    };
    reader.readAsText(file);
    els.importProjectInput.value = '';
  });

  els.toggleDarkMode.addEventListener('change', () => {
    applyDarkMode(els.toggleDarkMode.checked);
  });

  const exportAnimBtn = document.getElementById('btn-export-animation');
if (exportAnimBtn) {
  exportAnimBtn.addEventListener('click', async () => {
    const name = els.exportFilename.value.trim() || 'pixel-art';
    await exportAnimationFrames(name, parseInt(els.exportScale.value, 10));
    toast('Animation exported as ZIP');
  });
}
}

let playTimer = null;

function stopPlay() {
  if (playTimer !== null) {
    clearInterval(playTimer);
    playTimer = null;
  }
  if (state.animation.isPlaying) {
    state.animation.isPlaying = false;
    markCompositeDirty();
    render(); // bring the onion skin back now that playback stopped
  }
  const playBtn = document.getElementById('anim-play');
  if (playBtn) {
    playBtn.querySelector('.material-symbols-outlined').textContent = 'play_arrow';
    playBtn.title = 'Play';
  }
}

function togglePlay() {
  if (playTimer !== null) {
    stopPlay();
    return;
  }
  const frames = state.animation.frames;
  if (frames.length < 2) return;

  const playBtn = document.getElementById('anim-play');
  if (playBtn) {
    playBtn.querySelector('.material-symbols-outlined').textContent = 'pause';
    playBtn.title = 'Pause';
  }

  state.animation.isPlaying = true;
  render(); // hide the onion skin for the duration of playback

  const fps = Math.max(1, Math.min(60, state.animation.fps || 12));
  playTimer = setInterval(() => {
    const total = state.animation.frames.length;
    const next = (state.animation.currentFrame + 1) % total;
    switchFrame(next);
  }, 1000 / fps);
}

function initAnimation() {
  const prevBtn = document.getElementById('anim-prev');
  const nextBtn = document.getElementById('anim-next');
  const playBtn = document.getElementById('anim-play');
  const fpsInput = document.getElementById('anim-fps');
  const addBtn = document.getElementById('anim-add-frame');
  const dupBtn = document.getElementById('anim-dup-frame');
  const delBtn = document.getElementById('anim-delete-frame');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      stopPlay();
      if (state.animation.currentFrame > 0) {
        switchFrame(state.animation.currentFrame - 1);
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      stopPlay();
      const current = state.animation.currentFrame;
      if (current === state.animation.frames.length - 1) {
        addFrame();
      } else {
        switchFrame(current + 1);
      }
    });
  }
  if (playBtn) {
    playBtn.addEventListener('click', togglePlay);
  }
  if (fpsInput) {
    fpsInput.value = String(state.animation.fps || 12);
    fpsInput.addEventListener('change', () => {
      const fps = Math.max(1, Math.min(60, parseInt(fpsInput.value, 10) || 12));
      state.animation.fps = fps;
      fpsInput.value = String(fps);
      // Restart playback at the new speed if it's currently running
      if (playTimer !== null) {
        stopPlay();
        togglePlay();
      }
    });
  }
  if (addBtn) {
    addBtn.addEventListener('click', () => { stopPlay(); addFrame(); });
  }
  if (dupBtn) {
    dupBtn.addEventListener('click', () => { stopPlay(); duplicateFrame(); });
  }
  if (delBtn) {
    delBtn.addEventListener('click', () => { stopPlay(); deleteFrame(); });
  }

  updateAnimationUI();
}

/** Append a new blank (fully transparent) frame after the current one and
 *  switch to it. Blank rather than a copy of the current frame so onion
 *  skinning / tracing over the previous frame stays useful. */
function addFrame() {
  const { width, height } = state.canvas;
  const frames = state.animation.frames;
  const referenceLayers = frames.length ? frames[state.animation.currentFrame].layers : snapshotLayers();
  const blankSnapshot = referenceLayers.map((l) => ({
    ...l,
    data: new Uint32Array(width * height), // transparent
  }));
  const insertAt = state.animation.currentFrame + 1;
  frames.splice(insertAt, 0, { layers: blankSnapshot });
  switchFrame(insertAt);
  toast(t('toast_frame_added'));
}

/** Duplicate the current frame (full pixel copy) and switch to the copy. */
function duplicateFrame() {
  const frames = state.animation.frames;
  if (!frames.length) return;
  // Make sure the in-memory frame reflects what's on canvas right now
  frames[state.animation.currentFrame] = { layers: snapshotLayers() };
  const copy = {
    layers: frames[state.animation.currentFrame].layers.map((l) => ({ ...l, data: l.data.slice() })),
  };
  const insertAt = state.animation.currentFrame + 1;
  frames.splice(insertAt, 0, copy);
  switchFrame(insertAt);
  toast(t('toast_frame_duplicated'));
}

/** Delete the current frame. Always leaves at least one frame behind. */
function deleteFrame() {
  const frames = state.animation.frames;
  if (frames.length <= 1) {
    toast(t('toast_frame_delete_error'), 'error');
    return;
  }
  const current = state.animation.currentFrame;
  frames.splice(current, 1);
  const target = Math.min(current, frames.length - 1);
  restoreLayers(frames[target].layers);
  state.animation.currentFrame = target;
  markCompositeDirty();
  render();
  updateAnimationUI();
  toast(t('toast_frame_deleted'));
}

/** Reorder frame at `from` to sit at `to`, keeping the same frame selected. */
function moveFrame(from, to) {
  const frames = state.animation.frames;
  if (from === to || from < 0 || to < 0 || from >= frames.length || to >= frames.length) return;

  const wasCurrent = state.animation.currentFrame;
  // Keep the on-canvas edits attached to the frame being moved before we shuffle the array.
  if (wasCurrent === from) {
    frames[from] = { layers: snapshotLayers() };
  }

  const [moved] = frames.splice(from, 1);
  frames.splice(to, 0, moved);

  // Track where the previously-selected frame ended up.
  let newCurrent = wasCurrent;
  if (wasCurrent === from) {
    newCurrent = to;
  } else if (from < wasCurrent && to >= wasCurrent) {
    newCurrent = wasCurrent - 1;
  } else if (from > wasCurrent && to <= wasCurrent) {
    newCurrent = wasCurrent + 1;
  }
  state.animation.currentFrame = newCurrent;
  updateAnimationUI();
}

function switchFrame(index) {
  if (!state.animation.enabled) return;
  const frames = state.animation.frames;
  if (index < 0 || index >= frames.length) return;

  // Save current layers to current frame
  const currentSnapshot = snapshotLayers();
  frames[state.animation.currentFrame] = { layers: currentSnapshot };

  // Restore target frame
  restoreLayers(frames[index].layers);
  state.animation.currentFrame = index;
  markCompositeDirty();
  render();
  updateAnimationUI();
}

function renderFrameStrip() {
  const strip = document.getElementById('anim-frame-strip');
  if (!strip) return;
  strip.innerHTML = '';
  strip.style.touchAction = 'pan-x'; // let normal swipes scroll; only a long-press arms dragging

  const { width, height } = state.canvas;
  const frames = state.animation.frames;

  frames.forEach((frame, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'anim-frame-thumb' + (i === state.animation.currentFrame ? ' active' : '');
    thumb.title = `Frame ${i + 1}`;
    thumb.dataset.index = String(i);

    // The current frame's canvas edits haven't been written back into
    // frame.layers yet (that only happens on switchFrame/reorder), so use
    // the live layers for its own thumbnail and the stored snapshot for
    // every other frame.
    const layersForThumb = i === state.animation.currentFrame ? state.layers : frame.layers;
    thumb.style.backgroundImage = `url(${generateThumbnail(layersForThumb, width, height)})`;

    const indexLabel = document.createElement('span');
    indexLabel.className = 'anim-frame-index';
    indexLabel.textContent = String(i + 1);
    thumb.appendChild(indexLabel);

    wireFrameThumbInteraction(thumb, strip);
    strip.appendChild(thumb);
  });
}

// Tap selects a frame; a ~280ms press-and-hold arms drag-to-reorder. Doing
// it this way (instead of HTML5 dragstart/dragover/drop) matters because
// `draggable="true"" hijacks touch gestures on mobile WebKit and silently
// breaks horizontal swipe-scrolling of the whole strip - a plain tap/scroll
// still needs to work untouched, and only an intentional long-press should
// ever call preventDefault() on the pointer.
const LONG_PRESS_MS = 280;
const MOVE_CANCEL_PX = 8;

function wireFrameThumbInteraction(thumb, strip) {
  let pressTimer = null;
  let dragging = false;
  let startX = 0;
  let startY = 0;

  function clearPressTimer() {
    if (pressTimer !== null) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  function clearDragOverStyles() {
    strip.querySelectorAll('.anim-frame-thumb.drag-over').forEach((t) => t.classList.remove('drag-over'));
  }

  function endDrag(e) {
    clearPressTimer();
    if (!dragging) return;
    dragging = false;
    thumb.classList.remove('dragging');
    strip.style.touchAction = 'pan-x';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const targetThumb = el ? el.closest('.anim-frame-thumb') : null;
    clearDragOverStyles();
    if (targetThumb && targetThumb !== thumb) {
      const from = parseInt(thumb.dataset.index, 10);
      const to = parseInt(targetThumb.dataset.index, 10);
      stopPlay();
      moveFrame(from, to);
    }
  }

  thumb.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button > 0) return; // ignore right/middle click
    startX = e.clientX;
    startY = e.clientY;
    dragging = false;
    clearPressTimer();
    pressTimer = setTimeout(() => {
      dragging = true;
      thumb.classList.add('dragging');
      strip.style.touchAction = 'none'; // only block scroll once a drag is actually armed
      try { thumb.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }, LONG_PRESS_MS);
  });

  thumb.addEventListener('pointermove', (e) => {
    if (dragging) {
      e.preventDefault();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const targetThumb = el ? el.closest('.anim-frame-thumb') : null;
      clearDragOverStyles();
      if (targetThumb && targetThumb !== thumb) targetThumb.classList.add('drag-over');
    } else if (pressTimer !== null) {
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
        // Finger is scrolling the strip, not holding still - stand down and
        // let the browser's native horizontal scroll take over.
        clearPressTimer();
      }
    }
  });

  thumb.addEventListener('pointerup', (e) => {
    const wasDragging = dragging;
    endDrag(e);
    if (!wasDragging) {
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx < MOVE_CANCEL_PX && dy < MOVE_CANCEL_PX) {
        stopPlay();
        switchFrame(parseInt(thumb.dataset.index, 10));
      }
    }
  });

  thumb.addEventListener('pointercancel', (e) => {
    clearPressTimer();
    dragging = false;
    thumb.classList.remove('dragging');
    strip.style.touchAction = 'pan-x';
    clearDragOverStyles();
  });
}

function updateAnimationUI() {
  const bar = document.getElementById('animation-bar');
  const label = document.getElementById('anim-frame-label');
  const prevBtn = document.getElementById('anim-prev');
  const nextBtn = document.getElementById('anim-next');
  const playBtn = document.getElementById('anim-play');
  const delBtn = document.getElementById('anim-delete-frame');

  if (!bar) return;

  const enabled = state.animation.enabled && state.animation.frames.length > 0;
  if (!enabled) {
  bar.hidden = true;
  bar.setAttribute('hidden', '');
} else {
  bar.hidden = false;
  bar.removeAttribute('hidden');
}

  if (enabled && label) {
    const total = state.animation.frames.length;
    const current = state.animation.currentFrame + 1;
    label.textContent = `${current} / ${total}`;
    if (prevBtn) prevBtn.disabled = (state.animation.currentFrame === 0);
    if (nextBtn) nextBtn.disabled = false;
    if (playBtn) playBtn.disabled = total < 2;
    if (delBtn) delBtn.disabled = total <= 1;
    renderFrameStrip();
  }

  if (!enabled) stopPlay();

  // Show/hide export animation button
  const exportAnimBtn = document.getElementById('btn-export-animation');
  if (exportAnimBtn) {
    exportAnimBtn.hidden = !enabled;
  }
}


// ---- js/ui/sidebar.js ----

/**
 * ui/sidebar.js
 * The slide-in hamburger sidebar and its "back to home" button.
 */




function wireSidebar() {
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('sidebar-scrim');
  const openBtn = document.getElementById('btn-menu');
  const closeBtn = document.getElementById('sidebar-close');
  const homeBtn = document.getElementById('sidebar-home-btn');

  if (!sidebar || !scrim || !openBtn) {
    console.warn('Sidebar elements not found');
    return;
  }

  function openSidebar() {
    console.log('Opening sidebar');
    sidebar.removeAttribute('hidden');          // ✅ ลบ hidden attribute
    sidebar.classList.remove('hidden');
    sidebar.classList.add('open');
    scrim.classList.add('visible');
    scrim.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    console.log('Closing sidebar');
    sidebar.classList.remove('open');
    sidebar.classList.add('hidden');
    sidebar.setAttribute('hidden', '');        // ✅ ใส่ hidden attribute กลับ
    scrim.classList.remove('visible');
    setTimeout(() => {
      scrim.hidden = true;
      document.body.style.overflow = '';
    }, 300);
  }

  openBtn.addEventListener('click', openSidebar);

  if (closeBtn) {
    closeBtn.addEventListener('click', closeSidebar);
  }

  scrim.addEventListener('click', closeSidebar);

  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      closeSidebar();
      goHome();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      closeSidebar();
    }
  });
}

function goHome() {
  // Close every panel.
  closeAllPanels();

  // Show the Home page.
  const homePage = document.getElementById('home-page');
  if (homePage) {
    homePage.classList.remove('hidden');
  }

  toast('🏠 กลับหน้าแรก');
}


// ---- js/ui/create-project-page.js ----

/**
 * ui/create-project-page.js
 * The "Create Project" page reached from Projects' + button: pick a
 * size, give it a name, and it's immediately saved into the project
 * library (unlike New Canvas, which only autosaves).
 */











let createProjectSelectedSize = null;
let createProjectIsCustom = false;

function initCreateProjectPage() {
  const page = document.getElementById('create-project-page');
  if (!page) return;

  // ─── Back button ───
  const backBtn = document.getElementById('create-project-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      page.classList.add('hidden');
      // Go back to the Projects page.
      const projectsPage = document.getElementById('projects-page');
      if (projectsPage) projectsPage.classList.remove('hidden');
    });
  }

  // ─── Cancel button ───
  const cancelBtn = document.getElementById('create-project-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      page.classList.add('hidden');
      const projectsPage = document.getElementById('projects-page');
      if (projectsPage) projectsPage.classList.remove('hidden');
    });
  }

  // ─── Size selection ───
  const sizeBtns = page.querySelectorAll('.size-btn[data-size]');
  sizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const size = parseInt(btn.dataset.size, 10);

      page.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      const customRow = document.getElementById('create-project-custom-row');
      if (customRow) customRow.hidden = true;
      const customBtn = document.getElementById('create-project-custom-size-btn');
      if (customBtn) customBtn.style.display = '';

      createProjectSelectedSize = { w: size, h: size };
      createProjectIsCustom = false;
      hideCreateProjectWarning();
    });
  });

  // ─── Custom ───
  const customBtn = document.getElementById('create-project-custom-size-btn');
  const customRow = document.getElementById('create-project-custom-row');
  if (customBtn) {
    customBtn.addEventListener('click', () => {
      page.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
      customBtn.classList.add('selected');
      customRow.hidden = false;
      createProjectIsCustom = true;
      createProjectSelectedSize = null;
      setTimeout(() => document.getElementById('create-project-w')?.focus(), 100);
      checkCreateProjectWarning();
    });
  }

  // ─── Create button ───
  const confirmBtn = document.getElementById('create-project-confirm');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      let w, h;
      const nameInput = document.getElementById('create-project-name-input');
      const name = nameInput?.value.trim() || 'untitled';

      if (createProjectIsCustom) {
        w = clamp(parseInt(document.getElementById('create-project-w')?.value, 10) || 32, 1, 2048);
        h = clamp(parseInt(document.getElementById('create-project-h')?.value, 10) || 32, 1, 2048);
      } else if (createProjectSelectedSize) {
        w = createProjectSelectedSize.w;
        h = createProjectSelectedSize.h;
      } else {
        toast('กรุณาเลือกขนาดก่อน', 'error');
        return;
      }

      // Create the project.
      createProjectAndSave(name, w, h);
      page.classList.add('hidden');
      resetCreateProjectPage();
    });
  }

  // ─── Warning ───
  const wInput = document.getElementById('create-project-w');
  const hInput = document.getElementById('create-project-h');
  if (wInput) wInput.addEventListener('input', checkCreateProjectWarning);
  if (hInput) hInput.addEventListener('input', checkCreateProjectWarning);

  // ─── Enter key ───
  if (wInput) wInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmBtn?.click(); });
  if (hInput) hInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmBtn?.click(); });
  const nameInput = document.getElementById('create-project-name-input');
  if (nameInput) nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmBtn?.click(); });
}

function openCreateProjectPage() {
  const projectsPage = document.getElementById('projects-page');
  if (projectsPage) projectsPage.classList.add('hidden');

  const page = document.getElementById('create-project-page');
  if (page) {
    page.removeAttribute('hidden');
    page.classList.remove('hidden');
    resetCreateProjectPage();
    setTimeout(() => document.getElementById('create-project-name-input')?.focus(), 100);
  }
}

function resetCreateProjectPage() {
  const page = document.getElementById('create-project-page');
  if (!page) return;

  page.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
  const customRow = document.getElementById('create-project-custom-row');
  if (customRow) customRow.hidden = true;
  const customBtn = document.getElementById('create-project-custom-size-btn');
  if (customBtn) customBtn.style.display = '';

  const nameInput = document.getElementById('create-project-name-input');
  if (nameInput) nameInput.value = '';

  createProjectSelectedSize = null;
  createProjectIsCustom = false;
  hideCreateProjectWarning();
}

function createProjectAndSave(name, w, h) {
  // Close the Projects and Create Project pages.
  const projectsPage = document.getElementById('projects-page');
  if (projectsPage) projectsPage.classList.add('hidden');

  const createPage = document.getElementById('create-project-page');
  if (createPage) createPage.classList.add('hidden');

  // Create the canvas.
  resetDocument(w, h);
  resetHistory();
  markCompositeDirty();
  fitAndCenter();
  render();
  renderLayerList();
  updateAnimationUI();

  // Save the project automatically.
  saveProjectAs(name);

  updateColorUI();
  toast(t('toast_project_created', { name }));
}

function checkCreateProjectWarning() {
  const w = parseInt(document.getElementById('create-project-w')?.value, 10) || 0;
  const h = parseInt(document.getElementById('create-project-h')?.value, 10) || 0;
  const warningEl = document.getElementById('create-project-warning');
  if (!warningEl) return;
  warningEl.hidden = !(w > 1024 || h > 1024);
}

function hideCreateProjectWarning() {
  const warningEl = document.getElementById('create-project-warning');
  if (warningEl) warningEl.hidden = true;
}


// ---- js/ui/projects-page.js ----

/**
 * ui/projects-page.js
 * The "My Projects" page: lists everything saved via Save As / Create
 * Project, with open and delete actions per row.
 */












function initProjectsPage() {
  const page = document.getElementById('projects-page');
  if (!page) return;

  // ─── Back button ───
  const backBtn = document.getElementById('projects-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      page.classList.add('hidden');
      const homePage = document.getElementById('home-page');
      if (homePage) homePage.classList.remove('hidden');
    });
  }

  // ─── + button (new project) -> opens the Create Project page ───
  const addBtn = document.getElementById('projects-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      openCreateProjectPage();  // ✅ เปิดหน้า Create Project
    });
  }

  renderProjectsList();
}

function openProjectsPage() {
  const homePage = document.getElementById('home-page');
  if (homePage) homePage.classList.add('hidden');

  const page = document.getElementById('projects-page');
  if (page) {
    page.removeAttribute('hidden');
    page.classList.remove('hidden');
    renderProjectsList();
  }
}

function renderProjectsList() {
  const container = document.getElementById('projects-list');
  const empty = document.getElementById('projects-empty');
  if (!container) return;

  const projects = listProjects();

  if (projects.length === 0) {
    container.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;
  container.innerHTML = '';

  for (const p of projects) {
    const item = document.createElement('div');
    item.className = 'project-item';

    const info = document.createElement('div');
    info.className = 'project-info';
    info.innerHTML = `
      <span class="project-name">${p.name}</span>
      <span class="project-meta">${sizeLabel(p.width, p.height)} · ${new Date(p.savedAt).toLocaleDateString('th-TH')}</span>
    `;

    const actions = document.createElement('div');
    actions.className = 'project-actions';

    // Open button.
    const openBtn = document.createElement('button');
    openBtn.className = 'chip-btn primary';
    openBtn.textContent = t('project_open_button') || 'เปิด';
    openBtn.addEventListener('click', () => {
      const doc = loadProject(p.name);
      if (doc) {
        loadDocument(doc);
        resetHistory();
        markCompositeDirty();
        fitAndCenter();
        render();
        renderLayerList();
        updateColorUI();
        // Close the projects page.
        const projectsPage = document.getElementById('projects-page');
        if (projectsPage) projectsPage.classList.add('hidden');
        toast(t('toast_project_opened', { name: p.name }));
      }
    });
    actions.appendChild(openBtn);

    // Delete button.
    const delBtn = document.createElement('button');
    delBtn.className = 'chip-btn danger';
    delBtn.textContent = t('project_delete_button') || 'ลบ';
    delBtn.addEventListener('click', () => {
      if (confirm(`ลบโปรเจกต์ "${p.name}"?`)) {
        deleteProject(p.name);
        renderProjectsList();
        toast(`🗑️ ลบ "${p.name}" แล้ว`);
      }
    });
    actions.appendChild(delBtn);

    item.appendChild(info);
    item.appendChild(actions);
    container.appendChild(item);
  }
}


// ---- js/ui/new-canvas-page.js ----

/**
 * ui/new-canvas-page.js
 * The full-page "New Canvas" flow: pick a size (recommended dropdown,
 * portrait/landscape presets, or custom up to 2048x2048), optionally
 * import an image to start from, and create the document.
 */













let newCanvasSelectedSize = null;
let newCanvasIsCustom = false;

/** Defined for parity with the original module - not currently called
 *  from anywhere, kept as-is rather than silently dropped. */
function enableAnimation() {
  state.animation.enabled = true;
  const snapshot = snapshotLayers();
  state.animation.frames = [{ layers: snapshot }];
  state.animation.currentFrame = 0;
  updateAnimationUI();
}

function createFromNewCanvas(w, h) {
  const homePage = document.getElementById('home-page');
  if (homePage) homePage.classList.add('hidden');

  const newCanvasPage = document.getElementById('new-canvas-page');
  if (newCanvasPage) {
    newCanvasPage.setAttribute('hidden', '');
    newCanvasPage.classList.add('hidden');
  }

  resetHistory();
  markCompositeDirty();
  fitAndCenter();
  resetDocument(w, h);
  render();
  renderLayerList();

  // Check whether the animation checkbox is ticked.
  const animCheckbox = document.getElementById('nc-animation');
  if (animCheckbox && animCheckbox.checked) {
    // Enable animation mode.
    state.animation.enabled = true;
    const snapshot = snapshotLayers();
    state.animation.frames = [{ layers: snapshot }];
    state.animation.currentFrame = 0;
    updateAnimationUI();
  } else {
    state.animation.enabled = false;
    state.animation.frames = [];
    updateAnimationUI();
  }

  // Save after resetDocument has run.
  const nameInput = document.getElementById('nc-name-input');
  const name = nameInput?.value.trim() || 'untitled';
  state.project.galleryId = addToGallery(name, state.layers, state.canvas, state.palette, state.bg);

  saveAutosave();
  toast(t('toast_canvas_created', { size: sizeLabel(w, h) }));
}

function initNewCanvasPage() {
  const page = document.getElementById('new-canvas-page');
  if (!page) return;

  // ─── Element references ───
  const backBtn = document.getElementById('new-canvas-back');
  const cancelBtn = document.getElementById('nc-cancel');
  const confirmBtn = document.getElementById('nc-confirm');

  const recommended = document.getElementById('nc-recommended');
  const portrait = document.getElementById('nc-portrait');
  const landscape = document.getElementById('nc-landscape');
  const customRow = document.getElementById('nc-custom-row');
  const customW = document.getElementById('nc-custom-w');
  const customH = document.getElementById('nc-custom-h');
  const nameInput = document.getElementById('nc-name-input');

  // ─── All the check buttons ───
  const checkBtns = {
    recommended: document.getElementById('nc-check-recommended'),
    portrait: document.getElementById('nc-check-portrait'),
    landscape: document.getElementById('nc-check-landscape'),
    custom: document.getElementById('nc-check-custom'),
  };

  // ─── Select-only helper ───
  function selectOnly(target) {
  // Remove 'active' from every button.
  Object.keys(checkBtns).forEach(key => {
    if (checkBtns[key]) checkBtns[key].classList.remove('active');
  });
  // Add 'active' to the chosen button.
  if (checkBtns[target]) checkBtns[target].classList.add('active');

  // If 'custom' was selected, open the custom row.
  if (target === 'custom') {
    if (customRow) customRow.hidden = false;
    setTimeout(() => customW?.focus(), 100);
  } else {
    if (customRow) customRow.hidden = true;
  }

  updatePreview();
}

  // ─── Event: check buttons ───
  if (checkBtns.recommended) {
  checkBtns.recommended.addEventListener('click', (e) => {
    e.preventDefault();
    selectOnly('recommended');
  });
}
if (checkBtns.portrait) {
  checkBtns.portrait.addEventListener('click', (e) => {
    e.preventDefault();
    selectOnly('portrait');
  });
}

if (checkBtns.landscape) {
  checkBtns.landscape.addEventListener('click', (e) => {
    e.preventDefault();
    selectOnly('landscape');
  });
}

if (checkBtns.custom) {
  checkBtns.custom.addEventListener('click', (e) => {
    e.preventDefault();
    selectOnly('custom');
  });
}

  // ─── Event: dropdown change ───
  const dropdowns = [recommended, portrait, landscape];
  dropdowns.forEach(dropdown => {
    if (dropdown) {
      dropdown.addEventListener('change', () => {
        // Auto-select the matching option when the value changes.
        const target = dropdown.id.replace('nc-', '');
        selectOnly(target);
      });
    }
  });

  // ─── Event: Custom inputs ───
  if (customW) customW.addEventListener('input', updatePreview);
  if (customH) customH.addEventListener('input', updatePreview);

  // ─── Preview update helper ───
  function updatePreview() {
  const { w, h } = getSelectedSize();
  const label = document.getElementById('nc-preview-label');
  const block = document.getElementById('nc-preview-block');
  const warning = document.getElementById('nc-preview-warning');

  if (label) label.textContent = `${w} × ${h}`;
  if (block) {
    // Scale the preview shape to fit the real reference box (read the size
    // directly from the DOM instead of hardcoding 100, since a CSS media
    // query shrinks the box down to 76px on mobile - a wrong hardcoded
    // value would get squeezed on one axis only by flexbox, distorting what should be a perfect square).
    const stage = block.parentElement;
    const stageSize = stage ? Math.min(stage.clientWidth, stage.clientHeight) : 100;
    const scale = stageSize / Math.max(w, h);
    const displayW = Math.max(6, Math.round(w * scale));
    const displayH = Math.max(6, Math.round(h * scale));

    block.style.width = displayW + 'px';
    block.style.height = displayH + 'px';
  }
  if (warning) {
    warning.hidden = !(w > 1024 || h > 1024);
  }
}

  // ─── Get-selected-size helper ───
  function getSelectedSize() {
    // Check which option is currently selected.
    if (checkBtns.custom && checkBtns.custom.classList.contains('active')) {
      const w = clamp(parseInt(customW?.value, 10) || 32, 1, 2048);
      const h = clamp(parseInt(customH?.value, 10) || 32, 1, 2048);
      return { w, h };
    }

    if (checkBtns.portrait && checkBtns.portrait.classList.contains('active')) {
      const val = portrait?.value || '16x24';
      const parts = val.split('x');
      return { w: parseInt(parts[0], 10), h: parseInt(parts[1], 10) };
    }

    if (checkBtns.landscape && checkBtns.landscape.classList.contains('active')) {
      const val = landscape?.value || '24x16';
      const parts = val.split('x');
      return { w: parseInt(parts[0], 10), h: parseInt(parts[1], 10) };
    }

    // default: recommended
    const val = recommended?.value || '32';
    const size = parseInt(val, 10);
    return { w: size, h: size };
  }

  // ─── Confirm button ───
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      const { w, h } = getSelectedSize();
      const name = nameInput?.value.trim() || 'untitled';

      createFromNewCanvas(w, h);
      if (name && name !== 'untitled') {
        state.project.name = name;
        updateProjectNameUI();
      }
      page.classList.add('hidden');
    });
  }

  // ─── Back / Cancel button ───
  function goBack() {
    page.classList.add('hidden');
    const homePage = document.getElementById('home-page');
    if (homePage) homePage.classList.remove('hidden');
  }

  if (backBtn) backBtn.addEventListener('click', goBack);
  if (cancelBtn) cancelBtn.addEventListener('click', goBack);

  // ─── Default state: select recommended ───
  selectOnly('recommended');

  // ─── Import Image ───
  const importInput = document.getElementById('nc-import-input');
  if (importInput) {
    importInput.addEventListener('change', () => {
      const file = importInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const w = clamp(img.width, 1, 2048);
          const h = clamp(img.height, 1, 2048);
          const homePage = document.getElementById('home-page');
          if (homePage) homePage.classList.add('hidden');
          page.classList.add('hidden');

          resetDocument(w, h);
          resetHistory();
          markCompositeDirty();
          fitAndCenter();
          render();
          renderLayerList();

          const layer = getActiveLayer();
          if (layer) {
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const ctx = c.getContext('2d');
            ctx.clearRect(0, 0, w, h);
            let dw = img.width, dh = img.height, ox = 0, oy = 0;
            if (img.width > w || img.height > h) {
              const ratio = Math.min(w / img.width, h / img.height);
              dw = img.width * ratio; dh = img.height * ratio;
              ox = (w - dw) / 2; oy = (h - dh) / 2;
            } else {
              ox = (w - img.width) / 2; oy = (h - img.height) / 2;
              dw = img.width; dh = img.height;
            }
            ctx.drawImage(img, ox, oy, dw, dh);
            const imageData = ctx.getImageData(0, 0, w, h);
            const data = imageData.data;
            for (let i = 0; i < w * h; i++) {
              const o = i * 4;
              layer.data[i] = ((data[o+3] << 24) | (data[o+2] << 16) | (data[o+1] << 8) | data[o]) >>> 0;
            }
            markCompositeDirty();
            render();
            renderLayerList();
            toast('📐 นำเข้ารูปแล้ว');
          }
          saveAutosave();
          importInput.value = '';
        };
        img.onerror = () => toast('โหลดรูปไม่สำเร็จ', 'error');
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ─── Open the New Canvas page (from Home) ───
  window.openNewCanvasPage = function() {
    const homePage = document.getElementById('home-page');
    if (homePage) homePage.classList.add('hidden');
    page.removeAttribute('hidden');
    page.classList.remove('hidden');
    selectOnly('recommended');
    if (nameInput) nameInput.value = '';
  };

    updatePreview();

  // ─── Reset UI on open ───
  function resetNewCanvasPage() {
  if (customRow) customRow.hidden = true;
  if (customW) customW.value = 32;
  if (customH) customH.value = 32;
  if (recommended) recommended.value = '32';
  if (portrait) portrait.value = '16x24';
  if (landscape) landscape.value = '24x16';
  const nameInput = document.getElementById('nc-name-input');
  if (nameInput) nameInput.value = '';
  updatePreview();
}

  // ─── Open the New Canvas page (from Home) ───
  window.openNewCanvasPage = function() {
    const homePage = document.getElementById('home-page');
    if (homePage) homePage.classList.add('hidden');
    page.removeAttribute('hidden');
    page.classList.remove('hidden');
    resetNewCanvasPage();
  };
}

function checkNewCanvasWarning() {
  const w = parseInt(document.getElementById('new-canvas-w')?.value, 10) || 0;
  const h = parseInt(document.getElementById('new-canvas-h')?.value, 10) || 0;
  const warningEl = document.getElementById('new-canvas-warning');
  if (!warningEl) return;
  warningEl.hidden = !(w > 1024 || h > 1024);
}

function hideNewCanvasWarning() {
  const warningEl = document.getElementById('new-canvas-warning');
  if (warningEl) warningEl.hidden = true;
}

function openNewCanvasPage() {
  const homePage = document.getElementById('home-page');
  if (homePage) homePage.classList.add('hidden');
  const page = document.getElementById('new-canvas-page');
  if (page) {
    page.removeAttribute('hidden');
    page.classList.remove('hidden');
    page.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
    const customRow = document.getElementById('new-canvas-custom-row');
    if (customRow) customRow.hidden = true;
    const customBtn = document.getElementById('new-canvas-custom-btn');
    if (customBtn) customBtn.style.display = '';
    newCanvasSelectedSize = null;
    newCanvasIsCustom = false;
    hideNewCanvasWarning();
    if (document.getElementById('new-canvas-w')) document.getElementById('new-canvas-w').value = 32;
    if (document.getElementById('new-canvas-h')) document.getElementById('new-canvas-h').value = 32;
  }
}


// ---- js/ui/home-page.js ----

/**
 * ui/home-page.js
 * The home screen: New / Settings / Projects / Open (import) / Gallery
 * buttons, plus the "import warning" dialog shown the first time someone
 * uses Open from the home screen.
 */














function initHome() {
  const homePage = document.getElementById('home-page');
  if (!homePage) return;

  homePage.classList.remove('hidden');

  // ─── New canvas button ───
const newBtn = document.getElementById('home-btn-new');
if (newBtn) {
  newBtn.addEventListener('click', () => {
    if (window.openNewCanvasPage) {
      window.openNewCanvasPage();
    } else {
      // fallback
      openNewCanvasPage();
    }
  });
}

  // ─── Settings button ───
  const settingsBtn = document.getElementById('home-btn-settings');
  const dialogSettings = document.getElementById('dialog-settings');
  if (settingsBtn && dialogSettings) {
    settingsBtn.addEventListener('click', () => {
      updateHomeSettingsLangButtons();
      const versionHint = document.getElementById('settings-version-hint');
      if (versionHint) {
        const versionText = document.querySelector('.home-version')?.textContent || '';
        versionHint.textContent = versionText;
      }
      openDialog(dialogSettings);
    });
  }
  wireHomeSettings();

  // ─── Projects button ───

  const projectsBtn = document.getElementById('home-btn-projects');
  if (projectsBtn) {
    projectsBtn.addEventListener('click', () => {
      openProjectsPage();
    });
  }

  // ─── Open from file button ───
  const openBtn = document.getElementById('home-btn-open');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      // Check whether "don't show again" was previously checked.
      if (isImportWarningDismissed()) {
        // Already dismissed before -> open the file picker directly.
        const input = document.getElementById('home-import-input');
        if (input) input.click();
      } else {
        // Not dismissed yet -> show the warning dialog.
        openImportWarningDialog();
      }
    });
  }

  // ─── Gallery button ───
  const galleryBtn = document.getElementById('home-btn-gallery');
  if (galleryBtn) {
    galleryBtn.addEventListener('click', () => {
      openGalleryPage();
    });
  }

  // ─── Import file ───
  const importInput = document.getElementById('home-import-input');
  if (importInput) {
    importInput.setAttribute('accept', '.json,application/json');

    importInput.addEventListener('change', () => {
      const file = importInput.files[0];
      if (!file) return;

      if (!file.name.endsWith('.pxproj.json')) {
        toast('กรุณาเลือกไฟล์ .pxproj.json เท่านั้น', 'error');
        importInput.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const doc = JSON.parse(reader.result);
          if (!doc.canvas || !doc.layers || !doc.version) {
            toast('ไฟล์นี้ไม่ใช่โปรเจกต์ที่ถูกต้อง', 'error');
            importInput.value = '';
            return;
          }
          loadDocument(doc);
          resetHistory();
          markCompositeDirty();
          fitAndCenter();
          render();
          renderLayerList();
          updateColorUI();
          homePage.classList.add('hidden');
          toast(t('toast_project_imported'));
        } catch (err) {
          toast(t('toast_project_import_error'), 'error');
        }
      };
      reader.readAsText(file);
      importInput.value = '';
    });
  }
}

function isImportWarningDismissed() {
  try {
    return localStorage.getItem('pixora.importWarningDismissed') === 'true';
  } catch {
    return false;
  }
}

function setImportWarningDismissed(value) {
  try {
    localStorage.setItem('pixora.importWarningDismissed', value ? 'true' : 'false');
  } catch {
    // ignore
  }
}

function openImportWarningDialog() {
  console.log('openImportWarningDialog called');  // ✅ debug
  const dialog = document.getElementById('dialog-import-warning');
  console.log('dialog:', dialog);  // ✅ debug
  if (dialog) {
    dialog.hidden = false;
    console.log('dialog hidden set to false');  // ✅ debug
    const checkbox = document.getElementById('import-warning-dont-show');
    if (checkbox) checkbox.checked = false;
  } else {
    console.warn('dialog-import-warning not found!');
  }
}

function closeImportWarningDialog() {
  const dialog = document.getElementById('dialog-import-warning');
  if (dialog) dialog.hidden = true;
}

function initImportWarningDialog() {
  const dialog = document.getElementById('dialog-import-warning');
  if (!dialog) return;

  // ─── Cancel button ───
  const cancelBtn = document.getElementById('import-warning-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      closeImportWarningDialog();
    });
  }

  // ─── Confirm (proceed) button ───
  const confirmBtn = document.getElementById('import-warning-confirm');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      const checkbox = document.getElementById('import-warning-dont-show');
      if (checkbox && checkbox.checked) {
        setImportWarningDismissed(true);
      }
      closeImportWarningDialog();

      // Open the file picker.
      const input = document.getElementById('home-import-input');
      if (input) input.click();
    });
  }

  // ─── Click outside the dialog closes it ───
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      closeImportWarningDialog();
    }
  });
}


// ---- js/ui/import-image.js ----

/**
 * ui/import-image.js
 * "Import Image" - adds a picked image as a new layer on the current
 * canvas (scaled/centered to fit), then activates Transform so the user
 * can position it before committing.
 */








function initImportImage() {
  const input = document.getElementById('import-image-input');
  if (!input) return;

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const img = new Image();
        img.onload = () => {
          importImageToLayer(img);
          input.value = '';
        };
        img.onerror = () => {
          toast('ไม่สามารถโหลดรูปภาพได้', 'error');
          input.value = '';
        };
        img.src = e.target.result;
      } catch (err) {
        toast('เกิดข้อผิดพลาดในการนำเข้ารูป', 'error');
        input.value = '';
      }
    };
    reader.readAsDataURL(file);
  });
}

function importImageToLayer(img) {
  const { width, height } = state.canvas;

  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  // ─── Scale the image to fit the canvas without cropping ───
  let drawWidth = img.width;
  let drawHeight = img.height;
  let offsetX = 0;
  let offsetY = 0;

  if (img.width > width || img.height > height) {
    // Image is larger -> shrink to fit (keep aspect ratio).
    const ratioW = width / img.width;
    const ratioH = height / img.height;
    const scale = Math.min(ratioW, ratioH);
    drawWidth = img.width * scale;
    drawHeight = img.height * scale;
    offsetX = (width - drawWidth) / 2;
    offsetY = (height - drawHeight) / 2;
  } else {
    // Image is smaller -> center it.
    offsetX = (width - img.width) / 2;
    offsetY = (height - img.height) / 2;
    drawWidth = img.width;
    drawHeight = img.height;
  }

  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

  // ─── Read the pixels ───
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // ─── Create the layer ───
  const layer = addLayer(`Import ${new Date().toLocaleTimeString()}`);
  const len = width * height;
  for (let i = 0; i < len; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const a = data[o + 3];
    layer.data[i] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }

  state.activeLayerId = layer.id;
  markCompositeDirty();
  render();
  renderLayerList();

  // ─── Adjust zoom to fit the image (using the drawn size) ───
  const rect = document.getElementById('view-canvas').getBoundingClientRect();
  const margin = 40;
  const availW = rect.width - margin * 2;
  const availH = rect.height - margin * 2;
  let zoom = Math.min(availW / drawWidth, availH / drawHeight);
  zoom = Math.floor(zoom * 10) / 10;
  zoom = Math.max(0.1, Math.min(zoom, 48));

  state.view.zoom = zoom;
  state.view.panX = (rect.width - drawWidth * zoom) / 2;
  state.view.panY = (rect.height - drawHeight * zoom) / 2;

  markCompositeDirty();
  render();

  // ─── Activate Transform ───
  const ok = activateTransform(layer.id);
  if (ok) {
    toast('📐 วางรูปแล้ว ปรับขนาด/ตำแหน่ง แล้วกด Apply');
    renderLayerList();
    render();
    closeAllPanels();
  }
}


// ---- js/ui.js ----

/**
 * ui.js
 * Entry point for all UI wiring. This file itself contains no glue logic
 * anymore - it just imports each panel/page module from js/ui/ and calls
 * their init/wire functions in the same order the app always started up
 * in. See js/ui/ for the actual implementations:
 *
 *   dom-refs.js          - shared `els` cache
 *   toast.js              - toast notifications
 *   panels.js              - generic panel open/close
 *   dialogs.js              - New/Clear/Save As/Open dialogs
 *   toolbar.js               - tools, zoom/grid, undo/redo, shortcuts
 *   color-panel.js            - color panel
 *   layers-panel.js            - layers panel, transform controls, layer popup
 *   file-panel.js                - file panel, export, animation frames
 *   language-theme.js             - language switch, dark mode, settings
 *   background-panel.js            - canvas background panel
 *   sidebar.js                      - hamburger sidebar
 *   status.js                        - status bar, state subscription
 *   new-canvas-page.js                - New Canvas page
 *   home-page.js                       - Home page + import warning dialog
 *   projects-page.js                    - Projects page
 *   create-project-page.js               - Create Project page
 *   import-image.js                       - Import Image
 *   gallery.js                             - Gallery page
 */




























// Re-exported so export.js's `` keeps working
// without touching that file.

function initUI() {
  cacheElements();
  bootstrapDocument();

  initCanvas(els.viewCanvas);
  initInput(els.viewCanvas, { onColorPicked: onEyedropperPick });
  initTransformOverlay(els.canvasWrap);
  wireTransformControls();

  wireToolbar();
  wireZoomAndGrid();
  wireUndoRedo();
  wirePanels();
  wireColorPanel();
  wireLayerPanel();
  wireFilePanel();
  wireLanguagePanel();
  wireDialogs();
  wireKeyboardShortcuts();
  wireResize();
  wireBackgroundPanel();
  wireSidebar();
  loadDarkModePreference();

  initHome();
  initNewCanvasPage();
  initProjectsPage();
  initCreateProjectPage();
  initImportWarningDialog();
  initImportImage();
  initAnimation();
  initGalleryPage();

  subscribe(onStateChange);
  setActiveTool('pencil');

  refreshAll();
  fitAndCenter();
  render();

  onLanguageChange(() => {
    els.statusTool.textContent = toolLabel(state.tool);
    updateProjectNameUI();
    renderLayerList();
    updateLangButtons();
  });
}

function bootstrapDocument() {
  const saved = loadAutosave();
  if (saved && saved.canvas && saved.layers && saved.layers.length) {
    loadDocument(saved);
  } else {
    resetDocument(32, 32);
  }
  resetHistory();
}


// ---- app.js ----

/**
 * app.js
 * Entry point. Keeps startup wiring minimal: everything real lives in
 * js/ui.js and the modules it coordinates.
 */



// Runs once the DOM is ready.
function startApp() {
  // 1. Init the language system first (reads localStorage or falls back to
  initI18n();

  // 2. Init the main UI system (including the language switcher; see wireLanguagePanel() in js/ui.js).
  initUI();
}

// Check the page's loading state.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
