/**
 * PixStar
 * File        : js/layers.js
 * Description : Higher-level layer operations that build on the
 *                primitives in state.js (addLayer/removeLayer). Anything
 *                that rearranges or combines layers lives here, keeping
 *                state.js focused on plain data storage.
 *
 *                Transform functions: move/scale/rotate a layer
 *                interactively.
 */

import { state, emit, markDirty, addLayer as addLayerBase, removeLayer as removeLayerBase } from './state.js';
import { uid, clamp } from './utils.js';
import { markCompositeDirty } from './canvas.js';

// Hard bounds so a drag/pinch gesture can never produce a zero, negative,
// or absurdly large scale (spec bugs #10/#11: "negative scale",
// "size becomes 0"). Chosen so the layer stays visible/manipulable at both ends.
// Exported so every gesture handler (single-finger handles, two-finger
// pinch) clamps to the exact same bounds - one source of truth.
export const TRANSFORM_MIN_SCALE = 0.02;
export const TRANSFORM_MAX_SCALE = 40;
const MIN_SCALE = TRANSFORM_MIN_SCALE;
const MAX_SCALE = TRANSFORM_MAX_SCALE;

// ============================================================
// BASIC LAYER OPERATIONS
// ============================================================

export function addLayer(name) {
  const layer = addLayerBase(name);
  markCompositeDirty();
  markDirty();
  return layer;
}

export function removeLayer(layerId) {
  const ok = removeLayerBase(layerId);
  if (ok) { markCompositeDirty(); markDirty(); }
  return ok;
}

export function renameLayer(layerId, name) {
  const layer = state.layers.find((l) => l.id === layerId);
  if (!layer) return;
  layer.name = name;
  emit('layers');
  markDirty();
}

export function toggleVisibility(layerId) {
  const layer = state.layers.find((l) => l.id === layerId);
  if (!layer) return;
  layer.visible = !layer.visible;
  markCompositeDirty();
  emit('layers');
  markDirty();
}

export function toggleLock(layerId) {
  const layer = state.layers.find((l) => l.id === layerId);
  if (!layer) return;
  layer.locked = !layer.locked;
  emit('layers');
}

export function setOpacity(layerId, opacity) {
  const layer = state.layers.find((l) => l.id === layerId);
  if (!layer) return;
  layer.opacity = Math.max(0, Math.min(1, opacity));
  markCompositeDirty();
  emit('layers');
  markDirty();
}

export function moveLayer(layerId, direction) {
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

export function duplicateLayer(layerId) {
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

export function mergeDown(layerId) {
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
export function activateTransform(layerId) {
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
export function cancelTransform() {
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
export function commitTransform() {
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
 * the wrong direction when rotated" class of bug that two
 * slightly-different formulas drifting apart would otherwise cause).
 *
 * Uses DOMMatrix (per spec: no guessed/ad-hoc coordinate math) and is
 * always built around the layer's fixed center - the pivot never moves
 * mid-gesture, which is what keeps the anchor point stable while
 * scaling or rotating.
 */
export function getTransformMatrix(
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
export function applyTransformToLayer(layerId, x, y, scaleX, scaleY, rotation) {
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

export function scheduleTransformApply(onApplied) {
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