/**
 * PixStar
 * File        : js/ui/status.js
 * Description : Status bar (size/zoom text), project name + dirty dot, viewport resize
 *               handling, and the central state-change subscriber that keeps all the
 *               panels in sync with each other.
 */

import { state } from '../state.js';
import { render } from '../canvas.js';
import { sizeLabel } from '../utils.js';
import { t } from '../i18n.js';
import { els } from './dom-refs.js';
import { updateUndoRedoButtons } from './toolbar.js';
import { renderLayerList, syncTransformControlsVisibility } from './layers-panel.js';
import { updateColorUI, renderSwatchGrid } from './color-panel.js';
import { updateBackgroundUI } from './background-panel.js';

export function wireResize() {
  const ro = new ResizeObserver(() => render());
  ro.observe(els.canvasWrap);
  window.addEventListener('orientationchange', () => setTimeout(() => render(), 200));
}

export function updateStatusBar() {
  els.statusSize.textContent = sizeLabel(state.canvas.width, state.canvas.height);
  els.statusZoom.textContent = `${Math.round(state.view.zoom * 100)}%`;
}

export function updateProjectNameUI() {
  els.projectName.textContent = state.project.name === 'untitled'
    ? t('project_name_untitled')
    : state.project.name;
  els.dirtyDot.hidden = !state.project.dirty;
}

export function onStateChange(topic) {
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

export function refreshAll() {
  updateUndoRedoButtons();
  updateProjectNameUI();
  updateStatusBar();
  updateColorUI();
  renderLayerList();
}
