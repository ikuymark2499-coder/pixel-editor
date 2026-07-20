/**
 * PixStar
 * File        : js/ui/import-image.js
 * Description : "Import Image" - adds a picked image as a new layer on the current
 * canvas (scaled/centered to fit), then activates Transform so the user
 * can position it before committing.
 */

import { state } from '../state.js';
import { render, markCompositeDirty } from '../canvas.js';
import { addLayer, activateTransform } from '../layers.js';
import { toast } from './toast.js';
import { renderLayerList } from './layers-panel.js';
import { closeAllPanels } from './panels.js';

export function initImportImage() {
  const input = document.getElementById('import-image-input');
  if (!input) return;

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const img = new Image();
        img.onload = () => {
          importImageToLayer(img);
          input.value = '';
        };
        img.onerror = () => {
          toast('ไม่สามารถโหลดรูปภาพได้', 'error');
          input.value = '';
        };
        img.src = e.target.result;
      } catch (err) {
        toast('เกิดข้อผิดพลาดในการนำเข้ารูป', 'error');
        input.value = '';
      }
    };
    reader.readAsDataURL(file);
  });
}

export function importImageToLayer(img) {
  const { width, height } = state.canvas;

  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, width, height);

  // ─── Scale the image to fit the canvas without cropping ───
  let drawWidth = img.width;
  let drawHeight = img.height;
  let offsetX = 0;
  let offsetY = 0;

  if (img.width > width || img.height > height) {
    // Image is larger -> shrink to fit (keep aspect ratio).
    const ratioW = width / img.width;
    const ratioH = height / img.height;
    const scale = Math.min(ratioW, ratioH);
    drawWidth = img.width * scale;
    drawHeight = img.height * scale;
    offsetX = (width - drawWidth) / 2;
    offsetY = (height - drawHeight) / 2;
  } else {
    // Image is smaller -> center it.
    offsetX = (width - img.width) / 2;
    offsetY = (height - img.height) / 2;
    drawWidth = img.width;
    drawHeight = img.height;
  }

  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

  // ─── Read the pixels ───
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // ─── Create the layer ───
  const layer = addLayer(`Import ${new Date().toLocaleTimeString()}`);
  const len = width * height;
  for (let i = 0; i < len; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const a = data[o + 3];
    layer.data[i] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }

  state.activeLayerId = layer.id;
  markCompositeDirty();
  render();
  renderLayerList();

  // ─── Adjust zoom to fit the image (using the drawn size) ───
  const rect = document.getElementById('view-canvas').getBoundingClientRect();
  const margin = 40;
  const availW = rect.width - margin * 2;
  const availH = rect.height - margin * 2;
  let zoom = Math.min(availW / drawWidth, availH / drawHeight);
  zoom = Math.floor(zoom * 10) / 10;
  zoom = Math.max(0.1, Math.min(zoom, 48));

  state.view.zoom = zoom;
  state.view.panX = (rect.width - drawWidth * zoom) / 2;
  state.view.panY = (rect.height - drawHeight * zoom) / 2;

  markCompositeDirty();
  render();

  // ─── Activate Transform ───
  const ok = activateTransform(layer.id);
  if (ok) {
    toast('📐 วางรูปแล้ว ปรับขนาด/ตำแหน่ง แล้วกด Apply');
    renderLayerList();
    render();
    closeAllPanels();
  }
}
