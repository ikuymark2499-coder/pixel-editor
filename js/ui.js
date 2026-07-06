/**
 * ui.js
 * Wires up every DOM control to the modules that do the real work. This
 * file intentionally contains no drawing/tool logic itself - it reads and
 * writes state, and calls into canvas/input/tools/history/storage/export/
 * palette/layers. Keeping it as "glue only" is what lets each of those
 * modules be extended independently later.
 */

import { state, subscribe, emit, resetDocument, getActiveLayer, loadDocument, markDirty } from './state.js';
import { initCanvas, render, fitAndCenter, markCompositeDirty } from './canvas.js';
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
} from './layers.js';
import { hexToPacked, packedToHex, clamp, sizeLabel, unpackRGBA } from './utils.js';
import { t, getLanguage, setLanguage, onLanguageChange } from './i18n.js';
import { initColorPicker, setPickerColor } from './colorpicker.js';

let els = {};

export function initUI() {
  cacheElements();
  bootstrapDocument();

  initCanvas(els.viewCanvas);
  initInput(els.viewCanvas, { onColorPicked: onEyedropperPick });

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

  subscribe(onStateChange);

  setActiveTool('pencil');
  refreshAll();
  fitAndCenter();
  render();

  // เมื่อผู้ใช้เปลี่ยนภาษา ข้อความ static ใน HTML (data-i18n) จะถูกอัปเดตให้อัตโนมัติ
  // อยู่แล้วโดย i18n.js ส่วนตรงนี้คือรีเฟรชข้อความที่ ui.js สร้างขึ้นเองด้วย JS
  onLanguageChange(() => {
    els.statusTool.textContent = toolLabel(state.tool);
    updateProjectNameUI();
    renderLayerList();
    updateLangButtons();
  });
}

function cacheElements() {
  const ids = [
    'view-canvas', 'canvas-wrap', 'project-name', 'dirty-dot',
    'btn-undo', 'btn-redo', 'btn-menu',
    'btn-panel-layers', 'btn-panel-color', 'btn-panel-file',
    'status-size', 'status-zoom', 'status-tool',
    'toolbar', 'btn-zoom-in', 'btn-zoom-out', 'btn-grid', 'btn-clear',
    'scrim', 'panel-color', 'panel-layers', 'panel-file',
    'swatch-primary', 'swatch-secondary', 'swatch-swap',
    'hex-input', 'alpha-slider',
    'hsv-square', 'hsv-square-canvas', 'hsv-square-thumb',
    'hue-slider', 'hue-slider-canvas', 'hue-slider-thumb',
    'default-swatches', 'custom-swatches', 'recent-swatches', 'favorite-swatches',
    'btn-add-custom', 'btn-export-palette', 'import-palette-input',
    'layer-list', 'btn-layer-add', 'btn-layer-dup', 'btn-layer-merge', 'btn-layer-delete',
    'btn-new', 'btn-open', 'btn-save-as', 'autosave-hint',
    'export-filename', 'export-scale', 'export-transparent',
    'btn-export-png', 'btn-export-sheet', 'btn-export-meta',
    'btn-export-project', 'import-project-input', 'toggle-dark-mode',
    'tool-options', 'brush-size', 'brush-size-label', 'fill-shape-row', 'shape-filled',
    'dialog-new', 'new-size-preset', 'new-size-custom-row', 'new-size-w', 'new-size-h', 'confirm-new',
    'dialog-clear', 'confirm-clear',
    'dialog-save-as', 'save-as-name', 'confirm-save-as',
    'dialog-open', 'open-project-list', 'open-empty-hint',
    'toast-container',
    'btn-lang-th', 'btn-lang-en',
  ];
  for (const id of ids) {
    els[toCamel(id)] = document.getElementById(id);
  }
}

function toCamel(id) {
  return id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
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

/* ============================== Tools ============================== */

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

  const isPaintTool = tool === 'pencil' || tool === 'eraser';
  const isShapeTool = tool === 'line' || tool === 'rect' || tool === 'circle';
  els.toolOptions.hidden = !(isPaintTool || isShapeTool);
  els.fillShapeRow.hidden = !isShapeTool;
  els.brushSize.closest('.field-row').hidden = !isPaintTool;
}

function toolLabel(tool) {
  return t(`status_tool_${tool}`) || tool;
}

/* ============================== Zoom / grid ============================== */

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
  const newZoom = clamp(Math.round(zoom * factor), 1, 64);
  const worldX = (cx - panX) / zoom;
  const worldY = (cy - panY) / zoom;
  state.view.zoom = newZoom;
  state.view.panX = cx - worldX * newZoom;
  state.view.panY = cy - worldY * newZoom;
  render();
  updateStatusBar();
}

/* ============================== Undo / redo ============================== */

function wireUndoRedo() {
  els.btnUndo.addEventListener('click', () => { undo(); markCompositeDirty(); render(); scheduleAutosave(); });
  els.btnRedo.addEventListener('click', () => { redo(); markCompositeDirty(); render(); scheduleAutosave(); });
}

function updateUndoRedoButtons() {
  els.btnUndo.disabled = !canUndo();
  els.btnRedo.disabled = !canRedo();
}

/* ============================== Panels ============================== */

const panelMap = {}; // button -> panel element

function wirePanels() {
  panelMap[els.btnPanelColor.id] = els.panelColor;
  panelMap[els.btnPanelLayers.id] = els.panelLayers;
  panelMap[els.btnPanelFile.id] = els.panelFile;

  [els.btnPanelColor, els.btnPanelLayers, els.btnPanelFile].forEach((btn) => {
    btn.addEventListener('click', () => togglePanel(panelMap[btn.id]));
  });

  els.btnMenu.addEventListener('click', () => togglePanel(els.panelFile));

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
}

function closeAllPanels() {
  [els.panelColor, els.panelLayers, els.panelFile].forEach((p) => (p.hidden = true));
  els.scrim.hidden = true;
}

/* ============================== Color panel ============================== */

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
  addRecentColor(state.primaryColor);
  updateColorUI();
}

function onEyedropperPick(colorInt) {
  state.primaryColor = colorInt;
  addRecentColor(colorInt);
  updateColorUI();
  toast(t('toast_color_picked'));
}

/**
 * Called by the HSV picker (colorpicker.js) whenever the person drags the
 * hue slider or the saturation/value square. `commit` is false on every
 * intermediate frame while dragging (so we only touch the cheap bits: the
 * primary swatch preview, hex field, and alpha field) and true once the
 * gesture ends (so recent colors + everything else updates exactly once,
 * instead of on every animation frame).
 */
function onPickerChange(packed, { commit }) {
  state.primaryColor = packed;
  els.swatchPrimary.style.setProperty('--swatch-color', packedToRgbaCss(packed));
  els.hexInput.value = packedToHex(packed);
  els.alphaSlider.value = String(unpackRGBA(packed)[3]);
  if (commit) {
    addRecentColor(packed);
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
      pressTimer = setTimeout(() => { toggleFavorite(hex); updateColorUI(); }, 550);
    });
    const clearPress = () => clearTimeout(pressTimer);
    cell.addEventListener('pointerup', clearPress);
    cell.addEventListener('pointerleave', clearPress);
    if (allowRemove) {
      cell.addEventListener('dblclick', () => onRemove(hex));
      cell.title += t('swatch_hint_remove');
    } else {
      cell.title += t('swatch_hint_favorite');
    }
    container.appendChild(cell);
  }
}

/* ============================== Layers panel ============================== */

function wireLayerPanel() {
  els.btnLayerAdd.addEventListener('click', () => { addLayer(); renderLayerList(); toast(t('toast_layer_added')); });
  els.btnLayerDup.addEventListener('click', () => {
    if (!state.activeLayerId) return;
    duplicateLayer(state.activeLayerId);
    renderLayerList();
    render();
  });
  els.btnLayerMerge.addEventListener('click', () => {
    if (!state.activeLayerId) return;
    const ok = mergeDown(state.activeLayerId);
    if (ok) { renderLayerList(); render(); toast(t('toast_layer_merged')); }
    else toast(t('toast_layer_merge_error'), 'error');
  });
  els.btnLayerDelete.addEventListener('click', () => {
    if (!state.activeLayerId) return;
    if (state.layers.length <= 1) { toast(t('toast_layer_delete_error'), 'error'); return; }
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
  // Show topmost layer first (matches visual stacking order)
  for (let i = state.layers.length - 1; i >= 0; i--) {
    const layer = state.layers[i];
    const row = document.createElement('li');
    row.className = 'layer-row' + (layer.id === state.activeLayerId ? ' active' : '');

    const thumb = document.createElement('div');
    thumb.className = 'layer-thumb';
    thumb.style.backgroundImage = `url(${makeLayerThumbDataUrl(layer)})`;
    thumb.style.backgroundSize = 'cover';
    thumb.style.imageRendering = 'pixelated';
    row.appendChild(thumb);

    const nameInput = document.createElement('input');
    nameInput.className = 'layer-name';
    nameInput.value = layer.name;
    nameInput.addEventListener('change', () => renameLayer(layer.id, nameInput.value || t('layer_default_name')));
    row.appendChild(nameInput);

    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.className = 'opacity-slider';
    opacitySlider.min = '0';
    opacitySlider.max = '100';
    opacitySlider.value = String(Math.round(layer.opacity * 100));
    opacitySlider.title = t('layer_opacity_title');
    opacitySlider.addEventListener('input', () => {
      setOpacity(layer.id, parseInt(opacitySlider.value, 10) / 100);
      render();
    });
    row.appendChild(opacitySlider);

    const visBtn = document.createElement('button');
    visBtn.className = 'icon-btn';
    visBtn.innerHTML = layer.visible
  ? `<span class="material-symbols-outlined">visibility</span>`
  : `<span class="material-symbols-outlined">visibility_off</span>`;
    visBtn.title = t('layer_toggle_visibility_title');
    visBtn.addEventListener('click', () => { toggleVisibility(layer.id); renderLayerList(); render(); });
    row.appendChild(visBtn);

    const lockBtn = document.createElement('button');
    lockBtn.className = 'icon-btn';
    lockBtn.innerHTML = layer.locked
  ? `<span class="material-symbols-outlined">lock</span>`
  : `<span class="material-symbols-outlined">lock_open</span>`;
    lockBtn.title = t('layer_toggle_lock_title');
    lockBtn.addEventListener('click', () => { toggleLock(layer.id); renderLayerList(); });
    row.appendChild(lockBtn);

    const upBtn = document.createElement('button');
    upBtn.className = 'icon-btn';
    upBtn.textContent = '↑';
    upBtn.title = t('layer_move_up_title');
    upBtn.addEventListener('click', () => { moveLayer(layer.id, 1); renderLayerList(); render(); });
    row.appendChild(upBtn);

    const downBtn = document.createElement('button');
    downBtn.className = 'icon-btn';
    downBtn.textContent = '↓';
    downBtn.title = t('layer_move_down_title');
    downBtn.addEventListener('click', () => { moveLayer(layer.id, -1); renderLayerList(); render(); });
    row.appendChild(downBtn);

    row.addEventListener('click', (e) => {
      if (e.target === nameInput || e.target.tagName === 'BUTTON' || e.target === opacitySlider) return;
      state.activeLayerId = layer.id;
      renderLayerList();
    });

    els.layerList.appendChild(row);
  }
}

/* ============================== File panel ============================== */

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

  els.toggleDarkMode.addEventListener('change', () => {
    document.body.classList.toggle('light-mode', !els.toggleDarkMode.checked);
  });
}

/* ============================== Language panel ============================== */

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

/* ============================== Dialogs ============================== */

function wireDialogs() {
  document.querySelectorAll('[data-dialog-cancel]').forEach((btn) => {
    btn.addEventListener('click', () => closeDialog(btn.closest('.dialog-overlay')));
  });

  els.newSizePreset.addEventListener('change', () => {
    els.newSizeCustomRow.hidden = els.newSizePreset.value !== 'custom';
  });

  els.confirmNew.addEventListener('click', () => {
    let w, h;
    if (els.newSizePreset.value === 'custom') {
      w = clamp(parseInt(els.newSizeW.value, 10) || 32, 1, 256);
      h = clamp(parseInt(els.newSizeH.value, 10) || 32, 1, 256);
    } else {
      w = h = parseInt(els.newSizePreset.value, 10);
    }
    resetDocument(w, h);
    resetHistory();
    markCompositeDirty();
    fitAndCenter();
    render();
    renderLayerList();
    saveAutosave();
    closeDialog(els.dialogNew);
    toast(t('toast_canvas_created', { size: sizeLabel(w, h) }));
  });

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

  els.confirmSaveAs.addEventListener('click', () => {
    const name = els.saveAsName.value.trim();
    if (!name) { toast(t('toast_project_name_required'), 'error'); return; }
    saveProjectAs(name);
    closeDialog(els.dialogSaveAs);
    toast(t('toast_project_saved', { name }));
    updateProjectNameUI();
  });
}

function openDialog(dialog) { dialog.hidden = false; }
function closeDialog(dialog) { dialog.hidden = true; }

/* ============================== Keyboard shortcuts ============================== */

function wireKeyboardShortcuts() {
  const keyToTool = {
    b: 'pencil', e: 'eraser', g: 'bucket', l: 'line',
    r: 'rect', c: 'circle', i: 'eyedropper', h: 'pan',
  };
  window.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) { redo(); } else { undo(); }
      markCompositeDirty(); render(); scheduleAutosave();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo(); markCompositeDirty(); render(); scheduleAutosave();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      state.view.gridVisible = !state.view.gridVisible;
      els.btnGrid.classList.toggle('active', state.view.gridVisible);
      render();
      return;
    }
    if (e.key === '+' || e.key === '=') { zoomBy(1.25); return; }
    if (e.key === '-' || e.key === '_') { zoomBy(0.8); return; }

    const tool = keyToTool[e.key.toLowerCase()];
    if (tool) setActiveTool(tool);
  });
}

/* ============================== Resize / status ============================== */

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

/* ============================== Global state subscription ============================== */

function onStateChange(topic) {
  if (topic === 'history' || topic === 'document') updateUndoRedoButtons();
  if (topic === 'document') { renderLayerList(); updateColorUI(); }
  if (topic === 'layers') renderLayerList();
  if (topic === 'dirty' || topic === 'document') updateProjectNameUI();
  updateStatusBar();
}

function refreshAll() {
  updateUndoRedoButtons();
  updateProjectNameUI();
  updateStatusBar();
  updateColorUI();
  renderLayerList();
}

/* ============================== Toasts ============================== */

let toastTimer = null;
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
