import CONFIG from './config.js';

const KEY = 'tdmdev_link4m_api_key';
const HISTORY_KEY = 'tdmdev_link4m_history';

const $ = (id) => document.getElementById(id);

function backendUrl(path) {
  return `${CONFIG.BACKEND_URL.replace(/\/$/, '')}${path}`;
}

function loadKey() {
  const saved = localStorage.getItem(KEY) || '';
  $('link4m-api-key').value = saved;
  updateKeyState(Boolean(saved));
}

function updateKeyState(hasKey) {
  $('key-saved-label').textContent = hasKey ? 'Đã lưu trên thiết bị' : 'Chưa lưu';
}

function saveKey(value) {
  localStorage.setItem(KEY, value);
  updateKeyState(true);
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (_) { return []; }
}

function setHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 10)));
}

function escapeText(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function extractShortUrl(payload) {
  const candidates = [
    payload?.shortenedUrl, payload?.shortened_url, payload?.shortUrl, payload?.short_url,
    payload?.url, payload?.link, payload?.data?.shortenedUrl, payload?.data?.shortened_url,
    payload?.data?.shortUrl, payload?.data?.url, payload?.data?.link
  ];
  return candidates.find((value) => /^https?:\/\//i.test(String(value || ''))) || '';
}

function renderHistory() {
  const list = $('link-history');
  const empty = $('link-history-empty');
  if (!list || !empty) return;
  const items = getHistory();
  empty.hidden = items.length > 0;
  list.innerHTML = items.map((item) => `
    <div class="history-item">
      <div>
        <strong>${escapeText(item.title || 'Link rút gọn')}</strong>
        <small>${escapeText(item.original)}</small>
      </div>
      <button class="mini-copy" data-copy="${escapeText(item.short)}" type="button">Copy</button>
    </div>
  `).join('');
  list.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      await navigator.clipboard.writeText(button.dataset.copy).catch(() => {});
      window.showToast?.('Đã sao chép link rút gọn.', 'success');
    });
  });
}

function renderResult(shortUrl) {
  $('short-result').hidden = !shortUrl;
  $('short-url').value = shortUrl;
  const qrTarget = $('qrcode');
  qrTarget.innerHTML = '';
  if (shortUrl && window.QRCode) {
    new window.QRCode(qrTarget, { text: shortUrl, width: 190, height: 190, correctLevel: window.QRCode.CorrectLevel.M });
  }
}

async function shorten() {
  const apiKey = $('link4m-api-key').value.trim();
  const title = $('link4m-title').value.trim();
  const url = $('link4m-url').value.trim();
  if (!apiKey) return window.showToast?.('Vui lòng nhập API Key Link4M.', 'warning');
  if (!/^https?:\/\//i.test(url)) return window.showToast?.('Link gốc phải bắt đầu bằng http:// hoặc https://.', 'warning');

  $('shorten-button').disabled = true;
  $('shorten-button').classList.add('loading');
  try {
    const response = await fetch(backendUrl('/api/link4m/shorten'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ apiKey, title, url })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.message || 'Rút gọn link thất bại.');
    const shortUrl = extractShortUrl(payload.data || payload);
    if (!shortUrl) throw new Error('Link4M không trả về URL rút gọn ở định dạng nhận diện được.');

    saveKey(apiKey);
    renderResult(shortUrl);
    const history = getHistory();
    history.unshift({ title: title || 'Link rút gọn', original: url, short: shortUrl, createdAt: new Date().toISOString() });
    setHistory(history);
    renderHistory();
    window.showToast?.('Rút gọn link thành công.', 'success');
  } catch (error) {
    window.showToast?.(error.message, 'error');
  } finally {
    $('shorten-button').disabled = false;
    $('shorten-button').classList.remove('loading');
  }
}

function bind() {
  loadKey();
  renderHistory();
  $('toggle-api-key')?.addEventListener('click', () => {
    const input = $('link4m-api-key');
    input.type = input.type === 'password' ? 'text' : 'password';
  });
  $('change-api-key')?.addEventListener('click', () => {
    localStorage.removeItem(KEY);
    $('link4m-api-key').value = '';
    updateKeyState(false);
    window.showToast?.('Đã xóa API Key đã lưu trên thiết bị.', 'success');
  });
  $('shorten-button')?.addEventListener('click', shorten);
  $('copy-short')?.addEventListener('click', async () => {
    const value = $('short-url').value;
    if (!value) return;
    await navigator.clipboard.writeText(value).catch(() => {});
    window.showToast?.('Đã sao chép link rút gọn.', 'success');
  });
  $('clear-history')?.addEventListener('click', () => {
    setHistory([]);
    renderHistory();
    window.showToast?.('Đã xóa lịch sử link.', 'success');
  });
}

export function initLink4M() {
  bind();
}
