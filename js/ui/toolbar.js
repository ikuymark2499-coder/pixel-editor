/**
 * PixStar
 * File        : js/ui/toolbar.js
 * Description : Tool selection (pencil/eraser/bucket/...), zoom + grid toggle,
 *               undo/redo buttons, and all desktop keyboard shortcuts. Grouped
 *               together because the keyboard-shortcut handler drives all of them.
 */

import { state } from '../state.js';
import { render, resizeViewport, markCompositeDirty } from '../canvas.js';
import { undo, redo, canUndo, canRedo } from '../history.js';
import { scheduleAutosave } from '../storage.js';
import { t } from '../i18n.js';
import { cancelTransform, commitTransform } from '../layers.js';
import { els } from './dom-refs.js';
import { toast } from './toast.js';
import { openDialog } from './dialogs.js';
import { renderLayerList, syncAspectLockCheckbox } from './layers-panel.js';
import { updateStatusBar } from './status.js';

// ============================================================
// TOOLS
// ============================================================

export function wireToolbar() {
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

export function setActiveTool(tool) {
  state.tool = tool;
  els.toolbar.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
  els.statusTool.textContent = toolLabel(tool);

  // Tool options: Brush Size is always shown (every tool).
  const isPaintTool = tool === 'pencil' || tool === 'eraser';
  const isShapeTool = tool === 'line' || tool === 'rect' || tool === 'circle';

  // Show tool options for every tool except bucket, eyedropper, and pan.
  const showOptions = isPaintTool || isShapeTool;
  els.toolOptions.hidden = !showOptions;

  // Show the Filled checkbox only for shape tools.
  els.fillShapeRow.hidden = !isShapeTool;

  // Brush size is always shown (both Pencil and Shape) - no separate hide needed.

  requestAnimationFrame(() => {
    resizeViewport();
  });
}

export function toolLabel(tool) {
  return t(`status_tool_${tool}`) || tool;
}

// ============================================================
// ZOOM / GRID
// ============================================================

export function wireZoomAndGrid() {
  els.btnZoomIn.addEventListener('click', () => zoomBy(1.25));
  els.btnZoomOut.addEventListener('click', () => zoomBy(0.8));
  els.btnGrid.addEventListener('click', () => {
    state.view.gridVisible = !state.view.gridVisible;
    els.btnGrid.classList.toggle('active', state.view.gridVisible);
    render();
  });
  els.btnGrid.classList.toggle('active', state.view.gridVisible);
}

export function zoomBy(factor) {
  const rect = els.viewCanvas.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const { zoom, panX, panY } = state.view;

  // Smaller step at lower zoom levels.
  const step = Math.max(0.05, zoom * 0.08);
  let newZoom = zoom;
  if (factor > 1) {
    newZoom = Math.min(64, zoom + step);
  } else {
    newZoom = Math.max(0.1, zoom - step); // floor lowered from 1 to 0.1
  }
  newZoom = Math.round(newZoom * 10) / 10; // round to 1 decimal place

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
// UNDO / REDO
// ============================================================

export function wireUndoRedo() {
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

export function updateUndoRedoButtons() {
  els.btnUndo.disabled = !canUndo();
  els.btnRedo.disabled = !canRedo();
}

// ============================================================
// KEYBOARD SHORTCUTS
// ============================================================

export function wireKeyboardShortcuts() {
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
