/**
 * PixStar
 * File        : js/i18n.js
 * Description : Language/translation system — switches UI text between
 *                the loaded language packs and keeps other modules in
 *                sync when the active language changes.
 */

import th from "./lang/th.js";
import en from "./lang/en.js";

// ============================================================
// Global Variables
// ============================================================
const languages = {
    th,
    en
};

let currentLanguage = "th";
const listeners = [];

// ============================================================
// Core Functions
// ============================================================

// Switches the active language and re-renders all translated text.
export function setLanguage(lang) {
    if (languages[lang]) {
        currentLanguage = lang;
        updateTexts();
        listeners.forEach((cb) => cb(currentLanguage));
    }
}

// Returns the currently active language code ('th' or 'en').
export function getLanguage() {
    return currentLanguage;
}

// Lets other modules (e.g. ui.js) register to be notified when the user
// changes language, so they can update text generated in JS (e.g. toasts,
// default layer names).
export function onLanguageChange(callback) {
    listeners.push(callback);
}

// Looks up a translation by key (usable from any other module, e.g.
// t('tool_pencil')). Supports {name}-style variable substitution, e.g.
// t('toast_project_opened', { name: 'cat' }).
export function t(key, vars) {
    let str = languages[currentLanguage][key] ?? key;
    if (vars) {
        for (const [k, v] of Object.entries(vars)) {
            str = str.replace(new RegExp(`\\{${k}\\}`, "g"), v);
        }
    }
    return str;
}

// Sweeps the whole page and updates every translatable piece of text.
function updateTexts() {
    // 1. Element inner text (e.g. <h2>, <span>, <button>).
    document.querySelectorAll("[data-i18n]").forEach(element => {
        const key = element.getAttribute("data-i18n");
        element.textContent = t(key);
    });

    // 2. 'title' attribute (tooltip shown on hover).
    document.querySelectorAll("[data-i18n-title]").forEach(element => {
        const key = element.getAttribute("data-i18n-title");
        element.setAttribute("title", t(key));
    });

    // 3. 'placeholder' attribute (faded hint text in inputs).
    document.querySelectorAll("[data-i18n-placeholder]").forEach(element => {
        const key = element.getAttribute("data-i18n-placeholder");
        element.setAttribute("placeholder", t(key));
    });

    // 4. 'aria-label' attribute (for screen readers).
    document.querySelectorAll("[data-i18n-aria-label]").forEach(element => {
        const key = element.getAttribute("data-i18n-aria-label");
        element.setAttribute("aria-label", t(key));
    });
}

// ============================================================
// Initialization
// ============================================================

// Runs once on first app start to pick the initial language.
export function initI18n() {
  // Selection order:
  // 1. If the user previously chose a language in localStorage, use it.
  // 2. Otherwise check the browser's language.
  // 3. If the browser is Thai, use 'th'.
  // 4. Otherwise use 'en'.

  let lang = localStorage.getItem('app_lang');

  if (!lang) {
    const browserLang = navigator.language || navigator.languages?.[0] || 'en';

    if (browserLang.startsWith('th')) {
      lang = 'th';
    } else {
      lang = 'en';
    }
  }

  setLanguage(lang);
}
