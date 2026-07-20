/**
 * PixStar
 * File        : js/colorpicker.js
 * Description : A self-contained HSV color picker widget: a vertical rainbow hue slider
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

import { clamp, hsvToRgb, hsvToPacked, packedToHsv } from './utils.js';

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
export function initColorPicker(els, callbacks = {}) {
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
  window.addEventListener('pointermove', onPointerMove);
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
    syncCanvasSize();
    drawHueSlider();
    drawSquare(true);
    positionThumbs();
  });
  resizeObserver.observe(squareEl);
  resizeObserver.observe(hueEl);

  syncCanvasSize();
  drawHueSlider();
  drawSquare(true);
  positionThumbs();
}

/** Push a color that changed from *outside* the picker (hex input, alpha
 *  slider, swatch click, eyedropper, undo/redo, loading a project, ...)
 *  so the picker's own controls stay in sync. Cheap to call often: the
 *  SV square gradient is only rebuilt if the hue actually changed. */
export function setPickerColor(packed) {
  const [hh, ss, vv, aa] = packedToHsv(packed);
  h = hh; s = ss; v = vv; a = aa;
  drawSquare();
  positionThumbs();
}

function syncCanvasSize() {
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

function onPointerMove(e) {
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
