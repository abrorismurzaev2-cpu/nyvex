/**
 * NYVEX — ui/sidebar.js
 */

import { $ } from '../core/utils.js';

export function openSidebar() {
  $('sidebar')?.classList.add('open');
  $('sbOverlay')?.classList.add('show');
}

export function closeSidebar() {
  $('sidebar')?.classList.remove('open');
  $('sbOverlay')?.classList.remove('show');
}

export function initSidebar() {
  $('menuBtn')?.addEventListener('click', openSidebar);
  $('sbClose')?.addEventListener('click', closeSidebar);
  $('sbOverlay')?.addEventListener('click', closeSidebar);
}
