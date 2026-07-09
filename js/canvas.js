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
  
  // เรียก syncCanvasSize ครั้งแรกเพื่อตั้งขนาด
  syncCanvasSize();
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

/** Resize the visible canvas's backing store to match its CSS size and DPR.
 *  เรียกแค่ตอน resize หรือเปิด panel เท่านั้น ไม่ใช่ทุกเฟรม */
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
    return true; // เปลี่ยนขนาด
  }
  return false; // ขนาดเท่าเดิม
}

/** Main render entry point. Cheap to call often (e.g. on every pointermove). */
export function render() {
  if (!viewCanvas) return;
  if (compositeDirty) recomposite();

  // ใช้ viewportWidth/Height ที่ cache ไว้ แทนการเรียก getBoundingClientRect ทุกครั้ง
  // (แต่ถ้าขนาดเปลี่ยนต้อง syncCanvasSize ก่อน)
  const w = viewportWidth || viewCanvas.getBoundingClientRect().width;
  const h = viewportHeight || viewCanvas.getBoundingClientRect().height;
  
  viewCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  viewCtx.imageSmoothingEnabled = false;
  viewCtx.clearRect(0, 0, w, h);

  const { zoom, panX, panY, gridVisible } = state.view;
  const { width, height } = state.canvas;

  // คำนวณขอบเขต Canvas ที่แสดงบนจอ เพื่อลดการวาด Grid
  const startX = Math.max(0, Math.floor(-panX / zoom));
  const endX = Math.min(width, Math.ceil((w - panX) / zoom));
  const startY = Math.max(0, Math.floor(-panY / zoom));
  const endY = Math.min(height, Math.ceil((h - panY) / zoom));

  // Checkerboard background behind transparency, only within canvas bounds
  drawCheckerboard(panX, panY, width * zoom, height * zoom, zoom);

  // วาดเฉพาะส่วนที่อยู่ในขอบเขตการแสดงผล (clip)
  viewCtx.save();
  viewCtx.beginPath();
  viewCtx.rect(panX, panY, width * zoom, height * zoom);
  viewCtx.clip();
  
  // วาดเฉพาะพิกเซลที่อยู่ในหน้าจอ (ลดภาระ CPU/GPU)
  const visibleStartX = Math.max(0, Math.floor(-panX / zoom));
  const visibleStartY = Math.max(0, Math.floor(-panY / zoom));
  const visibleEndX = Math.min(width, Math.ceil((w - panX) / zoom));
  const visibleEndY = Math.min(height, Math.ceil((h - panY) / zoom));
  
  // วาดภาพเฉพาะส่วนที่อยู่ในขอบเขต
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
    // สร้าง checkerboard ใหม่ (ถ้าขนาด canvas เปลี่ยน หรือ ธีมเปลี่ยน)
    buildCheckerboard();
    
    // ✅ วาด checkerboard ที่สร้างไว้ แล้วขยายตาม zoom และ pan
    viewCtx.drawImage(
      checkerboardCanvas,
      0, 0, state.canvas.width, state.canvas.height,  // source
      panX, panY, state.canvas.width * zoom, state.canvas.height * zoom  // dest
    );
  }
  viewCtx.restore();
}

/**
 * สร้าง checkerboard ให้มีขนาดเท่ากับ canvas พอดี
 * ขนาดช่องตาราง 8x8 พิกเซล (ปรับได้)
 */
function buildCheckerboard() {
  const { width, height } = state.canvas;
  
  // สร้าง canvas ถ้ายังไม่มี หรือขนาดเปลี่ยน
  if (!checkerboardCanvas || checkerboardCanvas.width !== width || checkerboardCanvas.height !== height) {
    checkerboardCanvas = document.createElement('canvas');
    checkerboardCanvas.width = width;
    checkerboardCanvas.height = height;
  }
  
  const ctx = checkerboardCanvas.getContext('2d');
  
  // สีตามธีมปัจจุบัน
  const isDark = document.body.classList.contains('light-mode') ? false : true;
  const color1 = isDark ? '#2a2a2a' : '#e0e0e0';
  const color2 = isDark ? '#3a3a3a' : '#d0d0d0';
  
  const size = 8; // ขนาดช่องตาราง 8x8 (ปรับเป็น 4 หรือ 16 ได้)
  
  // เติมพื้นหลังด้วยสีแรก
  ctx.fillStyle = color1;
  ctx.fillRect(0, 0, width, height);
  
  // วาดช่องสีเข้ม
  ctx.fillStyle = color2;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      // ตรวจสอบว่าช่องนี้เป็นสีเข้มหรือไม่ (สลับกัน)
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
  
  // วาดเฉพาะเส้น Grid ที่อยู่ในขอบเขตการแสดงผล
  const xStart = Math.max(0, startX);
  const xEnd = Math.min(width, endX);
  const yStart = Math.max(0, startY);
  const yEnd = Math.min(height, endY);
  
  // แกนแนวตั้ง (x)
  for (let x = xStart; x <= xEnd; x++) {
    const sx = Math.round(panX + x * zoom) + 0.5;
    // เช็คว่าอยู่ในจอจริงๆ
    if (sx < -2 || sx > cssWidth + 2) continue;
    viewCtx.moveTo(sx, Math.max(0, panY));
    viewCtx.lineTo(sx, Math.min(cssHeight, panY + height * zoom));
  }
  // แกนนอน (y)
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
    // ตรวจสอบว่าจุดอยู่ในขอบเขตที่แสดงผล
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
  const margin = 40; // เพิ่ม margin ให้เห็นพื้นที่รอบๆ
  
  const availW = rect.width - margin * 2;
  const availH = rect.height - margin * 2;
  
  // ✅ คำนวณ zoom ให้พอดีกับหน้าจอ
  let zoom = Math.min(availW / width, availH / height);
  
  // ✅ ซูมออกได้ถึง 0.1 (เดิมคือ 1)
  // ✅ และให้ zoom เป็นทศนิยมละเอียดขึ้น
  zoom = Math.floor(zoom * 10) / 10;
  zoom = Math.max(0.1, Math.min(zoom, 48));
  
  state.view.zoom = zoom;
  state.view.panX = (rect.width - width * zoom) / 2;
  state.view.panY = (rect.height - height * zoom) / 2;
  
  markCompositeDirty();
  syncCanvasSize();
}

/** เรียกเมื่อ layout เปลี่ยน (tool options แสดง/ซ่อน) ให้ canvas ปรับขนาดตาม UI */
export function resizeViewport() {
  syncCanvasSize();
  render();
}

// ใน canvas.js
export function rebuildCheckerboard() {
  if (state.bg.type === 'checkerboard') {
    buildCheckerboard();
  }
}