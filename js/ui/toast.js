/**
 * PixStar
 * File        : js/ui/toast.js
 * Description : Small "toast" popup notifications shown at the bottom of the screen.
 */

import { els } from './dom-refs.js';

export function toast(message, type = 'ok') {
  const node = document.createElement('div');
  node.className = 'toast' + (type === 'error' ? ' error' : '');
  node.textContent = message;
  els.toastContainer.appendChild(node);

  requestAnimationFrame(() => node.classList.add('show'));

  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 250);
  }, 2200);
}
