/**
 * layers.js
 * Higher-level layer operations that build on the primitives in state.js
 * (addLayer/removeLayer). Anything that rearranges or combines layers
 * lives here, keeping state.js focused on plain data storage.
 */

import { state, emit, markDirty, addLayer as addLayerBase, removeLayer as removeLayerBase } from './state.js';
import { uid } from './utils.js';
import { markCompositeDirty } from './canvas.js';

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

/** Move a layer up (+1) or down (-1) in stack order. */
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

/** Duplicate a layer, inserting the copy directly above the original. */
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

/** Merge a layer down into the one below it (simple alpha-over composite),
 *  removing the source layer afterward. No-op if it's already the bottom layer. */
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
