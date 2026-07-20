/**
 * PixStar
 * File        : js/ui/new-canvas-page.js
 * Description : The full-page "New Canvas" flow: pick a size (recommended dropdown,
 * portrait/landscape presets, or custom up to 2048x2048), optionally
 * import an image to start from, and create the document.
 */

import { state, resetDocument, getActiveLayer } from '../state.js';
import { render, fitAndCenter, markCompositeDirty } from '../canvas.js';
import { resetHistory, snapshotLayers } from '../history.js';
import { saveAutosave } from '../storage.js';
import { clamp, sizeLabel } from '../utils.js';
import { t } from '../i18n.js';
import { toast } from './toast.js';
import { renderLayerList } from './layers-panel.js';
import { updateAnimationUI } from './file-panel.js';
import { addToGallery } from './gallery.js';
import { updateProjectNameUI } from './status.js';

let newCanvasSelectedSize = null;
let newCanvasIsCustom = false;

/** Defined for parity with the original module - not currently called
 *  from anywhere, kept as-is rather than silently dropped. */
export function enableAnimation() {
  state.animation.enabled = true;
  const snapshot = snapshotLayers();
  state.animation.frames = [{ layers: snapshot }];
  state.animation.currentFrame = 0;
  updateAnimationUI();
}

export function createFromNewCanvas(w, h) {
  const homePage = document.getElementById('home-page');
  if (homePage) homePage.classList.add('hidden');

  const newCanvasPage = document.getElementById('new-canvas-page');
  if (newCanvasPage) {
    newCanvasPage.setAttribute('hidden', '');
    newCanvasPage.classList.add('hidden');
  }

  resetHistory();
  markCompositeDirty();
  fitAndCenter();
  resetDocument(w, h);
  render();
  renderLayerList();

  // Check whether the animation checkbox is ticked.
  const animCheckbox = document.getElementById('nc-animation');
  if (animCheckbox && animCheckbox.checked) {
    // Enable animation mode.
    state.animation.enabled = true;
    const snapshot = snapshotLayers();
    state.animation.frames = [{ layers: snapshot }];
    state.animation.currentFrame = 0;
    updateAnimationUI();
  } else {
    state.animation.enabled = false;
    state.animation.frames = [];
    updateAnimationUI();
  }

  // Save after resetDocument has run.
  const nameInput = document.getElementById('nc-name-input');
  const name = nameInput?.value.trim() || 'untitled';
  state.project.galleryId = addToGallery(name, state.layers, state.canvas, state.palette, state.bg);

  saveAutosave();
  toast(t('toast_canvas_created', { size: sizeLabel(w, h) }));
}

export function initNewCanvasPage() {
  const page = document.getElementById('new-canvas-page');
  if (!page) return;

  // ─── Element references ───
  const backBtn = document.getElementById('new-canvas-back');
  const cancelBtn = document.getElementById('nc-cancel');
  const confirmBtn = document.getElementById('nc-confirm');

  const recommended = document.getElementById('nc-recommended');
  const portrait = document.getElementById('nc-portrait');
  const landscape = document.getElementById('nc-landscape');
  const customRow = document.getElementById('nc-custom-row');
  const customW = document.getElementById('nc-custom-w');
  const customH = document.getElementById('nc-custom-h');
  const nameInput = document.getElementById('nc-name-input');

  // ─── All the check buttons ───
  const checkBtns = {
    recommended: document.getElementById('nc-check-recommended'),
    portrait: document.getElementById('nc-check-portrait'),
    landscape: document.getElementById('nc-check-landscape'),
    custom: document.getElementById('nc-check-custom'),
  };

  // ─── Select-only helper ───
  function selectOnly(target) {
    // Remove 'active' from every button.
    Object.keys(checkBtns).forEach(key => {
      if (checkBtns[key]) checkBtns[key].classList.remove('active');
    });
    // Add 'active' to the chosen button.
    if (checkBtns[target]) checkBtns[target].classList.add('active');

    // If 'custom' was selected, open the custom row.
    if (target === 'custom') {
      if (customRow) customRow.hidden = false;
      setTimeout(() => customW?.focus(), 100);
    } else {
      if (customRow) customRow.hidden = true;
    }

    updatePreview();
  }

  // ─── Event: check buttons ───
  if (checkBtns.recommended) {
    checkBtns.recommended.addEventListener('click', (e) => {
      e.preventDefault();
      selectOnly('recommended');
    });
  }
  if (checkBtns.portrait) {
    checkBtns.portrait.addEventListener('click', (e) => {
      e.preventDefault();
      selectOnly('portrait');
    });
  }

  if (checkBtns.landscape) {
    checkBtns.landscape.addEventListener('click', (e) => {
      e.preventDefault();
      selectOnly('landscape');
    });
  }

  if (checkBtns.custom) {
    checkBtns.custom.addEventListener('click', (e) => {
      e.preventDefault();
      selectOnly('custom');
    });
  }

  // ─── Event: dropdown change ───
  const dropdowns = [recommended, portrait, landscape];
  dropdowns.forEach(dropdown => {
    if (dropdown) {
      dropdown.addEventListener('change', () => {
        // Auto-select the matching option when the value changes.
        const target = dropdown.id.replace('nc-', '');
        selectOnly(target);
      });
    }
  });

  // ─── Event: Custom inputs ───
  if (customW) customW.addEventListener('input', updatePreview);
  if (customH) customH.addEventListener('input', updatePreview);

  // ─── Preview update helper ───
  function updatePreview() {
    const { w, h } = getSelectedSize();
    const label = document.getElementById('nc-preview-label');
    const block = document.getElementById('nc-preview-block');
    const warning = document.getElementById('nc-preview-warning');

    if (label) label.textContent = `${w} × ${h}`;
    if (block) {
      // Scale the preview shape to fit the real reference box (read the size
      // directly from the DOM instead of hardcoding 100, since a CSS media
      // query shrinks the box down to 76px on mobile - a wrong hardcoded
      // value would get squeezed on one axis only by flexbox, distorting
      // what should be a perfect square).
      const stage = block.parentElement;
      const stageSize = stage ? Math.min(stage.clientWidth, stage.clientHeight) : 100;
      const scale = stageSize / Math.max(w, h);
      const displayW = Math.max(6, Math.round(w * scale));
      const displayH = Math.max(6, Math.round(h * scale));

      block.style.width = displayW + 'px';
      block.style.height = displayH + 'px';
    }
    if (warning) {
      warning.hidden = !(w > 1024 || h > 1024);
    }
  }

  // ─── Get-selected-size helper ───
  function getSelectedSize() {
    // Check which option is currently selected.
    if (checkBtns.custom && checkBtns.custom.classList.contains('active')) {
      const w = clamp(parseInt(customW?.value, 10) || 32, 1, 2048);
      const h = clamp(parseInt(customH?.value, 10) || 32, 1, 2048);
      return { w, h };
    }

    if (checkBtns.portrait && checkBtns.portrait.classList.contains('active')) {
      const val = portrait?.value || '16x24';
      const parts = val.split('x');
      return { w: parseInt(parts[0], 10), h: parseInt(parts[1], 10) };
    }

    if (checkBtns.landscape && checkBtns.landscape.classList.contains('active')) {
      const val = landscape?.value || '24x16';
      const parts = val.split('x');
      return { w: parseInt(parts[0], 10), h: parseInt(parts[1], 10) };
    }

    // default: recommended
    const val = recommended?.value || '32';
    const size = parseInt(val, 10);
    return { w: size, h: size };
  }

  // ─── Confirm button ───
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      const { w, h } = getSelectedSize();
      const name = nameInput?.value.trim() || 'untitled';

      createFromNewCanvas(w, h);
      if (name && name !== 'untitled') {
        state.project.name = name;
        updateProjectNameUI();
      }
      page.classList.add('hidden');
    });
  }

  // ─── Back / Cancel button ───
  function goBack() {
    page.classList.add('hidden');
    const homePage = document.getElementById('home-page');
    if (homePage) homePage.classList.remove('hidden');
  }

  if (backBtn) backBtn.addEventListener('click', goBack);
  if (cancelBtn) cancelBtn.addEventListener('click', goBack);

  // ─── Default state: select recommended ───
  selectOnly('recommended');

  // ─── Import Image ───
  const importInput = document.getElementById('nc-import-input');
  if (importInput) {
    importInput.addEventListener('change', () => {
      const file = importInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const w = clamp(img.width, 1, 2048);
          const h = clamp(img.height, 1, 2048);
          const homePage = document.getElementById('home-page');
          if (homePage) homePage.classList.add('hidden');
          page.classList.add('hidden');

          resetDocument(w, h);
          resetHistory();
          markCompositeDirty();
          fitAndCenter();
          render();
          renderLayerList();

          const layer = getActiveLayer();
          if (layer) {
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const ctx = c.getContext('2d');
            ctx.clearRect(0, 0, w, h);
            let dw = img.width, dh = img.height, ox = 0, oy = 0;
            if (img.width > w || img.height > h) {
              const ratio = Math.min(w / img.width, h / img.height);
              dw = img.width * ratio; dh = img.height * ratio;
              ox = (w - dw) / 2; oy = (h - dh) / 2;
            } else {
              ox = (w - img.width) / 2; oy = (h - img.height) / 2;
              dw = img.width; dh = img.height;
            }
            ctx.drawImage(img, ox, oy, dw, dh);
            const imageData = ctx.getImageData(0, 0, w, h);
            const data = imageData.data;
            for (let i = 0; i < w * h; i++) {
              const o = i * 4;
              layer.data[i] = ((data[o+3] << 24) | (data[o+2] << 16) | (data[o+1] << 8) | data[o]) >>> 0;
            }
            markCompositeDirty();
            render();
            renderLayerList();
            toast('📐 นำเข้ารูปแล้ว');
          }
          saveAutosave();
          importInput.value = '';
        };
        img.onerror = () => toast('โหลดรูปไม่สำเร็จ', 'error');
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  updatePreview();

  // ─── Reset UI on open ───
  function resetNewCanvasPage() {
    if (customRow) customRow.hidden = true;
    if (customW) customW.value = 32;
    if (customH) customH.value = 32;
    if (recommended) recommended.value = '32';
    if (portrait) portrait.value = '16x24';
    if (landscape) landscape.value = '24x16';
    const nameInput = document.getElementById('nc-name-input');
    if (nameInput) nameInput.value = '';
    updatePreview();
  }

  // ─── Open the New Canvas page (from Home) ───
  window.openNewCanvasPage = function() {
    const homePage = document.getElementById('home-page');
    if (homePage) homePage.classList.add('hidden');
    page.removeAttribute('hidden');
    page.classList.remove('hidden');
    resetNewCanvasPage();
  };
}

export function checkNewCanvasWarning() {
  const w = parseInt(document.getElementById('new-canvas-w')?.value, 10) || 0;
  const h = parseInt(document.getElementById('new-canvas-h')?.value, 10) || 0;
  const warningEl = document.getElementById('new-canvas-warning');
  if (!warningEl) return;
  warningEl.hidden = !(w > 1024 || h > 1024);
}

export function hideNewCanvasWarning() {
  const warningEl = document.getElementById('new-canvas-warning');
  if (warningEl) warningEl.hidden = true;
}

export function openNewCanvasPage() {
  const homePage = document.getElementById('home-page');
  if (homePage) homePage.classList.add('hidden');
  const page = document.getElementById('new-canvas-page');
  if (page) {
    page.removeAttribute('hidden');
    page.classList.remove('hidden');
    page.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
    const customRow = document.getElementById('new-canvas-custom-row');
    if (customRow) customRow.hidden = true;
    const customBtn = document.getElementById('new-canvas-custom-btn');
    if (customBtn) customBtn.style.display = '';
    newCanvasSelectedSize = null;
    newCanvasIsCustom = false;
    hideNewCanvasWarning();
    if (document.getElementById('new-canvas-w')) document.getElementById('new-canvas-w').value = 32;
    if (document.getElementById('new-canvas-h')) document.getElementById('new-canvas-h').value = 32;
  }
}
