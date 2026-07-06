/**
 * history.js
 * Snapshot-based undo/redo. We snapshot the full layer stack's pixel data
 * (cheap enough at pixel-art resolutions, even 256x256 with several layers)
 * before a mutation begins, and can restore it on undo. This is far simpler
 * and less bug-prone than per-pixel diffing, at a small memory cost that is
 * bounded by MAX_HISTORY.
 */

import { state, emit } from './state.js';

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
    data: l.data.slice(), // copy
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
export function beginAction() {
  pendingSnapshot = snapshotLayers();
}

/** Call after a stroke/operation finishes. Pushes the *pre*-action state
 *  onto the undo stack so it can be restored later. */
export function commitAction() {
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
export function cancelAction() {
  if (pendingSnapshot) {
    restoreLayers(pendingSnapshot);
    emit('document');
  }
  pendingSnapshot = null;
}

export function canUndo() {
  return undoStack.length > 0;
}

export function canRedo() {
  return redoStack.length > 0;
}

export function undo() {
  if (!undoStack.length) return false;
  const prev = undoStack.pop();
  redoStack.push(snapshotLayers());
  restoreLayers(prev);
  emit('document');
  return true;
}

export function redo() {
  if (!redoStack.length) return false;
  const next = redoStack.pop();
  undoStack.push(snapshotLayers());
  restoreLayers(next);
  emit('document');
  return true;
}

/** Clear all history (e.g. after loading a new document). */
export function resetHistory() {
  undoStack = [];
  redoStack = [];
  pendingSnapshot = null;
  emit('history');
}
