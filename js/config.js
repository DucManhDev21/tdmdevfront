export const BACKEND_URL = 'https://YOUR-RAILWAY-DOMAIN.up.railway.app';

export async function apiFetch(path, options = {}) {
  const url = `${BACKEND_URL}${path}`;
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && options.body !== undefined) headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');
  const response = await fetch(url, { ...options, headers });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
  if (!response.ok || data.success === false) {
    const error = new Error(data.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}

export function formatDateTime(value) {
  if (!value) return 'Chưa rõ thời gian';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', { dateStyle:'short', timeStyle:'medium' }).format(date);
}

export async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

export function showToast(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

export async function loadPublicConfig() {
  try { return await apiFetch('/api/config/public'); } catch { return { tools:{ link4m:true, tempmail:true, sendmail:true }, banner:'' }; }
}

export function initPage(active) {
  document.querySelectorAll('[data-nav]').forEach((link) => link.classList.toggle('active', link.dataset.nav === active));
  const menuBtn = document.querySelector('#menu-btn');
  const drawer = document.querySelector('#mobile-drawer');
  menuBtn?.addEventListener('click', () => drawer?.classList.toggle('open'));
  document.querySelectorAll('#mobile-drawer a').forEach((a) => a.addEventListener('click', () => drawer?.classList.remove('open')));
}

export function hidePreloader() { setTimeout(() => document.querySelector('#preloader')?.classList.add('hide'), 450); }
