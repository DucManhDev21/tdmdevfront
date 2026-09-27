import CONFIG from './config.js';
import { initTempMail } from './tempmail.js';
import { initLink4M } from './link4m.js';

const $ = (id) => document.getElementById(id);

function backendUrl(path) {
  return `${CONFIG.BACKEND_URL.replace(/\/$/, '')}${path}`;
}

function escapeText(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}


async function fetchJson(path, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(backendUrl(path), { ...options, signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function getMenus(payload) {
  const list = Array.isArray(payload?.menus) ? payload.menus : Array.isArray(payload) ? payload : [];
  return list
    .filter((item) => item && item.title && /^https?:\/\//i.test(item.url || ''))
    .sort((a, b) => Number(a.order) - Number(b.order));
}

let currentMenus = [];

async function loadMenu() {
  const payload = await fetchJson('/api/menu', { headers: { Accept: 'application/json' } }, 10000);
  currentMenus = getMenus(payload);
  renderMenu(currentMenus);
}

function renderMenu(menus) {
  const list = $('dynamic-menu');
  if (!list) return;
  list.innerHTML = '';

  if (!menus.length) {
    list.innerHTML = '<div class="menu-empty">Chưa có mục menu động.</div>';
    return;
  }

  menus.forEach((item) => {
    const row = document.createElement('button');
    row.className = 'drawer-link';
    row.type = 'button';
    row.innerHTML = `<span class="drawer-link-icon">${item.type === 'iframe' ? '▣' : '↗'}</span><span>${escapeText(item.title)}</span>`;
    row.addEventListener('click', () => {
      closeDrawer();
      if (item.type === 'iframe') {
        openIframe(item.url, item.title);
      } else {
        window.open(item.url, '_blank', 'noopener,noreferrer');
      }
    });
    list.appendChild(row);
  });
}

function connectMenuStream() {
  if (!CONFIG.MENU_STREAM_ENABLED || !('EventSource' in window)) return;
  const source = new EventSource(backendUrl('/api/menu/stream'));
  source.addEventListener('menu', (event) => {
    try {
      currentMenus = getMenus(JSON.parse(event.data));
      renderMenu(currentMenus);
    } catch (_) {}
  });
  source.onerror = () => {
    // EventSource tự reconnect; không bật toast để tránh làm phiền người dùng.
  };
}

function openDrawer() {
  $('app-drawer')?.classList.add('open');
  $('drawer-backdrop')?.classList.add('open');
  document.body.classList.add('drawer-lock');
}

function closeDrawer() {
  $('app-drawer')?.classList.remove('open');
  $('drawer-backdrop')?.classList.remove('open');
  document.body.classList.remove('drawer-lock');
}

function openIframe(url, title) {
  if (!/^https?:\/\//i.test(url)) return showToast('URL không hợp lệ.', 'error');
  $('iframe-title').textContent = title || 'Xem nội dung';
  $('iframe-loader').hidden = false;
  $('iframe-target').src = url;
  openModal('iframe-modal');
  $('iframe-target').onload = () => { $('iframe-loader').hidden = true; };
}

function openModal(id) {
  const modal = $(id);
  if (!modal) return;
  modal.hidden = false;
  requestAnimationFrame(() => modal.classList.add('open'));
  document.body.classList.add('modal-lock');
}

function closeModal(id) {
  const modal = $(id);
  if (!modal) return;
  modal.classList.remove('open');
  setTimeout(() => { modal.hidden = true; }, 180);
  if (![...document.querySelectorAll('.modal.open')].some((item) => item.id !== id)) {
    document.body.classList.remove('modal-lock');
  }
  if (id === 'iframe-modal') $('iframe-target').src = 'about:blank';
}

function showToast(message, type = 'info') {
  const host = $('toast-host');
  if (!host) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-dot"></span><span>${escapeText(message)}</span>`;
  host.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 220);
  }, 3200);
}

function confirmDialog(message, title = 'Xác nhận') {
  return new Promise((resolve) => {
    const modal = $('confirm-modal');
    $('confirm-title').textContent = title;
    $('confirm-message').textContent = message;
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('open'));
    const cleanup = (result) => {
      modal.classList.remove('open');
      setTimeout(() => { modal.hidden = true; }, 180);
      $('confirm-ok').onclick = null;
      $('confirm-cancel').onclick = null;
      resolve(result);
    };
    $('confirm-ok').onclick = () => cleanup(true);
    $('confirm-cancel').onclick = () => cleanup(false);
  });
}

function hideLoader() {
  const loader = $('app-loader');
  if (!loader) return;
  loader.classList.add('fade-out');
  setTimeout(() => {
    loader.hidden = true;
    document.body.classList.remove('loading-lock');
  }, 520);
}

function setupLoaderFallback() {
  window.__tdmLoaderSafety = setTimeout(() => {
    if (!$('app-loader')?.hidden) {
      hideLoader();
      showToast('Trang đã mở. Một số dữ liệu có thể đang chờ kết nối backend.', 'warning');
    }
  }, 15000);
}

function bindUi() {
  $('hamburger')?.addEventListener('click', openDrawer);
  $('drawer-close')?.addEventListener('click', closeDrawer);
  $('drawer-backdrop')?.addEventListener('click', closeDrawer);
  $('theme-toggle')?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('tdmdev_theme', next);
    $('theme-toggle-label').textContent = next === 'light' ? 'Chế độ tối' : 'Chế độ sáng';
  });
  document.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => closeModal(button.dataset.closeModal));
  });
  document.querySelectorAll('.modal').forEach((modal) => {
    modal.addEventListener('mousedown', (event) => {
      if (event.target === modal) closeModal(modal.id);
    });
  });
  $('iframe-target')?.addEventListener('load', () => { $('iframe-loader').hidden = true; });
}

async function init() {
  document.body.classList.add('loading-lock');
  const savedTheme = localStorage.getItem('tdmdev_theme') || 'dark';
  document.documentElement.dataset.theme = savedTheme;
  $('theme-toggle-label').textContent = savedTheme === 'light' ? 'Chế độ tối' : 'Chế độ sáng';
  bindUi();
  setupLoaderFallback();

  const results = await Promise.allSettled([
    loadMenu(),
    initTempMail(),
    Promise.resolve(initLink4M())
  ]);

  if (results[0].status === 'rejected') {
    renderMenu([]);
    showToast('Không tải được menu động từ backend.', 'warning');
  }

  connectMenuStream();
  clearTimeout(window.__tdmLoaderSafety);
  hideLoader();
}

window.showToast = showToast;
window.openModal = openModal;
window.closeModal = closeModal;
window.confirmDialog = confirmDialog;

window.addEventListener('DOMContentLoaded', init, { once: true });
