// TDM Dev frontend runtime configuration.
// Replace BACKEND_URL with the public Railway URL of your backend.
export const BACKEND_URL = 'https://tdmdev-backend.up.railway.app';

export const API_TIMEOUT_MS = 30000;

export async function apiFetch(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');

  try {
    const response = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message = typeof payload === 'object' && payload?.message
        ? payload.message
        : `Yêu cầu thất bại (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Kết nối tới máy chủ quá thời gian chờ.');
    }
    if (error instanceof TypeError) {
      throw new Error('Không thể kết nối backend. Hãy kiểm tra BACKEND_URL, CORS và trạng thái Railway.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}
