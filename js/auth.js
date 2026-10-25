/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * PIN disimpan sebagai hash PBKDF2-SHA256 + salt acak; PIN asli tidak pernah disimpan. */
import { meta, db } from './db.js';
import { $, esc } from './util.js';
import { icon } from './icons.js';
import { sheet, toast, closeAllSheets } from './ui.js';
import { getSettings } from './state.js';

const ITERATIONS = 150000;
const MAX_TRIES = 5;
const ACTIVE_KEY = 'sb_last_active';

const b64e = (bytes) => btoa(String.fromCharCode(...bytes));
const b64d = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

async function derive(pin, saltB64, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: b64d(saltB64), iterations, hash: 'SHA-256' }, key, 256);
  return b64e(new Uint8Array(bits));
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function hasPin() {
  return !!(await meta.get('pin'));
}

export async function setPin(pin) {
  const salt = b64e(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await derive(pin, salt);
  await meta.set('pin', { salt, hash, len: pin.length, iterations: ITERATIONS });
  await meta.set('lockout', { fails: 0, until: 0 });
}

export async function verifyPin(pin) {
  const p = await meta.get('pin');
  if (!p) return false;
  return safeEqual(await derive(pin, p.salt, p.iterations || ITERATIONS), p.hash);
}

/* ---------- Status aktif / kunci otomatis ---------- */
let locked = false;
let lastActive = Date.now();
let hiddenAt = 0;

const lockMs = () => Math.max(1, Number(getSettings().security?.lockMinutes) || 5) * 60000;

function touch() {
  lastActive = Date.now();
  try {
    sessionStorage.setItem(ACTIVE_KEY, String(lastActive));
  } catch {}
}

/** Saat aplikasi dibuka ulang: perlu PIN jika sesi sebelumnya sudah lewat batas waktu. */
export function needsUnlockOnLoad() {
  let t = 0;
  try {
    t = Number(sessionStorage.getItem(ACTIVE_KEY)) || 0;
  } catch {}
  return !t || Date.now() - t > lockMs();
}

export function startIdleWatch() {
  let throttle = 0;
  const onActivity = () => {
    if (locked) return;
    const now = Date.now();
    if (now - throttle > 5000) {
      throttle = now;
      touch();
    } else lastActive = now;
  };
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((ev) =>
    window.addEventListener(ev, onActivity, { passive: true, capture: true })
  );
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      if (!locked) touch(); // saat terkunci jangan perbarui sesi, agar muat ulang tetap minta PIN
    } else if (hiddenAt && Date.now() - hiddenAt > lockMs()) lockNow();
  });
  setInterval(() => {
    if (!locked && Date.now() - lastActive > lockMs()) lockNow();
  }, 10000);
  touch();
}

export async function lockNow(opts = {}) {
  if (locked) return;
  locked = true;
  // Tanpa ini, memuat ulang halaman saat terkunci melewati PIN (sesi dianggap masih aktif).
  try {
    sessionStorage.setItem(ACTIVE_KEY, '0');
  } catch {}
  closeAllSheets();
  document.body.classList.add('is-locked');
  if (opts.splash) await splashScreen(opts.splash);
  await unlockScreen(opts.splash ? {} : opts);
  locked = false;
  document.body.classList.remove('is-locked');
  touch();
}

const isMobileDevice = () => /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isIOSDevice = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

/** Petunjuk menutup sesuai perangkat, dipakai bila browser/HP menolak ditutup lewat tombol. */
function closeHint() {
  const mac = /mac/i.test(navigator.platform);
  if (isInstalled()) {
    if (isIOSDevice()) return 'Data aman & terkunci. Geser ke atas dari bawah layar untuk menutup SnapBill.';
    if (isMobileDevice()) return 'Data aman & terkunci. Tekan tombol Kembali atau geser SnapBill dari daftar aplikasi untuk menutup.';
    return 'Data aman & terkunci. Tutup jendela dengan tombol × di pojok jendela.';
  }
  if (isMobileDevice()) return 'Data aman & terkunci. Tutup tab ini dari daftar tab di browser Anda.';
  return `Data aman & terkunci. Tutup tab ini dengan ${mac ? '⌘ + W' : 'Ctrl + W'}.`;
}

/**
 * Tombol ✕: kunci aplikasi lalu coba tutup tab/jendela.
 * Browser hanya mengizinkan window.close() pada kondisi tertentu (mis. jendela aplikasi desktop);
 * bila ditolak, layar kunci tetap tampil dengan petunjuk cara menutup.
 */
export async function exitApp() {
  try {
    sessionStorage.setItem(ACTIVE_KEY, '0');
  } catch {}
  try {
    window.close();
  } catch {}
  await new Promise((r) => setTimeout(r, 300));
  if (window.closed) return;
  await lockNow({ splash: closeHint() });
}

/** Layar pembuka SnapBill (dipakai bila tab/aplikasi tidak bisa ditutup). Resolve saat "Masuk" ditekan. */
function splashScreen(hint) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'splash-screen';
    el.innerHTML = `
      <div class="splash-inner">
        <img class="splash-logo" src="icons/logo.svg" alt="" width="104" height="104">
        <h1 class="splash-name">SnapBill</h1>
        <div class="splash-by">by Silsilara</div>
        <p class="splash-tag">Tagihan rapi, terkirim dalam hitungan detik.</p>
        <button type="button" class="btn btn-lg splash-go">Masuk</button>
        <p class="splash-hint">${esc(hint)}</p>
      </div>
      <div class="splash-copy">© 2026 Risyad Abdala Ramadhan</div>`;
    $('#lock').appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    const go = el.querySelector('.splash-go');
    go.addEventListener('click', () => {
      el.classList.remove('in');
      setTimeout(() => el.remove(), 200);
      resolve();
    });
    setTimeout(() => go.focus(), 250);
  });
}

export const isLocked = () => locked;

/* ---------- Layar PIN ---------- */

/**
 * Tampilkan keypad PIN. Mengembalikan elemen & kontrol.
 * opts.length: panjang tetap (auto-submit) atau null (4–6 digit, tombol OK).
 */
function pinScreen({ title, subtitle = '', length = null, onSubmit, footer = '', onFooter, onCancel }) {
  const root = $('#lock');
  const el = document.createElement('div');
  el.className = 'pin-screen';
  const slots = length || 6;
  el.innerHTML = `
    <div class="pin-inner">
      ${onCancel ? `<button type="button" class="icon-btn pin-cancel" aria-label="Batal">${icon('close')}</button>` : ''}
      <img class="pin-logo" src="icons/icon-192.png" alt="" width="64" height="64">
      <h1 class="pin-title">${esc(title)}</h1>
      <p class="pin-sub">${esc(subtitle)}</p>
      <div class="pin-dots" aria-hidden="true">${'<i></i>'.repeat(slots)}</div>
      <p class="pin-msg" role="alert"></p>
      <div class="pin-pad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-k="${n}">${n}</button>`).join('')}
        <button type="button" class="pin-ok" data-k="ok" ${length ? 'style="visibility:hidden"' : ''} disabled>OK</button>
        <button type="button" data-k="0">0</button>
        <button type="button" class="pin-del" data-k="del" aria-label="Hapus">${icon('backspace', 26)}</button>
      </div>
      ${footer ? `<button type="button" class="link pin-foot">${esc(footer)}</button>` : ''}
    </div>`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));

  let pin = '';
  let busy = false;
  const dots = [...el.querySelectorAll('.pin-dots i')];
  const msg = el.querySelector('.pin-msg');
  const ok = el.querySelector('.pin-ok');

  const paint = () => {
    dots.forEach((d, i) => d.classList.toggle('on', i < pin.length));
    if (!length) dots.forEach((d, i) => d.classList.toggle('opt', i >= 4 && i >= pin.length));
    ok.disabled = pin.length < 4;
  };
  const setMsg = (t, kind = 'err') => {
    msg.textContent = t || '';
    msg.className = 'pin-msg ' + kind;
  };
  const shake = () => {
    el.querySelector('.pin-dots').classList.remove('shake');
    void el.offsetWidth;
    el.querySelector('.pin-dots').classList.add('shake');
    navigator.vibrate?.(120);
  };
  const submit = async () => {
    if (busy) return;
    busy = true;
    el.classList.add('checking');
    const res = await onSubmit(pin, { setMsg, shake });
    el.classList.remove('checking');
    busy = false;
    if (res !== true) {
      pin = '';
      paint();
    }
  };
  const press = (k) => {
    if (busy) return;
    if (k === 'del') pin = pin.slice(0, -1);
    else if (k === 'ok') {
      if (pin.length >= 4) submit();
      return;
    } else if (/^\d$/.test(k) && pin.length < slots) {
      pin += k;
      setMsg('');
    }
    paint();
    if (length && pin.length === length) setTimeout(submit, 90);
  };
  el.querySelector('.pin-pad').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b) press(b.dataset.k);
  });
  const onKey = (e) => {
    if (el !== root.lastElementChild) return;
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('del');
    else if (e.key === 'Enter') press('ok');
    else if (e.key === 'Escape' && onCancel) onCancel();
  };
  document.addEventListener('keydown', onKey);
  el.querySelector('.pin-foot')?.addEventListener('click', () => onFooter?.());
  el.querySelector('.pin-cancel')?.addEventListener('click', () => onCancel?.());
  paint();

  return {
    el,
    setMsg,
    close() {
      document.removeEventListener('keydown', onKey);
      el.classList.remove('in');
      setTimeout(() => el.remove(), 200);
    },
  };
}

/** Buat PIN baru (dengan konfirmasi). Resolve setelah tersimpan. */
export function createPinFlow({ title = 'Buat PIN Anda', subtitle = 'Pilih 4–6 digit angka untuk mengunci SnapBill.', cancellable = false } = {}) {
  return new Promise((resolve) => {
    let first = null;
    let scr;
    const step1 = () => {
      scr = pinScreen({
        title,
        subtitle,
        length: null,
        onCancel: cancellable
          ? () => {
              scr.close();
              resolve(false);
            }
          : null,
        onSubmit: async (pin) => {
          first = pin;
          scr.close();
          step2();
          return true;
        },
      });
    };
    const step2 = () => {
      scr = pinScreen({
        title: 'Ulangi PIN',
        subtitle: `Masukkan ${first.length} digit PIN yang sama sekali lagi.`,
        length: first.length,
        onCancel: cancellable
          ? () => {
              scr.close();
              resolve(false);
            }
          : null,
        onSubmit: async (pin, { setMsg, shake }) => {
          if (pin !== first) {
            shake();
            setMsg('PIN tidak sama. Ulangi dari awal.');
            setTimeout(() => {
              scr.close();
              step1();
            }, 900);
            return false;
          }
          await setPin(pin);
          scr.close();
          resolve(true);
          return true;
        },
      });
    };
    step1();
  });
}

async function lockoutState() {
  return (await meta.get('lockout')) || { fails: 0, until: 0 };
}

/** Layar buka kunci. Resolve saat PIN benar. */
export function unlockScreen({ title = 'Masukkan PIN', subtitle = 'SnapBill terkunci untuk menjaga privasi data Anda.', cancellable = false } = {}) {
  return new Promise(async (resolve) => {
    const p = await meta.get('pin');
    let scr;
    let timer;
    const showWait = async () => {
      const st = await lockoutState();
      const left = Math.ceil((st.until - Date.now()) / 1000);
      if (left > 0) {
        scr.setMsg(`Terlalu banyak percobaan. Coba lagi dalam ${left} detik.`);
        scr.el.classList.add('wait');
        clearTimeout(timer);
        timer = setTimeout(showWait, 1000);
      } else {
        scr.el.classList.remove('wait');
        scr.setMsg('');
      }
    };
    scr = pinScreen({
      title,
      subtitle,
      length: p?.len || 6,
      footer: cancellable ? '' : 'Lupa PIN?',
      onFooter: () => forgotPin(),
      onCancel: cancellable
        ? () => {
            clearTimeout(timer);
            scr.close();
            resolve(false);
          }
        : null,
      onSubmit: async (pin, { setMsg, shake }) => {
        const st = await lockoutState();
        if (st.until > Date.now()) {
          showWait();
          return false;
        }
        if (await verifyPin(pin)) {
          await meta.set('lockout', { fails: 0, until: 0 });
          clearTimeout(timer);
          scr.close();
          resolve(true);
          return true;
        }
        const fails = st.fails + 1;
        let until = 0;
        if (fails % MAX_TRIES === 0) {
          const round = fails / MAX_TRIES;
          until = Date.now() + Math.min(15 * 60, 30 * 2 ** (round - 1)) * 1000;
        }
        await meta.set('lockout', { fails, until });
        shake();
        if (until) showWait();
        else setMsg(`PIN salah. Sisa ${MAX_TRIES - (fails % MAX_TRIES)} percobaan.`);
        return false;
      },
    });
    showWait();
  });
}

function forgotPin() {
  const s = sheet({
    title: 'Lupa PIN?',
    content: `
      <p class="sheet-msg">Demi privasi, PIN tidak bisa dipulihkan karena semua data hanya tersimpan di perangkat ini.</p>
      <p class="sheet-msg">Satu-satunya cara adalah <b>reset aplikasi</b>: seluruh data (tagihan, klien, layanan, pengaturan) di perangkat ini akan dihapus. Jika Anda punya file backup <code>.json</code>, data bisa dipulihkan lagi setelah reset.</p>
      <label class="fld"><span>Ketik <b>HAPUS</b> untuk melanjutkan</span><input id="wipe-confirm" autocomplete="off" autocapitalize="characters"></label>`,
    actions: [
      { label: 'Batal', kind: 'ghost', value: false },
      {
        label: 'Reset aplikasi',
        kind: 'danger',
        onClick: async ({ body }) => {
          if (body.querySelector('#wipe-confirm').value.trim().toUpperCase() !== 'HAPUS') {
            toast('Ketik HAPUS untuk konfirmasi', { type: 'error' });
            return false;
          }
          await db.wipe();
          try {
            sessionStorage.clear();
          } catch {}
          location.reload();
        },
      },
    ],
  });
  return s.result;
}
