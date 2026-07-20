/**
 * PixStar
 * File        : js/ui.js
 * Description : Entry point for all UI wiring. This file itself contains no glue logic
 * anymore - it just imports each panel/page module from js/ui/ and calls
 * their init/wire functions in the same order the app always started up
 * in. See js/ui/ for the actual implementations:
 *
 *   dom-refs.js          - shared `els` cache
 *   toast.js              - toast notifications
 *   panels.js              - generic panel open/close
 *   dialogs.js              - New/Clear/Save As/Open dialogs
 *   toolbar.js               - tools, zoom/grid, undo/redo, shortcuts
 *   color-panel.js            - color panel
 *   layers-panel.js            - layers panel, transform controls, layer popup
 *   file-panel.js                - file panel, export, animation frames
 *   language-theme.js             - language switch, dark mode, settings
 *   background-panel.js            - canvas background panel
 *   sidebar.js                      - hamburger sidebar
 *   status.js                        - status bar, state subscription
 *   new-canvas-page.js                - New Canvas page
 *   home-page.js                       - Home page + import warning dialog
 *   projects-page.js                    - Projects page
 *   create-project-page.js               - Create Project page
 *   import-image.js                       - Import Image
 *   gallery.js                             - Gallery page
 */

import { state, subscribe, resetDocument, loadDocument } from './state.js';
import { initCanvas, render, fitAndCenter } from './canvas.js';
import { initInput } from './input.js';
import { resetHistory } from './history.js';
import { loadAutosave } from './storage.js';
import { onLanguageChange } from './i18n.js';
import { initTransformOverlay } from './transform-overlay.js';

import { els, cacheElements } from './ui/dom-refs.js';
import { toast } from './ui/toast.js';
import { wirePanels } from './ui/panels.js';
import {
  wireToolbar, wireZoomAndGrid, wireUndoRedo, wireKeyboardShortcuts, setActiveTool, toolLabel,
} from './ui/toolbar.js';
import { wireColorPanel, onEyedropperPick } from './ui/color-panel.js';
import { wireLayerPanel, renderLayerList, wireTransformControls } from './ui/layers-panel.js';
import { wireFilePanel, initAnimation } from './ui/file-panel.js';
import { wireLanguagePanel, updateLangButtons, loadDarkModePreference } from './ui/language-theme.js';
import { wireDialogs } from './ui/dialogs.js';
import { wireResize, refreshAll, updateProjectNameUI, onStateChange } from './ui/status.js';
import { wireBackgroundPanel } from './ui/background-panel.js';
import { wireSidebar } from './ui/sidebar.js';
import { initHome, initImportWarningDialog } from './ui/home-page.js';
import { initNewCanvasPage } from './ui/new-canvas-page.js';
import { initProjectsPage } from './ui/projects-page.js';
import { initCreateProjectPage } from './ui/create-project-page.js';
import { initImportImage } from './ui/import-image.js';
import { initGalleryPage } from './ui/gallery.js';

// Re-exported so export.js's `import { toast } from './ui.js'` keeps working
// without touching that file.
export { toast };

export function initUI() {
  cacheElements();
  bootstrapDocument();

  initCanvas(els.viewCanvas);
  initInput(els.viewCanvas, { onColorPicked: onEyedropperPick });
  initTransformOverlay(els.canvasWrap);
  wireTransformControls();

  wireToolbar();
  wireZoomAndGrid();
  wireUndoRedo();
  wirePanels();
  wireColorPanel();
  wireLayerPanel();
  wireFilePanel();
  wireLanguagePanel();
  wireDialogs();
  wireKeyboardShortcuts();
  wireResize();
  wireBackgroundPanel();
  wireSidebar();
  loadDarkModePreference();

  initHome();
  initNewCanvasPage();
  initProjectsPage();
  initCreateProjectPage();
  initImportWarningDialog();
  initImportImage();
  initAnimation();
  initGalleryPage();

  subscribe(onStateChange);
  setActiveTool('pencil');

  refreshAll();
  fitAndCenter();
  renderLayerList();
  render();

  onLanguageChange(() => {
    els.statusTool.textContent = toolLabel(state.tool);
    updateProjectNameUI();
    updateLangButtons();
  });
}

function bootstrapDocument() {
  const saved = loadAutosave();
  if (saved && saved.canvas && saved.layers && saved.layers.length) {
    loadDocument(saved);
  } else {
    resetDocument(32, 32);
  }
  resetHistory();
}
