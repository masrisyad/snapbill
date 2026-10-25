/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Titik masuk aplikasi: onboarding, kunci PIN, router, dan kerangka tampilan. */
import { $, esc, isStandalone } from './util.js';
import { icon } from './icons.js';
import { loadSettings } from './state.js';
import { hasPin, createPinFlow, needsUnlockOnLoad, unlockScreen, startIdleWatch, lockNow, exitApp } from './auth.js';
import { closeAllSheets } from './ui.js';
import { closeCombo } from './combo.js';
import { migrateStatuses } from './invoice-model.js';
import { applyMode } from './mode.js';
import { registerSW } from './update.js';
import './pwa.js';
import { onboardingProfile } from './views/onboarding.js';
import * as dashboard from './views/dashboard.js';
import * as invoices from './views/invoices.js';
import * as editor from './views/editor.js';
import * as viewer from './views/viewer.js';
import * as master from './views/master.js';
import * as settings from './views/settings.js';

/* ---------- Router ---------- */
const ROUTES = [
  { re: /^\/?$/, id: 'dashboard', view: dashboard, nav: 'home', fab: true },
  { re: /^\/tagihan\/?$/, id: 'invoices', view: invoices, nav: 'bills', fab: true },
  { re: /^\/tagihan\/baru$/, id: 'editor', view: editor, nav: 'bills', back: '#/tagihan' },
  { re: /^\/tagihan\/([^/]+)\/ubah$/, id: 'editor', view: editor, nav: 'bills', keys: ['id'] },
  { re: /^\/tagihan\/([^/]+)$/, id: 'viewer', view: viewer, nav: 'bills', back: '#/tagihan', keys: ['id'] },
  { re: /^\/master\/?$/, id: 'master', view: master, nav: 'master' },
  { re: /^\/pengaturan\/?$/, id: 'settings', view: settings, nav: 'settings' },
];

let current = null; // { route, instance, hash }
let suppressNext = false;

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs)) };
}

async function navigate() {
  if (suppressNext) {
    suppressNext = false;
    return;
  }
  const prevHash = current?.hash;
  if (current?.instance?.guard && location.hash !== prevHash) {
    const ok = await current.instance.guard();
    if (!ok) {
      suppressNext = true;
      location.hash = prevHash;
      return;
    }
  }
  closeAllSheets();
  closeCombo();
  current?.instance?.destroy?.();

  const { path, query } = parseHash();
  let route = ROUTES.find((r) => r.re.test(path));
  if (!route) {
    location.replace('#/');
    return;
  }
  const m = path.match(route.re);
  const params = {};
  (route.keys || []).forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));

  const main = $('#view');
  main.innerHTML = '';
  main.className = 'view view-' + route.id;
  document.body.classList.toggle('show-fab', !!route.fab);
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === route.nav));
  setBack(route.back || null);
  setActions('');

  const ctx = {
    el: main,
    params,
    query,
    setTitle,
    setActions,
    setBack,
    go: (h) => (location.hash = h),
  };
  current = { route, instance: null, hash: location.hash || '#/' };
  try {
    current.instance = (await route.view.render(ctx)) || null;
  } catch (err) {
    console.error(err);
    main.innerHTML = `<div class="card error-card"><b>Terjadi kesalahan.</b><br>${esc(err.message || err)}</div>`;
  }
  window.scrollTo(0, 0);
}

function setTitle(t) {
  $('.tb-title').textContent = t;
  document.title = t ? `${t} · SnapBill` : 'SnapBill by Silsilara';
}
function setActions(html, bind) {
  const box = $('.tb-actions');
  box.innerHTML = html || '';
  bind?.(box);
}
function setBack(href) {
  const b = $('.tb-back');
  b.hidden = !href;
  $('.tb-brand').hidden = !!href;
  b.onclick = () => {
    if (href === true) history.back();
    else location.hash = href;
  };
}

/* ---------- Kerangka ---------- */
function shell() {
  $('#app').innerHTML = `
  <div class="shell">
    <header class="topbar">
      <button type="button" class="icon-btn tb-back" aria-label="Kembali" hidden>${icon('back', 24)}</button>
      <a class="tb-brand" role="link" tabindex="0" data-href="#/" aria-label="Beranda"><img src="icons/icon-192.png" alt="" width="30" height="30"></a>
      <h1 class="tb-title"></h1>
      <div class="tb-actions"></div>
      <button type="button" class="icon-btn tb-lock" aria-label="Kunci aplikasi" title="Kunci aplikasi">${icon('lock', 21)}<span class="tb-label">Kunci</span></button>
      <button type="button" class="icon-btn tb-exit" aria-label="Tutup aplikasi" title="Kunci & tutup aplikasi">${icon('close', 22)}<span class="tb-label">Tutup</span></button>
    </header>
    <nav class="nav" aria-label="Navigasi utama">
      <div class="nav-brand"><img src="icons/icon-192.png" alt="" width="36" height="36"><div><b>SnapBill</b><small>by Silsilara</small></div></div>
      <a role="link" tabindex="0" data-href="#/" data-nav="home">${icon('home')}<span>Beranda</span></a>
      <a role="link" tabindex="0" data-href="#/tagihan" data-nav="bills">${icon('bills')}<span>Tagihan</span></a>
      <a role="link" tabindex="0" data-href="#/master" data-nav="master">${icon('users')}<span>Master</span></a>
      <a role="link" tabindex="0" data-href="#/pengaturan" data-nav="settings">${icon('settings')}<span>Pengaturan</span></a>
      <a class="nav-new" role="link" tabindex="0" data-href="#/tagihan/baru">${icon('plus')}<span>Tagihan baru</span></a>
    </nav>
    <main id="view" class="view"></main>
    <a class="fab" role="link" tabindex="0" data-href="#/tagihan/baru" aria-label="Buat tagihan baru">${icon('plus', 30)}<span class="fab-label">Buat baru</span></a>
  </div>`;
  $('.tb-lock').onclick = () => lockNow();
  $('.tb-exit').onclick = () => exitApp();
}

/* Tautan internal memakai data-href (bukan href) agar browser tidak memunculkan
 * alamat "localhost/#/…" di pojok kiri bawah saat kursor lewat — terasa seperti aplikasi, bukan situs. */
function followLink(e) {
  const a = e.target.closest?.('[data-href]');
  if (!a || e.defaultPrevented || a.closest('[inert]')) return;
  if (e.type === 'keydown' && e.key !== 'Enter') return;
  e.preventDefault();
  const to = a.dataset.href;
  if (location.hash !== to) location.hash = to;
}
document.addEventListener('click', followLink);
document.addEventListener('keydown', followLink);

function startApp() {
  applyMode();
  shell();
  startIdleWatch();
  window.addEventListener('hashchange', navigate);
  navigate();
  navigator.storage?.persist?.().catch(() => {});
}

/* ---------- Boot ---------- */
async function boot() {
  // Pop-up wajib muat ulang saat ada versi baru; isian yang belum disimpan ikut diamankan dulu.
  registerSW({
    unsaved: () => !!current?.instance?.unsaved?.(),
    flush: async () => {
      const hash = await current?.instance?.flush?.();
      if (hash) history.replaceState(null, '', hash);
    },
  });
  if (!window.isSecureContext || !crypto?.subtle) {
    $('#app').innerHTML = `<div class="boot-error"><b>SnapBill perlu dibuka lewat HTTPS.</b><p>Buka melalui alamat GitHub Pages (https://…) atau localhost.</p></div>`;
    return;
  }
  try {
    await loadSettings();
    applyMode();
    await migrateStatuses();
  } catch (err) {
    $('#app').innerHTML = `<div class="boot-error"><b>Penyimpanan lokal tidak tersedia.</b><p>${esc(err.message || err)}</p><p>Pastikan tidak sedang memakai mode penyamaran/private.</p></div>`;
    return;
  }

  if (!(await hasPin())) {
    await welcome();
    await createPinFlow();
    await onboardingProfile();
    startApp();
    return;
  }
  if (needsUnlockOnLoad()) {
    document.body.classList.add('is-locked');
    await unlockScreen();
    document.body.classList.remove('is-locked');
  }
  startApp();
}

function welcome() {
  return new Promise((resolve) => {
    $('#app').innerHTML = `
    <div class="welcome">
      <div class="welcome-card">
        <img src="icons/icon-512.png" alt="" width="96" height="96" class="welcome-logo">
        <h1>SnapBill <span>by Silsilara</span></h1>
        <p class="welcome-lead">Buat tagihan rapi, simpan, dan kirim lewat WhatsApp dalam hitungan detik.</p>
        <ul class="welcome-list">
          <li>${icon('shield', 20)}<span><b>Privat & offline</b> — data hanya tersimpan di perangkat ini, dikunci PIN.</span></li>
          <li>${icon('send', 20)}<span><b>Siap kirim</b> — PDF, gambar, atau WhatsApp sekali ketuk.</span></li>
          <li>${icon('database', 20)}<span><b>Pindah perangkat mudah</b> — backup & restore satu file .json.</span></li>
        </ul>
        <button type="button" class="btn btn-primary btn-lg btn-block" id="start">Mulai — buat PIN</button>
        <p class="welcome-foot">${isStandalone() ? '' : 'Tip: pasang ke layar utama agar terasa seperti aplikasi.'}</p>
      </div>
      <div class="copy">© 2026 Risyad Abdala Ramadhan. Hak cipta dilindungi undang-undang.</div>
    </div>`;
    $('#start').onclick = () => {
      $('#app').innerHTML = '';
      resolve();
    };
  });
}

boot();

