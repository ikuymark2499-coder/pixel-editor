/**
 * PixStar
 * File        : js/ui/file-panel.js
 * Description : The File panel: New / Open / Save As, PNG / sprite-sheet / metadata /
 *               project-file export, project import, dark-mode toggle, and the
 *               animation timeline: play/pause preview at a set FPS, add/duplicate/
 *               delete frame, and drag-to-reorder via the thumbnail strip.
 */

import { state, loadDocument } from '../state.js';
import { render, fitAndCenter, markCompositeDirty } from '../canvas.js';
import { resetHistory, snapshotLayers, restoreLayers } from '../history.js';
import { exportPNG, exportSpriteSheetFromLayers, exportMetadataJSON, exportProjectFile, exportAnimationFrames } from '../export.js';
import { t } from '../i18n.js';
import { els } from './dom-refs.js';
import { toast } from './toast.js';
import { openDialog, openOpenDialog } from './dialogs.js';
import { renderLayerList } from './layers-panel.js';
import { updateColorUI } from './color-panel.js';
import { applyDarkMode } from './language-theme.js';
import { generateThumbnail } from './gallery.js';

export function wireFilePanel() {
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
    applyDarkMode(els.toggleDarkMode.checked);
  });

  const exportAnimBtn = document.getElementById('btn-export-animation');
if (exportAnimBtn) {
  exportAnimBtn.addEventListener('click', async () => {
    const name = els.exportFilename.value.trim() || 'pixel-art';
    await exportAnimationFrames(name, parseInt(els.exportScale.value, 10));
    toast('Animation exported as ZIP');
  });
}
}

let playTimer = null;

function stopPlay() {
  if (playTimer !== null) {
    clearInterval(playTimer);
    playTimer = null;
  }
  if (state.animation.isPlaying) {
    state.animation.isPlaying = false;
    markCompositeDirty();
    render(); // bring the onion skin back now that playback stopped
  }
  const playBtn = document.getElementById('anim-play');
  if (playBtn) {
    playBtn.querySelector('.material-symbols-outlined').textContent = 'play_arrow';
    playBtn.title = 'Play';
  }
}

function togglePlay() {
  if (playTimer !== null) {
    stopPlay();
    return;
  }
  const frames = state.animation.frames;
  if (frames.length < 2) return;

  const playBtn = document.getElementById('anim-play');
  if (playBtn) {
    playBtn.querySelector('.material-symbols-outlined').textContent = 'pause';
    playBtn.title = 'Pause';
  }

  state.animation.isPlaying = true;
  render(); // hide the onion skin for the duration of playback

  const fps = Math.max(1, Math.min(60, state.animation.fps || 12));
  playTimer = setInterval(() => {
    const total = state.animation.frames.length;
    const next = (state.animation.currentFrame + 1) % total;
    switchFrame(next);
  }, 1000 / fps);
}

export function initAnimation() {
  const prevBtn = document.getElementById('anim-prev');
  const nextBtn = document.getElementById('anim-next');
  const playBtn = document.getElementById('anim-play');
  const fpsInput = document.getElementById('anim-fps');
  const addBtn = document.getElementById('anim-add-frame');
  const dupBtn = document.getElementById('anim-dup-frame');
  const delBtn = document.getElementById('anim-delete-frame');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      stopPlay();
      if (state.animation.currentFrame > 0) {
        switchFrame(state.animation.currentFrame - 1);
      }
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      stopPlay();
      const current = state.animation.currentFrame;
      if (current === state.animation.frames.length - 1) {
        addFrame();
      } else {
        switchFrame(current + 1);
      }
    });
  }
  if (playBtn) {
    playBtn.addEventListener('click', togglePlay);
  }
  if (fpsInput) {
    fpsInput.value = String(state.animation.fps || 12);
    fpsInput.addEventListener('change', () => {
      const fps = Math.max(1, Math.min(60, parseInt(fpsInput.value, 10) || 12));
      state.animation.fps = fps;
      fpsInput.value = String(fps);
      // Restart playback at the new speed if it's currently running
      if (playTimer !== null) {
        stopPlay();
        togglePlay();
      }
    });
  }
  if (addBtn) {
    addBtn.addEventListener('click', () => { stopPlay(); addFrame(); });
  }
  if (dupBtn) {
    dupBtn.addEventListener('click', () => { stopPlay(); duplicateFrame(); });
  }
  if (delBtn) {
    delBtn.addEventListener('click', () => { stopPlay(); deleteFrame(); });
  }

  updateAnimationUI();
}

/** Append a new blank (fully transparent) frame after the current one and
 *  switch to it. Blank rather than a copy of the current frame so onion
 *  skinning / tracing over the previous frame stays useful. */
export function addFrame() {
  const { width, height } = state.canvas;
  const frames = state.animation.frames;
  const referenceLayers = frames.length ? frames[state.animation.currentFrame].layers : snapshotLayers();
  const blankSnapshot = referenceLayers.map((l) => ({
    ...l,
    data: new Uint32Array(width * height), // transparent
  }));
  const insertAt = state.animation.currentFrame + 1;
  frames.splice(insertAt, 0, { layers: blankSnapshot });
  switchFrame(insertAt);
  toast(t('toast_frame_added'));
}

/** Duplicate the current frame (full pixel copy) and switch to the copy. */
export function duplicateFrame() {
  const frames = state.animation.frames;
  if (!frames.length) return;
  // Make sure the in-memory frame reflects what's on canvas right now
  frames[state.animation.currentFrame] = { layers: snapshotLayers() };
  const copy = {
    layers: frames[state.animation.currentFrame].layers.map((l) => ({ ...l, data: l.data.slice() })),
  };
  const insertAt = state.animation.currentFrame + 1;
  frames.splice(insertAt, 0, copy);
  switchFrame(insertAt);
  toast(t('toast_frame_duplicated'));
}

/** Delete the current frame. Always leaves at least one frame behind. */
export function deleteFrame() {
  const frames = state.animation.frames;
  if (frames.length <= 1) {
    toast(t('toast_frame_delete_error'), 'error');
    return;
  }
  const current = state.animation.currentFrame;
  frames.splice(current, 1);
  const target = Math.min(current, frames.length - 1);
  restoreLayers(frames[target].layers);
  state.animation.currentFrame = target;
  markCompositeDirty();
  render();
  updateAnimationUI();
  toast(t('toast_frame_deleted'));
}

/** Reorder frame at `from` to sit at `to`, keeping the same frame selected. */
export function moveFrame(from, to) {
  const frames = state.animation.frames;
  if (from === to || from < 0 || to < 0 || from >= frames.length || to >= frames.length) return;

  const wasCurrent = state.animation.currentFrame;
  // Keep the on-canvas edits attached to the frame being moved before we shuffle the array.
  if (wasCurrent === from) {
    frames[from] = { layers: snapshotLayers() };
  }

  const [moved] = frames.splice(from, 1);
  frames.splice(to, 0, moved);

  // Track where the previously-selected frame ended up.
  let newCurrent = wasCurrent;
  if (wasCurrent === from) {
    newCurrent = to;
  } else if (from < wasCurrent && to >= wasCurrent) {
    newCurrent = wasCurrent - 1;
  } else if (from > wasCurrent && to <= wasCurrent) {
    newCurrent = wasCurrent + 1;
  }
  state.animation.currentFrame = newCurrent;
  updateAnimationUI();
}

export function switchFrame(index) {
  if (!state.animation.enabled) return;
  const frames = state.animation.frames;
  if (index < 0 || index >= frames.length) return;

  // Save current layers to current frame
  const currentSnapshot = snapshotLayers();
  frames[state.animation.currentFrame] = { layers: currentSnapshot };

  // Restore target frame
  restoreLayers(frames[index].layers);
  state.animation.currentFrame = index;
  markCompositeDirty();
  render();
  updateAnimationUI();
}

function renderFrameStrip() {
  const strip = document.getElementById('anim-frame-strip');
  if (!strip) return;
  strip.innerHTML = '';
  strip.style.touchAction = 'pan-x'; // let normal swipes scroll; only a long-press arms dragging

  const { width, height } = state.canvas;
  const frames = state.animation.frames;

  frames.forEach((frame, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'anim-frame-thumb' + (i === state.animation.currentFrame ? ' active' : '');
    thumb.title = `Frame ${i + 1}`;
    thumb.dataset.index = String(i);

    // The current frame's canvas edits haven't been written back into
    // frame.layers yet (that only happens on switchFrame/reorder), so use
    // the live layers for its own thumbnail and the stored snapshot for
    // every other frame.
    const layersForThumb = i === state.animation.currentFrame ? state.layers : frame.layers;
    thumb.style.backgroundImage = `url(${generateThumbnail(layersForThumb, width, height)})`;

    const indexLabel = document.createElement('span');
    indexLabel.className = 'anim-frame-index';
    indexLabel.textContent = String(i + 1);
    thumb.appendChild(indexLabel);

    wireFrameThumbInteraction(thumb, strip);
    strip.appendChild(thumb);
  });
}

// Tap selects a frame; a ~280ms press-and-hold arms drag-to-reorder. Doing
// it this way (instead of HTML5 dragstart/dragover/drop) matters because
// `draggable="true"" hijacks touch gestures on mobile WebKit and silently
// breaks horizontal swipe-scrolling of the whole strip - a plain tap/scroll
// still needs to work untouched, and only an intentional long-press should
// ever call preventDefault() on the pointer.
const LONG_PRESS_MS = 280;
const MOVE_CANCEL_PX = 8;

function wireFrameThumbInteraction(thumb, strip) {
  let pressTimer = null;
  let dragging = false;
  let startX = 0;
  let startY = 0;

  function clearPressTimer() {
    if (pressTimer !== null) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  function clearDragOverStyles() {
    strip.querySelectorAll('.anim-frame-thumb.drag-over').forEach((t) => t.classList.remove('drag-over'));
  }

  function endDrag(e) {
    clearPressTimer();
    if (!dragging) return;
    dragging = false;
    thumb.classList.remove('dragging');
    strip.style.touchAction = 'pan-x';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const targetThumb = el ? el.closest('.anim-frame-thumb') : null;
    clearDragOverStyles();
    if (targetThumb && targetThumb !== thumb) {
      const from = parseInt(thumb.dataset.index, 10);
      const to = parseInt(targetThumb.dataset.index, 10);
      stopPlay();
      moveFrame(from, to);
    }
  }

  thumb.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button > 0) return; // ignore right/middle click
    startX = e.clientX;
    startY = e.clientY;
    dragging = false;
    clearPressTimer();
    pressTimer = setTimeout(() => {
      dragging = true;
      thumb.classList.add('dragging');
      strip.style.touchAction = 'none'; // only block scroll once a drag is actually armed
      try { thumb.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }, LONG_PRESS_MS);
  });

  thumb.addEventListener('pointermove', (e) => {
    if (dragging) {
      e.preventDefault();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const targetThumb = el ? el.closest('.anim-frame-thumb') : null;
      clearDragOverStyles();
      if (targetThumb && targetThumb !== thumb) targetThumb.classList.add('drag-over');
    } else if (pressTimer !== null) {
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) {
        // Finger is scrolling the strip, not holding still - stand down and
        // let the browser's native horizontal scroll take over.
        clearPressTimer();
      }
    }
  });

  thumb.addEventListener('pointerup', (e) => {
    const wasDragging = dragging;
    endDrag(e);
    if (!wasDragging) {
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx < MOVE_CANCEL_PX && dy < MOVE_CANCEL_PX) {
        stopPlay();
        switchFrame(parseInt(thumb.dataset.index, 10));
      }
    }
  });

  thumb.addEventListener('pointercancel', (e) => {
    clearPressTimer();
    dragging = false;
    thumb.classList.remove('dragging');
    strip.style.touchAction = 'pan-x';
    clearDragOverStyles();
  });
}

export function updateAnimationUI() {
  const bar = document.getElementById('animation-bar');
  const label = document.getElementById('anim-frame-label');
  const prevBtn = document.getElementById('anim-prev');
  const nextBtn = document.getElementById('anim-next');
  const playBtn = document.getElementById('anim-play');
  const delBtn = document.getElementById('anim-delete-frame');

  if (!bar) return;

  const enabled = state.animation.enabled && state.animation.frames.length > 0;
  if (!enabled) {
  bar.hidden = true;
  bar.setAttribute('hidden', '');
} else {
  bar.hidden = false;
  bar.removeAttribute('hidden');
}

  if (enabled && label) {
    const total = state.animation.frames.length;
    const current = state.animation.currentFrame + 1;
    label.textContent = `${current} / ${total}`;
    if (prevBtn) prevBtn.disabled = (state.animation.currentFrame === 0);
    if (nextBtn) nextBtn.disabled = false;
    if (playBtn) playBtn.disabled = total < 2;
    if (delBtn) delBtn.disabled = total <= 1;
    renderFrameStrip();
  }

  if (!enabled) stopPlay();

  // Show/hide export animation button
  const exportAnimBtn = document.getElementById('btn-export-animation');
  if (exportAnimBtn) {
    exportAnimBtn.hidden = !enabled;
  }
}
