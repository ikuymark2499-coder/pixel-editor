/**
 * PixStar
 * File        : js/ui/layers-panel.js
 * Description : Layer list rendering (thumbnails, name, opacity, visibility, lock),
 * the add/duplicate/merge/delete layer popup menu, and the transform
 * control bar (Apply / Cancel / aspect-lock).
 */

import { state } from '../state.js';
import { render } from '../canvas.js';
import { t } from '../i18n.js';
import {
  addLayer, removeLayer, renameLayer, toggleVisibility, toggleLock,
  setOpacity, moveLayer, duplicateLayer, mergeDown,
  activateTransform, cancelTransform, commitTransform,
} from '../layers.js';
import { els } from './dom-refs.js';
import { toast } from './toast.js';
import { closeAllPanels } from './panels.js';

export function wireLayerPanel() {
  els.btnLayerAdd.addEventListener('click', () => {
    addLayer();
    renderLayerList();
    toast(t('toast_layer_added'));
  });

  renderLayerList();
}

export function makeLayerThumbDataUrl(layer) {
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

export function renderLayerList() {
  if (!els.layerList) return;
  els.layerList.innerHTML = '';

  for (let i = state.layers.length - 1; i >= 0; i--) {
    const layer = state.layers[i];

    const row = document.createElement('li');
    row.className = 'layer-row' + (layer.id === state.activeLayerId ? ' active' : '');

    // Wrapper for the thumbnail + name (name sits on top).
    const thumbWrapper = document.createElement('div');
    thumbWrapper.className = 'layer-thumb-wrapper';
    thumbWrapper.style.cssText = `
      display: flex;
      flex-direction: column;
      flex: 0 0 56px;
      width: 56px;
      align-items: center;
      gap: 2px;
    `;

    // Layer name (top).
    const nameInput = document.createElement('input');
    nameInput.className = 'layer-name';
    nameInput.value = layer.name;
    nameInput.style.cssText = `
      width: 100%;
      background: transparent;
      color: var(--text-0);
      border: none;
      border-radius: 4px;
      padding: 0 2px;
      font-size: 9px;
      font-weight: 500;
      text-align: center;
      outline: none;
      box-sizing: border-box;
      font-family: inherit;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      pointer-events: auto;
    `;

    nameInput.addEventListener('change', () => {
      renameLayer(layer.id, nameInput.value || t('layer_default_name'));
    });
    nameInput.addEventListener('click', (e) => e.stopPropagation());

    thumbWrapper.appendChild(nameInput);

    // Thumbnail (bottom).
    const thumb = document.createElement('div');
    thumb.className = 'layer-thumb';
    thumb.style.cssText = `
      width: 100%;
      height: 56px;
      background-image: url(${makeLayerThumbDataUrl(layer)});
      background-size: cover;
      background-position: center;
      image-rendering: pixelated;
      border-radius: 4px;
      border: 1px solid var(--line);
      flex-shrink: 0;
    `;
    thumbWrapper.appendChild(thumb);

    row.appendChild(thumbWrapper);

    // Opacity slider
    const opacitySlider = document.createElement('input');
    opacitySlider.type = 'range';
    opacitySlider.className = 'opacity-slider';
    opacitySlider.min = '0';
    opacitySlider.max = '100';
    opacitySlider.value = String(Math.round(layer.opacity * 100));
    opacitySlider.title = t('layer_opacity_title');
    opacitySlider.style.cssText = `
      width: 80px;
      height: 4px;
      flex-shrink: 0;
      accent-color: var(--accent);
      cursor: pointer;
    `;
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
    visBtn.style.cssText = `
      width: 34px;
      height: 34px;
      border: none;
      background: transparent;
      color: var(--text-0);
      font-size: 18px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
    `;
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
    lockBtn.style.cssText = `
      width: 34px;
      height: 34px;
      border: none;
      background: transparent;
      color: var(--text-0);
      font-size: 18px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
    `;
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
    menuBtn.title = t('layer_options_title');
    menuBtn.style.cssText = `
      width: 34px;
      height: 34px;
      border: none;
      background: transparent;
      color: var(--text-0);
      font-size: 18px;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
    `;
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
export function wireTransformControls() {
  if (!els.transformApply) return;

  // Apply button.
  els.transformApply.addEventListener('click', () => {
    if (!state.transform.active) return;
    commitTransform();
    toast(t('toast_transform_applied'));
    renderLayerList();
    render();
  });

  // Cancel button.
  els.transformCancel.addEventListener('click', () => {
    if (!state.transform.active) return;
    cancelTransform();
    toast(t('toast_transform_cancelled'));
    renderLayerList();
    render();
  });

  // Close (X) button - uses the ID from the HTML.
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

export function syncTransformControlsVisibility() {
  if (!els.transformControls) return;
  els.transformControls.hidden = !state.transform.active;
  syncAspectLockCheckbox();
}

export function syncAspectLockCheckbox() {
  if (!els.transformAspectLock) return;
  els.transformAspectLock.checked = state.transform.aspectLocked;
}

// ─── Layer Popup Menu ───
export function showLayerPopup(event, layerId) {
  // Remove the old popup if one exists.
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

  // ─── Compute position ───
  const rect = event.target.getBoundingClientRect();
  const popupWidth = 160;
  const popupHeight = 280; // approximate popup height (adjust with button count)

  // Compute horizontal position (left).
  let left = rect.left - popupWidth + 34; // aligns the right edge with the button

  // Clamp so it doesn't overflow the left edge of the screen.
  if (left < 10) left = 10;

  // Clamp so it doesn't overflow the right edge of the screen.
  if (left + popupWidth > window.innerWidth - 10) {
    left = window.innerWidth - popupWidth - 10;
  }

  // Compute vertical position (below the button).
  let top = rect.bottom + 4;

  // Check whether it would overflow the bottom of the screen.
  if (top + popupHeight > window.innerHeight - 10) {
    // If it would, show it above the button instead.
    top = rect.top - popupHeight - 4;
  }

  // If it still overflows above, center it on the screen.
  if (top < 10) {
    top = (window.innerHeight - popupHeight) / 2;
    left = (window.innerWidth - popupWidth) / 2;
  }

  popup.style.left = left + 'px';
  popup.style.top = top + 'px';

  // ─── Transform button ───
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

  // ─── Move Up button ───
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

  // ─── Move Down button ───
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

  // ─── Duplicate button ───
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

  // ─── Merge Down button ───
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

  // ─── Delete button ───
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

  // Click outside the popup to close it.
  const closePopup = (e) => {
    if (!popup.contains(e.target)) {
      popup.remove();
      document.removeEventListener('click', closePopup);
    }
  };
  setTimeout(() => document.addEventListener('click', closePopup), 10);
}

// ─── Activate Transform from the popup ─────────────────
export function activateTransformFromLayer(layerId) {
  // Cancel any other active transform first.
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
