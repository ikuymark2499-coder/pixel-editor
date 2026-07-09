/**
 * ui.js
 * Wires up every DOM control to the modules that do the real work.
 * This file contains no drawing/tool logic itself - it's pure glue.
 *
 * Sections:
 *   1. Imports
 *   2. DOM References (els)
 *   3. Init
 *   4. Tools
 *   5. Zoom / Grid
 *   6. Undo / Redo
 *   7. Panels
 *   8. Color Panel
 *   9. Layers Panel
 *  10. File Panel
 *  11. Language Panel
 *  12. Dialogs
 *  13. Keyboard Shortcuts
 *  14. Resize / Status
 *  15. State Subscription
 *  16. Toasts
 */

// ============================================================
// 1. IMPORTS
// ============================================================

import { state, subscribe, emit, resetDocument, getActiveLayer, loadDocument, markDirty } from './state.js';
import { initCanvas, render, fitAndCenter, markCompositeDirty, resizeViewport, rebuildCheckerboard } from './canvas.js';
import { initInput } from './input.js';
import { undo, redo, canUndo, canRedo, beginAction, commitAction, resetHistory } from './history.js';
import {
  scheduleAutosave, saveAutosave, loadAutosave,
  saveProjectAs, listProjects, loadProject, deleteProject,
} from './storage.js';
import { exportPNG, exportSpriteSheetFromLayers, exportMetadataJSON, exportProjectFile } from './export.js';
import {
  addRecentColor, addCustomColor, removeCustomColor, toggleFavorite, isFavorite,
  DEFAULT_SWATCHES, exportPaletteJSON, importPaletteJSON,
} from './palette.js';
import {
  addLayer, removeLayer, renameLayer, toggleVisibility, toggleLock,
  setOpacity, moveLayer, duplicateLayer, mergeDown,
  activateTransform, cancelTransform, commitTransform,
} from './layers.js';
import { hexToPacked, packedToHex, clamp, sizeLabel, unpackRGBA } from './utils.js';
import { t, getLanguage, setLanguage, onLanguageChange } from './i18n.js';
import { initColorPicker, setPickerColor } from './colorpicker.js';
import { initTransformOverlay } from './transform-overlay.js';

// ============================================================
// 2. DOM REFERENCES
// ============================================================

let els = {};

function cacheElements() {
  const ids = [
    // Main layout
    'view-canvas', 'canvas-wrap', 'project-name', 'dirty-dot',
    // Top bar
    'btn-undo', 'btn-redo', 'btn-menu',
    'btn-panel-layers', 'btn-panel-color', 'btn-panel-file',
    // Status bar
    'status-size', 'status-zoom', 'status-tool',
    // Toolbar
    'toolbar', 'btn-zoom-in', 'btn-zoom-out', 'btn-grid', 'btn-clear',
    // Panels
    'scrim', 'panel-color', 'panel-layers', 'panel-file',
    // Color panel
    'swatch-primary', 'swatch-secondary', 'swatch-swap',
    'hex-input', 'alpha-slider',
    'hsv-square', 'hsv-square-canvas', 'hsv-square-thumb',
    'hue-slider', 'hue-slider-canvas', 'hue-slider-thumb',
    'default-swatches', 'custom-swatches', 'recent-swatches', 'favorite-swatches',
    'btn-add-custom', 'btn-export-palette', 'import-palette-input',
    // Layers panel
    'layer-list', 'btn-layer-add', 'btn-layer-dup', 'btn-layer-merge', 'btn-layer-delete',
    // File panel
    'btn-new', 'btn-open', 'btn-save-as', 'autosave-hint',
    'export-filename', 'export-scale', 'export-transparent',
    'btn-export-png', 'btn-export-sheet', 'btn-export-meta',
    'btn-export-project', 'import-project-input', 'toggle-dark-mode',
    // Tool options
    'tool-options', 'brush-size', 'brush-size-label', 'fill-shape-row', 'shape-filled',
    // Dialogs
    'dialog-new', 'new-size-w', 'new-size-h',
    'dialog-clear', 'confirm-clear',
    'dialog-save-as', 'save-as-name', 'confirm-save-as',
    'dialog-open', 'open-project-list', 'open-empty-hint',
    // Misc
    'toast-container',
    'btn-lang-th', 'btn-lang-en',
    // Transform
    'transform-controls', 'transform-apply', 'transform-cancel', 'transform-aspect-lock',
    
    'btn-background',
    
    'panel-background',
    
    'bg-color-picker', 
    
    'bg-color-input',
    
    'bg-type-row',
    
    'bg-swatch-grid',
    
    'confirm-new',  // ✅ เพิ่ม
    
  ];

  for (const id of ids) {
    els[toCamel(id)] = document.getElementById(id);
  }
}

function toCamel(id) {
  return id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

// ============================================================
// 3. INIT
// ============================================================

export function initUI() {
  cacheElements();
  bootstrapDocument();

  initCanvas(els.viewCanvas);
  initInput(els.viewCanvas, { onColorPicked: onEyedropperPick });
  initTransformOverlay(els.canvasWrap);
  wireTransformControls();

  wireToolbar();
  wireZoomAndGrid();
  wireUndoRedo();
  wirePanels();
  wireColorPanel();
  wireLayerPanel();
  wireFilePanel();
  wireLanguagePanel();
  wireDialogs();
  wireKeyboardShortcuts();
  wireResize();
  wireBackgroundPanel();
  wireSidebar();
  
  initHome();
  
  subscribe(onStateChange);

  setActiveTool('pencil');
  refreshAll();
  fitAndCenter();
  render();

  onLanguageChange(() => {
    els.statusTool.textContent = toolLabel(state.tool);
    updateProjectNameUI();
    renderLayerList();
    updateLangButtons();
  });
}

function bootstrapDocument() {
  const saved = loadAutosave();
  if (saved && saved.canvas && saved.layers && saved.layers.length) {
    loadDocument(saved);
  } else {
    resetDocument(32, 32);
  }
  resetHistory();
}

// ============================================================
// 4. TOOLS
// ============================================================

function wireToolbar() {
  els.toolbar.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => setActiveTool(btn.dataset.tool));
  });

els.brushSize.addEventListener('input', () => {
  state.toolOptions.brushSize = parseInt(els.brushSize.value, 10);
  els.brushSizeLabel.textContent = `${els.brushSize.value}px`;
});

  els.shapeFilled.addEventListener('change', () => {
    state.toolOptions.shapeFilled = els.shapeFilled.checked;
  });

  els.btnClear.addEventListener('click', () => openDialog(els.dialogClear));
}

function setActiveTool(tool) {
  state.tool = tool;
  els.toolbar.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
  els.statusTool.textContent = toolLabel(tool);

  // ✅ Tool options: แสดง Brush Size เสมอ (ทุก tool)
  const isPaintTool = tool === 'pencil' || tool === 'eraser';
  const isShapeTool = tool === 'line' || tool === 'rect' || tool === 'circle';
  
  // ✅ แสดง tool options สำหรับทุก tool (ยกเว้น bucket, eyedropper, pan)
  const showOptions = isPaintTool || isShapeTool;
  els.toolOptions.hidden = !showOptions;
  
  // ✅ แสดง Filled checkbox เฉพาะ Shape
  els.fillShapeRow.hidden = !isShapeTool;
  
  // ✅ Brush size แสดงเสมอ (ทั้ง Pencil และ Shape)
  // ไม่ต้องซ่อน brush size แยก

  requestAnimationFrame(() => {
    resizeViewport();
  });
}

function toolLabel(tool) {
  return t(`status_tool_${tool}`) || tool;
}

// ============================================================
// 5. ZOOM / GRID
// ============================================================

function wireZoomAndGrid() {
  els.btnZoomIn.addEventListener('click', () => zoomBy(1.25));
  els.btnZoomOut.addEventListener('click', () => zoomBy(0.8));
  els.btnGrid.addEventListener('click', () => {
    state.view.gridVisible = !state.view.gridVisible;
    els.btnGrid.classList.toggle('active', state.view.gridVisible);
    render();
  });
  els.btnGrid.classList.toggle('active', state.view.gridVisible);
}

function zoomBy(factor) {
  const rect = els.viewCanvas.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const { zoom, panX, panY } = state.view;

  // ✅ step เล็กลงเมื่อ zoom น้อย
  const step = Math.max(0.05, zoom * 0.08);
  let newZoom = zoom;
  if (factor > 1) {
    newZoom = Math.min(64, zoom + step);
  } else {
    newZoom = Math.max(0.1, zoom - step); // จาก 1 → 0.1
  }
  newZoom = Math.round(newZoom * 10) / 10; // ทศนิยม 1 ตำแหน่ง

  if (newZoom === zoom) return;

  const worldX = (cx - panX) / zoom;
  const worldY = (cy - panY) / zoom;
  state.view.zoom = newZoom;
  state.view.panX = cx - worldX * newZoom;
  state.view.panY = cy - worldY * newZoom;
  render();
  updateStatusBar();
}

// ============================================================
// 6. UNDO / REDO
// ============================================================

function wireUndoRedo() {
  els.btnUndo.addEventListener('click', () => {
    undo();
    markCompositeDirty();
    render();
    scheduleAutosave();
  });
  els.btnRedo.addEventListener('click', () => {
    redo();
    markCompositeDirty();
    render();
    scheduleAutosave();
  });
}

function updateUndoRedoButtons() {
  els.btnUndo.disabled = !canUndo();
  els.btnRedo.disabled = !canRedo();
}

// ============================================================
// 7. PANELS
// ============================================================

const panelMap = {};

function wirePanels() {
  panelMap[els.btnPanelColor.id] = els.panelColor;
  panelMap[els.btnPanelLayers.id] = els.panelLayers;
  panelMap[els.btnPanelFile.id] = els.panelFile;

  [els.btnPanelColor, els.btnPanelLayers, els.btnPanelFile].forEach((btn) => {
    btn.addEventListener('click', () => togglePanel(panelMap[btn.id]));
  });
  
  els.scrim.addEventListener('click', closeAllPanels);
  document.querySelectorAll('.panel-close').forEach((btn) => {
    btn.addEventListener('click', closeAllPanels);
  });
}

function togglePanel(panel) {
  const isOpen = !panel.hidden;
  closeAllPanels();
  if (!isOpen) {
    panel.hidden = false;
    els.scrim.hidden = false;
  }
  requestAnimationFrame(() => resizeViewport());
}

function closeAllPanels() {
  if (els.panelColor) els.panelColor.hidden = true;
  if (els.panelLayers) els.panelLayers.hidden = true;
  if (els.panelFile) els.panelFile.hidden = true;
  if (els.panelBackground) els.panelBackground.hidden = true;
  if (els.scrim) els.scrim.hidden = true;
  requestAnimationFrame(() => resizeViewport());
}

// ============================================================
// 8. COLOR PANEL
// ============================================================

function currentAlpha() {
  return unpackRGBA(state.primaryColor)[3];
}

function wireColorPanel() {
  renderSwatchGrid(els.defaultSwatches, DEFAULT_SWATCHES, false);
  initColorPicker(els, { onChange: onPickerChange });

  els.swatchSecondary.addEventListener('click', () => {
    const tmp = state.primaryColor;
    state.primaryColor = state.secondaryColor;
    state.secondaryColor = tmp;
    updateColorUI();
  });

  els.swatchSwap.addEventListener('click', () => {
    const tmp = state.primaryColor;
    state.primaryColor = state.secondaryColor;
    state.secondaryColor = tmp;
    updateColorUI();
  });

  els.hexInput.addEventListener('change', () => {
    const val = els.hexInput.value.trim();
    if (/^#?[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(val)) {
      setPrimaryFromHex(val, currentAlpha());
    } else {
      els.hexInput.value = packedToHex(state.primaryColor);
    }
  });

  els.alphaSlider.addEventListener('input', () => {
    const hex = packedToHex(state.primaryColor);
    setPrimaryFromHex(hex, parseInt(els.alphaSlider.value, 10));
  });

  els.btnAddCustom.addEventListener('click', () => {
    addCustomColor(packedToHex(state.primaryColor));
  });

  els.btnExportPalette.addEventListener('click', () => {
    exportPaletteJSON();
    toast(t('toast_palette_exported'));
  });

  els.importPaletteInput.addEventListener('change', async () => {
    const file = els.importPaletteInput.files[0];
    if (!file) return;
    try {
      await importPaletteJSON(file);
      toast(t('toast_palette_imported'));
    } catch (err) {
      toast(t('toast_palette_import_error'), 'error');
    }
    els.importPaletteInput.value = '';
  });

  updateColorUI();
}

function setPrimaryFromHex(hex, alpha) {
  state.primaryColor = hexToPacked(hex, alpha);
  updateColorUI();
}

function onEyedropperPick(colorInt) {
  state.primaryColor = colorInt;
  updateColorUI();
  toast(t('toast_color_picked'));
}

function onPickerChange(packed, { commit }) {
  state.primaryColor = packed;
  els.swatchPrimary.style.setProperty('--swatch-color', packedToRgbaCss(packed));
  els.hexInput.value = packedToHex(packed);
  els.alphaSlider.value = String(unpackRGBA(packed)[3]);
  if (commit) {
    renderSwatchGrid(els.recentSwatches, state.palette.recent, false);
  }
}

function updateColorUI() {
  els.swatchPrimary.style.setProperty('--swatch-color', packedToRgbaCss(state.primaryColor));
  els.swatchSecondary.style.setProperty('--swatch-color', packedToRgbaCss(state.secondaryColor));
  const hex = packedToHex(state.primaryColor);
  els.hexInput.value = hex;
  els.alphaSlider.value = String(currentAlpha());
  setPickerColor(state.primaryColor);
  renderSwatchGrid(els.customSwatches, state.palette.custom, true, removeCustomColor);
  renderSwatchGrid(els.recentSwatches, state.palette.recent, false);
  renderSwatchGrid(els.favoriteSwatches, state.palette.favorites, false);
}

function packedToRgbaCss(packed) {
  const [r, g, b, a] = unpackRGBA(packed);
  return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
}

function renderSwatchGrid(container, hexList, allowRemove, onRemove) {
  if (!container) return;
  container.innerHTML = '';

  for (const hex of hexList) {
    const cell = document.createElement('button');
    cell.className = 'swatch-cell';
    cell.style.background = hex;
    cell.title = hex;
    if (isFavorite(hex)) cell.classList.add('favorited');

    cell.addEventListener('click', () => {
      setPrimaryFromHex(hex, 255);
    });

    let pressTimer = null;
    cell.addEventListener('pointerdown', () => {
      pressTimer = setTimeout(() => {
        toggleFavorite(hex);
        updateColorUI();
      }, 550);
    });
    cell.addEventListener('pointerup', () => clearTimeout(pressTimer));
    cell.addEventListener('pointerleave', () => clearTimeout(pressTimer));

    if (allowRemove) {
      cell.addEventListener('dblclick', () => onRemove(hex));
      cell.title += t('swatch_hint_remove');
    } else {
      cell.title += t('swatch_hint_favorite');
    }

    container.appendChild(cell);
  }
}

// ============================================================
// 9. LAYERS PANEL
// ============================================================

function wireLayerPanel() {
  els.btnLayerAdd.addEventListener('click', () => {
    addLayer();
    renderLayerList();
    toast(t('toast_layer_added'));
  });

  els.btnLayerDup.addEventListener('click', () => {
    if (!state.activeLayerId) return;
    duplicateLayer(state.activeLayerId);
    renderLayerList();
    render();
  });

  els.btnLayerMerge.addEventListener('click', () => {
    if (!state.activeLayerId) return;
    const ok = mergeDown(state.activeLayerId);
    if (ok) {
      renderLayerList();
      render();
      toast(t('toast_layer_merged'));
    } else {
      toast(t('toast_layer_merge_error'), 'error');
    }
  });

  els.btnLayerDelete.addEventListener('click', () => {
    if (!state.activeLayerId) return;
    if (state.layers.length <= 1) {
      toast(t('toast_layer_delete_error'), 'error');
      return;
    }
    removeLayer(state.activeLayerId);
    renderLayerList();
    render();
  });

  renderLayerList();
}

function makeLayerThumbDataUrl(layer) {
  const { width, height } = state.canvas;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  const imageData = ctx.createImageData(width, height);

  for (let i = 0; i < width * height; i++) {
    const v = layer.data[i];
    const o = i * 4;
    imageData.data[o] = v & 0xff;
    imageData.data[o + 1] = (v >>> 8) & 0xff;
    imageData.data[o + 2] = (v >>> 16) & 0xff;
    imageData.data[o + 3] = (v >>> 24) & 0xff;
  }
  ctx.putImageData(imageData, 0, 0);
  return c.toDataURL();
}

function renderLayerList() {
  if (!els.layerList) return;
  els.layerList.innerHTML = '';

  for (let i = state.layers.length - 1; i >= 0; i--) {
    const layer = state.layers[i];

    const row = document.createElement('li');
    row.className = 'layer-row' + (layer.id === state.activeLayerId ? ' active' : '');

    // ทั้งแถวนอน
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '10px';
    row.style.padding = '30px 12px 10px';
    row.style.borderRadius = '10px';
    row.style.background = 'var(--bg-2)';
    row.style.border = '1px solid var(--line)';
    row.style.minHeight = '80px';
    row.style.width = '100%';
    row.style.boxSizing = 'border-box';

    // Thumbnail
    const thumb = document.createElement('div');
    thumb.className = 'layer-thumb';
    thumb.style.width = '40px';
    thumb.style.height = '40px';
    thumb.style.flexShrink = '0';
    thumb.style.borderRadius = '6px';
    thumb.style.border = '1px solid var(--line)';
    thumb.style.backgroundImage = `url(${makeLayerThumbDataUrl(layer)})`;
    thumb.style.backgroundSize = 'cover';
    thumb.style.backgroundPosition = 'center';
    thumb.style.imageRendering = 'pixelated';
    row.appendChild(thumb);

    // Name
    const nameInput = document.createElement('input');
    nameInput.className = 'layer-name';
    nameInput.value = layer.name;
    nameInput.style.background = 'transparent';
    nameInput.style.border = 'none';
    nameInput.style.outline = 'none';
    nameInput.style.color = 'var(--text-0)';
    nameInput.style.fontSize = '13px';
    nameInput.style.fontWeight = '500';
    nameInput.style.padding = '2px 0';
    nameInput.style.flex = '1';
    nameInput.style.minWidth = '80px';
    nameInput.style.width = '100%';
    nameInput.style.boxSizing = 'border-box';

    nameInput.addEventListener('change', () => {
      renameLayer(layer.id, nameInput.value || t('layer_default_name'));
    });

    row.appendChild(nameInput);

    // Opacity slider
    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.className = 'opacity-slider';
    opacitySlider.min = '0';
    opacitySlider.max = '100';
    opacitySlider.value = String(Math.round(layer.opacity * 100));
    opacitySlider.title = t('layer_opacity_title');
    opacitySlider.style.width = '120px';
    opacitySlider.style.flexShrink = '0';
    opacitySlider.style.height = '4px';
    opacitySlider.style.accentColor = 'var(--accent)';

    opacitySlider.addEventListener('input', () => {
      setOpacity(layer.id, parseInt(opacitySlider.value, 10) / 100);
      render();
    });

    row.appendChild(opacitySlider);

    // Visibility
    const visBtn = document.createElement('button');
    visBtn.className = 'icon-btn';
    visBtn.innerHTML = layer.visible
      ? `<span class="material-symbols-outlined">visibility</span>`
      : `<span class="material-symbols-outlined">visibility_off</span>`;
    visBtn.title = t('layer_toggle_visibility_title');
    visBtn.style.width = '34px';
    visBtn.style.height = '34px';
    visBtn.style.flexShrink = '0';

    visBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleVisibility(layer.id);
      renderLayerList();
      render();
    });

    row.appendChild(visBtn);

    // Lock
    const lockBtn = document.createElement('button');
    lockBtn.className = 'icon-btn';
    lockBtn.innerHTML = layer.locked
      ? `<span class="material-symbols-outlined">lock</span>`
      : `<span class="material-symbols-outlined">lock_open</span>`;
    lockBtn.title = t('layer_toggle_lock_title');
    lockBtn.style.width = '34px';
    lockBtn.style.height = '34px';
    lockBtn.style.flexShrink = '0';

    lockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleLock(layer.id);
      renderLayerList();
    });

    row.appendChild(lockBtn);

    // 3 dots menu
    const menuBtn = document.createElement('button');
    menuBtn.className = 'icon-btn';
    menuBtn.innerHTML = `<span class="material-symbols-outlined">more_vert</span>`;
    menuBtn.title = 'Layer options';
    menuBtn.style.width = '34px';
    menuBtn.style.height = '34px';
    menuBtn.style.flexShrink = '0';

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showLayerPopup(e, layer.id);
    });

    row.appendChild(menuBtn);

    // Click row to select layer
    row.addEventListener('click', (e) => {
      if (
        e.target === nameInput ||
        e.target === opacitySlider ||
        e.target.tagName === 'BUTTON' ||
        e.target.closest('button')
      ) return;

      state.activeLayerId = layer.id;
      renderLayerList();
    });

    els.layerList.appendChild(row);
  }
}

// ─── TRANSFORM CONTROL BAR (Apply / Cancel / aspect-lock) ──────
function wireTransformControls() {
  if (!els.transformApply) return;

  // ปุ่ม Apply
  els.transformApply.addEventListener('click', () => {
    if (!state.transform.active) return;
    commitTransform();
    toast(t('toast_transform_applied'));
    renderLayerList();
    render();
  });

  // ปุ่ม Cancel
  els.transformCancel.addEventListener('click', () => {
    if (!state.transform.active) return;
    cancelTransform();
    toast(t('toast_transform_cancelled'));
    renderLayerList();
    render();
  });

  // ✅ ปุ่ม Close (X) - ใช้ ID จาก HTML
  const transformCloseBtn = document.getElementById('transform-close');
  if (transformCloseBtn) {
    transformCloseBtn.addEventListener('click', () => {
      if (!state.transform.active) return;
      cancelTransform();
      toast(t('toast_transform_cancelled'));
      renderLayerList();
      render();
    });
  }

  els.transformAspectLock.addEventListener('change', () => {
    state.transform.aspectLocked = els.transformAspectLock.checked;
  });

  syncTransformControlsVisibility();
}

function syncTransformControlsVisibility() {
  if (!els.transformControls) return;
  els.transformControls.hidden = !state.transform.active;
  syncAspectLockCheckbox();
}

function syncAspectLockCheckbox() {
  if (!els.transformAspectLock) return;
  els.transformAspectLock.checked = state.transform.aspectLocked;
}

// ============================================================
// 10. FILE PANEL
// ============================================================

function wireFilePanel() {
  els.btnNew.addEventListener('click', () => openDialog(els.dialogNew));
  els.btnOpen.addEventListener('click', openOpenDialog);
  els.btnSaveAs.addEventListener('click', () => {
    els.saveAsName.value = state.project.name === 'untitled' ? '' : state.project.name;
    openDialog(els.dialogSaveAs);
  });

  els.btnExportPng.addEventListener('click', async () => {
    const name = els.exportFilename.value.trim() || 'pixel-art';
    const scale = parseInt(els.exportScale.value, 10);
    try {
      await exportPNG(name, scale, els.exportTransparent.checked);
      toast(t('toast_png_exported'));
    } catch (err) {
      toast(t('toast_export_error'), 'error');
    }
  });

  els.btnExportSheet.addEventListener('click', async () => {
    const name = els.exportFilename.value.trim() || 'pixel-art';
    const scale = parseInt(els.exportScale.value, 10);
    try {
      await exportSpriteSheetFromLayers(`${name}-sheet`, scale);
      toast(t('toast_sprite_sheet_exported'));
    } catch (err) {
      toast(t('toast_export_error'), 'error');
    }
  });

  els.btnExportMeta.addEventListener('click', () => {
    const name = els.exportFilename.value.trim() || 'pixel-art';
    exportMetadataJSON(`${name}-meta`);
    toast(t('toast_metadata_exported'));
  });

  els.btnExportProject.addEventListener('click', () => {
    const name = els.exportFilename.value.trim() || 'pixel-art';
    exportProjectFile(name);
    toast(t('toast_project_exported'));
  });

  els.importProjectInput.addEventListener('change', () => {
    const file = els.importProjectInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const doc = JSON.parse(reader.result);
        loadDocument(doc);
        resetHistory();
        markCompositeDirty();
        fitAndCenter();
        render();
        renderLayerList();
        updateColorUI();
        toast(t('toast_project_imported'));
      } catch (err) {
        toast(t('toast_project_import_error'), 'error');
      }
    };
    reader.readAsText(file);
    els.importProjectInput.value = '';
  });
  
  // ใน wireFilePanel()
els.toggleDarkMode.addEventListener('change', () => {
  document.body.classList.toggle('light-mode', !els.toggleDarkMode.checked);
  if (state.bg.type === 'checkerboard') {
    rebuildCheckerboard();
    render();
  }
});

// ============================================================
// 11. LANGUAGE PANEL
// ============================================================

function wireLanguagePanel() {
  els.btnLangTh.addEventListener('click', () => switchLanguage('th'));
  els.btnLangEn.addEventListener('click', () => switchLanguage('en'));
  updateLangButtons();
}

function switchLanguage(lang) {
  setLanguage(lang);
  localStorage.setItem('app_lang', lang);
  updateLangButtons();
}

function updateLangButtons() {
  if (!els.btnLangTh || !els.btnLangEn) return;
  const current = getLanguage();
  els.btnLangTh.classList.toggle('primary', current === 'th');
  els.btnLangEn.classList.toggle('primary', current === 'en');
}

// ============================================================
// 12. DIALOGS
// ============================================================

function wireDialogs() {
  // ─── ปุ่ม Cancel ──────────────────────────────────────
  document.querySelectorAll('[data-dialog-cancel]').forEach((btn) => {
    btn.addEventListener('click', () => closeDialog(btn.closest('.dialog-overlay')));
  });

  // ─── ตัวแปรเก็บขนาดที่เลือก ──────────────────────────
  let selectedSize = null; // { w, h } หรือ null
  let isCustomMode = false;

  // ─── Grid Size Selection ─────────────────────────────
  const sizeBtns = document.querySelectorAll('.size-btn[data-size]');
  sizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const size = parseInt(btn.dataset.size, 10);
      
      // ✅ ลบ selected ออกจากปุ่มอื่น
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
      
      // ✅ เพิ่ม selected ให้ปุ่มนี้
      btn.classList.add('selected');
      
      // ✅ ถ้า Custom เปิดอยู่ ให้ซ่อน
      const customRow = document.getElementById('custom-size-row');
      if (customRow) customRow.hidden = true;
      const customBtn = document.getElementById('size-custom-btn');
      if (customBtn) customBtn.style.display = '';
      
      isCustomMode = false;
      selectedSize = { w: size, h: size };
      
      // ✅ ซ่อนข้อความเตือน
      hideSizeWarning();
    });
  });

  // ─── ปุ่ม Custom ──────────────────────────────────────
  const customBtn = document.getElementById('size-custom-btn');
  const customRow = document.getElementById('custom-size-row');
  
  if (customBtn) {
    customBtn.addEventListener('click', () => {
      // ✅ ลบ selected ออกจากปุ่มอื่น
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
      
      // ✅ เพิ่ม selected ให้ปุ่ม Custom
      customBtn.classList.add('selected');
      
      customRow.hidden = false;
      isCustomMode = true;
      selectedSize = null;
      
      setTimeout(() => els.newSizeW?.focus(), 100);
      checkSizeWarning();
    });
  }

  // ─── ปุ่ม Create (ยืนยัน) ────────────────────────────
  const confirmBtn = document.getElementById('confirm-new');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      let w, h;
      
      if (isCustomMode) {
        // ✅ Custom mode
        w = clamp(parseInt(els.newSizeW?.value, 10) || 32, 1, 2048);
        h = clamp(parseInt(els.newSizeH?.value, 10) || 32, 1, 2048);
        
        // ✅ ถ้าเกิน 1024 แค่เตือน แต่ยังสร้างได้
        if (w > 1024 || h > 1024) {
          // แค่โชว์ข้อความเตือน (ไม่ต้องถาม)
        }
      } else if (selectedSize) {
        // ✅ เลือกขนาดจากปุ่ม
        w = selectedSize.w;
        h = selectedSize.h;
      } else {
        // ❌ ยังไม่ได้เลือก
        toast('กรุณาเลือกขนาดก่อน', 'error');
        return;
      }
      
      createNewCanvas(w, h);
      closeDialog(els.dialogNew);
      resetNewCanvasUI();
    });
  }

  // ─── ตรวจสอบขนาด (real-time) ────────────────────────
  if (els.newSizeW) {
    els.newSizeW.addEventListener('input', checkSizeWarning);
  }
  if (els.newSizeH) {
    els.newSizeH.addEventListener('input', checkSizeWarning);
  }

  // ─── Enter key ในช่อง Custom ─────────────────────────
  if (els.newSizeW) {
    els.newSizeW.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmBtn?.click();
    });
  }
  if (els.newSizeH) {
    els.newSizeH.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmBtn?.click();
    });
  }

  // ─── Clear Canvas ─────────────────────────────────────
  els.confirmClear.addEventListener('click', () => {
    const layer = getActiveLayer();
    if (layer) {
      beginAction();
      layer.data.fill(0);
      commitAction();
      markDirty();
      markCompositeDirty();
      render();
      scheduleAutosave();
    }
    closeDialog(els.dialogClear);
    toast(t('toast_canvas_cleared'));
  });

  // ─── Save As ──────────────────────────────────────────
  els.confirmSaveAs.addEventListener('click', () => {
    const name = els.saveAsName.value.trim();
    if (!name) {
      toast(t('toast_project_name_required'), 'error');
      return;
    }
    saveProjectAs(name);
    closeDialog(els.dialogSaveAs);
    toast(t('toast_project_saved', { name }));
    updateProjectNameUI();
  });
}

// ─── ฟังก์ชันสร้าง Canvas ใหม่ ──────────────────────────
function createNewCanvas(w, h) {
  resetDocument(w, h);
  resetHistory();
  markCompositeDirty();
  fitAndCenter();
  render();
  renderLayerList();
  saveAutosave();
  toast(t('toast_canvas_created', { size: sizeLabel(w, h) }));
}

// ─── ฟังก์ชันรีเซ็ต UI เมื่อปิด Dialog ──────────────────
function resetNewCanvasUI() {
  const customRow = document.getElementById('custom-size-row');
  const customBtn = document.getElementById('size-custom-btn');
  
  if (customRow) customRow.hidden = true;
  if (customBtn) customBtn.style.display = '';
  
  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
  
  if (els.newSizeW) els.newSizeW.value = 32;
  if (els.newSizeH) els.newSizeH.value = 32;
  
  isCustomMode = false;
  selectedSize = null;
  hideSizeWarning();
}

// ─── ฟังก์ชันตรวจสอบขนาด ──────────────────────────────
function checkSizeWarning() {
  const w = parseInt(els.newSizeW?.value, 10) || 0;
  const h = parseInt(els.newSizeH?.value, 10) || 0;
  const warningEl = document.getElementById('new-size-warning-text');
  
  if (!warningEl) return;
  
  if (w > 1024 || h > 1024) {
    warningEl.hidden = false;
  } else {
    warningEl.hidden = true;
  }
}

// ─── ฟังก์ชันซ่อนข้อความเตือน ──────────────────────────
function hideSizeWarning() {
  const warningEl = document.getElementById('new-size-warning-text');
  if (warningEl) warningEl.hidden = true;
}

function openOpenDialog() {
  const projects = listProjects();
  els.openProjectList.innerHTML = '';
  els.openEmptyHint.hidden = projects.length > 0;

  for (const p of projects) {
    const row = document.createElement('li');
    row.className = 'project-row';

    const label = document.createElement('span');
    label.textContent = `${p.name} · ${sizeLabel(p.width, p.height)}`;
    row.appendChild(label);

    const actions = document.createElement('div');
    actions.className = 'field-row';

    const loadBtn = document.createElement('button');
    loadBtn.className = 'chip-btn primary';
    loadBtn.textContent = t('project_open_button');
    loadBtn.addEventListener('click', () => {
      const doc = loadProject(p.name);
      if (doc) {
        loadDocument(doc);
        resetHistory();
        markCompositeDirty();
        fitAndCenter();
        render();
        renderLayerList();
        updateColorUI();
        closeDialog(els.dialogOpen);
        toast(t('toast_project_opened', { name: p.name }));
      }
    });
    actions.appendChild(loadBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'chip-btn danger';
    delBtn.textContent = t('project_delete_button');
    delBtn.addEventListener('click', () => {
      deleteProject(p.name);
      openOpenDialog();
    });
    actions.appendChild(delBtn);

    row.appendChild(actions);
    els.openProjectList.appendChild(row);
  }
  openDialog(els.dialogOpen);
}

function openDialog(dialog) { dialog.hidden = false; }
function closeDialog(dialog) { dialog.hidden = true; }

// ============================================================
// 13. KEYBOARD SHORTCUTS
// ============================================================

function wireKeyboardShortcuts() {
  const keyToTool = {
    b: 'pencil', e: 'eraser', g: 'bucket', l: 'line',
    r: 'rect', c: 'circle', i: 'eyedropper', h: 'pan',
  };

  window.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

    // ─── Transform shortcuts ──────────────────────────────
    if (state.transform.active) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitTransform();
        toast(t('toast_transform_applied') || '✅ Transform applied');
        renderLayerList();
        render();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelTransform();
        toast(t('toast_transform_cancelled') || '❌ Transform cancelled');
        renderLayerList();
        render();
        return;
      }
      // A = toggle aspect-ratio lock for the resize handles (spec item 5).
      // (The old M/S/R "mode switch" keys never changed actual pointer
      // behavior - onPointerMove ignored state.transform.mode entirely -
      // so they're replaced here with a toggle that does something real.)
      if (e.key === 'a' || e.key === 'A') {
        state.transform.aspectLocked = !state.transform.aspectLocked;
        toast(state.transform.aspectLocked ? t('toast_aspect_locked') : t('toast_aspect_unlocked'));
        syncAspectLockCheckbox();
        return;
      }
    }

    // ─── Undo / Redo ──────────────────────────────────────
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) { redo(); } else { undo(); }
      markCompositeDirty();
      render();
      scheduleAutosave();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
      markCompositeDirty();
      render();
      scheduleAutosave();
      return;
    }

    // ─── Grid toggle ──────────────────────────────────────
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      state.view.gridVisible = !state.view.gridVisible;
      els.btnGrid.classList.toggle('active', state.view.gridVisible);
      render();
      return;
    }

    // ─── Zoom ─────────────────────────────────────────────
    if (e.key === '+' || e.key === '=') { zoomBy(1.25); return; }
    if (e.key === '-' || e.key === '_') { zoomBy(0.8); return; }

    // ─── Tool shortcuts ──────────────────────────────────
    const tool = keyToTool[e.key.toLowerCase()];
    if (tool) setActiveTool(tool);
  });
}

// ============================================================
// 14. RESIZE / STATUS
// ============================================================

function wireResize() {
  const ro = new ResizeObserver(() => render());
  ro.observe(els.canvasWrap);
  window.addEventListener('orientationchange', () => setTimeout(() => render(), 200));
}

function updateStatusBar() {
  els.statusSize.textContent = sizeLabel(state.canvas.width, state.canvas.height);
  els.statusZoom.textContent = `${state.view.zoom * 100}%`;
}

function updateProjectNameUI() {
  els.projectName.textContent = state.project.name === 'untitled'
    ? t('project_name_untitled')
    : state.project.name;
  els.dirtyDot.hidden = !state.project.dirty;
}

// ============================================================
// 15. STATE SUBSCRIPTION
// ============================================================

function onStateChange(topic) {
  if (topic === 'history' || topic === 'document') updateUndoRedoButtons();
  if (topic === 'document') { renderLayerList(); updateColorUI(); }
  if (topic === 'layers') renderLayerList();
  if (topic === 'palette') {
    renderSwatchGrid(els.recentSwatches, state.palette.recent, false);
  }
  if (topic === 'transform') {
    renderLayerList(); // Refresh transform button states
    syncTransformControlsVisibility();
  }
  if (topic === 'dirty' || topic === 'document') updateProjectNameUI();
  updateStatusBar();
  
  if (topic === 'bg') {
    updateBackgroundUI();
  }
}

function refreshAll() {
  updateUndoRedoButtons();
  updateProjectNameUI();
  updateStatusBar();
  updateColorUI();
  renderLayerList();
}

// ============================================================
// HOME PAGE
// ============================================================

let homeProjects = [];

function initHome() {
  const homePage = document.getElementById('home-page');
  if (!homePage) return;
  
  // ✅ แสดงหน้า Home เสมอ
  homePage.classList.remove('hidden');
  
  wireHomeEvents();
  
  // ✅ ไม่ต้อง render gallery (ไม่มีในหน้า Home แล้ว)
}

function wireHomeEvents() {
  // ─── ปุ่มสร้างโปรเจกต์ใหม่ ───
  const newBtn = document.getElementById('home-btn-new');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      // ✅ เปิด Dialog New Canvas (ที่มีอยู่แล้ว)
      openDialog(els.dialogNew);
      // ✅ ปิดหน้า Home (ไปที่หน้า Editor)
      document.getElementById('home-page')?.classList.add('hidden');
    });
  }

  // ─── ปุ่มโปรเจกต์ของฉัน ───
  const galleryBtn = document.getElementById('home-btn-gallery');
  if (galleryBtn) {
    galleryBtn.addEventListener('click', () => {
      // ✅ เปิด Dialog Open Project (ที่มีอยู่แล้ว)
      openOpenDialog();
    });
  }

  // ─── ปุ่มเปิดจากไฟล์ ───
  const openBtn = document.getElementById('home-btn-open');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      // ✅ เปิด file picker
      const input = document.getElementById('home-import-input');
      if (input) input.click();
    });
  }

  // ─── Import file ───
  const importInput = document.getElementById('home-import-input');
  if (importInput) {
    importInput.addEventListener('change', () => {
      const file = importInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const doc = JSON.parse(reader.result);
          loadDocument(doc);
          resetHistory();
          markCompositeDirty();
          fitAndCenter();
          render();
          renderLayerList();
          updateColorUI();
          document.getElementById('home-page')?.classList.add('hidden');
          toast(t('toast_project_imported'));
        } catch (err) {
          toast(t('toast_project_import_error'), 'error');
        }
      };
      reader.readAsText(file);
      importInput.value = '';
    });
  }
}

function createFromHome(w, h) {
  resetDocument(w, h);
  resetHistory();
  markCompositeDirty();
  fitAndCenter();
  render();
  renderLayerList();
  saveAutosave();
  
  // ✅ ซ่อนหน้า Home
  document.getElementById('home-page')?.classList.add('hidden');
  
  toast(t('toast_canvas_created', { size: sizeLabel(w, h) }));
}

function checkHomeWarning() {
  const w = parseInt(document.getElementById('home-size-w')?.value, 10) || 0;
  const h = parseInt(document.getElementById('home-size-h')?.value, 10) || 0;
  const warningEl = document.getElementById('home-warning-text');
  if (!warningEl) return;
  warningEl.hidden = !(w > 1024 || h > 1024);
}

function renderHomeGallery() {
  const gallery = document.getElementById('home-gallery');
  const empty = document.getElementById('home-empty');
  if (!gallery) return;
  
  const projects = listProjects();
  
  if (projects.length === 0) {
    gallery.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }
  
  if (empty) empty.hidden = true;
  gallery.innerHTML = '';
  
  // แสดงเฉพาะ 5 โปรเจกต์ล่าสุด
  const recent = projects.slice(0, 5);
  
  for (const p of recent) {
    const item = document.createElement('div');
    item.className = 'home-gallery-item';
    
    const info = document.createElement('div');
    info.className = 'info';
    info.innerHTML = `
      <span class="name">${p.name}</span>
      <span class="meta">${sizeLabel(p.width, p.height)} · ${new Date(p.savedAt).toLocaleDateString()}</span>
    `;
    
    const actions = document.createElement('div');
    actions.className = 'actions';
    
    const openBtn = document.createElement('button');
    openBtn.className = 'chip-btn primary';
    openBtn.textContent = t('project_open_button') || 'เปิด';
    openBtn.addEventListener('click', () => {
      const doc = loadProject(p.name);
      if (doc) {
        loadDocument(doc);
        resetHistory();
        markCompositeDirty();
        fitAndCenter();
        render();
        renderLayerList();
        updateColorUI();
        document.getElementById('home-page')?.classList.add('hidden');
        toast(t('toast_project_opened', { name: p.name }));
      }
    });
    actions.appendChild(openBtn);
    
    const delBtn = document.createElement('button');
    delBtn.className = 'chip-btn danger';
    delBtn.textContent = t('project_delete_button') || 'ลบ';
    delBtn.addEventListener('click', () => {
      if (confirm(`ลบโปรเจกต์ "${p.name}"?`)) {
        deleteProject(p.name);
        renderHomeGallery();
      }
    });
    actions.appendChild(delBtn);
    
    item.appendChild(info);
    item.appendChild(actions);
    gallery.appendChild(item);
  }
}

// ─── Layer Popup Menu ───
function showLayerPopup(event, layerId) {
  // ลบ popup เก่าถ้ามี
  const oldPopup = document.querySelector('.layer-popup');
  if (oldPopup) oldPopup.remove();

  const popup = document.createElement('div');
  popup.className = 'layer-popup';
  popup.style.position = 'fixed';
  popup.style.background = 'var(--bg-2)';
  popup.style.border = '1px solid var(--line)';
  popup.style.borderRadius = '12px';
  popup.style.padding = '8px';
  popup.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
  popup.style.zIndex = '100';
  popup.style.minWidth = '160px';
  popup.style.display = 'flex';
  popup.style.flexDirection = 'column';
  popup.style.gap = '4px';

  // ─── คำนวณตำแหน่ง ───
  const rect = event.target.getBoundingClientRect();
  const popupWidth = 160;
  const popupHeight = 280; // ความสูงโดยประมาณของ popup (ปรับตามจำนวนปุ่ม)

  // คำนวณตำแหน่งแนวนอน (ซ้าย)
  let left = rect.left - popupWidth + 34; // ให้ขอบขวาชิดกับปุ่ม

  // ✅ ปรับไม่ให้เกินขอบซ้ายของหน้าจอ
  if (left < 10) left = 10;

  // ✅ ปรับไม่ให้เกินขอบขวาของหน้าจอ
  if (left + popupWidth > window.innerWidth - 10) {
    left = window.innerWidth - popupWidth - 10;
  }

  // คำนวณตำแหน่งแนวตั้ง (ด้านล่างของปุ่ม)
  let top = rect.bottom + 4;

  // ✅ ตรวจสอบว่าด้านล่างจะจมไหม
  if (top + popupHeight > window.innerHeight - 10) {
    // ถ้าจม → ให้แสดงเหนือปุ่มแทน
    top = rect.top - popupHeight - 4;
  }

  // ✅ ถ้าเหนือก็ยังจมอีก → วางตรงกลางหน้าจอ
  if (top < 10) {
    top = (window.innerHeight - popupHeight) / 2;
    left = (window.innerWidth - popupWidth) / 2;
  }

  popup.style.left = left + 'px';
  popup.style.top = top + 'px';

    // ─── ปุ่ม Transform ───
  const transformBtn = document.createElement('button');
  transformBtn.className = 'chip-btn';
  transformBtn.innerHTML = `
<span class="material-symbols-outlined">open_with</span>
${t('layer_popup_transform')}
`;
  transformBtn.style.width = '100%';
  transformBtn.style.justifyContent = 'flex-start';
  transformBtn.addEventListener('click', () => {
    popup.remove();
    activateTransformFromLayer(layerId);
  });
  popup.appendChild(transformBtn);

  // ─── ปุ่ม Move Up ───
  const upBtn = document.createElement('button');
  upBtn.className = 'chip-btn';
  upBtn.innerHTML = `
<span class="material-symbols-outlined">arrow_upward</span>
${t('layer_popup_move_up')}
`;
  upBtn.style.width = '100%';
  upBtn.style.justifyContent = 'flex-start';
  upBtn.addEventListener('click', () => {
    moveLayer(layerId, 1);
    renderLayerList();
    render();
    popup.remove();
  });
  popup.appendChild(upBtn);

  // ─── ปุ่ม Move Down ───
  const downBtn = document.createElement('button');
  downBtn.className = 'chip-btn';
  downBtn.innerHTML = `
<span class="material-symbols-outlined">arrow_downward</span>
${t('layer_popup_move_down')}
`;
  downBtn.style.width = '100%';
  downBtn.style.justifyContent = 'flex-start';
  downBtn.addEventListener('click', () => {
    moveLayer(layerId, -1);
    renderLayerList();
    render();
    popup.remove();
  });
  popup.appendChild(downBtn);

  // ─── ปุ่ม Duplicate ───
  const dupBtn = document.createElement('button');
  dupBtn.className = 'chip-btn';
  dupBtn.innerHTML = `
<span class="material-symbols-outlined">content_copy</span>
${t('layer_popup_duplicate')}
`;
  dupBtn.style.width = '100%';
  dupBtn.style.justifyContent = 'flex-start';
  dupBtn.addEventListener('click', () => {
    duplicateLayer(layerId);
    renderLayerList();
    render();
    popup.remove();
  });
  popup.appendChild(dupBtn);

  // ─── ปุ่ม Merge Down ───
  const mergeBtn = document.createElement('button');
  mergeBtn.className = 'chip-btn';
  mergeBtn.innerHTML = `
<img class="menu-icon" src="images/icon/merge_down.png">
${t('layer_popup_merge_down')}
`;
  mergeBtn.style.width = '100%';
  mergeBtn.style.justifyContent = 'flex-start';
  mergeBtn.addEventListener('click', () => {
    const ok = mergeDown(layerId);
    if (ok) {
      renderLayerList();
      render();
      toast(t('toast_layer_merged'));
    } else {
      toast(t('toast_layer_merge_error'), 'error');
    }
    popup.remove();
  });
  popup.appendChild(mergeBtn);

  // ─── ปุ่ม Delete ───
  const delBtn = document.createElement('button');
  delBtn.className = 'chip-btn danger';
  delBtn.innerHTML = `
<span class="material-symbols-outlined">delete</span>
${t('layer_popup_delete')}
`;
  delBtn.style.width = '100%';
  delBtn.style.justifyContent = 'flex-start';
  delBtn.addEventListener('click', () => {
    if (state.layers.length <= 1) {
      toast(t('toast_layer_delete_error'), 'error');
      popup.remove();
      return;
    }
    removeLayer(layerId);
    renderLayerList();
    render();
    popup.remove();
  });
  popup.appendChild(delBtn);
  document.body.appendChild(popup);

  // คลิกนอก popup เพื่อปิด
  const closePopup = (e) => {
    if (!popup.contains(e.target)) {
      popup.remove();
      document.removeEventListener('click', closePopup);
    }
  };
  setTimeout(() => document.addEventListener('click', closePopup), 10);
}

// ─── ฟังก์ชันเปิด Transform จาก Popup ───
function activateTransformFromLayer(layerId) {
  // ถ้ามี Transform อื่นอยู่ ยกเลิกก่อน
  if (state.transform.active) {
    cancelTransform();
  }

  const ok = activateTransform(layerId);
  if (ok) {
    const layer = state.layers.find(l => l.id === layerId);
    toast(`🔧 ${t('toast_transform_active') || 'Transform:'} ${layer ? layer.name : ''}`);
    renderLayerList();
    render();
    closeAllPanels();
  }
}

function wireBackgroundPanel() {
  // ปุ่มเปิด panel ใน file panel
  if (els.btnBackground) {
    els.btnBackground.addEventListener('click', openBackgroundPanel);
  }

  // เลือกประเภทพื้นหลัง
  if (els.bgTypeRow) {
    els.bgTypeRow.querySelectorAll('[data-bg-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.bgType;
        state.bg.type = type;
        updateBackgroundUI();
        render();
        markCompositeDirty();
      });
    });
  }

  // เปลี่ยนสี (แบบ real-time)
  if (els.bgColorInput) {
    els.bgColorInput.addEventListener('input', () => {
      state.bg.color = els.bgColorInput.value;
      render();
      markCompositeDirty();
    });
  }

  // เปิด panel ครั้งแรกให้อัปเดต UI
  updateBackgroundUI();
}

function openBackgroundPanel() {
  // ปิด panel อื่นๆ
  closeAllPanels();
  // เปิด panel-background
  if (els.panelBackground) {
    els.panelBackground.hidden = false;
  }
  if (els.scrim) {
    els.scrim.hidden = false;
  }
  updateBackgroundUI();
  requestAnimationFrame(() => resizeViewport());
}

function updateBackgroundUI() {
  const { type, color } = state.bg;
  
  // อัปเดต active class ของปุ่ม type
  if (els.bgTypeRow) {
    els.bgTypeRow.querySelectorAll('[data-bg-type]').forEach((btn) => {
      btn.classList.toggle('primary', btn.dataset.bgType === type);
    });
  }

  // แสดง/ซ่อน color picker
  const isSolid = type === 'solid';
  if (els.bgColorPicker) {
    els.bgColorPicker.hidden = !isSolid;
  }
  
  if (isSolid && els.bgColorInput) {
    els.bgColorInput.value = color;
  }

  renderBgSwatches();
}

function renderBgSwatches() {
  if (!els.bgSwatchGrid) return;
  
  const colors = ['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
  const grid = els.bgSwatchGrid;
  grid.innerHTML = '';
  
  for (const c of colors) {
    const cell = document.createElement('button');
    cell.className = 'swatch-cell';
    cell.style.background = c;
    cell.style.width = '30px';
    cell.style.height = '30px';
    cell.style.borderRadius = '6px';
    cell.style.border = '1px solid var(--line)';
    cell.style.cursor = 'pointer';
    cell.addEventListener('click', () => {
      state.bg.color = c;  // ✅ แก้จาก state.background → state.bg
      if (els.bgColorInput) els.bgColorInput.value = c;
      render();
      markCompositeDirty();
      grid.querySelectorAll('.swatch-cell').forEach(el => el.style.outline = 'none');
      cell.style.outline = '2px solid var(--accent)';
    });
    grid.appendChild(cell);
  }
}

// ============================================================
// SIDEBAR (ใหม่)
// ============================================================

function wireSidebar() {
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('sidebar-scrim');
  const openBtn = document.getElementById('btn-menu');
  const closeBtn = document.getElementById('sidebar-close');
  const homeBtn = document.getElementById('sidebar-home-btn');

  if (!sidebar || !scrim || !openBtn || !closeBtn) return;

  function openSidebar() {
    sidebar.classList.add('open');
    scrim.classList.add('visible');
    scrim.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    scrim.classList.remove('visible');
    setTimeout(() => {
      scrim.hidden = true;
      document.body.style.overflow = '';
    }, 300);
  }

  openBtn.addEventListener('click', openSidebar);
  closeBtn.addEventListener('click', closeSidebar);
  scrim.addEventListener('click', closeSidebar);

  // ✅ ปุ่มกลับหน้า Home
  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      closeSidebar();
      goHome();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      closeSidebar();
    }
  });
}

// ✅ ฟังก์ชันกลับหน้า Home
function goHome() {
  const homePage = document.getElementById('home-page');
  if (!homePage) return;
  
  // แสดงหน้า Home
  homePage.classList.remove('hidden');
  
  // รีเฟรชแกลเลอรี
  renderHomeGallery();
  
  toast('🏠 กลับหน้าแรก');
}

// ============================================================
// TOASTS (ท้ายสุด)
// ============================================================

export function toast(message, type = 'ok') {
  const node = document.createElement('div');
  node.className = 'toast' + (type === 'error' ? ' error' : '');
  node.textContent = message;
  els.toastContainer.appendChild(node);

  requestAnimationFrame(() => node.classList.add('show'));

  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 250);
  }, 2200);
}