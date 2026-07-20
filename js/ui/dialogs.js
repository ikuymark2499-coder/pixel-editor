/**
 * PixStar
 * File        : js/ui/dialogs.js
 * Description : The modal dialogs launched from the File panel: New canvas (grid size
 * picker + custom size), Clear canvas confirm, Save As, and Open project
 * list. Also the generic openDialog/closeDialog helpers used everywhere.
 */

import { state, resetDocument, getActiveLayer, loadDocument, markDirty } from '../state.js';
import { render, fitAndCenter, markCompositeDirty } from '../canvas.js';
import { beginAction, commitAction, resetHistory } from '../history.js';
import {
  scheduleAutosave, saveAutosave,
  saveProjectAs, listProjects, loadProject, deleteProject,
} from '../storage.js';
import { clamp, sizeLabel } from '../utils.js';
import { t } from '../i18n.js';
import { els } from './dom-refs.js';
import { toast } from './toast.js';
import { renderLayerList } from './layers-panel.js';
import { updateColorUI } from './color-panel.js';
import { updateAnimationUI } from './file-panel.js';
import { updateProjectNameUI } from './status.js';

// ─── Selected size state ───────────────────────────────
// Kept at module level (not inside wireDialogs) because resetNewCanvasUI()
// lives outside wireDialogs() but still needs to read/write this same state.
let selectedSize = null; // { w, h } or null
let isCustomMode = false;

export function wireDialogs() {
  // ─── Cancel button ───────────────────────────────────
  document.querySelectorAll('[data-dialog-cancel]').forEach((btn) => {
    btn.addEventListener('click', () => closeDialog(btn.closest('.dialog-overlay')));
  });

  // ─── Grid Size Selection ─────────────────────────────
  const sizeBtns = document.querySelectorAll('.size-btn[data-size]');
  sizeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const size = parseInt(btn.dataset.size, 10);

      // Remove 'selected' from every other button.
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));

      // Add 'selected' to this button.
      btn.classList.add('selected');

      // Hide the custom row if it's open.
      const customRow = document.getElementById('custom-size-row');
      if (customRow) customRow.hidden = true;
      const customBtn = document.getElementById('size-custom-btn');
      if (customBtn) customBtn.style.display = '';

      isCustomMode = false;
      selectedSize = { w: size, h: size };

      // Hide the warning message.
      hideSizeWarning();
    });
  });

  // ─── Custom button ───────────────────────────────────
  const customBtn = document.getElementById('size-custom-btn');
  const customRow = document.getElementById('custom-size-row');

  if (customBtn) {
    customBtn.addEventListener('click', () => {
      // Remove 'selected' from every other button.
      document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));

      // Add 'selected' to the Custom button.
      customBtn.classList.add('selected');

      customRow.hidden = false;
      isCustomMode = true;
      selectedSize = null;

      setTimeout(() => els.newSizeW?.focus(), 100);
      checkSizeWarning();
    });
  }

  // ─── Create (confirm) button ─────────────────────────
  const confirmBtn = document.getElementById('confirm-new');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      let w, h;

      if (isCustomMode) {
        // Custom mode.
        w = clamp(parseInt(els.newSizeW?.value, 10) || 32, 1, 2048);
        h = clamp(parseInt(els.newSizeH?.value, 10) || 32, 1, 2048);

        // If over 1024, just warn - still allowed to create.
        if (w > 1024 || h > 1024) {
          // The warning text is shown elsewhere; no need to block here.
        }
      } else if (selectedSize) {
        // Size chosen from a preset button.
        w = selectedSize.w;
        h = selectedSize.h;
      } else {
        // Nothing selected yet.
        toast('กรุณาเลือกขนาดก่อน', 'error');
        return;
      }

      createNewCanvas(w, h);
      closeDialog(els.dialogNew);
      resetNewCanvasUI();
    });
  }

  // ─── Size validation (real-time) ────────────────────
  if (els.newSizeW) {
    els.newSizeW.addEventListener('input', checkSizeWarning);
  }
  if (els.newSizeH) {
    els.newSizeH.addEventListener('input', checkSizeWarning);
  }

  // ─── Enter key inside the custom size fields ─────────
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

// ─── Create a new canvas ─────────────────────────────────
export function createNewCanvas(w, h) {
  // Hide the Home and New Canvas pages (if present).
  const homePage = document.getElementById('home-page');
  if (homePage) homePage.classList.add('hidden');

  const newCanvasPage = document.getElementById('new-canvas-page');
  if (newCanvasPage) newCanvasPage.classList.add('hidden');

  resetDocument(w, h);
  resetHistory();
  markCompositeDirty();
  fitAndCenter();
  render();
  renderLayerList();
  updateAnimationUI();
  saveAutosave();
  toast(t('toast_canvas_created', { size: sizeLabel(w, h) }));
}

// ─── Reset the UI when the dialog closes ─────────────────
export function resetNewCanvasUI() {
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

// ─── Size warning check ───────────────────────────────────
export function checkSizeWarning() {
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

// ─── Hide the warning message ─────────────────────────────
export function hideSizeWarning() {
  const warningEl = document.getElementById('new-size-warning-text');
  if (warningEl) warningEl.hidden = true;
}

export function openOpenDialog() {
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
        updateAnimationUI();
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

export function openDialog(dialog) { dialog.hidden = false; }
export function closeDialog(dialog) { dialog.hidden = true; }
