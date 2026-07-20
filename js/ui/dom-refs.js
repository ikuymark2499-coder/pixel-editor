/**
 * PixStar
 * File        : js/ui/dom-refs.js
 * Description : Central `els` cache (id -> element, camelCased) shared by every other
 * ui/ submodule. Populated once by cacheElements() during initUI().
 *
 * `els` is exported as a stable object reference - submodules that need
 * DOM elements import this same object and read its properties at call
 * time (after cacheElements() has run), rather than each other cloning
 * or re-querying the DOM.
 */

export const els = {};

export function toCamel(id) {
  return id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

export function cacheElements() {
  const ids = [
    // Main layout
    'view-canvas', 'canvas-wrap', 'project-name', 'dirty-dot',
    // Top bar
    'btn-undo', 'btn-redo', 'btn-menu',
    'btn-panel-layers', 'btn-panel-color', 'btn-panel-file',
    // Status bar
    'status-size', 'status-zoom', 'status-tool',
    // Toolbar
    'toolbar', 'btn-zoom-in', 'btn-zoom-out', 'btn-grid', 'btn-clear',
    // Panels
    'scrim', 'panel-color', 'panel-layers', 'panel-file',
    // Color panel
    'swatch-primary', 'swatch-secondary', 'swatch-swap',
    'hex-input', 'alpha-slider',
    'hsv-square', 'hsv-square-canvas', 'hsv-square-thumb',
    'hue-slider', 'hue-slider-canvas', 'hue-slider-thumb',
    'default-swatches', 'custom-swatches', 'recent-swatches', 'favorite-swatches',
    'btn-add-custom', 'btn-export-palette', 'import-palette-input',
    // Layers panel
    'layer-list', 'btn-layer-add', 'btn-layer-dup', 'btn-layer-merge', 'btn-layer-delete',
    // File panel
    'btn-new', 'btn-open', 'btn-save-as', 'autosave-hint',
    'export-filename', 'export-scale', 'export-transparent',
    'btn-export-png', 'btn-export-sheet', 'btn-export-meta',
    'btn-export-project', 'import-project-input', 'toggle-dark-mode',
    // Tool options
    'tool-options', 'brush-size', 'brush-size-label', 'fill-shape-row', 'shape-filled',
    // Dialogs
    'dialog-new', 'new-size-w', 'new-size-h',
    'dialog-clear', 'confirm-clear',
    'dialog-save-as', 'save-as-name', 'confirm-save-as',
    'dialog-open', 'open-project-list', 'open-empty-hint',
    // Misc
    'toast-container',
    'btn-lang-th', 'btn-lang-en',
    // Transform
    'transform-controls', 'transform-apply', 'transform-cancel', 'transform-aspect-lock',
    // Background panel
    'btn-background', 'panel-background', 'bg-color-picker', 'bg-color-input',
    'bg-type-row', 'bg-swatch-grid',
    // Dialogs (additional)
    'confirm-new',
  ];

  for (const id of ids) {
    els[toCamel(id)] = document.getElementById(id);
  }
}
