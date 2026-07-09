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

import { state } from './state.js';
import { getViewMatrix, screenToCanvasFloat, render, onAfterRender } from './canvas.js';
import { getTransformMatrix, scheduleTransformApply, TRANSFORM_MIN_SCALE, TRANSFORM_MAX_SCALE } from './layers.js';
import { clamp } from './utils.js';

const MIN_SCALE = TRANSFORM_MIN_SCALE;
const MAX_SCALE = TRANSFORM_MAX_SCALE;
const ROTATE_HANDLE_DIST = 34; // fixed screen px, OUT from the top edge ("how far above")
const TANGENT_OFFSET = -9.90; // fixed screen px, ALONG the top edge ("how far left/right")

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

/** Corner/edge handles: fixed percentage anchors, counter-rotated/scaled so
 *  they always render as small upright squares regardless of the layer's
 *  own rotation/scale (a squashed or spinning handle would be unusable). */
function positionResizeHandles() {
  const rotationDeg = (state.transform.rotation * 180) / Math.PI;
  const invScaleX = 1 / Math.max(Math.abs(state.transform.scaleX), MIN_SCALE);
  const invScaleY = 1 / Math.max(Math.abs(state.transform.scaleY), MIN_SCALE);
  for (const def of HANDLE_DEFS) {
    const h = handles[def.key];
    h.style.left = `${def.ax * 100}%`;
    h.style.top = `${def.ay * 100}%`;
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
 *  handle stays attached and correctly oriented at any rotation/scale. */
function positionRotateHandle(wrapFromLocal, width, height) {
  const tl = wrapFromLocal.transformPoint(new DOMPoint(0, 0));
  const tr = wrapFromLocal.transformPoint(new DOMPoint(width, 0));
  const center = wrapFromLocal.transformPoint(new DOMPoint(width / 2, height / 2));
  const topMidX = (tl.x + tr.x) / 2;
  const topMidY = (tl.y + tr.y) / 2;

  // Outward normal to the top edge, in screen space.
  let nx = -(tr.y - tl.y);
  let ny = tr.x - tl.x;
  const len = Math.hypot(nx, ny) || 1;
  nx /= len; ny /= len;
  const towardTop = { x: topMidX - center.x, y: topMidY - center.y };
  if (nx * towardTop.x + ny * towardTop.y < 0) { nx = -nx; ny = -ny; }

  // Tangent ALONG the top edge (perpendicular to the normal above), used
  // for the sideways nudge - tr - tl already points along the edge, we
  // just need it normalized.
  let tx = tr.x - tl.x;
  let ty = tr.y - tl.y;
  const tlen = Math.hypot(tx, ty) || 1;
  tx /= tlen; ty /= tlen;

  const desiredScreen = new DOMPoint(
    topMidX + nx * ROTATE_HANDLE_DIST + tx * TANGENT_OFFSET,
    topMidY + ny * ROTATE_HANDLE_DIST + ty * TANGENT_OFFSET
  );
  const localPoint = wrapFromLocal.inverse().transformPoint(desiredScreen);

  const rotationDeg = (state.transform.rotation * 180) / Math.PI;
  const invScaleX = 1 / Math.max(Math.abs(state.transform.scaleX), MIN_SCALE);
  const invScaleY = 1 / Math.max(Math.abs(state.transform.scaleY), MIN_SCALE);
  const rot = handles.rotate;
  rot.style.left = `${localPoint.x}px`;
  rot.style.top = `${localPoint.y}px`;
  rot.style.transform = `translate(-50%, -50%) rotate(${-rotationDeg}deg) scale(${invScaleX}, ${invScaleY})`;
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
