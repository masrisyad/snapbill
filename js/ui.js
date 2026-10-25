/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved. */
import { $, esc } from './util.js';
import { icon } from './icons.js';

/* ---------- Toast ---------- */
export function toast(message, { type = 'info', timeout = 2800, action } = {}) {
  const root = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  const close = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 250);
  };
  if (action) {
    el.querySelector('button').onclick = () => {
      action.onClick?.();
      close();
    };
  }
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  if (timeout) setTimeout(close, timeout);
  return close;
}

/* ---------- Sheet / dialog ---------- */
let openSheets = 0;

/**
 * Bottom sheet di HP, dialog di layar lebar.
 * content: string HTML atau Node. actions: [{label, kind, value, onClick}]
 * Mengembalikan { el, body, close, result } — result = Promise nilai tombol / null.
 */
export function sheet({ title = '', content = '', actions = [], dismissible = true, size = '' } = {}) {
  const root = $('#sheets');
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet-backdrop"></div>
    <div class="sheet ${size ? 'sheet-' + size : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grip"></div>
      ${title || dismissible ? `<div class="sheet-head"><h2>${esc(title)}</h2>${dismissible ? `<button type="button" class="icon-btn sheet-x" aria-label="Tutup">${icon('close')}</button>` : ''}</div>` : ''}
      <div class="sheet-body"></div>
      ${actions.length ? '<div class="sheet-actions"></div>' : ''}
    </div>`;
  const body = wrap.querySelector('.sheet-body');
  if (typeof content === 'string') body.innerHTML = content;
  else if (content) body.appendChild(content);

  let resolveFn;
  const result = new Promise((r) => (resolveFn = r));
  let closed = false;
  const close = (value = null) => {
    if (closed) return;
    closed = true;
    wrap.classList.remove('in');
    document.removeEventListener('keydown', onKey);
    openSheets = Math.max(0, openSheets - 1);
    if (!openSheets) document.body.classList.remove('no-scroll');
    setTimeout(() => wrap.remove(), 220);
    resolveFn(value);
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && dismissible && wrap === root.lastElementChild) close(null);
  };

  if (actions.length) {
    const bar = wrap.querySelector('.sheet-actions');
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn btn-${a.kind || 'ghost'}`;
      b.innerHTML = a.html || esc(a.label);
      b.onclick = async () => {
        if (a.onClick) {
          const r = await a.onClick({ close, body });
          if (r === false) return;
        }
        close(a.value ?? a.label);
      };
      bar.appendChild(b);
    });
  }
  if (dismissible) {
    wrap.querySelector('.sheet-backdrop').onclick = () => close(null);
    wrap.querySelector('.sheet-x')?.addEventListener('click', () => close(null));
  }
  document.addEventListener('keydown', onKey);
  root.appendChild(wrap);
  openSheets++;
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => wrap.classList.add('in'));
  return { el: wrap, body, close, result };
}

export function closeAllSheets() {
  document.querySelectorAll('#sheets .sheet-wrap').forEach((w) => w.remove());
  openSheets = 0;
  document.body.classList.remove('no-scroll');
}

export function confirmDialog({ title = 'Konfirmasi', message = '', ok = 'Ya', cancel = 'Batal', danger = false } = {}) {
  const s = sheet({
    title,
    content: `<p class="sheet-msg">${message}</p>`,
    actions: [
      { label: cancel, kind: 'ghost', value: false },
      { label: ok, kind: danger ? 'danger' : 'primary', value: true },
    ],
  });
  return s.result.then((v) => v === true);
}

export function busy(message = 'Memproses…') {
  const el = document.createElement('div');
  el.className = 'busy';
  el.innerHTML = `<div class="busy-card"><div class="spinner"></div><div>${esc(message)}</div></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  return () => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 200);
  };
}

/* ---------- Komponen kecil ---------- */
export function emptyState({ icon: ic = 'bills', title, text = '', action = '' }) {
  return `<div class="empty">
    <div class="empty-ic">${icon(ic, 30)}</div>
    <div class="empty-title">${esc(title)}</div>
    ${text ? `<div class="empty-text">${text}</div>` : ''}
    ${action}
  </div>`;
}

/** Hanya dua status: masih disiapkan (Draft) atau sudah dikirim ke klien (Terkirim). */
export const STATUS = {
  draft: { label: 'Draft', cls: 'st-draft' },
  sent: { label: 'Terkirim', cls: 'st-sent' },
};

export const statusBadge = (s, docType) => {
  const st = STATUS[s === 'draft' ? 'draft' : 'sent'];
  const label = docType === 'quote' ? `Penawaran · ${st.label}` : st.label;
  return `<span class="badge ${st.cls}">${esc(label)}</span>`;
};

/** Format isi input uang saat diketik (1500000 -> 1.500.000) dan kembalikan angkanya. */
export function formatMoneyInput(input) {
  const digits = input.value.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');
  const v = digits ? Number(digits) : 0;
  const pos = input.selectionStart ?? input.value.length;
  const before = input.value.length;
  input.value = digits ? new Intl.NumberFormat('id-ID').format(v) : '';
  try {
    const p = Math.max(0, pos + (input.value.length - before));
    input.setSelectionRange(p, p);
  } catch {}
  return v;
}

export function bindMoneyInput(input, onChange) {
  input.addEventListener('input', () => onChange?.(formatMoneyInput(input)));
}

export const moneyValue = (n) => (Number(n) ? new Intl.NumberFormat('id-ID').format(n) : '');
