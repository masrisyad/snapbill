/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Service worker: simpan seluruh aplikasi di cache agar terbuka instan & bisa offline.
 * Naikkan VERSION setiap rilis agar pengguna menerima pembaruan. */
const VERSION = 'snapbill-v1.0.0';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './css/invoice.css',
  './css/modes.css',
  './js/app.js',
  './js/auth.js',
  './js/backup.js',
  './js/combo.js',
  './js/db.js',
  './js/excel-import.js',
  './js/export.js',
  './js/icons.js',
  './js/invoice-model.js',
  './js/mode.js',
  './js/pwa.js',
  './js/sample.js',
  './js/state.js',
  './js/templates.js',
  './js/ui.js',
  './js/update.js',
  './js/util.js',
  './js/xlsx-reader.js',
  './js/views/business-form.js',
  './js/views/dashboard.js',
  './js/views/editor.js',
  './js/views/excel-import-ui.js',
  './js/views/insights.js',
  './js/views/invoices.js',
  './js/views/master.js',
  './js/views/onboarding.js',
  './js/views/settings.js',
  './js/views/shared.js',
  './js/views/viewer.js',
  './vendor/html2canvas.min.js',
  './vendor/jspdf.umd.min.js',
  './fonts/barlow-semi-condensed-latin-400-normal.woff2',
  './fonts/barlow-semi-condensed-latin-500-normal.woff2',
  './fonts/barlow-semi-condensed-latin-600-normal.woff2',
  './fonts/barlow-semi-condensed-latin-700-normal.woff2',
  './fonts/fredoka-latin-600-normal.woff2',
  './fonts/plus-jakarta-sans-latin-400-normal.woff2',
  './fonts/plus-jakarta-sans-latin-500-normal.woff2',
  './fonts/plus-jakarta-sans-latin-600-normal.woff2',
  './fonts/plus-jakarta-sans-latin-700-normal.woff2',
  './fonts/plus-jakarta-sans-latin-800-normal.woff2',
  './icons/logo.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './templates/snapbill-template-data-master.xlsx',
  './templates/snapbill-template-lengkap.xlsx',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('snapbill-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data === 'version') event.ports[0]?.postMessage(VERSION);
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigasi: selalu sajikan index.html dari cache (aplikasi satu halaman).
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html', { ignoreSearch: true }).then((hit) => hit || fetch(req))
    );
    return;
  }

  // Aset: cache dulu, jika tidak ada ambil dari jaringan lalu simpan.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
