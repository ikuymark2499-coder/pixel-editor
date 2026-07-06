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

import { state, getActiveLayer } from './state.js';
import { unpackRGBA } from './utils.js';

let viewCanvas, viewCtx;
let offscreen, offscreenCtx;
let compositeDirty = true;
let previewPoints = null; // shape-tool live preview
let cursorPixel = null; // {x,y} for hover highlight (desktop only)

// Reused scratch buffers for compositing, resized only when canvas dims change,
// so dragging a stroke doesn't allocate fresh typed arrays on every frame.
let scratch = { w: 0, h: 0, r: null, g: null, b: null, a: null };
function getScratch(w, h) {
  if (scratch.w !== w || scratch.h !== h) {
    scratch = {
      w, h,
      r: new Float32Array(w * h),
      g: new Float32Array(w * h),
      b: new Float32Array(w * h),
      a: new Float32Array(w * h),
    };
  } else {
    scratch.r.fill(0);
    scratch.g.fill(0);
    scratch.b.fill(0);
    scratch.a.fill(0);
  }
  return scratch;
}

export function initCanvas(canvasEl) {
  viewCanvas = canvasEl;
  viewCtx = viewCanvas.getContext('2d', { alpha: true });
  offscreen = document.createElement('canvas');
  offscreenCtx = offscreen.getContext('2d', { willReadFrequently: true });
  markCompositeDirty();
}

export function markCompositeDirty() {
  compositeDirty = true;
}

export function setPreviewPoints(points) {
  previewPoints = points;
}

export function setCursorPixel(p) {
  cursorPixel = p;
}

/** Recompute the composited offscreen image from all visible layers. */
function recomposite() {
  const { width, height } = state.canvas;
  if (offscreen.width !== width || offscreen.height !== height) {
    offscreen.width = width;
    offscreen.height = height;
  }
  const imageData = offscreenCtx.createImageData(width, height);
  const out = imageData.data; // Uint8ClampedArray, RGBA per pixel
  const n = width * height;

  // Running composited float buffers for correct alpha-over blending (reused across calls)
  const buf = getScratch(width, height);
  const outR = buf.r, outG = buf.g, outB = buf.b, outA = buf.a;

  for (const layer of state.layers) {
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

  offscreenCtx.putImageData(imageData, 0, 0);
  compositeDirty = false;
}

/** Resize the visible canvas's backing store to match its CSS size and DPR. */
function syncCanvasSize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = viewCanvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (viewCanvas.width !== w || viewCanvas.height !== h) {
    viewCanvas.width = w;
    viewCanvas.height = h;
  }
  return { dpr, cssWidth: rect.width, cssHeight: rect.height };
}

/** Main render entry point. Cheap to call often (e.g. on every pointermove). */
export function render() {
  if (!viewCanvas) return;
  if (compositeDirty) recomposite();

  const { dpr, cssWidth, cssHeight } = syncCanvasSize();
  viewCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  viewCtx.imageSmoothingEnabled = false;
  viewCtx.clearRect(0, 0, cssWidth, cssHeight);

  const { zoom, panX, panY, gridVisible } = state.view;
  const { width, height } = state.canvas;

  // Checkerboard background behind transparency, only within canvas bounds
  drawCheckerboard(panX, panY, width * zoom, height * zoom, zoom);

  viewCtx.drawImage(offscreen, 0, 0, width, height, panX, panY, width * zoom, height * zoom);

  if (gridVisible && zoom >= 4) {
    drawGrid(panX, panY, width, height, zoom, cssWidth, cssHeight);
  }

  drawCanvasBorder(panX, panY, width * zoom, height * zoom);

  if (previewPoints && previewPoints.length) {
    drawPreview(previewPoints, panX, panY, zoom);
  }

  if (cursorPixel) {
    drawCursorHighlight(cursorPixel, panX, panY, zoom);
  }
}

function drawCheckerboard(panX, panY, w, h, zoom) {
    viewCtx.save();
    viewCtx.fillStyle = "#1e1e1e"; // สีพื้นหลัง
    viewCtx.fillRect(panX, panY, w, h);
    viewCtx.restore();
}

function drawGrid(panX, panY, width, height, zoom, cssWidth, cssHeight) {
  viewCtx.save();
  viewCtx.strokeStyle = 'rgba(255,255,255,0.15)';
  viewCtx.lineWidth = 1;
  viewCtx.beginPath();
  for (let x = 0; x <= width; x++) {
    const sx = Math.round(panX + x * zoom) + 0.5;
    if (sx < -1 || sx > cssWidth + 1) continue;
    viewCtx.moveTo(sx, Math.max(0, panY));
    viewCtx.lineTo(sx, Math.min(cssHeight, panY + height * zoom));
  }
  for (let y = 0; y <= height; y++) {
    const sy = Math.round(panY + y * zoom) + 0.5;
    if (sy < -1 || sy > cssHeight + 1) continue;
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

function drawPreview(points, panX, panY, zoom) {
  viewCtx.save();
  const [r, g, b, a] = unpackRGBA(state.primaryColor);
  viewCtx.fillStyle = `rgba(${r},${g},${b},${Math.max(0.5, a / 255)})`;
  for (const p of points) {
    viewCtx.fillRect(panX + p.x * zoom, panY + p.y * zoom, zoom, zoom);
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
export function screenToPixel(clientX, clientY) {
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
export function getCanvasRect() {
  return viewCanvas.getBoundingClientRect();
}

/** Produce a standalone canvas with the final composited image, optionally
 *  scaled up by an integer factor and/or flattened onto an opaque background.
 *  Used by export.js so exporting never depends on the live view's zoom/pan. */
export function exportCanvas(scale = 1, background = null) {
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
export function fitAndCenter() {
  const rect = viewCanvas.getBoundingClientRect();
  const { width, height } = state.canvas;
  const margin = 24;
  const availW = rect.width - margin * 2;
  const availH = rect.height - margin * 2;
  let zoom = Math.floor(Math.min(availW / width, availH / height));
  zoom = Math.max(1, Math.min(zoom, 48));
  state.view.zoom = zoom;
  state.view.panX = Math.round((rect.width - width * zoom) / 2);
  state.view.panY = Math.round((rect.height - height * zoom) / 2);
  markCompositeDirty();
}
