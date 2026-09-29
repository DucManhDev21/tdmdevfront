import { apiFetch, escapeHtml, formatDateTime } from './config.js';

let initialized = false;
let sending = false;

function getElements() {
  return {
    form: document.querySelector('#sendmail-form'),
    recipients: document.querySelector('#sendmail-recipients'),
    subject: document.querySelector('#sendmail-subject'),
    isHtml: document.querySelector('#sendmail-html'),
    plain: document.querySelector('#sendmail-plain'),
    body: document.querySelector('#sendmail-body'),
    attachment: document.querySelector('#sendmail-attachment'),
    repeat: document.querySelector('#sendmail-repeat'),
    submit: document.querySelector('#sendmail-submit'),
    status: document.querySelector('#sendmail-status'),
    progressWrap: document.querySelector('#sendmail-progress-wrap'),
    progressBar: document.querySelector('#sendmail-progress'),
    progressLabel: document.querySelector('#sendmail-progress-label'),
    logs: document.querySelector('#sendmail-logs'),
  };
}

function setStatus(message = '', type = 'info') {
  const { status } = getElements();
  status.textContent = message;
  status.dataset.type = type;
  status.hidden = !message;
}

function parseRecipients(raw) {
  const rows = raw.split(/[\n,;]+/g).map((email) => email.trim().toLowerCase()).filter(Boolean);
  const unique = [...new Set(rows)];
  const valid = [];
  const invalid = [];
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

  for (const email of unique) {
    if (regex.test(email)) valid.push(email);
    else invalid.push(email);
  }

  return { valid, invalid };
}

function addLog(email, result, message = '') {
  const { logs } = getElements();
  const item = document.createElement('div');
  item.className = `log-row ${result === 'success' ? 'log-success' : 'log-error'}`;
  item.innerHTML = `
    <span>[${escapeHtml(formatDateTime(new Date()))}]</span>
    <strong>Gửi tới ${escapeHtml(email)}</strong>
    <em>→ ${result === 'success' ? 'Thành công' : 'Thất bại'}</em>
    ${message ? `<small>${escapeHtml(message)}</small>` : ''}
  `;
  logs.prepend(item);
}

function animateRequestProgress(seconds, sent, total) {
  const { progressWrap, progressBar, progressLabel } = getElements();
  progressWrap.hidden = false;
  const startedAt = performance.now();
  let stopped = false;

  const timer = window.setInterval(() => {
    if (stopped) return;
    const elapsed = (performance.now() - startedAt) / 1000;
    const percent = Math.min(100, (elapsed / seconds) * 100);
    const remaining = Math.max(0, Math.ceil(seconds - elapsed));
    progressBar.style.width = `${percent}%`;
    progressLabel.textContent = `Đang xử lý ${sent + 1}/${total} · ${remaining}s đến mốc 15s...`;
  }, 250);

  return {
    stop() {
      stopped = true;
      window.clearInterval(timer);
      return (performance.now() - startedAt) / 1000;
    },
  };
}

function waitRemaining(ms, sent, total) {
  if (ms <= 0) return Promise.resolve();
  const { progressWrap, progressBar, progressLabel } = getElements();
  progressWrap.hidden = false;
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const remainMs = Math.max(0, ms - elapsed);
      progressBar.style.width = `${Math.min(100, ((ms - remainMs) / ms) * 100)}%`;
      progressLabel.textContent = `Đã gửi ${sent}/${total} email - Chờ ${Math.ceil(remainMs / 1000)}s để gửi tiếp...`;
      if (remainMs <= 0) {
        window.clearInterval(timer);
        progressBar.style.width = '100%';
        resolve();
      }
    }, 250);
  });
}

async function sendOne(email, subject, body, isHtml, attachment) {
  const formData = new FormData();
  formData.append('toEmail', email);
  formData.append('subject', subject);
  formData.append('body', body);
  formData.append('isHtml', String(isHtml));
  if (attachment) formData.append('attachment', attachment, attachment.name);

  return apiFetch('/api/sendmail', {
    method: 'POST',
    body: formData,
  });
}

async function handleSubmit(event) {
  event.preventDefault();
  if (sending) return;

  const elements = getElements();
  const { valid, invalid } = parseRecipients(elements.recipients.value);
  const subject = elements.subject.value.trim();
  const body = elements.body.value;
  const isHtml = elements.isHtml.checked;
  const repeat = Math.max(1, Math.min(3, Number.parseInt(elements.repeat.value, 10) || 1));
  const attachment = elements.attachment.files?.[0] || null;

  if (!valid.length) {
    setStatus('Danh sách người nhận không có email hợp lệ.', 'error');
    return;
  }
  if (!subject) {
    setStatus('Vui lòng nhập tiêu đề email.', 'error');
    return;
  }
  if (!body.trim()) {
    setStatus('Vui lòng nhập nội dung email.', 'error');
    return;
  }
  if (attachment && attachment.size > 10 * 1024 * 1024) {
    setStatus('File đính kèm tối đa 10 MB.', 'error');
    return;
  }

  const targets = [];
  for (const email of valid) {
    for (let index = 0; index < repeat; index += 1) targets.push(email);
  }

  sending = true;
  elements.submit.disabled = true;
  elements.recipients.disabled = true;
  elements.subject.disabled = true;
  elements.body.disabled = true;
  elements.attachment.disabled = true;
  elements.repeat.disabled = true;
  elements.progressWrap.hidden = false;
  elements.logs.innerHTML = '';
  setStatus(`Đang bắt đầu gửi ${targets.length} lượt email...`, 'info');

  let sent = 0;
  let failed = 0;

  if (invalid.length) {
    invalid.forEach((email) => addLog(email, 'error', 'Địa chỉ email không hợp lệ nên đã bỏ qua.'));
  }

  try {
    for (const email of targets) {
      const progress = animateRequestProgress(15, sent, targets.length);
      try {
        await sendOne(email, subject, body, isHtml, attachment);
        const elapsedSeconds = progress.stop();
        sent += 1;
        addLog(email, 'success');
        if (sent + failed < targets.length) {
          await waitRemaining(Math.max(0, 15_000 - elapsedSeconds * 1000), sent, targets.length);
        }
      } catch (error) {
        progress.stop();
        failed += 1;
        addLog(email, 'error', error.message || 'Lỗi không xác định');
      }
    }

    setStatus(`Hoàn tất: ${sent} thành công, ${failed} thất bại.`, failed ? 'error' : 'success');
    elements.progressLabel.textContent = `Hoàn tất ${sent + failed}/${targets.length} lượt gửi.`;
    elements.progressBar.style.width = '100%';
  } finally {
    sending = false;
    elements.submit.disabled = false;
    elements.recipients.disabled = false;
    elements.subject.disabled = false;
    elements.body.disabled = false;
    elements.attachment.disabled = false;
    elements.repeat.disabled = false;
  }
}

export function mountSendmail() {
  const elements = getElements();
  if (!elements.form || initialized) return;
  initialized = true;

  elements.repeat.value = '1';
  elements.form.addEventListener('submit', handleSubmit);

  document.querySelectorAll('input[name="sendmail-content-type"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const isHtml = elements.isHtml.checked;
      elements.body.placeholder = isHtml
        ? '<h1>Xin chào</h1>\n<p>Nội dung HTML của bạn...</p>'
        : 'Nội dung email văn bản...';
      elements.body.dataset.mode = isHtml ? 'html' : 'plain';
    });
  });
}
