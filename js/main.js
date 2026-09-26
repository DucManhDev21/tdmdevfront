import { CONFIG, backendUrl } from './config.js';
import { TDMAuth } from './auth.js';
import { initTempMail } from './tempmail.js';
import { initLink4M } from './link4m.js';

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

let menuItems = [];
let toastTimer = null;

export function showToast(message, type = 'info') {
  const toast = $('#toast');
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.dataset.type = type;
  toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2800);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('tdm-theme', theme);
  const button = $('#themeToggle');
  if (button) {
    button.textContent = theme === 'dark' ? '☀️' : '🌙';
    button.setAttribute('aria-label', theme === 'dark' ? 'Bật Light Mode' : 'Bật Dark Mode');
  }
}

function initTheme() {
  const stored = localStorage.getItem('tdm-theme');
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  setTheme(stored || (systemDark ? 'dark' : 'light'));
  $('#themeToggle')?.addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
}

function openMenu() {
  $('#sidebar')?.classList.add('is-open');
  $('#menuBackdrop')?.classList.add('is-visible');
  document.body.classList.add('menu-open');
}

function closeMenu() {
  $('#sidebar')?.classList.remove('is-open');
  $('#menuBackdrop')?.classList.remove('is-visible');
  document.body.classList.remove('menu-open');
}

function navigateToFeature(target) {
  closeMenu();
  if (!target) return;
  const element = document.querySelector(target);
  if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderMenu() {
  const container = $('#dynamicMenuList');
  if (!container) return;
  container.innerHTML = '';

  if (!menuItems.length) {
    const empty = document.createElement('div');
    empty.className = 'menu-empty';
    empty.textContent = 'Chưa có mục tùy chỉnh.';
    container.appendChild(empty);
    return;
  }

  menuItems.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-item';
    button.innerHTML = `<span class="menu-item-icon">${item.type === 'iframe' ? '▣' : '↗'}</span><span>${escapeHtml(item.title)}</span>`;
    button.addEventListener('click', () => {
      if (item.type === 'iframe') openIframe(item.title, item.url);
      else window.open(item.url, '_blank', 'noopener,noreferrer');
      closeMenu();
    });
    container.appendChild(button);
  });
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

async function fetchMenu() {
  try {
    const response = await fetch(backendUrl('/api/menu'), { cache: 'no-store' });
    if (!response.ok) throw new Error('menu request failed');
    const payload = await response.json();
    menuItems = Array.isArray(payload.menus) ? payload.menus : [];
    renderMenu();
  } catch {
    menuItems = [];
    renderMenu();
  }
}

function connectMenuStream() {
  if (!window.EventSource) return;
  const source = new EventSource(backendUrl('/api/menu/stream'));
  source.addEventListener('menus', (event) => {
    try {
      const payload = JSON.parse(event.data);
      menuItems = Array.isArray(payload.menus) ? payload.menus : [];
      renderMenu();
    } catch {}
  });
  source.onerror = () => source.close();
}

function initSidebar() {
  $('#menuToggle')?.addEventListener('click', openMenu);
  $('#menuClose')?.addEventListener('click', closeMenu);
  $('#menuBackdrop')?.addEventListener('click', closeMenu);
  $$('.default-menu-link').forEach((button) => {
    button.addEventListener('click', () => navigateToFeature(button.dataset.target));
  });
}

function openIframe(title, url) {
  const modal = $('#iframeModal');
  const frame = $('#iframeView');
  const titleEl = $('#iframeTitle');
  if (!modal || !frame) return;
  frame.src = url;
  frame.title = title || 'TDM Dev Web View';
  if (titleEl) titleEl.textContent = title || 'Web View';
  modal.classList.add('is-visible');
  document.body.classList.add('modal-open');
}

function closeIframe() {
  const modal = $('#iframeModal');
  const frame = $('#iframeView');
  modal?.classList.remove('is-visible');
  document.body.classList.remove('modal-open');
  if (frame) frame.src = 'about:blank';
}

function initIframeModal() {
  $('#iframeClose')?.addEventListener('click', closeIframe);
  $('#iframeBackdrop')?.addEventListener('click', closeIframe);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
      closeIframe();
    }
  });
}

function updateAuthUI(user) {
  const authState = $('#authState');
  const authTrigger = $('#authTrigger');
  const authUserName = $('#authUserName');
  if (!authState || !authTrigger) return;

  if (user) {
    authState.hidden = false;
    authTrigger.hidden = true;
    if (authUserName) authUserName.textContent = TDMAuth.friendlyUser(user)?.displayName || 'TDM User';
  } else {
    authState.hidden = true;
    authTrigger.hidden = false;
  }
}

function initAuthModal() {
  const modal = $('#authModal');
  if (!modal) return;

  const modeTitle = $('#authModeTitle');
  const nameField = $('#authNameField');
  const nameInput = $('#authName');
  const emailInput = $('#authEmail');
  const passwordInput = $('#authPassword');
  const form = $('#authForm');
  const submit = $('#authSubmit');
  const switchMode = $('#authSwitch');
  const google = $('#googleSignIn');
  const close = () => {
    modal.classList.remove('is-visible');
    document.body.classList.remove('modal-open');
  };

  let mode = 'login';
  $('#authTrigger')?.addEventListener('click', () => {
    modal.classList.add('is-visible');
    document.body.classList.add('modal-open');
  });
  $('#authClose')?.addEventListener('click', close);
  $('#authBackdrop')?.addEventListener('click', close);
  $('#authLogout')?.addEventListener('click', async () => {
    await TDMAuth.signOut();
    showToast('Đã đăng xuất.', 'success');
  });

  function renderMode() {
    const register = mode === 'register';
    if (modeTitle) modeTitle.textContent = register ? 'Tạo tài khoản' : 'Đăng nhập';
    if (nameField) nameField.hidden = !register;
    if (submit) submit.textContent = register ? 'Đăng ký' : 'Đăng nhập';
    if (switchMode) switchMode.textContent = register ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký';
    if (!register && nameInput) nameInput.value = '';
  }

  switchMode?.addEventListener('click', () => {
    mode = mode === 'login' ? 'register' : 'login';
    renderMode();
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      if (mode === 'register') {
        await TDMAuth.createWithEmailPassword({ name: nameInput.value, email: emailInput.value, password: passwordInput.value });
        showToast('Tạo tài khoản thành công.', 'success');
      } else {
        await TDMAuth.signInWithEmailPassword({ email: emailInput.value, password: passwordInput.value });
        showToast('Đăng nhập thành công.', 'success');
      }
      form.reset();
      close();
    } catch (error) {
      showToast(TDMAuth.translateAuthError(error.code), 'error');
    } finally {
      submit.disabled = false;
    }
  });

  google?.addEventListener('click', async () => {
    google.disabled = true;
    try {
      await TDMAuth.signInWithGoogle();
      showToast('Đăng nhập Google thành công.', 'success');
      close();
    } catch (error) {
      showToast(TDMAuth.translateAuthError(error.code), 'error');
    } finally {
      google.disabled = false;
    }
  });

  TDMAuth.onAuthStateChanged((user) => updateAuthUI(user));
  renderMode();
}

async function bootstrap() {
  initTheme();
  initSidebar();
  initIframeModal();
  initAuthModal();
  await fetchMenu();
  connectMenuStream();
  initTempMail({ showToast, backendUrl, CONFIG });
  initLink4M({ showToast, backendUrl });
}

bootstrap();
