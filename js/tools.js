/**
 * tools.js
 * All drawing-tool logic lives here, decoupled from rendering and input.
 * Every function operates on a layer's Uint32Array pixel buffer and plain
 * (x, y) integer pixel coordinates. Nothing here touches the DOM or canvas.
 */

import { idx, bresenhamLine, circlePoints, rectPoints } from './utils.js';
import { state, getActiveLayer, markDirty } from './state.js';
import { addRecentColor } from './palette.js';

export const TOOLS = [
  'pencil',
  'eraser',
  'bucket',
  'line',
  'rect',
  'circle',
  'eyedropper',
  'pan',
];

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < state.canvas.width && y < state.canvas.height;
}

/** Set a single pixel (with optional brush size, stamping a square) on a layer. */
export function stampPixel(layer, x, y, color, brushSize = 1) {
  if (!layer || layer.locked) return;
  const { width, height } = state.canvas;
  const half = Math.floor(brushSize / 2);
  for (let dy = 0; dy < brushSize; dy++) {
    for (let dx = 0; dx < brushSize; dx++) {
      const px = x - half + dx;
      const py = y - half + dy;
      if (inBounds(px, py)) {
        layer.data[idx(px, py, width)] = color;
      }
    }
  }
}

/**
 * Paint a stroke with the given brush size.
 * - If brushSize === 1: pixel‑perfect line (Bresenham, one pixel at a time)
 * - If brushSize > 1: draw solid square blocks of size brushSize, stepping
 *   every half‑brush so blocks overlap and form a continuous stroke.
 *   Each pixel is painted only if its current color differs from the new color.
 */
export function paintStroke(layer, points, color, brushSize = 1) {
  if (!layer || layer.locked || points.length === 0) return;
  if (color !== 0) addRecentColor(color);

  const { width, height } = state.canvas;

  // ---- Helper: stamp a block (brushSize x brushSize) at (cx, cy) ----
  // Only overwrite pixels that are NOT already the target color.
  function stampBlock(cx, cy) {
    const half = Math.floor(brushSize / 2);
    for (let dy = 0; dy < brushSize; dy++) {
      for (let dx = 0; dx < brushSize; dx++) {
        const px = cx - half + dx;
        const py = cy - half + dy;
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const i = idx(px, py, width);
          // ✅ ทับเฉพาะเมื่อสีปัจจุบันต่างจากสีที่ต้องการ
          if (layer.data[i] !== color) {
            layer.data[i] = color;
          }
        }
      }
    }
  }

  // ---- Brush size 1: use original pixel‑perfect logic ----
  if (brushSize === 1) {
    if (points.length === 1) {
      stampPixel(layer, points[0].x, points[0].y, color, 1);
      return;
    }
    let prev = points[0];
    for (let i = 1; i < points.length; i++) {
      const cur = points[i];
      const linePoints = bresenhamLine(prev.x, prev.y, cur.x, cur.y);
      for (const p of linePoints) {
        stampPixel(layer, p.x, p.y, color, 1);
      }
      prev = cur;
    }
    return;
  }

  // ---- Brush size > 1: block‑based stroke ----
  const step = Math.max(1, Math.floor(brushSize / 2)); // half‑brush step

  if (points.length === 1) {
    stampBlock(points[0].x, points[0].y);
    return;
  }

  let prev = points[0];
  stampBlock(prev.x, prev.y);

  for (let i = 1; i < points.length; i++) {
    const cur = points[i];
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    const dist = Math.max(Math.abs(dx), Math.abs(dy));
    if (dist === 0) continue;

    const steps = Math.max(1, Math.floor(dist / step));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const px = Math.round(prev.x + dx * t);
      const py = Math.round(prev.y + dy * t);
      stampBlock(px, py);
    }
    prev = cur;
  }
}

/** Flood fill starting at (x, y) with `color`. 4-directional, tolerant of
 *  exact-color matching (pixel art doesn't need fuzzy thresholds). */
export function floodFill(layer, x, y, color) {
  if (!layer || layer.locked) return;
  
  // ✅ บันทึกสีล่าสุด
  if (color !== 0) {
    addRecentColor(color);
  }
  
  const { width, height } = state.canvas;
  if (!inBounds(x, y)) return;
  const start = idx(x, y, width);
  const target = layer.data[start];
  if (target === color) return; // nothing to do

  const stack = [[x, y]];
  const visited = new Uint8Array(width * height);
  visited[start] = 1;

  while (stack.length) {
    const [cx, cy] = stack.pop();
    const i = idx(cx, cy, width);
    if (layer.data[i] !== target) continue;
    layer.data[i] = color;

    const neighbors = [
      [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (!inBounds(nx, ny)) continue;
      const ni = idx(nx, ny, width);
      if (!visited[ni] && layer.data[ni] === target) {
        visited[ni] = 1;
        stack.push([nx, ny]);
      }
    }
  }
}

/** Compute preview points for a shape tool without mutating the layer.
 *  `shape` is 'line' | 'rect' | 'circle'. 
 *  ✅ เพิ่ม parameter brushSize สำหรับความหนาของเส้น */
export function shapePreviewPoints(shape, x0, y0, x1, y1, filled, brushSize = 1) {
  if (shape === 'line') {
    // ✅ เส้นตรง: ใช้ bresenham + ความหนา
    const points = bresenhamLine(x0, y0, x1, y1);
    if (brushSize === 1) return points;
    // ขยายความหนา
    return expandPoints(points, brushSize);
  }
  if (shape === 'rect') {
    const points = rectPoints(x0, y0, x1, y1, filled);
    if (brushSize === 1 || filled) return points;
    return expandPoints(points, brushSize);
  }
  if (shape === 'circle') {
    const radius = Math.round(Math.hypot(x1 - x0, y1 - y0));
    const points = circlePoints(x0, y0, radius, filled);
    if (brushSize === 1 || filled) return points;
    return expandPoints(points, brushSize);
  }
  return [];
}

/** ✅ ฟังก์ชันขยายความหนาของเส้น (เพิ่มความหนาให้กับจุดต่างๆ) */
function expandPoints(points, brushSize) {
  if (brushSize <= 1 || points.length === 0) return points;
  const result = [];
  const half = Math.floor(brushSize / 2);
  const seen = new Set();
  
  for (const p of points) {
    for (let dy = -half; dy < brushSize - half; dy++) {
      for (let dx = -half; dx < brushSize - half; dx++) {
        const px = p.x + dx;
        const py = p.y + dy;
        const key = px + ',' + py;
        if (!seen.has(key) && inBounds(px, py)) {
          seen.add(key);
          result.push({ x: px, y: py });
        }
      }
    }
  }
  return result;
}

/** Commit a shape's points onto the layer with the given color. */
// 4. แก้ stampPoints (ใช้กับ Shape)
export function stampPoints(layer, points, color) {
  if (!layer || layer.locked) return;
  
  // ✅ บันทึกสีล่าสุด
  if (color !== 0 && points.length > 0) {
    addRecentColor(color);
  }

  const { width } = state.canvas;
  for (const p of points) {
    if (inBounds(p.x, p.y)) layer.data[idx(p.x, p.y, width)] = color;
  }
}

/** Eyedropper: read the composited color visible at (x, y) across all
 *  visible layers (topmost non-transparent wins), used to set the active color. */
export function pickColor(layers, x, y) {
  const { width, height } = state.canvas;
  if (!inBounds(x, y)) return null;
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!layer.visible) continue;
    const c = layer.data[idx(x, y, width)];
    const alpha = (c >>> 24) & 0xff;
    if (alpha > 0) return c;
  }
  return 0; // fully transparent
}

/** Convenience: mark the project as modified after a tool action commits. */
export function afterMutation() {
  markDirty();
}

// ===== Pixel Perfect Streaming State (เฉพาะ brushSize === 1) =====
let pp = null;

function ppReset() {
  pp = { confirmed: null, pending: null, pendingPrevColor: 0, pendingInBounds: false };
}

function isRedundantElbow(a, b, c) {
  if (a.x === c.x || a.y === c.y) return false;
  return (b.x === a.x && b.y === c.y) || (b.x === c.x && b.y === a.y);
}

function ppStampProvisional(layer, p, color, width) {
  const within = inBounds(p.x, p.y);
  pp.pending = p;
  pp.pendingInBounds = within;
  if (within) {
    const i = idx(p.x, p.y, width);
    pp.pendingPrevColor = layer.data[i];
    layer.data[i] = color;
  }
}

function ppRetractPending(layer, width) {
  if (pp.pendingInBounds) {
    layer.data[idx(pp.pending.x, pp.pending.y, width)] = pp.pendingPrevColor;
  }
}

function ppFeed(layer, point, color, width) {
  if (pp.pending === null) {
    ppStampProvisional(layer, point, color, width);
    return;
  }
  const a = pp.confirmed;
  const b = pp.pending;
  const c = point;
  if (a && isRedundantElbow(a, b, c)) {
    ppRetractPending(layer, width);
  } else {
    pp.confirmed = b;
  }
  ppStampProvisional(layer, c, color, width);
}