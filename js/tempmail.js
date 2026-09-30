import { copyText, escapeHtml, formatDateTime, showToast } from './config.js';

const MAIL_TM = 'https://api.mail.tm';
const EMAIL_KEY = 'tdmdev_mailtm_email';
const TOKEN_KEY = 'tdmdev_mailtm_token';
let polling = false;

const $ = (selector) => document.querySelector(selector);

function setStatus(message, type = 'info') {
  const el = $('#tempmail-status');
  if (!el) return;
  el.textContent = message;
  el.className = `status show ${type}`;
}

async function mailTmFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${MAIL_TM}${path}`, { ...options, headers });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
  if (!response.ok) {
    const error = new Error(data?.['hydra:description'] || data?.message || `Mail.tm HTTP ${response.status}`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

function domainsFrom(payload) {
  if (Array.isArray(payload?.['hydra:member'])) return payload['hydra:member'];
  if (Array.isArray(payload?.domains)) return payload.domains;
  return Array.isArray(payload) ? payload : [];
}

function extractSignal(message) {
  const source = `${message.subject || ''}\n${message.intro || ''}\n${message.textBody || ''}\n${message.htmlBody || ''}`;
  const otp = (source.match(/\b\d{4,6}\b/g) || []).find((value) => !/^20\d{2}$/.test(value));
  const urls = source.match(/https?:\/\/[^\s<>"']+/gi) || [];
  const verify = urls.find((url) => /(token|verify|verification|activate|confirm)/i.test(url));
  if (verify) return { kind: 'link', value: verify };
  if (otp) return { kind: 'otp', value: otp };
  return null;
}

function normalize(content) {
  return String(content || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderHighlight(messages) {
  const box = $('#tempmail-highlight');
  let found = null;
  for (const message of messages) {
    found = extractSignal(message);
    if (found) break;
  }
  if (!found) {
    box.classList.remove('show');
    box.innerHTML = '';
    return;
  }
  if (found.kind === 'otp') {
    box.innerHTML = `<div class="highlight-top">Mã xác thực phát hiện</div><div class="highlight-main"><strong>${escapeHtml(found.value)}</strong><button id="copy-signal" class="btn btn-secondary" type="button">Copy OTP</button></div>`;
  } else {
    box.innerHTML = `<div class="highlight-top">Link kích hoạt phát hiện</div><div class="highlight-main"><a class="btn btn-secondary" href="${escapeHtml(found.value)}" target="_blank" rel="noopener noreferrer">Mở link xác thực</a><button id="copy-signal" class="btn btn-secondary" type="button">Copy link</button></div>`;
  }
  box.classList.add('show');
  $('#copy-signal')?.addEventListener('click', async () => {
    await copyText(found.value);
    showToast('Đã sao chép.');
  });
}

function renderMessages(messages) {
  const list = $('#tempmail-list');
  $('#tempmail-count').textContent = `${messages.length} thư`;
  if (!messages.length) {
    list.innerHTML = `<div class="card panel"><h3>Chưa có thư mới</h3><p class="help">Mail.tm sẽ lưu thư nhận được. Hệ thống đang tự kiểm tra hộp thư mỗi 5 giây.</p></div>`;
    renderHighlight([]);
    return;
  }
  list.innerHTML = messages.map((message, index) => {
    const from = message.from?.name ? `${message.from.name} <${message.from.address || ''}>` : (message.from?.address || 'Không rõ người gửi');
    const text = normalize(message.text || message.intro || (Array.isArray(message.html) ? message.html.join('\n') : message.html) || '');
    return `<details class="mail-item" ${index === 0 ? 'open' : ''}><summary><div class="mail-summary-main"><strong>${escapeHtml(message.subject || '(Không có tiêu đề)')}</strong><span>${escapeHtml(from)}</span></div><time>${escapeHtml(formatDateTime(message.createdAt))}</time></summary><div class="mail-body"><div class="mail-meta help">ID: ${escapeHtml(message.id || '')}</div><div class="mail-content">${escapeHtml(text || '(Thư không có nội dung văn bản)')}</div></div></details>`;
  }).join('');
  renderHighlight(messages);
}

async function createMailbox() {
  const button = $('#tempmail-create');
  button.disabled = true;
  button.textContent = 'Đang tạo...';
  setStatus('Đang lấy domain khả dụng từ Mail.tm...', 'info');
  try {
    const domainPayload = await mailTmFetch('/domains');
    const domains = domainsFrom(domainPayload).filter((item) => item?.domain && item?.isActive !== false && item?.isPrivate !== true);
    if (!domains.length) throw new Error('Mail.tm hiện không có domain khả dụng.');
    const domain = domains[0].domain;
    const address = `${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}@${domain}`.toLowerCase();
    const password = `${crypto.randomUUID()}Tdm9!`;
    await mailTmFetch('/accounts', { method: 'POST', body: JSON.stringify({ address, password }) });
    const tokenPayload = await mailTmFetch('/token', { method: 'POST', body: JSON.stringify({ address, password }) });
    if (!tokenPayload?.token) throw new Error('Mail.tm không trả về Bearer Token.');
    sessionStorage.setItem(EMAIL_KEY, address);
    sessionStorage.setItem(TOKEN_KEY, tokenPayload.token);
    $('#tempmail-email').value = address;
    renderMessages([]);
    setStatus('Đã tạo mailbox Mail.tm. Địa chỉ được giữ nguyên đúng như Mail.tm cấp.', 'success');
    await refreshMailbox();
  } catch (error) {
    setStatus(error.message || 'Không thể tạo mailbox Mail.tm.', 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Tạo Email Khác';
  }
}

async function refreshMailbox() {
  if (polling) return;
  const email = sessionStorage.getItem(EMAIL_KEY);
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!email || !token) return;
  polling = true;
  try {
    const headers = { Authorization: `Bearer ${token}` };
    const payload = await mailTmFetch('/messages', { method: 'GET', headers });
    const messages = Array.isArray(payload?.['hydra:member']) ? payload['hydra:member'] : (Array.isArray(payload?.messages) ? payload.messages : []);
    renderMessages(messages.slice(0, 30));
    setStatus(`Hộp thư đã kiểm tra lúc ${new Date().toLocaleTimeString('vi-VN')}.`, 'success');
  } catch (error) {
    if (error.status === 401) {
      sessionStorage.removeItem(EMAIL_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      $('#tempmail-email').value = '';
      renderMessages([]);
      setStatus('Bearer Token Mail.tm đã hết hiệu lực. Đang tạo email mới...', 'info');
      await createMailbox();
    } else {
      setStatus(error.message || 'Không thể đọc hộp thư Mail.tm.', 'error');
    }
  } finally {
    polling = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const email = sessionStorage.getItem(EMAIL_KEY);
  const token = sessionStorage.getItem(TOKEN_KEY);
  $('#tempmail-email').value = email || '';
  $('#tempmail-copy').addEventListener('click', async () => {
    if (!$('#tempmail-email').value) return;
    await copyText($('#tempmail-email').value);
    showToast('Đã sao chép đúng địa chỉ Mail.tm.');
  });
  $('#tempmail-create').addEventListener('click', createMailbox);
  $('#tempmail-refresh').addEventListener('click', refreshMailbox);
  if (email && token) await refreshMailbox(); else await createMailbox();
  setInterval(refreshMailbox, 5000);
});
