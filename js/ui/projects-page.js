/**
 * PixStar
 * File        : js/ui/projects-page.js
 * Description : The "My Projects" page: lists everything saved via Save As / Create
 * Project, with open and delete actions per row.
 */

import { loadDocument } from '../state.js';
import { render, fitAndCenter, markCompositeDirty } from '../canvas.js';
import { resetHistory } from '../history.js';
import { listProjects, loadProject, deleteProject } from '../storage.js';
import { sizeLabel } from '../utils.js';
import { t } from '../i18n.js';
import { toast } from './toast.js';
import { renderLayerList } from './layers-panel.js';
import { updateColorUI } from './color-panel.js';
import { openCreateProjectPage } from './create-project-page.js';

export function initProjectsPage() {
  const page = document.getElementById('projects-page');
  if (!page) return;

  // ─── Back button ───
  const backBtn = document.getElementById('projects-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      page.classList.add('hidden');
      const homePage = document.getElementById('home-page');
      if (homePage) homePage.classList.remove('hidden');
    });
  }

  // ─── + button (new project) -> opens the Create Project page ───
  const addBtn = document.getElementById('projects-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      openCreateProjectPage();
    });
  }

  renderProjectsList();
}

export function openProjectsPage() {
  const homePage = document.getElementById('home-page');
  if (homePage) homePage.classList.add('hidden');

  const page = document.getElementById('projects-page');
  if (page) {
    page.removeAttribute('hidden');
    page.classList.remove('hidden');
    renderProjectsList();
  }
}

export function renderProjectsList() {
  const container = document.getElementById('projects-list');
  const empty = document.getElementById('projects-empty');
  if (!container) return;

  const projects = listProjects();

  if (projects.length === 0) {
    container.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;
  container.innerHTML = '';

  for (const p of projects) {
    const item = document.createElement('div');
    item.className = 'project-item';

    const info = document.createElement('div');
    info.className = 'project-info';
    info.innerHTML = `
      <span class="project-name">${p.name}</span>
      <span class="project-meta">${sizeLabel(p.width, p.height)} · ${new Date(p.savedAt).toLocaleDateString('th-TH')}</span>
    `;

    const actions = document.createElement('div');
    actions.className = 'project-actions';

    // Open button.
    const openBtn = document.createElement('button');
    openBtn.className = 'chip-btn primary';
    openBtn.textContent = t('project_open_button') || 'เปิด';
    openBtn.addEventListener('click', () => {
      const doc = loadProject(p.name);
      if (doc) {
        loadDocument(doc);
        resetHistory();
        markCompositeDirty();
        fitAndCenter();
        render();
        renderLayerList();
        updateColorUI();
        // Close the projects page.
        const projectsPage = document.getElementById('projects-page');
        if (projectsPage) projectsPage.classList.add('hidden');
        toast(t('toast_project_opened', { name: p.name }));
      }
    });
    actions.appendChild(openBtn);

    // Delete button.
    const delBtn = document.createElement('button');
    delBtn.className = 'chip-btn danger';
    delBtn.textContent = t('project_delete_button') || 'ลบ';
    delBtn.addEventListener('click', () => {
      if (confirm(`ลบโปรเจกต์ "${p.name}"?`)) {
        deleteProject(p.name);
        renderProjectsList();
        toast(`🗑️ ลบ "${p.name}" แล้ว`);
      }
    });
    actions.appendChild(delBtn);

    item.appendChild(info);
    item.appendChild(actions);
    container.appendChild(item);
  }
}
