/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

export const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function deepMerge(target, src) {
  if (!isPlainObject(src)) return target;
  for (const [k, v] of Object.entries(src)) {
    if (isPlainObject(v) && isPlainObject(target[k])) deepMerge(target[k], v);
    else target[k] = v;
  }
  return target;
}

/* ---------- Angka & uang ---------- */
const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
export const num = (n) => nf.format(Math.round(Number(n) || 0));
export const rupiah = (n) => 'Rp ' + num(n);
export const parseMoney = (s) => {
  if (typeof s === 'number') return s;
  const d = String(s ?? '').replace(/[^\d]/g, '');
  return d ? Number(d) : 0;
};
const nfDec = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
export const numDec = (n) => nfDec.format(Number(n) || 0);

/** "2 unit" -> { qty: 2, unit: 'unit' }; "1,5 m" -> 1.5; "kg" -> qty 1. */
export function parseQty(text) {
  const m = String(text ?? '').trim().match(/^(\d+(?:[.,]\d+)?)?\s*(.*)$/);
  const unit = (m?.[2] || '').trim();
  const qty = m?.[1] ? parseFloat(m[1].replace(',', '.')) : unit ? 1 : 0;
  return { qty, unit };
}
export const fmtQty = (it) => `${numDec(it.qty)}${it.unit ? ' ' + it.unit : ''}`;

export const parseDecimal = (s) => {
  const v = parseFloat(String(s ?? '').replace(',', '.'));
  return Number.isFinite(v) ? v : 0;
};

/* ---------- Tanggal ---------- */
export const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const pad = (n, l = 2) => String(n).padStart(l, '0');

export function parseISO(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m) return null;
  return new Date(y, m - 1, d || 1);
}
export function toISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export const todayISO = () => toISO(new Date());
export const thisMonth = () => todayISO().slice(0, 7);

export function addDays(iso, days) {
  const d = parseISO(iso);
  if (!d) return '';
  d.setDate(d.getDate() + days);
  return toISO(d);
}

/** 13-Apr-23 */
export function fmtDateShort(iso) {
  const d = parseISO(iso);
  return d ? `${pad(d.getDate())}-${MON[d.getMonth()]}-${String(d.getFullYear()).slice(2)}` : '';
}
/** 4 Mar 2023 */
export function fmtDate(iso) {
  const d = parseISO(iso);
  return d ? `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}` : '';
}
/** 4 Maret 2023 */
export function fmtDateLong(iso) {
  const d = parseISO(iso);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '';
}
/** 2023-04 -> April 2023 */
export function fmtPeriod(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return m ? `${MONTHS[m - 1]} ${y}` : String(ym);
}

export function relTime(ts) {
  if (!ts) return 'belum pernah';
  const diff = Date.now() - ts;
  const day = 86400000;
  if (diff < 60000) return 'baru saja';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} menit lalu`;
  if (diff < day) return `${Math.floor(diff / 3600000)} jam lalu`;
  if (diff < day * 2) return 'kemarin';
  return `${Math.floor(diff / day)} hari lalu`;
}

/* ---------- Lain-lain ---------- */
export function debounce(fn, ms = 250) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export function safeFileName(s) {
  return String(s || 'invoice').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').slice(0, 80);
}

/** 0812-xxx -> 62812xxx untuk wa.me */
export function waNumber(phone) {
  let d = String(phone || '').replace(/[^\d]/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d;
}

export function readFileAsText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsText(file);
  });
}

export function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

/** Perkecil gambar (logo) agar database tetap ringan. */
export async function shrinkImage(dataUrl, max = 480) {
  const img = await loadImage(dataUrl);
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * s));
  const h = Math.max(1, Math.round(img.naturalHeight * s));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return c.toDataURL('image/png');
}

export function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

export function pickFile(accept) {
  return new Promise((res) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.onchange = () => {
      res(input.files?.[0] || null);
      input.remove();
    };
    document.body.appendChild(input);
    input.click();
  });
}

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
