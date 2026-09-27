import CONFIG from './config.js';

const state = {
  email: '',
  mailboxId: '',
  domains: [],
  messages: [],
  refreshTimer: null,
  countdownTimer: null,
  secondsLeft: CONFIG.TEMPMAIL_REFRESH_SECONDS,
  busy: false
};

const $ = (id) => document.getElementById(id);

function apiUrl(path) {
  return `${CONFIG.BACKEND_URL.replace(/\/$/, '')}${path}`;
}

async function request(path, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(apiUrl(path), {
      ...options,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.message || payload.error || `HTTP ${response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function unwrap(value) {
  if (value && typeof value === 'object' && value.data !== undefined) return value.data;
  return value;
}

function deepFind(value, keys, maxDepth = 5, depth = 0) {
  if (depth > maxDepth || value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepFind(item, keys, maxDepth, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null && String(value[key]).trim()) return value[key];
  }
  for (const [key, child] of Object.entries(value)) {
    if (keys.includes(key)) continue;
    const found = deepFind(child, keys, maxDepth, depth + 1);
    if (found) return found;
  }
  return '';
}

function findArray(value, preferredKeys = [], depth = 0) {
  if (depth > 5 || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'object') return [];
  for (const key of preferredKeys) {
    if (Array.isArray(value[key])) return value[key];
  }
  for (const child of Object.values(value)) {
    const result = findArray(child, preferredKeys, depth + 1);
    if (result.length) return result;
  }
  return [];
}

function escapeText(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function normalizeDomainList(payload) {
  const data = unwrap(payload);
  const array = findArray(data, ['domains', 'items', 'results', 'data']);
  const direct = array.length ? array : (Array.isArray(data) ? data : []);
  return direct.map((item) => {
    if (typeof item === 'string') return item;
    return deepFind(item, ['domain', 'name', 'value']) || '';
  }).filter(Boolean);
}

function normalizeMessages(payload) {
  const data = unwrap(payload);
  const array = findArray(data, ['messages', 'items', 'results', 'emails', 'data']);
  const direct = array.length ? array : (Array.isArray(data) ? data : []);
  return direct.map((item) => ({
    id: String(deepFind(item, ['id', 'message_id', 'messageId']) || ''),
    from: String(deepFind(item, ['from', 'sender', 'from_email', 'email']) || 'Không rõ người gửi'),
    subject: String(deepFind(item, ['subject', 'title']) || '(Không có tiêu đề)'),
    date: String(deepFind(item, ['date', 'created_at', 'createdAt', 'timestamp', 'time']) || ''),
    preview: String(deepFind(item, ['preview', 'snippet', 'text', 'body']) || '')
  })).filter((item) => item.id || item.subject);
}

function setStatus(text, tone = '') {
  const target = $('temp-status');
  if (!target) return;
  target.textContent = text;
  target.dataset.tone = tone;
}

function setEmail(value) {
  state.email = value || '';
  const input = $('temp-email');
  const compact = $('temp-email-mobile');
  if (input) input.value = state.email;
  if (compact) compact.textContent = state.email || 'Chưa tạo email';
  const hero = document.getElementById('hero-mail-status');
  if (hero) hero.textContent = state.email && !state.email.startsWith('Chưa') ? 'Đã kết nối' : 'Chờ kết nối';
}

function syncCountdown() {
  state.secondsLeft = CONFIG.TEMPMAIL_REFRESH_SECONDS;
  $('temp-countdown').textContent = `${state.secondsLeft}s`;
}

function startCountdown() {
  clearInterval(state.countdownTimer);
  syncCountdown();
  state.countdownTimer = setInterval(() => {
    state.secondsLeft -= 1;
    $('temp-countdown').textContent = `${Math.max(0, state.secondsLeft)}s`;
    if (state.secondsLeft <= 0) syncCountdown();
  }, 1000);
}

function renderMessages() {
  const list = $('message-list');
  const empty = $('message-empty');
  const count = $('message-count');
  if (!list || !empty) return;
  list.innerHTML = '';
  count.textContent = String(state.messages.length);
  empty.hidden = state.messages.length > 0;

  for (const message of state.messages) {
    const button = document.createElement('button');
    button.className = 'message-row';
    button.type = 'button';
    button.dataset.messageId = message.id;
    button.innerHTML = `
      <span class="message-avatar">✉</span>
      <span class="message-main">
        <strong>${escapeText(message.subject)}</strong>
        <small>${escapeText(message.from)}</small>
      </span>
      <span class="message-meta">${escapeText(formatDate(message.date))}</span>
    `;
    button.addEventListener('click', () => openMessage(message.id));
    list.appendChild(button);
  }
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 30);
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

async function loadDomains() {
  try {
    const result = await request('/api/tempmail/domains');
    const domains = normalizeDomainList(result.data);
    state.domains = domains;
    const select = $('temp-domain');
    if (select && domains.length) {
      select.innerHTML = domains.map((domain) => `<option value="${escapeText(domain)}">@${escapeText(domain)}</option>`).join('');
    }
    return domains;
  } catch (error) {
    setStatus(`Domain API chưa sẵn sàng: ${error.message}`, 'warning');
    return [];
  }
}

async function createMailbox({ silent = false } = {}) {
  if (state.busy) return;
  state.busy = true;
  if (!silent) setStatus('Đang tạo email mới…');
  try {
    const prefix = $('temp-prefix')?.value.trim() || '';
    const domain = $('temp-domain')?.value || '';
    const result = await request('/api/tempmail/create', {
      method: 'POST',
      body: JSON.stringify({ prefix, domain })
    });
    const data = unwrap(result.data);
    const email = String(deepFind(data, ['email', 'address', 'mail']) || deepFind(result, ['email', 'address', 'mail']) || '');
    const mailboxId = String(deepFind(data, ['id', 'mail_id', 'mailId', 'email_id', 'emailId']) || '');
    if (!email) throw new Error('TempMail không trả về địa chỉ email.');
    state.mailboxId = mailboxId;
    setEmail(email);
    state.messages = [];
    renderMessages();
    setStatus('Email tạm thời đang hoạt động', 'success');
    const hero = document.getElementById('hero-mail-status');
    if (hero) hero.textContent = 'Đã kết nối';
    syncCountdown();
    await refreshInbox({ silent: true });
    return email;
  } catch (error) {
    setStatus(error.message, 'error');
    if (!silent) window.showToast?.(error.message, 'error');
    throw error;
  } finally {
    state.busy = false;
  }
}

async function refreshInbox({ silent = false } = {}) {
  if (!state.email && !state.mailboxId) return;
  try {
    const query = state.email ? `?email=${encodeURIComponent(state.email)}` : `?id=${encodeURIComponent(state.mailboxId)}`;
    const result = await request(`/api/tempmail/inbox${query}`);
    state.messages = normalizeMessages(result.data);
    renderMessages();
    if (!silent) setStatus(`Đã làm mới hộp thư • ${state.messages.length} thư`, 'success');
    syncCountdown();
  } catch (error) {
    if (!silent) {
      setStatus(`Làm mới thất bại: ${error.message}`, 'warning');
      window.showToast?.(error.message, 'error');
    }
  }
}

async function openMessage(id) {
  if (!id) return;
  try {
    const result = await request(`/api/tempmail/message/${encodeURIComponent(id)}`);
    const data = unwrap(result.data) || result.data;
    const sender = String(deepFind(data, ['from', 'sender', 'from_email']) || 'Không rõ');
    const subject = String(deepFind(data, ['subject', 'title']) || '(Không có tiêu đề)');
    const date = String(deepFind(data, ['date', 'created_at', 'createdAt', 'timestamp']) || '');
    const html = String(deepFind(data, ['html', 'body_html', 'html_body', 'content_html']) || '');
    const text = String(deepFind(data, ['text', 'body_text', 'content', 'body']) || '');
    const attachments = findArray(data, ['attachments', 'files']);

    const modalBody = $('message-modal-body');
    const modalTitle = $('message-modal-title');
    if (modalTitle) modalTitle.textContent = subject;
    if (modalBody) {
      modalBody.innerHTML = `
        <div class="mail-details">
          <div><span>Người gửi</span><strong>${escapeText(sender)}</strong></div>
          <div><span>Thời gian</span><strong>${escapeText(formatDate(date))}</strong></div>
        </div>
        <div class="mail-content-box">
          ${html ? `<iframe class="mail-html-frame" sandbox="allow-same-origin" referrerpolicy="no-referrer" title="Email HTML"></iframe>` : `<pre>${escapeText(text || 'Email không có nội dung văn bản.')}</pre>`}
        </div>
        ${attachments.length ? `<div class="attachments"><h4>File đính kèm</h4>${attachments.map((file) => {
          const url = deepFind(file, ['url', 'download_url', 'downloadUrl']) || '#';
          const name = deepFind(file, ['name', 'filename', 'file_name']) || 'Tệp';
          return isSafeHttpUrl(url) ? `<a href="${escapeText(url)}" target="_blank" rel="noopener">${escapeText(name)}</a>` : `<span>${escapeText(name)}</span>`;
        }).join('')}</div>` : ''}
      `;
      const frame = modalBody.querySelector('.mail-html-frame');
      if (frame && html) frame.srcdoc = `<base target="_blank"><style>body{font-family:system-ui,sans-serif;padding:20px;line-height:1.6;word-break:break-word}img{max-width:100%;height:auto}</style>${html}`;
    }
    window.openModal?.('message-modal');
  } catch (error) {
    window.showToast?.(error.message, 'error');
  }
}

function isSafeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch (_) { return false; }
}

async function deleteMailbox() {
  if (!state.email && !state.mailboxId) return;
  const approved = await window.confirmDialog?.('Xóa hộp thư hiện tại? Các thư của hộp này có thể không khôi phục được.', 'Xóa hộp thư');
  if (!approved) return;
  try {
    await request('/api/tempmail/delete', {
      method: 'POST',
      body: JSON.stringify({ ids: state.mailboxId ? [state.mailboxId] : [], emailIds: state.mailboxId ? [state.mailboxId] : [], emails: state.email ? [state.email] : [] })
    });
    setEmail('');
    state.mailboxId = '';
    state.messages = [];
    renderMessages();
    setStatus('Đã xóa hộp thư', 'success');
    await createMailbox({ silent: true });
  } catch (error) {
    window.showToast?.(error.message, 'error');
  }
}

function bindEvents() {
  $('copy-email')?.addEventListener('click', async () => {
    if (!state.email) return window.showToast?.('Chưa có email để sao chép.', 'warning');
    await navigator.clipboard.writeText(state.email).catch(() => {});
    window.showToast?.('Đã sao chép email.', 'success');
  });
  $('create-email')?.addEventListener('click', () => createMailbox());
  $('refresh-mail')?.addEventListener('click', () => refreshInbox());
  $('delete-mailbox')?.addEventListener('click', deleteMailbox);
  $('random-prefix')?.addEventListener('click', () => {
    $('temp-prefix').value = `tdm${Math.random().toString(36).slice(2, 10)}`;
  });
}

export async function initTempMail() {
  bindEvents();
  startCountdown();
  const domainPromise = loadDomains();
  let createResult;
  try {
    createResult = await createMailbox({ silent: true });
  } catch (error) {
    createResult = null;
  }
  await domainPromise;
  if (!createResult && !state.email) {
    setEmail('Chưa kết nối được TempMail');
    const hero = document.getElementById('hero-mail-status');
    if (hero) hero.textContent = 'Chưa kết nối';
    state.messages = [];
    renderMessages();
  }
  clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(() => refreshInbox({ silent: true }), CONFIG.TEMPMAIL_REFRESH_SECONDS * 1000);
  return { email: state.email };
}
