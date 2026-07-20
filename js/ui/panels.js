/**
 * PixStar
 * File        : js/ui/panels.js
 * Description : Generic bottom-sheet / side-panel open, close, toggle behavior shared
 *               by the Color / Layers / File / Background panels.
 */

import { els } from './dom-refs.js';
import { resizeViewport } from '../canvas.js';

const panelMap = {};

export function wirePanels() {
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

export function togglePanel(panel) {
  const isOpen = !panel.hidden;
  closeAllPanels();
  if (!isOpen) {
    panel.hidden = false;
    els.scrim.hidden = false;
  }
  requestAnimationFrame(() => resizeViewport());
}

export function closeAllPanels() {
  if (els.panelColor) els.panelColor.hidden = true;
  if (els.panelLayers) els.panelLayers.hidden = true;
  if (els.panelFile) els.panelFile.hidden = true;
  if (els.panelBackground) els.panelBackground.hidden = true;
  if (els.scrim) els.scrim.hidden = true;
  requestAnimationFrame(() => resizeViewport());
}
