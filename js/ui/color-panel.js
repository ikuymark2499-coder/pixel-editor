/**
 * PixStar
 * File        : js/ui/color-panel.js
 * Description : Primary/secondary color swatches, hex + alpha inputs, HSV picker wiring,
 *               and the default/custom/recent/favorite swatch grids.
 */

import { state } from '../state.js';
import { hexToPacked, packedToHex, unpackRGBA } from '../utils.js';
import { t } from '../i18n.js';
import { initColorPicker, setPickerColor } from '../colorpicker.js';
import {
  addCustomColor, removeCustomColor, toggleFavorite, isFavorite,
  DEFAULT_SWATCHES, exportPaletteJSON, importPaletteJSON,
} from '../palette.js';
import { els } from './dom-refs.js';
import { toast } from './toast.js';

export function currentAlpha() {
  return unpackRGBA(state.primaryColor)[3];
}

export function wireColorPanel() {
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

export function setPrimaryFromHex(hex, alpha) {
  state.primaryColor = hexToPacked(hex, alpha);
  updateColorUI();
}

export function onEyedropperPick(colorInt) {
  state.primaryColor = colorInt;
  updateColorUI();
  toast(t('toast_color_picked'));
}

export function onPickerChange(packed, { commit }) {
  state.primaryColor = packed;
  els.swatchPrimary.style.setProperty('--swatch-color', packedToRgbaCss(packed));
  els.hexInput.value = packedToHex(packed);
  els.alphaSlider.value = String(unpackRGBA(packed)[3]);
  if (commit) {
    renderSwatchGrid(els.recentSwatches, state.palette.recent, false);
  }
}

export function updateColorUI() {
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

export function packedToRgbaCss(packed) {
  const [r, g, b, a] = unpackRGBA(packed);
  return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
}

export function renderSwatchGrid(container, hexList, allowRemove, onRemove) {
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
