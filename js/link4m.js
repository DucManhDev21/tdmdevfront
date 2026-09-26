const API_KEY_STORAGE = 'tdm-link4m-api-key';
const HISTORY_STORAGE = 'tdm-link4m-history';

const $ = (selector, scope = document) => scope.querySelector(selector);

function loadHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_STORAGE) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_STORAGE, JSON.stringify(history.slice(0, 20)));
}

function extractShortUrl(payload) {
  return payload?.shortUrl
    || payload?.shortenedUrl
    || payload?.shorturl
    || payload?.shortUrl
    || payload?.data?.shortenedUrl
    || payload?.data?.shorturl
    || payload?.data?.shortUrl
    || payload?.data?.short
    || payload?.data?.link
    || payload?.result?.shortenedUrl
    || payload?.result?.shorturl
    || payload?.result?.shortUrl
    || payload?.result?.short
    || '';
}

function renderHistory() {
  const container = $('#linkHistory');
  if (!container) return;
  const history = loadHistory();
  if (!history.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">↗</div><h3>Chưa có lịch sử</h3><p>Link sau khi rút gọn sẽ được lưu trên thiết bị này.</p></div>';
    return;
  }
  container.innerHTML = history.map((item, index) => `
    <article class="history-item">
      <div class="history-copy"><strong>${escapeHtml(item.title || 'Link4M')}</strong><a href="${escapeAttribute(item.shortUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.shortUrl)}</a><span>${escapeHtml(item.destination)}</span></div>
      <div class="history-actions"><button class="button button-small" data-copy-index="${index}">Copy</button><button class="button button-small button-ghost" data-remove-index="${index}">Xóa</button></div>
    </article>
  `).join('');
  container.querySelectorAll('[data-copy-index]').forEach((button) => button.addEventListener('click', async () => {
    const item = loadHistory()[Number(button.dataset.copyIndex)];
    if (!item) return;
    try { await navigator.clipboard.writeText(item.shortUrl); window.TDMShowToast?.('Đã sao chép link.', 'success'); } catch {}
  }));
  container.querySelectorAll('[data-remove-index]').forEach((button) => button.addEventListener('click', () => {
    const history = loadHistory();
    history.splice(Number(button.dataset.removeIndex), 1);
    saveHistory(history);
    renderHistory();
  }));
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function escapeAttribute(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function makeQr(container, value) {
  container.innerHTML = '';
  if (!window.QRCode) {
    container.textContent = 'QR library chưa tải.';
    return;
  }
  new window.QRCode(container, {
    text: value,
    width: 190,
    height: 190,
    correctLevel: window.QRCode.CorrectLevel.M
  });
}

export function initLink4M(runtime) {
  window.TDMShowToast = runtime.showToast;
  const apiKeyInput = $('#link4mApiKey');
  const keyToggle = $('#link4mKeyToggle');
  const changeKey = $('#link4mChangeKey');
  const form = $('#link4mForm');
  const result = $('#linkResult');
  const resultLink = $('#resultLink');
  const qr = $('#qrCode');
  const copyResult = $('#copyShortLink');

  if (!form || !apiKeyInput) return;
  const storedKey = localStorage.getItem(API_KEY_STORAGE);
  if (storedKey) apiKeyInput.value = storedKey;

  keyToggle?.addEventListener('click', () => {
    apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
    keyToggle.textContent = apiKeyInput.type === 'password' ? 'Hiện' : 'Ẩn';
  });

  changeKey?.addEventListener('click', () => {
    localStorage.removeItem(API_KEY_STORAGE);
    apiKeyInput.value = '';
    apiKeyInput.focus();
    runtime.showToast('Đã xóa API Key đã lưu trên thiết bị.', 'info');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = $('#shortenButton');
    const apiKey = apiKeyInput.value.trim();
    const title = $('#linkTitle')?.value.trim() || '';
    const destination = $('#destinationUrl')?.value.trim() || '';
    if (!apiKey) return runtime.showToast('Vui lòng nhập Link4M API Key.', 'error');
    if (!destination) return runtime.showToast('Vui lòng nhập link gốc.', 'error');

    submit.disabled = true;
    if (result) result.classList.remove('is-visible');
    try {
      localStorage.setItem(API_KEY_STORAGE, apiKey);
      const response = await fetch(runtime.backendUrl('/api/link4m/shorten'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, url: destination })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || 'Link4M request failed.');
      const shortUrl = extractShortUrl(payload);
      if (!shortUrl) throw new Error('Không tìm thấy link rút gọn trong phản hồi Link4M.');
      if (resultLink) {
        resultLink.href = shortUrl;
        resultLink.textContent = shortUrl;
      }
      if (qr) makeQr(qr, shortUrl);
      if (result) result.classList.add('is-visible');
      const history = loadHistory();
      history.unshift({ title: title || 'Link4M', shortUrl, destination, createdAt: Date.now() });
      saveHistory(history);
      renderHistory();
      runtime.showToast('Rút gọn link thành công.', 'success');
    } catch (error) {
      runtime.showToast(error.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });

  copyResult?.addEventListener('click', async () => {
    const shortUrl = resultLink?.href || '';
    if (!shortUrl) return;
    try {
      await navigator.clipboard.writeText(shortUrl);
      runtime.showToast('Đã sao chép link rút gọn.', 'success');
    } catch {
      runtime.showToast('Không thể sao chép tự động.', 'error');
    }
  });

  renderHistory();
}
