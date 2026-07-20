/**
 * PixStar
 * File        : js/storage.js
 * Description : All localStorage read/write lives here. Two concerns:
 *                1. Autosave - a single always-current slot, debounced so rapid strokes
 *                   don't hammer localStorage.
 *                2. Named projects - an explicit "Save As" library the user can browse
 *                   and reopen, stored as a name -> serialized-document map.
 */

import { state, serializeDocument } from './state.js';
import { debounce } from './utils.js';

const AUTOSAVE_KEY = 'pixelEditor.autosave.v1';
const PROJECTS_KEY = 'pixelEditor.projects.v1';

function safeGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('Storage read failed for', key, err);
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn('Storage write failed for', key, err);
    return false;
  }
}

const autosaveListeners = new Set();

/** Register a callback to run every time an autosave happens (immediate or
 *  debounced). Used by the gallery system to keep its saved copy in sync
 *  with whatever the user is currently drawing. Returns an unsubscribe fn. */
export function onAutosave(fn) {
  autosaveListeners.add(fn);
  return () => autosaveListeners.delete(fn);
}

export function saveAutosave() {
  const doc = serializeDocument();
  doc.savedAt = Date.now();
  const ok = safeSet(AUTOSAVE_KEY, doc);
  for (const fn of autosaveListeners) fn();
  return ok;
}

export const scheduleAutosave = debounce(saveAutosave, 700);

export function loadAutosave() {
  return safeGet(AUTOSAVE_KEY);
}

export function clearAutosave() {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch (err) {
    /* ignore */
  }
}

function readProjects() {
  return safeGet(PROJECTS_KEY) || {};
}

/** Save the current document under a project name (overwrites if it exists). */
export function saveProjectAs(name) {
  const projects = readProjects();
  const doc = serializeDocument();
  doc.name = name;
  doc.savedAt = Date.now();
  projects[name] = doc;
  state.project.name = name;
  return safeSet(PROJECTS_KEY, projects);
}

/** List saved projects with light metadata, newest first. */
export function listProjects() {
  const projects = readProjects();
  return Object.values(projects)
    .map((p) => ({
      name: p.name,
      savedAt: p.savedAt || 0,
      width: p.canvas ? p.canvas.width : 0,
      height: p.canvas ? p.canvas.height : 0,
    }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function loadProject(name) {
  const projects = readProjects();
  return projects[name] || null;
}

export function deleteProject(name) {
  const projects = readProjects();
  delete projects[name];
  return safeSet(PROJECTS_KEY, projects);
}

/** Wipe every saved project (used by Settings > clear all data). */
export function clearAllProjects() {
  try {
    localStorage.removeItem(PROJECTS_KEY);
  } catch (err) {
    /* ignore */
  }
}
