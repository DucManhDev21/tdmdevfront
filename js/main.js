(() => {
  const state = { dynamicMenu: [], currentView: 'home' };
  const $ = selector => document.querySelector(selector);

  function showToast(message) {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  window.quickToast = showToast;

  function applyTheme(theme) {
    document.body.dataset.theme = theme;
    localStorage.setItem('quicktools-theme', theme);
    $('#themeToggle').textContent = theme === 'light' ? '🌙' : '☀️';
  }

  function route(view) {
    const target = ['home', 'tempmail', 'link4m'].includes(view) ? view : 'home';
    state.currentView = target;
    document.querySelectorAll('.view').forEach(node => node.classList.toggle('active-view', node.dataset.view === target));
    document.querySelectorAll('[data-route]').forEach(node => node.classList.toggle('active', node.dataset.route === target));
    history.replaceState(null, '', `#${target}`);
    closeDrawer();
    if (target === 'tempmail' && window.TempMail?.activate) window.TempMail.activate();
    if (target === 'link4m' && window.Link4M?.activate) window.Link4M.activate();
  }

  function openDrawer() {
    $('#drawer').classList.add('open');
    $('#drawer').setAttribute('aria-hidden', 'false');
    $('#drawerBackdrop').hidden = false;
    $('#menuButton').setAttribute('aria-expanded', 'true');
  }

  function closeDrawer() {
    const drawer = $('#drawer');
    if (!drawer) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    $('#drawerBackdrop').hidden = true;
    $('#menuButton').setAttribute('aria-expanded', 'false');
  }

  function renderDynamicMenu() {
    const desktop = $('#desktopDynamicMenu');
    const drawer = $('#drawerDynamicMenu');
    const build = (isDrawer = false) => state.dynamicMenu.map(item => {
      const icon = item.type === 'iframe' ? '▣' : '↗';
      if (item.type === 'external') {
        return `<a href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">${icon} ${escapeHtml(item.name)}</a>`;
      }
      return `<a href="#" data-iframe-menu="${escapeAttr(item.id)}">${icon} ${escapeHtml(item.name)}</a>`;
    }).join('');
    desktop.innerHTML = build(false);
    drawer.innerHTML = build(true);
    document.querySelectorAll('[data-iframe-menu]').forEach(node => node.addEventListener('click', event => {
      event.preventDefault();
      const item = state.dynamicMenu.find(value => value.id === node.dataset.iframeMenu);
      if (item) openIframe(item);
      closeDrawer();
    }));
  }

  function openIframe(item) {
    $('#iframeTitle').textContent = item.name;
    $('#dynamicIframe').src = item.url;
    $('#iframeModal').hidden = false;
  }

  function closeIframe() {
    $('#iframeModal').hidden = true;
    $('#dynamicIframe').src = 'about:blank';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
  }
  function escapeAttr(value) { return escapeHtml(value); }

  async function fetchMenu() {
    try {
      const response = await fetch('/api/menu', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không thể tải menu');
      state.dynamicMenu = Array.isArray(data.items) ? data.items : [];
      renderDynamicMenu();
    } catch (error) {
      console.warn(error);
    }
  }

  function initMenuStream() {
    if (!window.EventSource) return;
    const stream = new EventSource('/api/menu/stream');
    stream.onmessage = event => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'menu-update') {
          state.dynamicMenu = Array.isArray(data.items) ? data.items : [];
          renderDynamicMenu();
        }
      } catch {}
    };
    stream.onerror = () => {};
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const preferred = localStorage.getItem('quicktools-theme') || 'dark';
    applyTheme(preferred);

    $('#themeToggle').addEventListener('click', () => applyTheme(document.body.dataset.theme === 'light' ? 'dark' : 'light'));
    $('#menuButton').addEventListener('click', openDrawer);
    $('#drawerClose').addEventListener('click', closeDrawer);
    $('#drawerBackdrop').addEventListener('click', closeDrawer);
    $('#iframeClose').addEventListener('click', closeIframe);
    $('#iframeModal').addEventListener('click', event => { if (event.target.id === 'iframeModal') closeIframe(); });

    document.querySelectorAll('[data-route]').forEach(node => node.addEventListener('click', event => {
      const view = node.dataset.route;
      if (node.tagName === 'A' && node.target === '_blank') return;
      event.preventDefault();
      route(view);
    }));

    window.addEventListener('hashchange', () => route(location.hash.slice(1)));
    await fetchMenu();
    initMenuStream();
    route(location.hash.slice(1) || 'home');
  });
})();
    
