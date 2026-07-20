/**
 * PixStar
 * File        : app.js
 * Description : Application entry point. Keeps startup wiring minimal —
 *                everything real lives in js/ui.js and the modules it
 *                coordinates.
 */

import { initUI } from './js/ui.js';
import { initI18n } from './js/i18n.js';

// ============================================================
// Initialization
// ============================================================

// Runs once the DOM is ready.
function startApp() {
  // 1. Init the language system first (reads localStorage or falls back to
  //    'th') so static page text is translated before anything else runs.
  initI18n();

  // 2. Init the main UI system (including the language switcher; see
  //    wireLanguagePanel() in js/ui.js).
  initUI();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
