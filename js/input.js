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

import { state, getActiveLayer } from './state.js';
import { screenToPixel, screenToCanvasFloat, markCompositeDirty, setPreviewPoints, setCursorPixel, render } from './canvas.js';
import { paintStroke, floodFill, shapePreviewPoints, stampPoints, pickColor, afterMutation } from './tools.js';
import { beginAction, commitAction, cancelAction, snapshotLayers, restoreLayers } from './history.js';
import { clamp, bresenhamLine } from './utils.js';
import { scheduleAutosave } from './storage.js';
import { activateTransform, cancelTransform, commitTransform, scheduleTransformApply, TRANSFORM_MIN_SCALE, TRANSFORM_MAX_SCALE } from './layers.js';
import { t } from './i18n.js';

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

export function initInput(el, callbacks = {}) {
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
    transformMoveStart = null; // a single-finger move-drag never survives a 2nd finger landing
    markCompositeDirty();
    if (state.transform.active && state.transform.layerId) {
      startTransformPinch();
    } else {
      startPinch();
    }
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
  markCompositeDirty();
  render();
}

// ─────────────────────────────────────────────────────────────

function onPointerMove(e) {
  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
  }

  // ─── 2+ FINGERS: PAN/ZOOM (normal) OR PINCH-TRANSFORM (transform mode) ──
  if (activePointers.size >= 2) {
    const now = performance.now();
    if (now - lastPinchTime >= PINCH_THROTTLE) {
      lastPinchTime = now;
      if (state.transform.active && state.transform.layerId) {
        if (!transformPinchState) startTransformPinch(); else updateTransformPinch();
      } else {
        if (!pinchState) startPinch(); else updatePinch();
      }
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
    drawState.lastPoint = currentPoint;
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

// ใน onPointerUp() - ประมาณบรรทัด 200
if (state.transform.active && state.transform.layerId) {
  // ✅ ไม่ทำอะไรตอนปล่อยนิ้ว ปล่อยให้ Transform ค้างอยู่
  // ผู้ใช้ต้องกดปุ่ม Apply หรือ Cancel อย่างเดียวถึงจะจบ
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

