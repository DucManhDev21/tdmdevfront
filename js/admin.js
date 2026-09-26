import { CONFIG, backendUrl } from './config.js';

const TOKEN_KEY = 'tdm-admin-token';
const $ = (selector, scope = document) => scope.querySelector(selector);
let editingId = null;
let menuItems = [];
let stream = null;

function show(message, type = 'info') {
  const node = $('#adminToast');
  if (!node) return;
  node.textContent = message;
  node.dataset.type = type;
  node.classList.add('is-visible');
  window.clearTimeout(show.timer);
  show.timer = window.setTimeout(() => node.classList.remove('is-visible'), 2800);
}

function token() { return localStorage.getItem(TOKEN_KEY) || ''; }

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const adminToken = token();
  if (adminToken) headers.set('Authorization', `Bearer ${adminToken}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(backendUrl(path), { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      show('Phiên admin đã hết hạn. Vui lòng đăng nhập lại.', 'error');
    }
    throw new Error(payload?.message || 'Admin request failed.');
  }
  return payload;
}

function setLoggedIn(loggedIn) {
  $('#adminLoginCard').hidden = loggedIn;
  $('#adminPanel').hidden = !loggedIn;
  $('#adminLogout').hidden = !loggedIn;
}

function clearForm() {
  editingId = null;
  $('#menuForm')?.reset();
  $('#menuOrder').value = '0';
  $('#formTitle').textContent = 'Thêm mục menu';
  $('#cancelEdit').hidden = true;
}

function renderMenus() {
  const body = $('#menuTableBody');
  const empty = $('#adminMenuEmpty');
  if (!body) return;
  body.innerHTML = '';
  if (!menuItems.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  menuItems.forEach((item) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(String(item.order))}</td>
      <td><strong>${escapeHtml(item.title)}</strong></td>
      <td>${item.type === 'iframe' ? 'iFrame Modal' : 'Tab mới'}</td>
      <td><a href="${escapeAttribute(item.url)}" target="_blank" rel="noopener noreferrer">Mở</a></td>
      <td><span class="status-badge ${item.enabled ? 'is-on' : ''}">${item.enabled ? 'Hiện' : 'Ẩn'}</span></td>
      <td><div class="table-actions"><button class="button button-small" data-edit="${item.id}">Sửa</button><button class="button button-small button-danger" data-delete="${item.id}">Xóa</button></div></td>
    `;
    body.appendChild(row);
  });
  body.querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => startEdit(button.dataset.edit)));
  body.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', () => deleteMenu(button.dataset.delete)));
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}
function escapeAttribute(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function loadMenus() {
  const payload = await request('/api/admin/menus');
  menuItems = Array.isArray(payload.menus) ? payload.menus : [];
  renderMenus();
}

function connectAdminStream() {
  if (!token() || !window.EventSource) return;
  stream?.close();
  stream = new EventSource(backendUrl('/api/menu/stream'));
  stream.addEventListener('menus', (event) => {
    try {
      const payload = JSON.parse(event.data);
      menuItems = Array.isArray(payload.menus) ? payload.menus : [];
      renderMenus();
    } catch {}
  });
}

function startEdit(id) {
  const item = menuItems.find((entry) => entry.id === id);
  if (!item) return;
  editingId = id;
  $('#formTitle').textContent = 'Sửa mục menu';
  $('#menuTitle').value = item.title || '';
  $('#menuType').value = item.type || 'external';
  $('#menuUrl').value = item.url || '';
  $('#menuOrder').value = String(item.order ?? 0);
  $('#menuEnabled').checked = item.enabled !== false;
  $('#cancelEdit').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteMenu(id) {
  if (!window.confirm('Bạn chắc chắn muốn xóa mục menu này?')) return;
  try {
    await request(`/api/admin/menus/${encodeURIComponent(id)}`, { method: 'DELETE' });
    show('Đã xóa menu.', 'success');
    await loadMenus();
  } catch (error) { show(error.message, 'error'); }
}

async function handleLogin(event) {
  event.preventDefault();
  const button = $('#adminLoginButton');
  const password = $('#adminPassword').value;
  button.disabled = true;
  try {
    const response = await fetch(backendUrl('/api/admin/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.message || 'Đăng nhập thất bại.');
    localStorage.setItem(TOKEN_KEY, payload.accessToken);
    setLoggedIn(true);
    $('#adminPassword').value = '';
    await loadMenus();
    connectAdminStream();
    show('Đăng nhập quản trị thành công.', 'success');
  } catch (error) { show(error.message, 'error'); }
  finally { button.disabled = false; }
}

async function handleMenuSubmit(event) {
  event.preventDefault();
  const payload = {
    title: $('#menuTitle').value.trim(),
    type: $('#menuType').value,
    url: $('#menuUrl').value.trim(),
    order: Number($('#menuOrder').value || 0),
    enabled: $('#menuEnabled').checked
  };
  try {
    if (editingId) {
      await request(`/api/admin/menus/${encodeURIComponent(editingId)}`, { method: 'PUT', body: JSON.stringify(payload) });
      show('Đã cập nhật menu.', 'success');
    } else {
      await request('/api/admin/menus', { method: 'POST', body: JSON.stringify(payload) });
      show('Đã thêm menu.', 'success');
    }
    clearForm();
    await loadMenus();
  } catch (error) { show(error.message, 'error'); }
}

function init() {
  $('#adminLoginForm')?.addEventListener('submit', handleLogin);
  $('#menuForm')?.addEventListener('submit', handleMenuSubmit);
  $('#cancelEdit')?.addEventListener('click', clearForm);
  $('#adminLogout')?.addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    stream?.close();
    setLoggedIn(false);
    show('Đã đăng xuất admin.', 'success');
  });
  setLoggedIn(Boolean(token()));
  if (token()) {
    loadMenus().then(connectAdminStream).catch(() => setLoggedIn(false));
  }
}

init();
