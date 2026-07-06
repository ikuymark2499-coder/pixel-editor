/**
 * palette.js
 * Manages the user's color palette: a custom swatch list, an automatic
 * "recently used" strip, and starred favorites. Colors are stored as
 * #rrggbb hex strings here (display-friendly); tools.js/state.js work with
 * packed RGBA ints, so conversions happen at the boundary via utils.js.
 */

import { state, emit } from './state.js';
import { packedToHex } from './utils.js';

const MAX_RECENT = 16;

export function addRecentColor(packedColor) {
  const hex = packedToHex(packedColor);
  const recent = state.palette.recent.filter((c) => c !== hex);
  recent.unshift(hex);
  state.palette.recent = recent.slice(0, MAX_RECENT);
  emit('palette');
}

export function addCustomColor(hex) {
  if (!state.palette.custom.includes(hex)) {
    state.palette.custom.push(hex);
    emit('palette');
  }
}

export function removeCustomColor(hex) {
  state.palette.custom = state.palette.custom.filter((c) => c !== hex);
  emit('palette');
}

export function toggleFavorite(hex) {
  const favorites = state.palette.favorites;
  const i = favorites.indexOf(hex);
  if (i === -1) favorites.push(hex);
  else favorites.splice(i, 1);
  emit('palette');
}

export function isFavorite(hex) {
  return state.palette.favorites.includes(hex);
}

/** Default starter swatches shown the very first time a project is created. */
export const DEFAULT_SWATCHES = [
  '#000000', '#1d1d1d', '#5a5a5a', '#ffffff',
  '#ff004d', '#ff7b00', '#ffec27', '#00e436',
  '#29adff', '#83769c', '#7e2553', '#ab5236',
];

export function exportPaletteJSON() {
  const payload = {
    custom: state.palette.custom,
    favorites: state.palette.favorites,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'palette.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Import a palette JSON file (as produced by exportPaletteJSON) and merge
 *  its colors into the custom swatch list. */
export function importPaletteJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const incoming = Array.isArray(data.custom) ? data.custom : Array.isArray(data) ? data : [];
        for (const hex of incoming) {
          if (typeof hex === 'string' && !state.palette.custom.includes(hex)) {
            state.palette.custom.push(hex);
          }
        }
        if (Array.isArray(data.favorites)) {
          for (const hex of data.favorites) {
            if (!state.palette.favorites.includes(hex)) state.palette.favorites.push(hex);
          }
        }
        emit('palette');
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
