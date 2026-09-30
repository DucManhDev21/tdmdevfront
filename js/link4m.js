import { apiFetch, copyText, showToast } from './config.js';

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.querySelector('#link4m-form');
  const apiKey = document.querySelector('#link4m-api');
  const url = document.querySelector('#link4m-url');
  const result = document.querySelector('#link4m-result');
  const shortInput = document.querySelector('#link4m-short');
  const qr = document.querySelector('#link4m-qr');
  const submit = document.querySelector('#link4m-submit');
  const status = document.querySelector('#link4m-status');
  apiKey.value = localStorage.getItem('link4m_api_key') || '';
  const setStatus = (text, type='info') => { status.textContent = text; status.className = `status show ${type}`; };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const key = apiKey.value.trim(); const destination = url.value.trim();
    if (!key || !destination) return setStatus('Vui lòng nhập API Key và URL đích.', 'error');
    submit.disabled = true; submit.textContent = 'Đang rút gọn...'; setStatus('Đang gửi yêu cầu tới Link4M...', 'info');
    try {
      localStorage.setItem('link4m_api_key', key);
      const data = await apiFetch('/api/link4m/shorten', { method:'POST', body: JSON.stringify({ apiKey:key, url:destination }) });
      shortInput.value = data.shortUrl;
      result.hidden = false;
      qr.innerHTML = '';
      if (window.QRCode) new QRCode(qr, { text:data.shortUrl, width:150, height:150, correctLevel:QRCode.CorrectLevel.M });
      setStatus('Rút gọn thành công.', 'success');
    } catch (error) { setStatus(error.message || 'Không thể rút gọn link.', 'error'); }
    finally { submit.disabled = false; submit.textContent = 'Rút gọn Link'; }
  });
  document.querySelector('#link4m-copy')?.addEventListener('click', async () => { if (!shortInput.value) return; await copyText(shortInput.value); const b = document.querySelector('#link4m-copy'); const old=b.textContent; b.textContent='✓ Đã sao chép'; setTimeout(()=>b.textContent=old,2000); showToast('Đã sao chép link rút gọn.'); });
});
