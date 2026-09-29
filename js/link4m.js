import { apiFetch } from './config.js';

const STORAGE_KEY = 'link4m_api_key';
let initialized = false;

function getElements() {
  return {
    form: document.querySelector('#link4m-form'),
    apiKey: document.querySelector('#link4m-api-key'),
    targetUrl: document.querySelector('#link4m-target-url'),
    submit: document.querySelector('#link4m-submit'),
    result: document.querySelector('#link4m-result'),
    shortUrl: document.querySelector('#link4m-short-url'),
    copy: document.querySelector('#link4m-copy'),
    qr: document.querySelector('#link4m-qr'),
    status: document.querySelector('#link4m-status'),
  };
}

function setStatus(message = '', type = 'info') {
  const { status } = getElements();
  if (!status) return;
  status.textContent = message;
  status.dataset.type = type;
  status.hidden = !message;
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }

  if (button) {
    const original = button.innerHTML;
    button.innerHTML = '✓ Đã sao chép';
    button.classList.add('copied');
    window.setTimeout(() => {
      button.innerHTML = original;
      button.classList.remove('copied');
    }, 2000);
  }
}

async function createQrCode(url, canvas) {
  if (!canvas || !window.QRCode) return;
  canvas.innerHTML = '';
  const qrTarget = document.createElement('div');
  qrTarget.style.maxWidth = '100%';
  canvas.appendChild(qrTarget);
  await new Promise((resolve, reject) => {
    try {
      const qr = new QRCode(qrTarget, {
        text: url,
        width: 220,
        height: 220,
        colorDark: '#0f172a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
      if (qr) resolve(); else resolve();
    } catch (error) {
      reject(error);
    }
  }).catch(() => {
    canvas.textContent = 'Không tạo được QR Code.';
  });
}

async function handleSubmit(event) {
  event.preventDefault();
  const elements = getElements();
  const apiKey = elements.apiKey.value.trim();
  const url = elements.targetUrl.value.trim();

  if (!apiKey) {
    setStatus('Vui lòng nhập API Key Link4M.', 'error');
    elements.apiKey.focus();
    return;
  }

  try {
    new URL(url);
  } catch {
    setStatus('Link đích không hợp lệ. Hãy nhập URL đầy đủ, ví dụ https://example.com.', 'error');
    elements.targetUrl.focus();
    return;
  }

  localStorage.setItem(STORAGE_KEY, apiKey);
  elements.submit.disabled = true;
  elements.submit.innerHTML = '<span class="button-spinner"></span> Đang rút gọn...';
  elements.result.hidden = true;
  setStatus('Đang gọi Link4M API thông qua backend...', 'info');

  try {
    const data = await apiFetch('/api/link4m/shorten', {
      method: 'POST',
      body: JSON.stringify({ apiKey, url }),
    });

    const shortUrl = data?.shortUrl;
    if (!shortUrl) {
      throw new Error('Backend không trả về link rút gọn.');
    }

    elements.shortUrl.value = shortUrl;
    elements.result.hidden = false;
    await createQrCode(shortUrl, elements.qr);
    setStatus('Rút gọn thành công.', 'success');
  } catch (error) {
    setStatus(error.message || 'Không thể rút gọn link.', 'error');
  } finally {
    elements.submit.disabled = false;
    elements.submit.textContent = 'Rút gọn ngay';
  }
}

export function mountLink4m() {
  const elements = getElements();
  if (!elements.form || initialized) return;
  initialized = true;

  elements.apiKey.value = localStorage.getItem(STORAGE_KEY) || '';
  elements.form.addEventListener('submit', handleSubmit);
  elements.copy.addEventListener('click', () => copyText(elements.shortUrl.value, elements.copy));
}

export function unmountLink4m() {
  // The page is SPA-based; the controls are kept in DOM and hidden by the router.
}
