/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Pembaruan aplikasi: daftarkan service worker, cek versi baru, dan tampilkan
 * pop-up WAJIB muat ulang bila versi baru sudah terunduh (tidak bisa ditutup),
 * agar tidak ada perangkat yang tertinggal di versi lama. */
import { icon } from './icons.js';
import { APP_VERSION } from './state.js';

const CHECK_EVERY = 60 * 60 * 1000; // cek berkala saat aplikasi terbuka
const CHECK_ON_RETURN = 5 * 60 * 1000; // cek saat aplikasi dibuka lagi, paling sering tiap 5 menit

let hooks = { unsaved: () => false, flush: async () => {} };
let gate = null;
let reloading = false;

// Tanya versi ke service worker baru (dijawab lewat MessageChannel); kosong bila tidak menjawab.
function askVersion(worker) {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve(''), 1000);
    ch.port1.onmessage = (e) => {
      clearTimeout(t);
      resolve(String(e.data || '').replace(/^snapbill-v/, ''));
    };
    try {
      worker.postMessage('version', [ch.port2]);
    } catch {
      clearTimeout(t);
      resolve('');
    }
  });
}

// Simpan pekerjaan yang sedang diisi, lalu muat ulang (sekali saja).
async function reloadNow() {
  if (reloading) return;
  reloading = true;
  try {
    await hooks.flush();
  } catch (err) {
    console.warn('Gagal menyimpan sebelum muat ulang', err);
  }
  location.reload();
}

async function showGate(worker) {
  if (gate) return;
  const unsaved = hooks.unsaved();
  gate = document.createElement('div');
  gate.className = 'update-gate';
  gate.setAttribute('role', 'alertdialog');
  gate.setAttribute('aria-modal', 'true');
  gate.setAttribute('aria-labelledby', 'upd-title');
  gate.setAttribute('aria-describedby', 'upd-msg');
  gate.innerHTML = `
    <div class="update-card">
      <img class="update-logo" src="icons/logo.svg" width="64" height="64" alt="">
      <span class="update-badge">${icon('sparkle', 14)} Pembaruan wajib</span>
      <h2 id="upd-title">Versi baru SnapBill tersedia</h2>
      <p class="update-ver" hidden></p>
      <p id="upd-msg">Muat ulang sekarang agar aplikasi tetap berjalan benar. Semua data Anda aman tersimpan di perangkat ini.</p>
      ${unsaved ? `<p class="update-note">${icon('info', 16)}<span>Dokumen yang sedang Anda isi akan <b>disimpan otomatis sebagai draft</b>, lalu dibuka kembali.</span></p>` : ''}
      <button type="button" class="btn btn-primary btn-block update-go">${icon('refresh', 18)} <span>Muat ulang sekarang</span></button>
    </div>`;
  document.body.appendChild(gate);
  // Bagian lain aplikasi tidak bisa diklik/difokus selama pop-up tampil.
  for (const id of ['app', 'lock', 'sheets', 'render-root']) {
    const el = document.getElementById(id);
    if (el) el.inert = true;
  }
  document.activeElement?.blur?.();
  requestAnimationFrame(() => gate.classList.add('in'));
  const go = gate.querySelector('.update-go');
  go.focus();
  go.onclick = async () => {
    go.disabled = true;
    go.querySelector('span').textContent = 'Memuat ulang…';
    try {
      await hooks.flush();
    } catch (err) {
      console.warn('Gagal menyimpan sebelum muat ulang', err);
    }
    hooks.flush = async () => {}; // sudah disimpan; jangan dua kali
    // Aktifkan versi baru → 'controllerchange' → muat ulang. Cadangan bila event tak kunjung datang.
    worker.postMessage('skipWaiting');
    setTimeout(reloadNow, 4000);
  };

  const ver = await askVersion(worker);
  if (ver && gate) {
    const p = gate.querySelector('.update-ver');
    p.innerHTML = ver !== APP_VERSION ? `Versi ${APP_VERSION} → <b>${ver}</b>` : `Versi <b>${ver}</b>`;
    p.hidden = false;
  }
}

/**
 * Daftarkan service worker & pantau versi baru.
 * opts.unsaved() → true bila ada isian yang belum disimpan; opts.flush() → simpan isian itu sebelum dimuat ulang.
 */
export function registerSW(opts = {}) {
  hooks = { ...hooks, ...opts };
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const sw = navigator.serviceWorker;
  const hadController = !!sw.controller;

  // Versi baru aktif (dari tab ini atau tab lain) → semua tab versi lama dimuat ulang.
  sw.addEventListener('controllerchange', () => {
    if (hadController) reloadNow();
  });

  sw.register('sw.js')
    .then((reg) => {
      const watch = (w) => {
        if (!w) return;
        const check = () => w.state === 'installed' && sw.controller && showGate(w);
        check();
        w.addEventListener('statechange', check);
      };
      // Versi baru sudah terunduh sebelumnya tapi belum dipakai (mis. aplikasi ditutup saat itu).
      if (reg.waiting && sw.controller) showGate(reg.waiting);
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));

      let lastCheck = Date.now();
      const update = () => {
        lastCheck = Date.now();
        reg.update().catch(() => {});
      };
      setInterval(update, CHECK_EVERY);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - lastCheck > CHECK_ON_RETURN) update();
      });
      window.addEventListener('online', update);
    })
    .catch((err) => console.warn('SW gagal didaftarkan', err));
}
