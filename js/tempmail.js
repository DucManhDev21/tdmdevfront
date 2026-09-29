import { apiFetch, escapeHtml, formatDateTime } from './config.js';

const SESSION_KEY = 'tdmdev_tempmail_email';
let pollTimer = null;
let initialized = false;
let latestHighlight = null;

function getElements() {
  return {
    email: document.querySelector('#tempmail-email'),
    create: document.querySelector('#tempmail-create'),
    copy: document.querySelector('#tempmail-copy'),
    refresh: document.querySelector('#tempmail-refresh'),
    countdown: document.querySelector('#tempmail-countdown'),
    status: document.querySelector('#tempmail-status'),
    highlight: document.querySelector('#tempmail-highlight'),
    messages: document.querySelector('#tempmail-messages'),
  };
}

function setStatus(message = '', type = 'info') {
  const { status } = getElements();
  if (!status) return;
  status.textContent = message;
  status.dataset.type = type;
  status.hidden = !message;
}

function normalizeContent(content) {
  if (!content) return '';
  const text = String(content)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

function extractSignals(subject, content) {
  const source = `${subject || ''}\n${content || ''}`;
  const otpMatches = source.match(/\b\d{4,6}\b/g) || [];
  const uniqueOtps = [...new Set(otpMatches)].filter((code) => !/^20\d{2}$/.test(code));
  const urls = source.match(/https?:\/\/[^\s<>"']+/gi) || [];
  const verifyUrl = urls.find((url) => /(token|verify|verification|activate|confirm)/i.test(url));

  if (verifyUrl) return { kind: 'link', value: verifyUrl };
  if (uniqueOtps.length) return { kind: 'otp', value: uniqueOtps[0] };
  return null;
}

function renderHighlight(signal) {
  const { highlight } = getElements();
  latestHighlight = signal;
  if (!highlight) return;
  if (!signal) {
    highlight.hidden = true;
    highlight.innerHTML = '';
    return;
  }

  if (signal.kind === 'otp') {
    highlight.innerHTML = `
      <div class="signal-kicker">MÃ XÁC THỰC PHÁT HIỆN</div>
      <div class="signal-main">
        <strong>${escapeHtml(signal.value)}</strong>
        <button class="secondary-button" id="tempmail-copy-otp" type="button">Copy OTP</button>
      </div>
      <div class="signal-sub">Mã 4–6 chữ số được tìm thấy trong hộp thư mới nhất.</div>
    `;
  } else {
    highlight.innerHTML = `
      <div class="signal-kicker">LINK KÍCH HOẠT PHÁT HIỆN</div>
      <div class="signal-main">
        <a href="${escapeHtml(signal.value)}" target="_blank" rel="noopener noreferrer">Mở link xác thực</a>
        <button class="secondary-button" id="tempmail-copy-link" type="button">Copy link</button>
      </div>
      <div class="signal-sub">Link có dấu hiệu chứa token/verify/activate/confirm.</div>
    `;
  }
  highlight.hidden = false;

  const copyButton = highlight.querySelector('#tempmail-copy-otp, #tempmail-copy-link');
  copyButton?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(signal.value);
    const original = copyButton.textContent;
    copyButton.textContent = '✓ Đã sao chép';
    window.setTimeout(() => { copyButton.textContent = original; }, 2000);
  });
}

function renderMessages(messages) {
  const { messages: container } = getElements();
  if (!container) return;

  if (!Array.isArray(messages) || !messages.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✉</div>
        <h3>Chưa có thư mới</h3>
        <p>Hệ thống sẽ tự động kiểm tra hộp thư sau mỗi 5 giây.</p>
      </div>
    `;
    renderHighlight(null);
    return;
  }

  let globalSignal = null;
  container.innerHTML = messages.map((message, index) => {
    const subject = message.subject || '(Không có tiêu đề)';
    const from = message.from_email || message.from?.address || message.from || 'Không rõ người gửi';
    const fromName = message.from_name || message.from?.name || '';
    const senderLabel = fromName ? `${fromName} <${from}>` : from;
    const date = message.receivedAt || message.date || message.created_at;
    const content = message.content || message.textBody || message.text || message.intro || message.htmlBody || ''; 
    const plain = normalizeContent(content);
    const signal = extractSignals(subject, `${content} ${message.htmlBody || ''}`);
    if (!globalSignal && signal) globalSignal = signal;

    return `
      <details class="mail-item" ${index === 0 ? 'open' : ''}>
        <summary>
          <div class="mail-summary-main">
            <strong>${escapeHtml(subject)}</strong>
            <span>${escapeHtml(senderLabel)}</span>
          </div>
          <time>${escapeHtml(formatDateTime(date))}</time>
        </summary>
        <div class="mail-body">
          <div class="mail-meta">To: ${escapeHtml(message.to || '')}</div>
          <div class="mail-content">${escapeHtml(plain || '(Thư không có nội dung văn bản)')}</div>
        </div>
      </details>
    `;
  }).join('');

  renderHighlight(globalSignal);
}

async function refreshMailbox() {
  const elements = getElements();
  const email = sessionStorage.getItem(SESSION_KEY);
  if (!email) return;

  try {
    const data = await apiFetch(`/api/tempmail/messages?email=${encodeURIComponent(email)}`);
    renderMessages(data.messages || data || []);
    setStatus('Hộp thư đã cập nhật.', 'success');
  } catch (error) {
    if (error?.payload?.code === 'MAILBOX_NOT_FOUND') {
      // Backend vừa khởi động lại và mất phiên RAM: tự tạo mailbox mới.
      sessionStorage.removeItem(SESSION_KEY);
      elements.email.value = '';
      setStatus('Phiên email cũ đã hết. Đang tự động tạo email mới...', 'info');
      await createMailbox();
    } else {
      setStatus(error.message || 'Không thể tải hộp thư.', 'error');
    }
  } finally {
    let remaining = 5;
    elements.countdown.textContent = `Tự động làm mới sau ${remaining}s`;
    const tick = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) window.clearInterval(tick);
      elements.countdown.textContent = remaining > 0 ? `Tự động làm mới sau ${remaining}s` : 'Đang làm mới...';
    }, 1000);
  }
}

async function createMailbox() {
  const elements = getElements();
  elements.create.disabled = true;
  elements.create.innerHTML = '<span class="button-spinner"></span> Đang tạo...';
  setStatus('Đang tạo email tạm thời...', 'info');

  try {
    const data = await apiFetch('/api/tempmail/create', { method: 'POST' });
    const email = data?.email;
    if (!email) throw new Error('Backend không trả về địa chỉ email.');
    sessionStorage.setItem(SESSION_KEY, email);
    elements.email.value = email;
    renderHighlight(null);
    renderMessages([]);
    setStatus('Đã tạo hộp thư mới.', 'success');
    await refreshMailbox();
  } catch (error) {
    setStatus(error.message || 'Không thể tạo email tạm thời.', 'error');
  } finally {
    elements.create.disabled = false;
    elements.create.textContent = 'Tạo Email Khác';
  }
}

export async function mountTempmail() {
  const elements = getElements();
  if (!elements.email || !elements.create || initialized) return;
  initialized = true;

  elements.email.value = sessionStorage.getItem(SESSION_KEY) || '';
  elements.create.addEventListener('click', createMailbox);
  elements.refresh.addEventListener('click', refreshMailbox);
  elements.copy.addEventListener('click', async () => {
    if (!elements.email.value) return;
    await navigator.clipboard.writeText(elements.email.value);
    const original = elements.copy.textContent;
    elements.copy.textContent = '✓ Đã sao chép';
    window.setTimeout(() => { elements.copy.textContent = original; }, 2000);
  });

  if (!elements.email.value) {
    await createMailbox();
  } else {
    await refreshMailbox();
  }

  if (!pollTimer) {
    pollTimer = window.setInterval(refreshMailbox, 5000);
  }
}

export function unmountTempmail() {
  // Polling continues only for this SPA session so the mailbox remains live after route switching.
}
