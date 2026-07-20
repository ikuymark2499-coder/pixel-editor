/**
 * PixStar
 * File        : js/transform-overlay.js
 * Description : The interactive "free transform" box: 8 resize handles (4 corners + 4
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

import { state } from './state.js';
import { getViewMatrix, screenToCanvasFloat, render, onAfterRender } from './canvas.js';
import { getTransformMatrix, scheduleTransformApply, TRANSFORM_MIN_SCALE, TRANSFORM_MAX_SCALE } from './layers.js';
import { clamp } from './utils.js';

const MIN_SCALE = TRANSFORM_MIN_SCALE;
const MAX_SCALE = TRANSFORM_MAX_SCALE;
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
export function initTransformOverlay(canvasWrapEl) {
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
export function syncTransformOverlay() {
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
  const invScaleX = 1 / Math.max(Math.abs(state.transform.scaleX), MIN_SCALE);
  const invScaleY = 1 / Math.max(Math.abs(state.transform.scaleY), MIN_SCALE);

  // Handle size: baseline off the canvas size (factor=20, 12-20px range on
  // screen), then divided by the current zoom so the "real on-screen" size
  // stays constant no matter how far zoomed in/out (zooming out increases
  // the local value to compensate, zooming in decreases it).
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
  const invScaleX = 1 / Math.max(Math.abs(state.transform.scaleX), MIN_SCALE);
  const invScaleY = 1 / Math.max(Math.abs(state.transform.scaleY), MIN_SCALE);

  // Rotate handle size: same idea as the resize handles - baseline off the
  // canvas size (factor=20, 14-22px range on screen), compensated by the
  // current zoom so the on-screen size stays constant at any zoom level.
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
      const factor = clamp(distNow / distOrig, MIN_SCALE, MAX_SCALE);
      newScaleX = factor;
      newScaleY = factor;
    } else {
      if (def.axis === 'both' || def.axis === 'x') {
        newScaleX = clamp(Math.abs(local.x) / halfW, MIN_SCALE, MAX_SCALE);
      }
      if (def.axis === 'both' || def.axis === 'y') {
        newScaleY = clamp(Math.abs(local.y) / halfH, MIN_SCALE, MAX_SCALE);
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
