/**
 * PixStar
 * File        : js/ui/gallery.js
 * Description : The Gallery page: every canvas created via New Canvas gets a thumbnail
 * entry here, kept in sync with the live document on every autosave.
 * Backed entirely by localStorage (GALLERY_KEY) - no project-name concept,
 * just thumbnails + full documents.
 */

import { state, loadDocument } from '../state.js';
import { render, fitAndCenter, markCompositeDirty } from '../canvas.js';
import { resetHistory } from '../history.js';
import { onAutosave } from '../storage.js';
import { toast } from './toast.js';
import { renderLayerList } from './layers-panel.js';
import { updateColorUI } from './color-panel.js';
import { updateAnimationUI } from './file-panel.js';

const GALLERY_KEY = 'pixora.gallery.v1';

export function getGalleryItems() {
  try {
    const raw = localStorage.getItem(GALLERY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveGalleryItems(items) {
  try {
    localStorage.setItem(GALLERY_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function addToGallery(name, layers, canvas, palette, bg) {
  const items = getGalleryItems();
  const id = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

  // Generate the thumbnail.
  const thumbDataUrl = generateThumbnail(layers, canvas.width, canvas.height);

  items.push({
    id,
    name: name || 'untitled',
    createdAt: Date.now(),
    lastModified: Date.now(),
    thumbDataUrl,
    document: {
      name: name || 'untitled',
      canvas: { width: canvas.width, height: canvas.height },
      layers: layers.map(l => ({
        id: l.id,
        name: l.name,
        visible: l.visible,
        locked: l.locked,
        opacity: l.opacity,
        data: Array.from(l.data),
      })),
      palette,
      bg,
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
    }
  });

  saveGalleryItems(items);
  return id;
}

// Updates the gallery item currently being edited so it matches what's
// actually drawn on the canvas. Called every time autosave runs (see
// onAutosave below) so the thumbnail/content loaded from the gallery
// doesn't stay stuck as a blank image the first time it's created.
export function syncGalleryItem() {
  const id = state.project.galleryId;
  if (!id) return;

  const items = getGalleryItems();
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return;

  const { canvas, layers, palette, bg, project } = state;
  const thumbDataUrl = generateThumbnail(layers, canvas.width, canvas.height);

  items[idx] = {
    ...items[idx],
    name: project.name || items[idx].name,
    lastModified: Date.now(),
    thumbDataUrl,
    document: {
      name: project.name || items[idx].name,
      canvas: { width: canvas.width, height: canvas.height },
      layers: layers.map(l => ({
        id: l.id,
        name: l.name,
        visible: l.visible,
        locked: l.locked,
        opacity: l.opacity,
        data: Array.from(l.data),
      })),
      palette,
      bg,
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
    }
  };

  saveGalleryItems(items);
}

onAutosave(syncGalleryItem);

export function generateThumbnail(layers, width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');

  // Composite layers (simplified)
  const imageData = ctx.createImageData(width, height);
  const out = imageData.data;
  const n = width * height;
  const outR = new Float32Array(n);
  const outG = new Float32Array(n);
  const outB = new Float32Array(n);
  const outA = new Float32Array(n);

  for (const layer of layers) {
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
  ctx.putImageData(imageData, 0, 0);
  return c.toDataURL('image/png');
}

export function initGalleryPage() {
  const page = document.getElementById('gallery-page');
  if (!page) return;

  const backBtn = document.getElementById('gallery-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      page.classList.add('hidden');
      const homePage = document.getElementById('home-page');
      if (homePage) homePage.classList.remove('hidden');
    });
  }

  const addBtn = document.getElementById('gallery-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      page.classList.add('hidden');
      if (window.openNewCanvasPage) {
        window.openNewCanvasPage();
      }
    });
  }

  renderGallery();
}

export function openGalleryPage() {
  const homePage = document.getElementById('home-page');
  if (homePage) homePage.classList.add('hidden');

  const page = document.getElementById('gallery-page');
  if (page) {
    page.removeAttribute('hidden');
    page.classList.remove('hidden');
    renderGallery();
  }
}

export function renderGallery() {
  const grid = document.getElementById('gallery-grid');
  const empty = document.getElementById('gallery-empty');
  if (!grid) return;

  const items = getGalleryItems();

  if (items.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;
  grid.innerHTML = '';

  // Sort newest first.
  const sorted = items.sort((a, b) => b.createdAt - a.createdAt);

  for (const item of sorted) {
    const div = document.createElement('div');
    div.className = 'gallery-item';
    div.dataset.id = item.id;

    // Thumbnail
    const thumb = document.createElement('div');
    thumb.className = 'gallery-thumb';
    thumb.style.backgroundImage = `url(${item.thumbDataUrl})`;
    thumb.title = 'คลิกเพื่อแก้ไข';
    thumb.addEventListener('click', () => {
      loadGalleryItem(item.id);
    });
    div.appendChild(thumb);

    // Info
    const info = document.createElement('div');
    info.className = 'gallery-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'gallery-name';
    nameEl.textContent = item.name;
    info.appendChild(nameEl);

    const metaEl = document.createElement('div');
    metaEl.className = 'gallery-meta';
    metaEl.textContent = new Date(item.createdAt).toLocaleDateString('th-TH') + ' · ' +
                         item.document.canvas.width + '×' + item.document.canvas.height;
    info.appendChild(metaEl);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'gallery-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'chip-btn primary';
    editBtn.textContent = 'แก้ไข';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      loadGalleryItem(item.id);
    });
    actions.appendChild(editBtn);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'chip-btn';
    saveBtn.textContent = 'บันทึก';
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveGalleryItemAsPNG(item);
    });
    actions.appendChild(saveBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'chip-btn danger';
    delBtn.textContent = 'ลบ';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`ลบ "${item.name}" ออกจากแกลลอรี่?`)) {
        deleteGalleryItem(item.id);
        renderGallery();
        toast(`🗑️ ลบ "${item.name}" แล้ว`);
      }
    });
    actions.appendChild(delBtn);

    info.appendChild(actions);
    div.appendChild(info);
    grid.appendChild(div);
  }
}

export function loadGalleryItem(id) {
  const items = getGalleryItems();
  const item = items.find(i => i.id === id);
  if (!item) {
    toast('ไม่พบรูปนี้', 'error');
    return;
  }

  // Close the gallery first, so the canvas renders into a fully visible
  // viewport - matches the same order used by New Canvas / Create Project
  // (render-before-hide can leave the canvas blank on some browsers while
  // the full-screen gallery overlay is still on top).
  const page = document.getElementById('gallery-page');
  if (page) page.classList.add('hidden');

  // Load the document into the editor.
  const doc = item.document;
  loadDocument(doc);
  state.project.galleryId = item.id;
  resetHistory();
  markCompositeDirty();
  fitAndCenter();
  render();
  renderLayerList();
  updateColorUI();
  updateAnimationUI();

  toast(`📂 เปิด "${item.name}"`);
}

export function saveGalleryItemAsPNG(item) {
  // Layers need to be restored for export.
  const doc = item.document;
  const originalLayers = state.layers.map(l => l.data.slice());

  // Use exportCanvas with the document.
  const canvas = document.createElement('canvas');
  canvas.width = doc.canvas.width;
  canvas.height = doc.canvas.height;
  const ctx = canvas.getContext('2d');

  // Composite from doc.layers.
  const imageData = ctx.createImageData(doc.canvas.width, doc.canvas.height);
  const out = imageData.data;
  const n = doc.canvas.width * doc.canvas.height;
  const outR = new Float32Array(n);
  const outG = new Float32Array(n);
  const outB = new Float32Array(n);
  const outA = new Float32Array(n);

  for (const layer of doc.layers) {
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
  ctx.putImageData(imageData, 0, 0);

  const name = item.name + '.png';
  canvas.toBlob((blob) => {
    if (blob) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(`💾 บันทึก "${item.name}" แล้ว`);
    }
  });
}

export function deleteGalleryItem(id) {
  let items = getGalleryItems();
  items = items.filter(i => i.id !== id);
  saveGalleryItems(items);
}
