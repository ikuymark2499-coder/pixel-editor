/**
 * PixStar
 * File        : js/ui/sidebar.js
 * Description : The slide-in hamburger sidebar and its "back to home" button.
 */

import { toast } from './toast.js';
import { closeAllPanels } from './panels.js';

export function wireSidebar() {
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('sidebar-scrim');
  const openBtn = document.getElementById('btn-menu');
  const closeBtn = document.getElementById('sidebar-close');
  const homeBtn = document.getElementById('sidebar-home-btn');

  if (!sidebar || !scrim || !openBtn) {
    console.warn('Sidebar elements not found');
    return;
  }

  function openSidebar() {
    console.log('Opening sidebar');
    sidebar.removeAttribute('hidden');
    sidebar.classList.remove('hidden');
    sidebar.classList.add('open');
    scrim.classList.add('visible');
    scrim.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    console.log('Closing sidebar');
    sidebar.classList.remove('open');
    sidebar.classList.add('hidden');
    sidebar.setAttribute('hidden', '');
    scrim.classList.remove('visible');
    setTimeout(() => {
      scrim.hidden = true;
      document.body.style.overflow = '';
    }, 300);
  }

  openBtn.addEventListener('click', openSidebar);

  if (closeBtn) {
    closeBtn.addEventListener('click', closeSidebar);
  }

  scrim.addEventListener('click', closeSidebar);

  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      closeSidebar();
      goHome();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      closeSidebar();
    }
  });
}

export function goHome() {
  // Close every panel.
  closeAllPanels();

  // Show the Home page.
  const homePage = document.getElementById('home-page');
  if (homePage) {
    homePage.classList.remove('hidden');
  }

  toast('🏠 กลับหน้าแรก');
}
