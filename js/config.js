export const CONFIG = Object.freeze({
  BACKEND_URL: 'https://tdmdevback-production.up.railway.app'
});

export function backendUrl(path = '') {
  const base = CONFIG.BACKEND_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
