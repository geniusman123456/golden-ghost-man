(() => {
  let deferredPrompt = null;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const key = 'gg_pwa_install_dismissed';

  function createBanner() {
    if (isStandalone || localStorage.getItem(key) === '1') return;
    if (document.getElementById('gg-install-banner')) return;
    const el = document.createElement('div');
    el.id = 'gg-install-banner';
    el.innerHTML = `
      <div class="gg-install-card" role="dialog" aria-label="Install Golden Ghost">
        <div class="gg-install-icon">GG</div>
        <div class="gg-install-copy"><strong>Golden Ghost</strong><span>Install as an app on this device.</span></div>
        <button id="gg-install-btn" type="button">Install</button>
        <button id="gg-install-close" type="button" aria-label="Close">×</button>
      </div>`;
    const style = document.createElement('style');
    style.textContent = `
      #gg-install-banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:99999;display:flex;justify-content:center;pointer-events:none}
      .gg-install-card{pointer-events:auto;max-width:720px;width:100%;display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid rgba(255,210,31,.35);border-radius:18px;background:rgba(10,10,10,.96);backdrop-filter:blur(18px);box-shadow:0 18px 55px rgba(0,0,0,.55);color:#fff;font-family:system-ui,sans-serif}
      .gg-install-icon{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:#ffd21f;color:#090909;font-weight:1000}
      .gg-install-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px}.gg-install-copy span{font-size:12px;color:#a9abad}
      #gg-install-btn{border:0;border-radius:10px;padding:10px 14px;background:#ffd21f;color:#090909;font-weight:900;cursor:pointer}.gg-install-card button:last-child{border:0;background:transparent;color:#aaa;font-size:22px;cursor:pointer}
      @media(max-width:520px){.gg-install-card{padding:10px}.gg-install-copy span{font-size:11px}.gg-install-copy strong{font-size:14px}}
    `;
    document.head.appendChild(style);
    document.body.appendChild(el);
    const btn = document.getElementById('gg-install-btn');
    btn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        try { await deferredPrompt.userChoice; } catch (_) {}
        deferredPrompt = null;
        el.remove();
      } else if (isIOS) {
        btn.textContent = 'Share → Add to Home Screen';
        btn.disabled = true;
      } else {
        btn.textContent = 'Use browser menu → Install app';
      }
    });
    document.getElementById('gg-install-close').addEventListener('click', () => {
      localStorage.setItem(key, '1');
      el.remove();
    });
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    createBanner();
  });
  window.addEventListener('appinstalled', () => {
    localStorage.removeItem(key);
    document.getElementById('gg-install-banner')?.remove();
  });
  window.addEventListener('load', () => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    setTimeout(createBanner, 900);
  });
})();
