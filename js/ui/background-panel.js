/**
 * PixStar
 * File        : js/ui/background-panel.js
 * Description : The canvas background panel: pick solid/checkerboard/transparent type,
 * pick a solid color via input or swatch grid.
 */

import { state } from '../state.js';
import { render, markCompositeDirty } from '../canvas.js';
import { els } from './dom-refs.js';
import { closeAllPanels } from './panels.js';
import { resizeViewport } from '../canvas.js';

export function wireBackgroundPanel() {
  // Button that opens the panel from the file panel.
  if (els.btnBackground) {
    els.btnBackground.addEventListener('click', openBackgroundPanel);
  }

  // Select the background type.
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

  // Change color (live, real-time).
  if (els.bgColorInput) {
    els.bgColorInput.addEventListener('input', () => {
      state.bg.color = els.bgColorInput.value;
      render();
      markCompositeDirty();
    });
  }

  // Update the UI the first time the panel opens.
  updateBackgroundUI();
}

export function openBackgroundPanel() {
  // Close other panels.
  closeAllPanels();
  // Open panel-background.
  if (els.panelBackground) {
    els.panelBackground.hidden = false;
  }
  if (els.scrim) {
    els.scrim.hidden = false;
  }
  updateBackgroundUI();
  requestAnimationFrame(() => resizeViewport());
}

export function updateBackgroundUI() {
  const { type, color } = state.bg;

  // Update the active class on the type buttons.
  if (els.bgTypeRow) {
    els.bgTypeRow.querySelectorAll('[data-bg-type]').forEach((btn) => {
      btn.classList.toggle('primary', btn.dataset.bgType === type);
    });
  }

  // Show/hide the color picker.
  const isSolid = type === 'solid';
  if (els.bgColorPicker) {
    els.bgColorPicker.hidden = !isSolid;
  }

  if (isSolid && els.bgColorInput) {
    els.bgColorInput.value = color;
  }

  renderBgSwatches();
}

export function renderBgSwatches() {
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
      state.bg.color = c;
      if (els.bgColorInput) els.bgColorInput.value = c;
      render();
      markCompositeDirty();
      grid.querySelectorAll('.swatch-cell').forEach(el => el.style.outline = 'none');
      cell.style.outline = '2px solid var(--accent)';
    });
    grid.appendChild(cell);
  }
}
