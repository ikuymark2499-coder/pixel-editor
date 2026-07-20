/**
 * PixStar
 * File        : js/ui/home-page.js
 * Description : The home screen: New / Settings / Projects / Open (import) / Gallery
 * buttons, plus the "import warning" dialog shown the first time someone
 * uses Open from the home screen.
 */

import { loadDocument } from '../state.js';
import { render, fitAndCenter, markCompositeDirty } from '../canvas.js';
import { resetHistory } from '../history.js';
import { t } from '../i18n.js';
import { toast } from './toast.js';
import { openDialog } from './dialogs.js';
import { renderLayerList } from './layers-panel.js';
import { updateColorUI } from './color-panel.js';
import { updateHomeSettingsLangButtons, wireHomeSettings } from './language-theme.js';
import { openProjectsPage } from './projects-page.js';
import { openGalleryPage } from './gallery.js';
import { openNewCanvasPage } from './new-canvas-page.js';

export function initHome() {
  const homePage = document.getElementById('home-page');
  if (!homePage) return;

  homePage.classList.remove('hidden');

  // ─── New canvas button ───
  const newBtn = document.getElementById('home-btn-new');
  if (newBtn) {
    newBtn.addEventListener('click', () => {
      if (window.openNewCanvasPage) {
        window.openNewCanvasPage();
      } else {
        // Fallback.
        openNewCanvasPage();
      }
    });
  }

  // ─── Settings button ───
  const settingsBtn = document.getElementById('home-btn-settings');
  const dialogSettings = document.getElementById('dialog-settings');
  if (settingsBtn && dialogSettings) {
    settingsBtn.addEventListener('click', () => {
      updateHomeSettingsLangButtons();
      const versionHint = document.getElementById('settings-version-hint');
      if (versionHint) {
        const versionText = document.querySelector('.home-version')?.textContent || '';
        versionHint.textContent = versionText;
      }
      openDialog(dialogSettings);
    });
  }
  wireHomeSettings();

  // ─── Projects button ───
  const projectsBtn = document.getElementById('home-btn-projects');
  if (projectsBtn) {
    projectsBtn.addEventListener('click', () => {
      openProjectsPage();
    });
  }

  // ─── Open from file button ───
  const openBtn = document.getElementById('home-btn-open');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      // Check whether "don't show again" was previously checked.
      if (isImportWarningDismissed()) {
        // Already dismissed before -> open the file picker directly.
        const input = document.getElementById('home-import-input');
        if (input) input.click();
      } else {
        // Not dismissed yet -> show the warning dialog.
        openImportWarningDialog();
      }
    });
  }

  // ─── Gallery button ───
  const galleryBtn = document.getElementById('home-btn-gallery');
  if (galleryBtn) {
    galleryBtn.addEventListener('click', () => {
      openGalleryPage();
    });
  }

  // ─── Import file ───
  const importInput = document.getElementById('home-import-input');
  if (importInput) {
    importInput.setAttribute('accept', '.json,application/json');

    importInput.addEventListener('change', () => {
      const file = importInput.files[0];
      if (!file) return;

      if (!file.name.endsWith('.pxproj.json')) {
        toast('กรุณาเลือกไฟล์ .pxproj.json เท่านั้น', 'error');
        importInput.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const doc = JSON.parse(reader.result);
          if (!doc.canvas || !doc.layers || !doc.version) {
            toast('ไฟล์นี้ไม่ใช่โปรเจกต์ที่ถูกต้อง', 'error');
            importInput.value = '';
            return;
          }
          loadDocument(doc);
          resetHistory();
          markCompositeDirty();
          fitAndCenter();
          render();
          renderLayerList();
          updateColorUI();
          homePage.classList.add('hidden');
          toast(t('toast_project_imported'));
        } catch (err) {
          toast(t('toast_project_import_error'), 'error');
        }
      };
      reader.readAsText(file);
      importInput.value = '';
    });
  }
}

export function isImportWarningDismissed() {
  try {
    return localStorage.getItem('pixora.importWarningDismissed') === 'true';
  } catch {
    return false;
  }
}

export function setImportWarningDismissed(value) {
  try {
    localStorage.setItem('pixora.importWarningDismissed', value ? 'true' : 'false');
  } catch {
    // ignore
  }
}

export function openImportWarningDialog() {
  console.log('openImportWarningDialog called');  // ✅ debug
  const dialog = document.getElementById('dialog-import-warning');
  console.log('dialog:', dialog);  // ✅ debug
  if (dialog) {
    dialog.hidden = false;
    console.log('dialog hidden set to false');  // ✅ debug
    const checkbox = document.getElementById('import-warning-dont-show');
    if (checkbox) checkbox.checked = false;
  } else {
    console.warn('dialog-import-warning not found!');
  }
}

export function closeImportWarningDialog() {
  const dialog = document.getElementById('dialog-import-warning');
  if (dialog) dialog.hidden = true;
}

export function initImportWarningDialog() {
  const dialog = document.getElementById('dialog-import-warning');
  if (!dialog) return;

  // ─── Cancel button ───
  const cancelBtn = document.getElementById('import-warning-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      closeImportWarningDialog();
    });
  }

  // ─── Confirm (proceed) button ───
  const confirmBtn = document.getElementById('import-warning-confirm');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      const checkbox = document.getElementById('import-warning-dont-show');
      if (checkbox && checkbox.checked) {
        setImportWarningDismissed(true);
      }
      closeImportWarningDialog();

      // Open the file picker.
      const input = document.getElementById('home-import-input');
      if (input) input.click();
    });
  }

  // ─── Click outside the dialog closes it ───
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      closeImportWarningDialog();
    }
  });
}
