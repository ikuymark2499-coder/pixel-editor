/**
 * PixStar
 * File        : js/ui/create-project-page.js
 * Description : The "Create Project" page reached from Projects' + button: pick a
 * size, give it a name, and it's immediately saved into the project
 * library (unlike New Canvas, which only autosaves).
 */

import { resetDocument } from '../state.js';
import { render, fitAndCenter, markCompositeDirty } from '../canvas.js';
import { resetHistory } from '../history.js';
import { saveProjectAs } from '../storage.js';
import { clamp } from '../utils.js';
import { t } from '../i18n.js';
import { toast } from './toast.js';
import { renderLayerList } from './layers-panel.js';
import { updateColorUI } from './color-panel.js';
import { updateAnimationUI } from './file-panel.js';

let createProjectSelectedSize = null;
let createProjectIsCustom = false;

export function initCreateProjectPage() {
  const page = document.getElementById('create-project-page');
  if (!page) return;

  // ─── Back button ───
  const backBtn = document.getElementById('create-project-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      page.classList.add('hidden');
      // Go back to the Projects page.
      const projectsPage = document.getElementById('projects-page');
      if (projectsPage) projectsPage.classList.remove('hidden');
    });
  }

  // ─── Cancel button ───
  const cancelBtn = document.getElementById('create-project-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      page.classList.add('hidden');
      const projectsPage = document.getElementById('projects-page');
      if (projectsPage) projectsPage.classList.remove('hidden');
    });
  }

  // ─── Size selection ───
  const sizeBtns = page.querySelectorAll('.size-btn[data-size]');
  sizeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const size = parseInt(btn.dataset.size, 10);

      page.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      const customRow = document.getElementById('create-project-custom-row');
      if (customRow) customRow.hidden = true;
      const customBtn = document.getElementById('create-project-custom-size-btn');
      if (customBtn) customBtn.style.display = '';

      createProjectSelectedSize = { w: size, h: size };
      createProjectIsCustom = false;
      hideCreateProjectWarning();
    });
  });

  // ─── Custom ───
  const customBtn = document.getElementById('create-project-custom-size-btn');
  const customRow = document.getElementById('create-project-custom-row');
  if (customBtn) {
    customBtn.addEventListener('click', () => {
      page.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
      customBtn.classList.add('selected');
      customRow.hidden = false;
      createProjectIsCustom = true;
      createProjectSelectedSize = null;
      setTimeout(() => document.getElementById('create-project-w')?.focus(), 100);
      checkCreateProjectWarning();
    });
  }

  // ─── Create button ───
  const confirmBtn = document.getElementById('create-project-confirm');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      let w, h;
      const nameInput = document.getElementById('create-project-name-input');
      const name = nameInput?.value.trim() || 'untitled';

      if (createProjectIsCustom) {
        w = clamp(parseInt(document.getElementById('create-project-w')?.value, 10) || 32, 1, 2048);
        h = clamp(parseInt(document.getElementById('create-project-h')?.value, 10) || 32, 1, 2048);
      } else if (createProjectSelectedSize) {
        w = createProjectSelectedSize.w;
        h = createProjectSelectedSize.h;
      } else {
        toast('กรุณาเลือกขนาดก่อน', 'error');
        return;
      }

      // Create the project.
      createProjectAndSave(name, w, h);
      page.classList.add('hidden');
      resetCreateProjectPage();
    });
  }

  // ─── Warning ───
  const wInput = document.getElementById('create-project-w');
  const hInput = document.getElementById('create-project-h');
  if (wInput) wInput.addEventListener('input', checkCreateProjectWarning);
  if (hInput) hInput.addEventListener('input', checkCreateProjectWarning);

  // ─── Enter key ───
  if (wInput) wInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmBtn?.click(); });
  if (hInput) hInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmBtn?.click(); });
  const nameInput = document.getElementById('create-project-name-input');
  if (nameInput) nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmBtn?.click(); });
}

export function openCreateProjectPage() {
  const projectsPage = document.getElementById('projects-page');
  if (projectsPage) projectsPage.classList.add('hidden');

  const page = document.getElementById('create-project-page');
  if (page) {
    page.removeAttribute('hidden');
    page.classList.remove('hidden');
    resetCreateProjectPage();
    setTimeout(() => document.getElementById('create-project-name-input')?.focus(), 100);
  }
}

export function resetCreateProjectPage() {
  const page = document.getElementById('create-project-page');
  if (!page) return;

  page.querySelectorAll('.size-btn').forEach(b => b.classList.remove('selected'));
  const customRow = document.getElementById('create-project-custom-row');
  if (customRow) customRow.hidden = true;
  const customBtn = document.getElementById('create-project-custom-size-btn');
  if (customBtn) customBtn.style.display = '';

  const nameInput = document.getElementById('create-project-name-input');
  if (nameInput) nameInput.value = '';

  createProjectSelectedSize = null;
  createProjectIsCustom = false;
  hideCreateProjectWarning();
}

export function createProjectAndSave(name, w, h) {
  // Close the Projects and Create Project pages.
  const projectsPage = document.getElementById('projects-page');
  if (projectsPage) projectsPage.classList.add('hidden');

  const createPage = document.getElementById('create-project-page');
  if (createPage) createPage.classList.add('hidden');

  // Create the canvas.
  resetDocument(w, h);
  resetHistory();
  markCompositeDirty();
  fitAndCenter();
  render();
  renderLayerList();
  updateAnimationUI();

  // Save the project automatically.
  saveProjectAs(name);

  updateColorUI();
  toast(t('toast_project_created', { name }));
}

export function checkCreateProjectWarning() {
  const w = parseInt(document.getElementById('create-project-w')?.value, 10) || 0;
  const h = parseInt(document.getElementById('create-project-h')?.value, 10) || 0;
  const warningEl = document.getElementById('create-project-warning');
  if (!warningEl) return;
  warningEl.hidden = !(w > 1024 || h > 1024);
}

export function hideCreateProjectWarning() {
  const warningEl = document.getElementById('create-project-warning');
  if (warningEl) warningEl.hidden = true;
}
