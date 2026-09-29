import { apiFetch, escapeHtml } from './config.js';

const $ = (selector) => document.querySelector(selector);
const tokenKey = 'tdmdev_admin_token';
const labels = {
  link4m: { title: 'Rút gọn Link4M', desc: 'Tạo đường dẫn rút gọn và mã QR.', icon: '↗' },
  tempmail: { title: 'Email tạm thời', desc: 'Tạo hộp thư dùng một lần và nhận thư đến.', icon: '✉' },
  sendmail: { title: 'Gửi email', desc: 'Gửi nội dung email và tệp đính kèm.', icon: '➤' },
};
let token = sessionStorage.getItem(tokenKey) || '';
let currentTools = {};

function status(el, message = '', type = 'info') {
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
  el.classList.toggle('show', Boolean(message));
}
function setLoggedIn(value) {
  $('#login-view').classList.toggle('hidden', value);
  $('#dashboard').classList.toggle('hidden', !value);
}
function renderTools(tools = {}) {
  currentTools = { ...tools };
  $('#tool-list').innerHTML = Object.entries(labels).map(([key, item]) => {
    const enabled = tools[key] !== false;
    return `<div class="tool-row"><div class="tool-meta"><div class="tool-icon">${item.icon}</div><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.desc)} · <span data-state="${key}">${enabled ? 'Đang hoạt động' : 'Đang tắt'}</span></small></div></div><label class="switch" aria-label="${escapeHtml(item.title)}"><input type="checkbox" data-tool="${key}" ${enabled ? 'checked' : ''}><span class="slider"></span></label></div>`;
  }).join('');
}
async function loadConfig() {
  try {
    const data = await apiFetch('/api/admin/config', { headers: { Authorization: `Bearer ${token}` } });
    renderTools(data.tools || {});
    $('#system-banner').value = data.banner || '';
    updateCount();
    status($('#panel-status'), 'Đã tải cấu hình mới nhất từ backend.', 'success');
  } catch (error) {
    if (error.status === 401) logout(false);
    status($('#panel-status'), error.message || 'Không tải được cấu hình.', 'error');
  }
}
async function login(event) {
  event.preventDefault();
  const value = $('#admin-token').value.trim();
  if (!value) return status($('#login-status'), 'Vui lòng nhập Admin Pass Token.', 'error');
  const button = $('#login-btn');
  button.disabled = true;
  button.textContent = 'Đang xác thực…';
  status($('#login-status'), 'Đang kết nối backend để xác thực token…', 'info');
  try {
    await apiFetch('/api/admin/login', { method: 'POST', body: JSON.stringify({ token: value }) });
    token = value;
    sessionStorage.setItem(tokenKey, token);
    setLoggedIn(true);
    await loadConfig();
  } catch (error) {
    token = '';
    sessionStorage.removeItem(tokenKey);
    status($('#login-status'), error.message || 'Không thể xác thực token.', 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = 'Xác thực & mở bảng điều khiển <span>→</span>';
  }
}
async function saveConfig() {
  if (!token) return;
  const tools = {};
  document.querySelectorAll('[data-tool]').forEach((input) => { tools[input.dataset.tool] = input.checked; });
  const button = $('#save-btn');
  button.disabled = true;
  button.textContent = 'Đang lưu…';
  status($('#save-status'), 'Đang gửi cấu hình lên backend…', 'info');
  try {
    const data = await apiFetch('/api/admin/config', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tools, banner: $('#system-banner').value.trim() }),
    });
    renderTools(data.tools || tools);
    status($('#save-status'), 'Đã lưu cấu hình thành công.', 'success');
  } catch (error) {
    if (error.status === 401) logout(false);
    status($('#save-status'), error.message || 'Không thể lưu cấu hình.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Lưu thay đổi ↗';
  }
}
function logout(showMessage = true) {
  token = '';
  sessionStorage.removeItem(tokenKey);
  setLoggedIn(false);
  $('#admin-token').value = '';
  if (showMessage) status($('#login-status'), 'Bạn đã đăng xuất khỏi phiên quản trị.', 'info');
}
function updateCount() { $('#char-count').textContent = String($('#system-banner').value.length); }
$('#login-form').addEventListener('submit', login);
$('#save-btn').addEventListener('click', saveConfig);
$('#clear-banner').addEventListener('click', () => { $('#system-banner').value = ''; updateCount(); });
$('#system-banner').addEventListener('input', updateCount);
$('#logout-btn').addEventListener('click', () => logout(true));
$('#year').textContent = new Date().getFullYear();
if (token) { setLoggedIn(true); loadConfig(); }
