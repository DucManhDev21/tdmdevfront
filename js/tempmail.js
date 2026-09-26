const SESSION_KEY = 'tdm-temp-session';
const MAILBOX_KEY = 'tdm-temp-mailbox';
let countdown = 10;
let timer = null;
let currentMessages = [];

const $ = (selector, scope = document) => scope.querySelector(selector);

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function normalizeArray(payload) {
  const candidates = [payload, payload?.data, payload?.emails, payload?.messages, payload?.items, payload?.results, payload?.data?.emails, payload?.data?.messages, payload?.data?.items];
  return candidates.find(Array.isArray) || [];
}

function normalizeMailbox(value) {
  const root = value?.data || value || {};
  return {
    id: root.id ?? root.mail_id ?? root.mailId ?? root.email_id ?? '',
    email: root.email ?? root.address ?? root.mail ?? root.username ?? ''
  };
}

function normalizeMessage(message) {
  return {
    id: message?.id ?? message?.message_id ?? message?.messageId ?? message?.uuid ?? '',
    sender: message?.from ?? message?.sender ?? message?.from_email ?? message?.email ?? 'Không rõ',
    subject: message?.subject ?? message?.title ?? '(Không có tiêu đề)',
    date: message?.date ?? message?.created_at ?? message?.createdAt ?? message?.time ?? '',
    preview: message?.preview ?? message?.snippet ?? message?.text ?? message?.body ?? '',
    raw: message
  };
}

function extractMessageContent(payload) {
  const root = payload?.data || payload || {};
  const html = root.html ?? root.html_content ?? root.body_html ?? root.content_html ?? root.body ?? '';
  const text = root.text ?? root.text_content ?? root.body_text ?? root.plain ?? '';
  const from = root.from ?? root.sender ?? root.from_email ?? '';
  const subject = root.subject ?? root.title ?? '(Không có tiêu đề)';
  const date = root.date ?? root.created_at ?? root.createdAt ?? root.time ?? '';
  const attachmentList = root.attachments ?? root.files ?? root.file_attachments ?? [];
  return { html: String(html || ''), text: String(text || ''), from: String(from || ''), subject: String(subject || ''), date: String(date || ''), attachments: Array.isArray(attachmentList) ? attachmentList : [] };
}

function sanitizeEmailHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html || '', 'text/html');
  doc.querySelectorAll('script, iframe, object, embed, form, meta[http-equiv="refresh"]').forEach((node) => node.remove());
  doc.querySelectorAll('*').forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
      if (attribute.name.toLowerCase() === 'srcdoc') node.removeAttribute(attribute.name);
    });
  });
  return doc.body.innerHTML;
}

function attachmentUrl(attachment) {
  const url = attachment?.url ?? attachment?.download_url ?? attachment?.downloadUrl ?? attachment?.href ?? '';
  if (url) return String(url);
  const content = attachment?.content ?? attachment?.data ?? '';
  const mime = attachment?.mime ?? attachment?.mime_type ?? attachment?.contentType ?? 'application/octet-stream';
  if (!content) return '';
  if (String(content).startsWith('data:')) return String(content);
  return `data:${mime};base64,${String(content).replace(/^base64,/, '')}`;
}

function renderMailbox(mailbox) {
  const emailBox = $('#tempEmailAddress');
  if (emailBox) emailBox.textContent = mailbox?.email || 'Chưa có email';
  const status = $('#mailStatus');
  if (status) status.textContent = mailbox?.email ? 'Hộp thư đang hoạt động' : 'Đang tạo hộp thư...';
}

function renderMessages(messages) {
  const container = $('#messageList');
  const count = $('#messageCount');
  if (!container) return;
  currentMessages = messages.map(normalizeMessage).filter((item) => item.id);
  if (count) count.textContent = String(currentMessages.length);

  if (!currentMessages.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">✉</div><h3>Chưa có thư mới</h3><p>Hệ thống sẽ tự động kiểm tra hộp thư.</p></div>';
    return;
  }

  container.innerHTML = currentMessages.map((message, index) => `
    <button class="message-row" type="button" data-message-index="${index}">
      <div class="message-avatar">${escapeHtml((message.sender || '?').slice(0, 1).toUpperCase())}</div>
      <div class="message-main">
        <div class="message-top"><strong>${escapeHtml(message.sender)}</strong><time>${escapeHtml(formatDate(message.date))}</time></div>
        <div class="message-subject">${escapeHtml(message.subject)}</div>
        <div class="message-preview">${escapeHtml(String(message.preview).replace(/<[^>]+>/g, '').slice(0, 120))}</div>
      </div>
    </button>
  `).join('');

  container.querySelectorAll('.message-row').forEach((button) => {
    button.addEventListener('click', () => openMessage(currentMessages[Number(button.dataset.messageIndex)]));
  });
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const session = localStorage.getItem(SESSION_KEY);
  if (session) headers.set('X-Temp-Session', session);
  const response = await fetch(path, { ...options, headers });
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (response.headers.get('X-Temp-Session')) localStorage.setItem(SESSION_KEY, response.headers.get('X-Temp-Session'));
  if (!response.ok) {
    const error = new Error(payload?.message || 'Backend request failed.');
    error.payload = payload;
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function createMailbox(prefix = '') {
  const body = {};
  if (prefix.trim()) body.user = prefix.trim();
  const payload = await apiFetch('/api/temp-mail/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const mailbox = normalizeMailbox(payload.mailbox || payload.data);
  if (!mailbox.id || !mailbox.email) throw new Error('Không nhận được mailbox hợp lệ.');
  localStorage.setItem(MAILBOX_KEY, JSON.stringify(mailbox));
  renderMailbox(mailbox);
  await refreshMessages(false);
  return mailbox;
}

async function refreshMessages(showError = true) {
  try {
    const payload = await apiFetch('/api/temp-mail/messages');
    const messages = normalizeArray(payload?.data ?? payload);
    renderMessages(messages);
    $('#mailStatus')?.setAttribute('data-ok', 'true');
  } catch (error) {
    $('#mailStatus')?.setAttribute('data-ok', 'false');
    if (showError) initContext()?.showToast?.(error.message, 'error');
  }
  countdown = 10;
  renderCountdown();
}

function renderCountdown() {
  const counter = $('#refreshCountdown');
  if (counter) counter.textContent = `${countdown}s`;
}

let context = null;
function initContext() { return context; }

async function openMessage(message) {
  const modal = $('#emailModal');
  if (!modal) return;
  const title = $('#emailModalTitle');
  const meta = $('#emailMeta');
  const content = $('#emailContent');
  const attachments = $('#emailAttachments');
  if (title) title.textContent = message.subject || 'Nội dung thư';
  if (meta) meta.textContent = `${message.sender || 'Không rõ'} • ${formatDate(message.date)}`;
  if (content) content.innerHTML = '<div class="loading-state">Đang tải nội dung thư…</div>';
  if (attachments) attachments.innerHTML = '';
  modal.classList.add('is-visible');
  document.body.classList.add('modal-open');

  try {
    const payload = await apiFetch(`/api/temp-mail/message/${encodeURIComponent(message.id)}`);
    const data = extractMessageContent(payload);
    if (meta) meta.textContent = `${data.from || message.sender || 'Không rõ'} • ${formatDate(data.date || message.date)}`;
    const safeHtml = sanitizeEmailHtml(data.html);
    if (content) {
      if (safeHtml) {
        const frame = document.createElement('iframe');
        frame.className = 'email-frame';
        frame.setAttribute('sandbox', '');
        frame.setAttribute('referrerpolicy', 'no-referrer');
        frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data: cid:; style-src 'unsafe-inline'; font-src https: data:;"> </head><body style="margin:0;padding:18px;font-family:Arial,sans-serif;color:#182033;line-height:1.6">${safeHtml}</body></html>`;
        content.replaceChildren(frame);
      } else {
        content.innerHTML = `<pre class="email-text">${escapeHtml(data.text || 'Thư không có nội dung văn bản.')}</pre>`;
      }
    }
    renderAttachments(data.attachments);
  } catch (error) {
    if (content) content.innerHTML = `<div class="error-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderAttachments(items) {
  const container = $('#emailAttachments');
  if (!container) return;
  container.innerHTML = '';
  items.forEach((item) => {
    const url = attachmentUrl(item);
    const name = item?.name ?? item?.filename ?? 'Tệp đính kèm';
    const row = document.createElement('div');
    row.className = 'attachment-row';
    const title = document.createElement('span');
    title.textContent = name;
    row.appendChild(title);
    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Tải xuống';
      row.appendChild(link);
    }
    container.appendChild(row);
  });
}

function closeMessage() {
  $('#emailModal')?.classList.remove('is-visible');
  document.body.classList.remove('modal-open');
}

export function initTempMail(runtime) {
  context = runtime;
  const stored = localStorage.getItem(MAILBOX_KEY);
  if (stored) {
    try { renderMailbox(JSON.parse(stored)); } catch {}
  }

  $('#copyEmail')?.addEventListener('click', async () => {
    const email = $('#tempEmailAddress')?.textContent?.trim();
    if (!email || email === 'Chưa có email') return runtime.showToast('Chưa có email để sao chép.', 'error');
    try {
      await navigator.clipboard.writeText(email);
      runtime.showToast('Đã sao chép email.', 'success');
    } catch {
      runtime.showToast('Không thể sao chép tự động.', 'error');
    }
  });

  $('#newEmail')?.addEventListener('click', async () => {
    const prefix = $('#emailPrefix')?.value || '';
    const button = $('#newEmail');
    button.disabled = true;
    try {
      await createMailbox(prefix);
      runtime.showToast('Đã tạo email mới.', 'success');
    } catch (error) {
      runtime.showToast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  $('#refreshMail')?.addEventListener('click', () => refreshMessages(true));

  $('#deleteEmail')?.addEventListener('click', async () => {
    try {
      await apiFetch('/api/temp-mail/current', { method: 'DELETE' });
      localStorage.removeItem(MAILBOX_KEY);
      renderMailbox(null);
      renderMessages([]);
      runtime.showToast('Đã xóa hộp thư hiện tại.', 'success');
    } catch (error) {
      if (error.status === 501 || error.payload?.unsupported) {
        localStorage.removeItem(MAILBOX_KEY);
        renderMailbox(null);
        renderMessages([]);
        runtime.showToast('API chưa hỗ trợ xóa trực tiếp; hộp thư đã được xóa khỏi phiên của bạn.', 'info');
      } else {
        runtime.showToast(error.message, 'error');
      }
    }
  });

  $('#emailClose')?.addEventListener('click', closeMessage);
  $('#emailBackdrop')?.addEventListener('click', closeMessage);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMessage(); });

  createMailbox().catch(() => refreshMessages(false));

  renderCountdown();
  timer = window.setInterval(() => {
    countdown -= 1;
    if (countdown <= 0) {
      countdown = 10;
      if (!document.hidden) refreshMessages(false);
      else renderCountdown();
    }
    else renderCountdown();
  }, 1000);
}
