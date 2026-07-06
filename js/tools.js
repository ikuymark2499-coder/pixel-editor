/**
 * tools.js
 * All drawing-tool logic lives here, decoupled from rendering and input.
 * Every function operates on a layer's Uint32Array pixel buffer and plain
 * (x, y) integer pixel coordinates. Nothing here touches the DOM or canvas.
 */

import { idx, bresenhamLine, circlePoints, rectPoints } from './utils.js';
import { state, getActiveLayer, markDirty } from './state.js';

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
 * --- Pixel Perfect streaming state -----------------------------------------
 * ทำไมต้องมี state ค้างไว้ระดับโมดูล (module-level)?
 * เพราะ input.js เรียก paintStroke() ทีละครั้งต่อ pointermove หนึ่งครั้ง โดยส่ง
 * แค่ 2 จุดเท่านั้นคือ [lastPoint, currentPoint] (ดู onPointerMove ในไฟล์ input.js)
 * ไม่เคยส่งพิกัดทั้งเส้นมาให้ครั้งเดียว การกรองแบบเดิมที่ทำงานเฉพาะภายในอาร์เรย์
 * ที่ได้รับต่อการเรียกหนึ่งครั้ง (ซึ่งมีแค่ 2-3 จุด) จึงไม่มีทาง "มองเห็น" มุมเลี้ยว
 * ของเส้นได้เลย เพราะจุดที่ประกอบเป็นมุมเลี้ยวจริง ๆ นั้นถูกแบ่งส่งกันคนละ call
 * เป็นเหตุให้ตัวกรองเดิม (แม้ตรรกะจะถูกต้อง) ไม่เคยได้ทำงานจริงเวลาผู้ใช้ลากเมาส์
 *
 * ทางแก้คือทำตัวกรองแบบ "streaming": เก็บจุดล่าสุด 2 จุดของเส้นที่กำลังลากอยู่ไว้ใน
 * ตัวแปรระดับโมดูล แล้วตัดสินใจทีละจุดว่าจุดก่อนหน้า (pending) ควรถูก "ยืนยัน"
 * (confirmed แปลว่าคงอยู่ถาวร) หรือ "ถอนออก" (ลบพิกเซลที่เพิ่งแสตมป์ไปแล้ว คืนค่าสี
 * เดิมก่อนแสตมป์) เมื่อจุดถัดไปมาถึง สถานะนี้จะถูกล้างใหม่ทุกครั้งที่เริ่มเส้นใหม่
 * (สังเกตได้จาก input.js เรียก paintStroke(layer, [p], ...) แค่ครั้งเดียวตอน
 * pointerdown ด้วยอาร์เรย์ 1 จุด ใช้เป็นสัญญาณ "เริ่มเส้นใหม่" ได้พอดี)
 */
let pp = null; // { confirmed: {x,y}|null, pending: {x,y}|null, pendingPrevColor, pendingInBounds }

function ppReset() {
  pp = { confirmed: null, pending: null, pendingPrevColor: 0, pendingInBounds: false };
}

/** a,c คือจุดที่ทแยงมุมติดกัน (ห่างกัน 1 พิกเซลทั้งแกน x และ y) ส่วน b คือจุด
 *  "ตรงมุมฉาก" ที่เชื่อม a กับ c แบบเดินเป็นตัว L ถ้าเป็นเช่นนั้นจริง b คือพิกเซล
 *  ส่วนเกิน (elbow) ที่ทำให้เกิดก้อนสี่เหลี่ยม 2x2 หนาเตอะ ถ้าตัด b ออก a กับ c จะ
 *  ไปเชื่อมกันเองแบบทแยงมุมพอดี เส้นจึงเรียวเหลือ 1 พิกเซลเสมอ */
function isRedundantElbow(a, b, c) {
  if (a.x === c.x || a.y === c.y) return false; // เดินเป็นเส้นตรง ไม่ใช่มุมเลี้ยว
  return (b.x === a.x && b.y === c.y) || (b.x === c.x && b.y === a.y);
}

/** แสตมป์จุดใหม่แบบ "ชั่วคราว" (provisional) ลงเลเยอร์จริงทันทีเพื่อให้เห็นผลระหว่างลาก
 *  แต่จำสีเดิมก่อนแสตมป์ไว้ด้วย เผื่อภายหลังจุดนี้กลายเป็นพิกเซลส่วนเกินที่ต้องถอนออก */
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

/** ถอนพิกเซล pending ที่เพิ่งแสตมป์ไปก่อนหน้านี้ออก โดยคืนค่าสีเดิมก่อนแสตมป์กลับไป */
function ppRetractPending(layer, width) {
  if (pp.pendingInBounds) {
    layer.data[idx(pp.pending.x, pp.pending.y, width)] = pp.pendingPrevColor;
  }
}

/** ป้อนจุดถัดไปของเส้น (ที่ผ่าน bresenham มาแล้ว ต่อเนื่องทีละ 1 พิกเซล) เข้าตัวกรอง
 *  Pixel Perfect ทีละจุด จุดต้องมาตามลำดับ และห่างจากจุดก่อนหน้าไม่เกิน 1 พิกเซล */
function ppFeed(layer, point, color, width) {
  if (pp.pending === null) {
    // จุดแรกของเส้น (หรือจุดแรกหลังรีเซ็ต): ยังไม่มีอะไรให้เทียบ แสตมป์ไว้ก่อนเฉย ๆ
    ppStampProvisional(layer, point, color, width);
    return;
  }
  const a = pp.confirmed;
  const b = pp.pending;
  const c = point;
  if (a && isRedundantElbow(a, b, c)) {
    // b คือมุมเลี้ยวส่วนเกินระหว่าง a กับ c จริง ๆ -> ถอนออก ให้ a กับ c เชื่อมทแยงมุมกันเอง
    ppRetractPending(layer, width);
  } else {
    // b ผ่านการตรวจสอบ ยืนยันให้อยู่ถาวร
    pp.confirmed = b;
  }
  ppStampProvisional(layer, c, color, width);
}

/** Apply the pencil/eraser tool along a path (array of {x,y} points), typically
 *  the points collected during a pointer drag. Uses bresenham between the
 *  previous and current point so fast drags don't leave gaps.
 *
 *  เมื่อ brushSize === 1 จะเปิดใช้ Pixel Perfect Filter แบบ streaming (ดูคอมเมนต์
 *  ชุดฟังก์ชัน pp* ด้านบน) เพื่อกำจัดพิกเซลที่ซ้อนกันหนาเป็นก้อนสี่เหลี่ยมตรงมุมเลี้ยว
 *  หรือเส้นเฉียง โดยยังคงทำงานถูกต้องแม้ input.js จะส่งพิกัดมาทีละ 2 จุดต่อการเรียก
 *  หนึ่งครั้งก็ตาม (ไม่ต้องแก้ input.js เลย) */
export function paintStroke(layer, points, color, brushSize = 1) {
  if (!layer || layer.locked || points.length === 0) return;
  const { width } = state.canvas;

  // points.length === 1 คือสัญญาณจาก input.js ว่านี่คือจุดเริ่มต้นของเส้นใหม่
  // (เรียกครั้งเดียวตอน pointerdown) ใช้เป็นจังหวะรีเซ็ต state ของตัวกรอง
  const isStrokeStart = points.length === 1;

  if (brushSize !== 1) {
    // แปรงขนาดใหญ่กว่า 1 พิกเซลไม่จำเป็นต้องใช้ Pixel Perfect เพราะการแสตมป์เป็น
    // สี่เหลี่ยมอยู่แล้วทำให้มุมเลี้ยวไม่เห็นเป็นรอยต่อ ใช้พฤติกรรมเดิม (bresenham + stamp)
    pp = null; // ล้าง state เผื่อผู้ใช้เปลี่ยนขนาดแปรงกลางเส้น จะได้เริ่มใหม่ถ้ากลับมาเป็น 1
    let prev = points[0];
    if (isStrokeStart) stampPixel(layer, prev.x, prev.y, color, brushSize);
    for (let i = 1; i < points.length; i++) {
      const cur = points[i];
      for (const p of bresenhamLine(prev.x, prev.y, cur.x, cur.y)) {
        stampPixel(layer, p.x, p.y, color, brushSize);
      }
      prev = cur;
    }
    return;
  }

  if (isStrokeStart || !pp) {
    // เริ่มเส้นใหม่ (หรือถูกเรียกกลางเส้นโดยไม่เคยเห็นจุดเริ่มต้นมาก่อน เป็นตัวกันเหนียว)
    ppReset();
    ppFeed(layer, points[0], color, width);
    return;
  }

  let prev = points[0];
  for (let i = 1; i < points.length; i++) {
    const cur = points[i];
    const segment = bresenhamLine(prev.x, prev.y, cur.x, cur.y);
    // segment[0] จะตรงกับ prev เสมอ ซึ่งถูกป้อนเข้าตัวกรองไปแล้วในการเรียกครั้งก่อน
    // (หรือด้านบนในลูปนี้เอง) จึงข้ามจุดแรกของ segment เพื่อไม่ป้อนจุดซ้ำ
    for (let s = 1; s < segment.length; s++) {
      ppFeed(layer, segment[s], color, width);
    }
    prev = cur;
  }
}

/** Flood fill starting at (x, y) with `color`. 4-directional, tolerant of
 *  exact-color matching (pixel art doesn't need fuzzy thresholds). */
export function floodFill(layer, x, y, color) {
  if (!layer || layer.locked) return;
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
 *  `shape` is 'line' | 'rect' | 'circle'. */
export function shapePreviewPoints(shape, x0, y0, x1, y1, filled) {
  if (shape === 'line') return bresenhamLine(x0, y0, x1, y1);
  if (shape === 'rect') return rectPoints(x0, y0, x1, y1, filled);
  if (shape === 'circle') {
    const radius = Math.round(Math.hypot(x1 - x0, y1 - y0));
    return circlePoints(x0, y0, radius, filled);
  }
  return [];
}

/** Commit a shape's points onto the layer with the given color. */
export function stampPoints(layer, points, color) {
  if (!layer || layer.locked) return;
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
