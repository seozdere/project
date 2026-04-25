(function () {
    if (typeof window === 'undefined') return;

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) return;

    const hint = document.getElementById('pwaHint');
    let deferredPrompt = null;
    let banner = null;

    function ensureBanner() {
        if (banner) return banner;

        banner = document.createElement('div');
        banner.id = 'codexPwaBanner';
        banner.style.cssText = [
            'position:fixed',
            'left:16px',
            'right:16px',
            'bottom:16px',
            'z-index:9999',
            'display:none',
            'align-items:center',
            'gap:12px',
            'padding:14px 16px',
            'border-radius:18px',
            'background:linear-gradient(135deg,#0f172a,#1d4ed8)',
            'color:#fff',
            'box-shadow:0 16px 40px rgba(2,6,23,.45)',
            'border:1px solid rgba(255,255,255,.12)'
        ].join(';');

        banner.innerHTML = `
            <div style="flex:1;min-width:0;">
                <div style="font-weight:800;font-size:.92rem;">Uygulama gibi yukle</div>
                <div style="font-size:.78rem;opacity:.82;line-height:1.45;">Ana ekrana ekleyip tam ekran kullanabilirsiniz.</div>
            </div>
            <button id="codexPwaInstallBtn" style="border:none;border-radius:12px;padding:10px 14px;background:#fff;color:#1d4ed8;font-weight:800;cursor:pointer;">Yukle</button>
            <button id="codexPwaCloseBtn" style="border:none;background:transparent;color:rgba(255,255,255,.78);font-size:1.2rem;cursor:pointer;padding:4px 6px;">×</button>
        `;

        document.body.appendChild(banner);

        const installBtn = banner.querySelector('#codexPwaInstallBtn');
        const closeBtn = banner.querySelector('#codexPwaCloseBtn');

        if (installBtn) {
            installBtn.addEventListener('click', async () => {
                if (!deferredPrompt) return;
                deferredPrompt.prompt();
                const choice = await deferredPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
                if (choice?.outcome === 'accepted' && hint) {
                    hint.textContent = 'Uygulama ana ekrana eklendi.';
                }
                deferredPrompt = null;
                banner.style.display = 'none';
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                banner.style.display = 'none';
            });
        }

        return banner;
    }

    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        deferredPrompt = event;
        ensureBanner().style.display = 'flex';
        if (hint) hint.textContent = 'Bu sayfayi telefona uygulama gibi yukleyebilirsiniz.';
    });

    window.addEventListener('appinstalled', () => {
        if (banner) banner.style.display = 'none';
        if (hint) hint.textContent = 'Uygulama yüklendi.';
    });
})();
