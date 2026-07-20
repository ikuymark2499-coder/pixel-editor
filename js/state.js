/**
 * PixStar
 * File        : js/state.js
 * Description : Single source of truth for the whole app. Other modules
 *                read/mutate state through the functions exported here
 *                and subscribe to changes instead of poking at a shared
 *                object directly.
 *
 * Pixel data storage: each layer stores its pixels as a Uint32Array of
 * length (width*height), one packed RGBA value per pixel. This keeps
 * memory compact and access O(1) even at 256x256.
 */

import { uid, packRGBA } from './utils.js';

// ============================================================
// Global Variables
// ============================================================
const listeners = new Set();

// ============================================================
// Utility Functions
// ============================================================
function makeLayer(name, width, height) {
  return {
    id: uid('layer'),
    name,
    visible: true,
    locked: false,
    opacity: 1,
    // Transparent by default (alpha = 0)
    data: new Uint32Array(width * height),
  };
}

export const state = {
  canvas: {
    width: 32,
    height: 32,
  },
  layers: [],
  activeLayerId: null,

  tool: 'pencil',
  toolOptions: {
    brushSize: 1,
    shapeFilled: false,
  },

  primaryColor: packRGBA(30, 30, 30, 255),
  secondaryColor: packRGBA(255, 255, 255, 255),

  view: {
    zoom: 16,
    panX: 0,
    panY: 0,
    gridVisible: true,
  },

  palette: {
    custom: [],
    recent: [],
    favorites: [],
  },

  project: {
    name: 'untitled',
    dirty: false,
    galleryId: null,
  },
  
  animation: {
  enabled: false,
  frames: [], // each frame: { layers: [layer snapshot] }
  currentFrame: 0,
  fps: 12,
  isPlaying: false, // UI-only flag, not persisted - suppresses onion skin during playback
},

  // Transform box state. The layer's un-transformed rect is always
  // [0,0,canvas.width,canvas.height] (layers are always canvas-sized),
  // so `x`/`y` below is simply the translation applied to that rect's
  // center - there is no separate "layer position" to track.
  //
  // All fields are plain numbers (no derived/cached values) so there is
  // exactly one source of truth: the interactive overlay (handles),
  // the rasterizer (layers.js applyTransformToLayer) and the numeric
  // panel in the UI all read/write these same fields.
  transform: {
    active: false,
    layerId: null,
    mode: 'move', // 'move' | 'scale' | 'rotate' - cosmetic only, kept for the status toast
    originalData: null,
    hasMoved: false,

    x: 0,          // translation X, canvas px
    y: 0,          // translation Y, canvas px
    rotation: 0,   // radians, continuous/unwrapped (never snapped to 0-360)
    scaleX: 1,
    scaleY: 1,
    aspectLocked: false, // persists across activations (user preference)
  },
  
  bg: {
    type: 'theme', // 'theme' | 'solid' | 'checkerboard'
    color: '#1e1e1e',
  },
};

// ============================================================
// Core Functions
// ============================================================

/** Subscribe to any state change. Returns an unsubscribe function. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Notify subscribers that something changed. `topic` is an optional hint
 *  (e.g. 'canvas', 'layers', 'tool') so listeners can skip irrelevant work. */
export function emit(topic = 'all') {
  for (const fn of listeners) fn(topic);
}

export function getActiveLayer() {
  return state.layers.find((l) => l.id === state.activeLayerId) || null;
}

/** Reset the whole document to a fresh canvas of the given size. */
export function resetDocument(width, height) {
  state.canvas.width = width;
  state.canvas.height = height;
  const layer = makeLayer('Layer 1', width, height);
  state.layers = [layer];
  state.activeLayerId = layer.id;
  state.project.dirty = false;
  state.project.galleryId = null;
  
  state.animation.enabled = false;
  state.animation.frames = [];
  state.animation.currentFrame = 0;
  state.animation.fps = 12;
  state.animation.isPlaying = false;
  
  emit('document');
}

export function addLayer(name) {
  const { width, height } = state.canvas;
  const layer = makeLayer(name || `Layer ${state.layers.length + 1}`, width, height);
  state.layers.push(layer);
  state.activeLayerId = layer.id;
  emit('layers');
  return layer;
}

export function removeLayer(layerId) {
  if (state.layers.length <= 1) return false; // never remove the last layer
  const i = state.layers.findIndex((l) => l.id === layerId);
  if (i === -1) return false;
  state.layers.splice(i, 1);
  if (state.activeLayerId === layerId) {
    state.activeLayerId = state.layers[Math.max(0, i - 1)].id;
  }
  emit('layers');
  return true;
}

export function markDirty() {
  state.project.dirty = true;
  emit('dirty');
}

/** Serialize the document to a plain JSON-friendly object (for save/export). */
export function serializeDocument() {
  return {
    version: 1,
    name: state.project.name,
    canvas: { ...state.canvas },
    layers: state.layers.map((l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      locked: l.locked,
      opacity: l.opacity,
      // Store as regular array for JSON safety
      data: Array.from(l.data),
    })),
    activeLayerId: state.activeLayerId,
    palette: state.palette,
    bg: { ...state.bg },
    animation: {
      enabled: state.animation.enabled,
      fps: state.animation.fps,
      currentFrame: state.animation.currentFrame,
      frames: state.animation.frames.map((f) => ({
        layers: f.layers.map((l) => ({
          id: l.id,
          name: l.name,
          visible: l.visible,
          locked: l.locked,
          opacity: l.opacity,
          data: Array.from(l.data),
        })),
      })),
    },
  };
}

/** Load a previously serialized document back into state. */
export function loadDocument(doc) {
  state.canvas.width = doc.canvas.width;
  state.canvas.height = doc.canvas.height;
  state.layers = doc.layers.map((l) => ({
    id: l.id,
    name: l.name,
    visible: l.visible !== false,
    locked: !!l.locked,
    opacity: typeof l.opacity === 'number' ? l.opacity : 1,
    data: Uint32Array.from(l.data),
  }));
  state.activeLayerId = doc.activeLayerId || (state.layers[0] && state.layers[0].id);
  state.project.name = doc.name || 'untitled';
  if (doc.palette) state.palette = doc.palette;
  if (doc.bg) state.bg = doc.bg;

  if (doc.animation && Array.isArray(doc.animation.frames) && doc.animation.frames.length) {
    state.animation.enabled = !!doc.animation.enabled;
    state.animation.fps = typeof doc.animation.fps === 'number' ? doc.animation.fps : 12;
    state.animation.frames = doc.animation.frames.map((f) => ({
      layers: f.layers.map((l) => ({
        id: l.id,
        name: l.name,
        visible: l.visible !== false,
        locked: !!l.locked,
        opacity: typeof l.opacity === 'number' ? l.opacity : 1,
        data: Uint32Array.from(l.data),
      })),
    }));
    const savedFrame = doc.animation.currentFrame;
    state.animation.currentFrame = (typeof savedFrame === 'number' && savedFrame >= 0 && savedFrame < state.animation.frames.length)
      ? savedFrame
      : 0;
  } else {
    state.animation.enabled = false;
    state.animation.frames = [];
    state.animation.currentFrame = 0;
    state.animation.fps = 12;
  }

  state.project.dirty = false;
  emit('document');
}
