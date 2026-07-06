/**
 * input.js
 * Translates raw pointer/touch/mouse events into tool actions. Pointer
 * Events are the primary API (unifies mouse/touch/pen); nothing here
 * assumes a specific input device.
 *
 * Gesture rules:
 *  - 1 active pointer -> use the currently selected tool to draw/interact.
 *  - 2 active pointers -> always pan + pinch-zoom, regardless of tool,
 *    and cancel any in-progress single-pointer drawing action.
 *  - Mouse wheel (desktop) -> zoom, centered on the cursor.
 */

import { state, getActiveLayer, emit } from './state.js';
import { screenToPixel, markCompositeDirty, setPreviewPoints, setCursorPixel, render } from './canvas.js';
import { paintStroke, floodFill, shapePreviewPoints, stampPoints, pickColor, afterMutation } from './tools.js';
import { beginAction, commitAction, cancelAction } from './history.js';
import { clamp } from './utils.js';
import { scheduleAutosave } from './storage.js';

const activePointers = new Map(); // pointerId -> {clientX, clientY}
let drawState = null; // { kind: 'stroke'|'shape', ... }
let pinchState = null; // { startDist, startZoom, midpointPixel }

let canvasEl = null;
let onColorPicked = null; // callback(colorInt)

export function initInput(el, callbacks = {}) {
  canvasEl = el;
  onColorPicked = callbacks.onColorPicked || null;

  el.style.touchAction = 'none'; // we handle all gestures ourselves

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  el.addEventListener('pointerleave', onPointerLeaveForHover);
  el.addEventListener('wheel', onWheel, { passive: false });
}

function toolIsShape(tool) {
  return tool === 'line' || tool === 'rect' || tool === 'circle';
}

function onPointerDown(e) {
  activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
  canvasEl.setPointerCapture(e.pointerId);

  if (activePointers.size >= 2) {
    // Switch to pan/zoom gesture; abandon any single-pointer drawing.
    // cancelAction() rolls the pixel data back to how it was before this
    // stroke/shape began (see history.js), so we also need to mark the
    // composite dirty - otherwise the already-rendered offscreen bitmap
    // would still show the stray dot/shape even after the data underneath
    // it was reverted.
    if (drawState) {
      cancelAction();
      drawState = null;
      setPreviewPoints(null);
      markCompositeDirty();
    }
    startPinch();
    render();
    return;
  }

  const tool = state.tool;
  const p = screenToPixel(e.clientX, e.clientY);

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
    beginAction();
    floodFill(layer, p.x, p.y, state.primaryColor);
    commitAction();
    afterMutation();
    markCompositeDirty();
    scheduleAutosave();
    render();
    return;
  }

  if (toolIsShape(tool)) {
    beginAction();
    drawState = { kind: 'shape', tool, start: p, last: p };
    updateShapePreview();
    render();
    return;
  }

  // pencil / eraser
  beginAction();
  const color = tool === 'eraser' ? 0 : state.primaryColor;
  drawState = { kind: 'stroke', color, lastPoint: p };
  paintStroke(layer, [p], color, state.toolOptions.brushSize);
  markCompositeDirty();
  render();
}

function onPointerMove(e) {
  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
  }

  if (activePointers.size >= 2 && pinchState) {
    updatePinch();
    render();
    return;
  }

  const p = screenToPixel(e.clientX, e.clientY);

  // Hover highlight for desktop precision (harmless on touch, just unused)
  if (e.pointerType === 'mouse') {
    setCursorPixel(inBoundsPixel(p) ? p : null);
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
    paintStroke(layer, [drawState.lastPoint, p], drawState.color, state.toolOptions.brushSize);
    drawState.lastPoint = p;
    markCompositeDirty();
    render();
    return;
  }

  if (drawState.kind === 'shape') {
    drawState.last = p;
    updateShapePreview();
    render();
  }
}

function onPointerUp(e) {
  activePointers.delete(e.pointerId);

  if (pinchState && activePointers.size < 2) {
    pinchState = null;
  }

  if (activePointers.size > 0) return; // still have a pointer down (rare)

  if (!drawState) return;

  if (drawState.kind === 'stroke') {
    commitAction();
    afterMutation();
    scheduleAutosave();
  } else if (drawState.kind === 'shape') {
    const layer = getActiveLayer();
    const points = shapePreviewPoints(
      drawState.tool,
      drawState.start.x, drawState.start.y,
      drawState.last.x, drawState.last.y,
      state.toolOptions.shapeFilled
    );
    stampPoints(layer, points, state.primaryColor);
    commitAction();
    afterMutation();
    markCompositeDirty();
    scheduleAutosave();
    setPreviewPoints(null);
  }

  drawState = null;
  render();
}

function onPointerLeaveForHover(e) {
  if (e.pointerType === 'mouse' && activePointers.size === 0) {
    setCursorPixel(null);
    render();
  }
}

function updateShapePreview() {
  const points = shapePreviewPoints(
    drawState.tool,
    drawState.start.x, drawState.start.y,
    drawState.last.x, drawState.last.y,
    state.toolOptions.shapeFilled
  );
  setPreviewPoints(points);
}

function inBoundsPixel(p) {
  return p.x >= 0 && p.y >= 0 && p.x < state.canvas.width && p.y < state.canvas.height;
}

function pointerArray() {
  return Array.from(activePointers.values());
}

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
  const newZoom = clamp(Math.round(pinchState.startZoom * scale), 1, 64);

  // Keep the pinch midpoint visually anchored while zooming
  const zoomRatio = newZoom / pinchState.startZoom;
  const rect = canvasEl.getBoundingClientRect();
  const anchorX = pinchState.startMidX - rect.left;
  const anchorY = pinchState.startMidY - rect.top;

  state.view.panX = anchorX - (anchorX - pinchState.startPanX) * zoomRatio + (midClientX - pinchState.startMidX);
  state.view.panY = anchorY - (anchorY - pinchState.startPanY) * zoomRatio + (midClientY - pinchState.startMidY);
  state.view.zoom = newZoom;
}

function onWheel(e) {
  e.preventDefault();
  const rect = canvasEl.getBoundingClientRect();
  const cursorX = e.clientX - rect.left;
  const cursorY = e.clientY - rect.top;
  const { zoom, panX, panY } = state.view;

  const direction = e.deltaY > 0 ? -1 : 1;
  const newZoom = clamp(zoom + direction * Math.max(1, Math.round(zoom * 0.15)), 1, 64);
  if (newZoom === zoom) return;

  // Zoom centered on the cursor position
  const worldX = (cursorX - panX) / zoom;
  const worldY = (cursorY - panY) / zoom;
  state.view.zoom = newZoom;
  state.view.panX = cursorX - worldX * newZoom;
  state.view.panY = cursorY - worldY * newZoom;
  render();
}
