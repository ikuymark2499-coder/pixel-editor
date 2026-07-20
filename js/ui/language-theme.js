/**
 * PixStar
 * File        : js/ui/language-theme.js
 * Description : Thai/English language switch (editor panel + home Settings dialog),
 * dark/light mode toggle (persisted + kept in sync across both toggles),
 * and the rest of the home Settings dialog (clear-all-data confirm).
 */

import { state } from '../state.js';
import { render, rebuildCheckerboard } from '../canvas.js';
import { clearAutosave, clearAllProjects } from '../storage.js';
import { t, getLanguage, setLanguage } from '../i18n.js';
import { els } from './dom-refs.js';
import { toast } from './toast.js';
import { openDialog, closeDialog } from './dialogs.js';
import { saveGalleryItems } from './gallery.js';

export function wireLanguagePanel() {
  els.btnLangTh.addEventListener('click', () => switchLanguage('th'));
  els.btnLangEn.addEventListener('click', () => switchLanguage('en'));
  updateLangButtons();
}

export function switchLanguage(lang) {
  setLanguage(lang);
  localStorage.setItem('app_lang', lang);
  updateLangButtons();
}

export function updateLangButtons() {
  if (!els.btnLangTh || !els.btnLangEn) return;
  const current = getLanguage();
  els.btnLangTh.classList.toggle('primary', current === 'th');
  els.btnLangEn.classList.toggle('primary', current === 'en');
  updateHomeSettingsLangButtons();
}

export function updateHomeSettingsLangButtons() {
  const th = document.getElementById('settings-btn-lang-th');
  const en = document.getElementById('settings-btn-lang-en');
  if (!th || !en) return;
  const current = getLanguage();
  th.classList.toggle('primary', current === 'th');
  en.classList.toggle('primary', current === 'en');
}

const DARK_MODE_KEY = 'pixora_dark_mode';

/** Swaps the home page logo image between the light-theme and dark-theme
 *  transparent variants based on the current body theme class. */
function updateHomeLogo() {
  const logo = document.getElementById('home-logo');
  if (!logo) return;
  const isDark = !document.body.classList.contains('light-mode');
  // Dark theme (dark background) needs the light-colored logo (logo-light.png).
  // Light theme (light background) needs the dark-colored logo (logo-dark.png).
  logo.src = isDark
    ? 'images/logo/pixstar-logo-light.png'
    : 'images/logo/pixstar-logo-dark.png';
}

/** Single source of truth for dark/light mode: updates the DOM, keeps both
 *  toggle checkboxes (editor panel + home settings) in sync, and persists
 *  the choice so it survives a reload. */
export function applyDarkMode(isDark, { persist = true } = {}) {
  document.body.classList.toggle('light-mode', !isDark);
  if (els.toggleDarkMode) els.toggleDarkMode.checked = isDark;
  const settingsToggle = document.getElementById('settings-toggle-dark-mode');
  if (settingsToggle) settingsToggle.checked = isDark;
  if (persist) {
    try { localStorage.setItem(DARK_MODE_KEY, isDark ? '1' : '0'); } catch (err) { /* ignore */ }
  }
  if (state.bg.type === 'checkerboard') {
    rebuildCheckerboard();
    render();
  }

  // Update the home page logo to match the theme.
  updateHomeLogo();
}

export function loadDarkModePreference() {
  let saved = null;
  try { saved = localStorage.getItem(DARK_MODE_KEY); } catch (err) { /* ignore */ }
  const isDark = saved === null ? true : saved === '1';
  applyDarkMode(isDark, { persist: false });
}

export function wireHomeSettings() {
  const langTh = document.getElementById('settings-btn-lang-th');
  const langEn = document.getElementById('settings-btn-lang-en');
  if (langTh) langTh.addEventListener('click', () => switchLanguage('th'));
  if (langEn) langEn.addEventListener('click', () => switchLanguage('en'));

  const darkToggle = document.getElementById('settings-toggle-dark-mode');
  if (darkToggle) {
    darkToggle.addEventListener('change', () => applyDarkMode(darkToggle.checked));
  }

  const clearBtn = document.getElementById('settings-btn-clear-data');
  const confirmDialog = document.getElementById('dialog-clear-data-confirm');
  if (clearBtn && confirmDialog) {
    clearBtn.addEventListener('click', () => openDialog(confirmDialog));
  }

  const confirmClearBtn = document.getElementById('confirm-clear-data');
  if (confirmClearBtn && confirmDialog) {
    confirmClearBtn.addEventListener('click', () => {
      clearAutosave();
      clearAllProjects();
      saveGalleryItems([]);
      state.project.galleryId = null;
      closeDialog(confirmDialog);
      const dialogSettings = document.getElementById('dialog-settings');
      if (dialogSettings) closeDialog(dialogSettings);
      toast(t('toast_data_cleared'));
    });
  }
}
