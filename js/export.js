/**
 * export.js
 * Turns the current document into downloadable files: PNG (with optional
 * transparent background and integer upscale), and a JSON metadata sidecar
 * useful for game engines (canvas size, layer names, palette).
 */

import { state, serializeDocument } from './state.js';
import { exportCanvas } from './canvas.js';

function triggerDownload(blobOrUrl, filename) {
  const a = document.createElement('a');
  const isUrl = typeof blobOrUrl === 'string';
  a.href = isUrl ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (!isUrl) {
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
}

/** Export the composited image as a PNG file.
 *  @param {string} filename
 *  @param {number} scale integer upscale factor (1 = native pixel size)
 *  @param {boolean} transparentBackground if false, flattens onto white */
export function exportPNG(filename, scale = 1, transparentBackground = true) {
  const canvas = exportCanvas(scale, transparentBackground ? null : '#ffffff');
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('Could not create PNG blob'));
      const name = filename.endsWith('.png') ? filename : `${filename}.png`;
      triggerDownload(blob, name);
      resolve(name);
    }, 'image/png');
  });
}

/** Export a simple horizontal sprite sheet: one frame per visible layer,
 *  left to right, at native resolution times `scale`. This is a practical
 *  stand-in until true animation frames (see js/animation.js) ship in v2 -
 *  it lets layer-based "frames" (e.g. walk-cycle poses kept on layers) be
 *  exported as a sheet today. */
export function exportSpriteSheetFromLayers(filename, scale = 1) {
  const { width, height } = state.canvas;
  const frames = state.layers.filter((l) => l.visible);
  const sheet = document.createElement('canvas');
  sheet.width = width * scale * frames.length;
  sheet.height = height * scale;
  const ctx = sheet.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  frames.forEach((layer, i) => {
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = width;
    frameCanvas.height = height;
    const fctx = frameCanvas.getContext('2d');
    const imageData = fctx.createImageData(width, height);
    for (let p = 0; p < width * height; p++) {
      const c = layer.data[p];
      const o = p * 4;
      imageData.data[o] = c & 0xff;
      imageData.data[o + 1] = (c >>> 8) & 0xff;
      imageData.data[o + 2] = (c >>> 16) & 0xff;
      imageData.data[o + 3] = (c >>> 24) & 0xff;
    }
    fctx.putImageData(imageData, 0, 0);
    ctx.drawImage(frameCanvas, 0, 0, width, height, i * width * scale, 0, width * scale, height * scale);
  });

  return new Promise((resolve, reject) => {
    sheet.toBlob((blob) => {
      if (!blob) return reject(new Error('Could not create sprite sheet blob'));
      const name = filename.endsWith('.png') ? filename : `${filename}.png`;
      triggerDownload(blob, name);
      resolve(name);
    }, 'image/png');
  });
}

/** Export JSON metadata describing the document: canvas size, layers,
 *  palette. Useful alongside the PNG for game-engine import pipelines. */
export function exportMetadataJSON(filename) {
  const doc = serializeDocument();
  const meta = {
    name: doc.name,
    canvas: doc.canvas,
    layers: doc.layers.map((l) => ({ name: l.name, visible: l.visible, opacity: l.opacity })),
    palette: doc.palette,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });
  const name = filename.endsWith('.json') ? filename : `${filename}.json`;
  triggerDownload(blob, name);
  return name;
}

/** Export the full project (all layers, full fidelity) as a .json file the
 *  editor itself can re-open later via storage.js/loadDocument. */
export function exportProjectFile(filename) {
  const doc = serializeDocument();
  const blob = new Blob([JSON.stringify(doc)], { type: 'application/json' });
  const name = filename.endsWith('.pxproj.json') ? filename : `${filename}.pxproj.json`;
  triggerDownload(blob, name);
  return name;
}
