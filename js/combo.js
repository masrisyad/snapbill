/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Isian dengan daftar pilihan + pencarian, pengganti <datalist> bawaan browser
 * (yang tampil berbeda-beda di tiap browser dan muncul di jendela terpisah).
 * Satu panel dipakai bersama; muncul tepat di bawah isian yang sedang aktif. */
import { esc } from './util.js';
import { icon } from './icons.js';

const MAX = 60;
const CLEAR_W = 36; // lebar area ikon ✕, sama dengan padding-right .combo-input
const TAP_SLOP = 8; // geser lebih dari ini (px) = menggulir daftar, bukan memilih
let panel = null;
let state = null; // { input, items, active, spec }
let press = null; // { x, y, i, top } — posisi saat jari/mouse ditekan

function ensurePanel() {
  if (panel) return panel;
  panel = document.createElement('div');
  panel.className = 'combo-panel';
  panel.setAttribute('role', 'listbox');
  panel.hidden = true;
  // preventDefault di pointerdown: fokus tetap di isian, jadi daftar tidak tertutup sebelum dipilih.
  // Pilihan diambil saat dilepas & hanya bila tidak digeser — supaya daftar bisa digulir di layar sentuh.
  panel.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    press = { x: e.clientX, y: e.clientY, i: e.target.closest('[data-i]')?.dataset.i, top: panel.scrollTop };
  });
  panel.addEventListener('pointerup', (e) => {
    const p = press;
    press = null;
    if (!p || !state || p.i === undefined) return;
    const moved = Math.abs(e.clientX - p.x) > TAP_SLOP || Math.abs(e.clientY - p.y) > TAP_SLOP || Math.abs(panel.scrollTop - p.top) > 2;
    if (!moved) pick(state.items[Number(p.i)]);
  });
  panel.addEventListener('pointercancel', () => (press = null)); // browser mengambil alih untuk menggulir
  document.body.appendChild(panel);
  const reposition = () => state && place();
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);
  return panel;
}

const norm = (s) => String(s ?? '').toLowerCase().trim();

function highlight(text, q) {
  const t = String(text ?? '');
  const i = q ? t.toLowerCase().indexOf(q) : -1;
  if (i < 0) return esc(t);
  return `${esc(t.slice(0, i))}<mark>${esc(t.slice(i, i + q.length))}</mark>${esc(t.slice(i + q.length))}`;
}

// Isian berisi salah satu pilihan persis = sudah terpilih; tidak perlu dibuka sebagai pencarian lagi.
function picked(spec, input) {
  const q = norm(input.value);
  return !!q && (spec.options(input) || []).some((it) => norm(it.value) === q);
}

function filtered(spec, input, showAll = false) {
  const q = showAll ? '' : norm(input.value);
  const all = spec.options(input) || [];
  if (!q) return all.slice(0, MAX);
  const starts = [];
  const contains = [];
  for (const it of all) {
    const hay = norm(`${it.label ?? it.value} ${it.hint ?? ''}`);
    const label = norm(it.label ?? it.value);
    if (label.startsWith(q)) starts.push(it);
    else if (hay.includes(q)) contains.push(it);
  }
  return [...starts, ...contains].slice(0, MAX);
}

function render() {
  const { input, items, active, spec, showAll } = state;
  const q = showAll ? '' : norm(input.value);
  const exact = items.some((it) => norm(it.value) === q);
  const head = `<div class="combo-head">${icon('search', 15)}<span>${q ? `${items.length} hasil untuk “${esc(input.value.trim())}”` : esc(spec.title || 'Ketik untuk mencari')}</span></div>`;
  const rows = items
    .map(
      (it, i) => `<div class="combo-opt${i === active ? ' on' : ''}" role="option" data-i="${i}" aria-selected="${i === active}">
        <b>${highlight(it.label ?? it.value, q)}</b>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</div>`
    )
    .join('');
  const empty = !items.length ? `<div class="combo-empty">${q ? `Belum ada “${esc(input.value.trim())}” — lanjut ketik untuk ${esc(spec.newLabel || 'menambah baru')}.` : esc(spec.emptyText || 'Belum ada data.')}</div>` : '';
  const hintNew = q && items.length && !exact && spec.newLabel ? `<div class="combo-foot">${icon('plus', 14)} Tidak ada di daftar? Biarkan tertulis untuk ${esc(spec.newLabel)}.</div>` : '';
  panel.innerHTML = head + rows + empty + hintNew;
  panel.querySelector('.combo-opt.on')?.scrollIntoView({ block: 'nearest' });
}

function place() {
  const r = state.input.getBoundingClientRect();
  if (!r.width || r.bottom < 0 || r.top > innerHeight) return close();
  const vv = window.visualViewport;
  const viewH = vv ? vv.height + vv.offsetTop : innerHeight;
  const below = viewH - r.bottom - 8;
  const above = r.top - 8;
  const up = below < 200 && above > below;
  const maxH = Math.max(140, Math.min(320, up ? above : below));
  // Isian sempit (mis. baris rincian di HP) tetap mendapat panel yang cukup lebar.
  const width = Math.min(Math.max(r.width, 280), innerWidth - 16);
  const left = Math.max(8, Math.min(r.left, innerWidth - width - 8));
  Object.assign(panel.style, {
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${maxH}px`,
    top: up ? '' : `${r.bottom + 4}px`,
    bottom: up ? `${innerHeight - r.top + 4}px` : '',
  });
}

function open(input, spec, showAll = false) {
  ensurePanel();
  const items = filtered(spec, input, showAll);
  const cur = norm(input.value);
  state = { input, spec, showAll, items, active: showAll ? items.findIndex((it) => norm(it.value) === cur) : -1 };
  input.setAttribute('aria-expanded', 'true');
  panel.hidden = false;
  render();
  if (state.active < 0) panel.scrollTop = 0; // buka lagi dari atas, bukan dari posisi guliran sebelumnya
  place();
}

function close() {
  if (!state) return;
  state.input.setAttribute('aria-expanded', 'false');
  state = null;
  if (panel) panel.hidden = true;
}

function pick(item) {
  const { input, spec } = state;
  input.value = item.value;
  close();
  input.dispatchEvent(new Event('input', { bubbles: true }));
  spec.onPick?.(input, item);
}

/**
 * Pasang kombo pada semua isian di `root` yang cocok dengan `selector` (termasuk baris yang ditambah belakangan).
 * spec: { options(input) → [{ value, label?, hint? }], title?, emptyText?, newLabel?, onPick?(input, item) }
 */
export function comboField(root, selector, spec) {
  const match = (el) => el instanceof HTMLInputElement && el.matches(selector);
  const prep = (el) => {
    if (el.dataset.combo) return;
    el.dataset.combo = '1';
    el.removeAttribute('list');
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('role', 'combobox');
    el.setAttribute('aria-autocomplete', 'list');
    el.setAttribute('aria-expanded', 'false');
    el.classList.add('combo-input');
  };
  root.querySelectorAll(selector).forEach(prep);
  new MutationObserver(() => root.querySelectorAll(selector).forEach(prep)).observe(root, { childList: true, subtree: true });

  // Ikon ✕ di ujung kanan (lihat .combo-input di CSS) muncul saat isian berisi; klik di area itu = kosongkan.
  const onClear = (e) => {
    const el = e.target;
    return el.value !== '' && e.clientX >= el.getBoundingClientRect().right - CLEAR_W;
  };
  const clear = (el) => {
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
    open(el, spec);
  };

  root.addEventListener('focusin', (e) => match(e.target) && !picked(spec, e.target) && open(e.target, spec));
  root.addEventListener('click', (e) => {
    if (!match(e.target)) return;
    if (onClear(e)) return clear(e.target);
    if ((!state || state.input !== e.target) && !picked(spec, e.target)) open(e.target, spec);
  });
  root.addEventListener('mousemove', (e) => match(e.target) && (e.target.style.cursor = onClear(e) ? 'pointer' : ''));
  root.addEventListener('input', (e) => {
    if (!match(e.target) || (state && state.input !== e.target && !e.isTrusted)) return;
    if (!state || state.input !== e.target) {
      if (e.isTrusted) open(e.target, spec);
      return;
    }
    state.showAll = false;
    state.items = filtered(spec, e.target);
    state.active = -1;
    render();
    place();
  });
  root.addEventListener('keydown', (e) => {
    if (!match(e.target)) return;
    if (!state || state.input !== e.target) {
      if (e.key === 'ArrowDown') open(e.target, spec, picked(spec, e.target));
      return;
    }
    const n = state.items.length;
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      state.active = (state.active + 1) % n;
      render();
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      state.active = (state.active - 1 + n) % n;
      render();
    } else if (e.key === 'Enter' && state.active >= 0) {
      e.preventDefault();
      pick(state.items[state.active]);
    } else if (e.key === 'Escape') {
      close();
    }
  });
  root.addEventListener('focusout', (e) => {
    if (match(e.target) && state?.input === e.target) setTimeout(() => state?.input === e.target && document.activeElement !== e.target && close(), 120);
  });
}

export const closeCombo = close;
