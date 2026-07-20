/**
 * PixStar
 * File        : js/canvas.js
 * Description : Everything about turning pixel data into something on screen:
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
export function onAfterRender(fn) {
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

export function initCanvas(canvasEl) {
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
export function markCompositeDirty(rect) {
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

export function setPreviewPoints(points) {
  previewPoints = points;
}

export function setCursorPixel(p) {
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
export function syncCanvasSize() {
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
    return true; // size changed
  }
  return false; // size unchanged
}

/** Main render entry point. Cheap to call often (e.g. on every pointermove). */
export function render() {
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
  // it would show a faint double image on every frame instead of a clean
  // animation.
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

  // 4. Grid, border, preview, cursor.
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
    // pan/zoom used to stall on large canvases). rebuildCheckerboard() can
    // still force a rebuild directly when truly needed, e.g. toggling dark mode.
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
  
  const size = 8; // tile size 8x8 (could be 4 or 16)
  
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

/**
 * DOMMatrix mapping canvas-pixel space -> screen (client/CSS pixel) space,
 * i.e. the current pan+zoom, expressed with getBoundingClientRect() as the
 * origin. This is the single place pan/zoom get turned into a matrix, so
 * the transform overlay and the input handlers can never disagree about
 * where the canvas actually is on screen.
 */
export function getViewMatrix() {
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
export function screenToCanvasFloat(clientX, clientY) {
  const inv = getViewMatrix().inverse();
  const p = inv.transformPoint(new DOMPoint(clientX, clientY));
  return { x: p.x, y: p.y };
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
  const margin = 40; // extra margin so surrounding space stays visible
  
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
export function resizeViewport() {
  syncCanvasSize();
  render();
}

export function rebuildCheckerboard() {
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