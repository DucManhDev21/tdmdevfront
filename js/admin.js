import CONFIG from './config.js';

const TOKEN_KEY = 'tdmdev_admin_token';
const $ = (id) => document.getElementById(id);

let menus = [];
let editingId = '';

function apiUrl(path) {
  return `${CONFIG.BACKEND_URL.replace(/\/$/, '')}${path}`;
}

function token() { return sessionStorage.getItem(TOKEN_KEY) || ''; }
function authHeaders() { return { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }; }

async function request(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.message || payload.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function escapeText(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function showToast(message, type = 'info') {
  const host = $('admin-toast');
  const toast = document.createElement('div');
  toast.className = `admin-toast-item ${type}`;
  toast.textContent = message;
  host.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

async function login() {
  const password = $('admin-password').value;
  $('admin-login-button').disabled = true;
  try {
    const response = await fetch(apiUrl('/api/admin/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ password })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.message || 'Đăng nhập thất bại.');
    sessionStorage.setItem(TOKEN_KEY, payload.token);
    showDashboard();
    showToast('Đăng nhập quản trị thành công.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    $('admin-login-button').disabled = false;
  }
}

function logout() {
  sessionStorage.removeItem(TOKEN_KEY);
  window.location.reload();
}

async function loadMenus() {
  const response = await request('/api/menu', { headers: { Accept: 'application/json', Authorization: `Bearer ${token()}` } });
  menus = Array.isArray(response.menus) ? response.menus : [];
  renderMenus();
}

function renderMenus() {
  const container = $('admin-menu-list');
  $('menu-total').textContent = String(menus.length);
  if (!menus.length) {
    container.innerHTML = '<div class="empty-admin">Chưa có mục menu.</div>';
    return;
  }
  container.innerHTML = menus.map((item) => `
    <article class="admin-menu-card">
      <div class="menu-card-number">${escapeText(item.order)}</div>
      <div class="menu-card-body">
        <div class="menu-card-title-row"><h3>${escapeText(item.title)}</h3><span class="badge">${item.type === 'iframe' ? 'iFrame Modal' : 'External'}</span></div>
        <p>${escapeText(item.url)}</p>
      </div>
      <div class="menu-card-actions">
        <button type="button" class="secondary" data-edit="${escapeText(item.id)}">Sửa</button>
        <button type="button" class="danger" data-delete="${escapeText(item.id)}">Xóa</button>
      </div>
    </article>
  `).join('');
  container.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => startEdit(button.dataset.edit)));
  container.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', () => deleteMenu(button.dataset.delete)));
}

function resetForm() {
  editingId = '';
  $('menu-form-title').textContent = 'Thêm mục menu';
  $('menu-submit').textContent = 'Lưu menu';
  $('menu-title').value = '';
  $('menu-type').value = 'external';
  $('menu-url').value = '';
  $('menu-order').value = menus.length ? Math.max(...menus.map((x) => Number(x.order) || 0)) + 10 : 10;
}

function startEdit(id) {
  const item = menus.find((menu) => menu.id === id);
  if (!item) return;
  editingId = id;
  $('menu-form-title').textContent = `Chỉnh sửa: ${item.title}`;
  $('menu-submit').textContent = 'Cập nhật menu';
  $('menu-title').value = item.title;
  $('menu-type').value = item.type;
  $('menu-url').value = item.url;
  $('menu-order').value = item.order;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function saveMenu(event) {
  event.preventDefault();
  const body = {
    title: $('menu-title').value.trim(),
    type: $('menu-type').value,
    url: $('menu-url').value.trim(),
    order: Number($('menu-order').value)
  };
  if (!body.title || !/^https?:\/\//i.test(body.url)) {
    showToast('Vui lòng nhập tên và URL http/https hợp lệ.', 'warning');
    return;
  }
  $('menu-submit').disabled = true;
  try {
    if (editingId) {
      await request(`/api/menu/${encodeURIComponent(editingId)}`, { method: 'PUT', body: JSON.stringify(body) });
      showToast('Đã cập nhật menu.', 'success');
    } else {
      await request('/api/menu', { method: 'POST', body: JSON.stringify(body) });
      showToast('Đã thêm menu.', 'success');
    }
    await loadMenus();
    resetForm();
  } catch (error) {
    if (error.status === 401) return logout();
    showToast(error.message, 'error');
  } finally {
    $('menu-submit').disabled = false;
  }
}

async function deleteMenu(id) {
  const item = menus.find((menu) => menu.id === id);
  if (!item) return;
  if (!window.confirm(`Xóa mục "${item.title}"?`)) return;
  try {
    await request(`/api/menu/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showToast('Đã xóa menu.', 'success');
    await loadMenus();
    if (editingId === id) resetForm();
  } catch (error) {
    if (error.status === 401) return logout();
    showToast(error.message, 'error');
  }
}

function connectStream() {
  if (!('EventSource' in window)) return;
  const source = new EventSource(apiUrl('/api/menu/stream'));
  source.addEventListener('menu', (event) => {
    try {
      menus = JSON.parse(event.data) || [];
      renderMenus();
    } catch (_) {}
  });
}

function showDashboard() {
  $('login-screen').hidden = true;
  $('dashboard').hidden = false;
  resetForm();
  loadMenus().catch((error) => {
    if (error.status === 401) return logout();
    showToast(error.message, 'error');
  });
  connectStream();
}

function bind() {
  $('admin-login-form').addEventListener('submit', (event) => { event.preventDefault(); login(); });
  $('logout-button').addEventListener('click', logout);
  $('menu-form').addEventListener('submit', saveMenu);
  $('reset-form').addEventListener('click', resetForm);
}

window.addEventListener('DOMContentLoaded', () => {
  bind();
  if (token()) showDashboard();
});
