/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved. */
import { esc, rupiah, fmtPeriod, fmtDate } from '../util.js';
import { calc } from '../invoice-model.js';
import { statusBadge, sheet } from '../ui.js';
import { icon } from '../icons.js';
import { TEMPLATES, renderInvoice } from '../templates.js';
import { getSettings } from '../state.js';

export const INVOICE_WIDTH = 760;

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function invoiceRow(inv) {
  const t = calc(inv);
  const owing = t.paid > 0 && inv.docType !== 'quote';
  const sub = [inv.number, fmtPeriod(inv.period) || fmtDate(inv.issueDate)].filter(Boolean).map(esc).join(' · ') +
    (owing ? ` · <span class="sisa">sisa ${rupiah(t.balance)}</span>` : '');
  return `
  <a class="inv-row" role="link" tabindex="0" data-href="#/tagihan/${encodeURIComponent(inv.id)}">
    <div class="avatar">${esc(initials(inv.client.name))}</div>
    <div class="ir-main">
      <div class="ir-name">${esc(inv.client.name || 'Tanpa nama')}</div>
      <div class="ir-sub">${sub || '&nbsp;'}</div>
    </div>
    <div class="ir-right">
      <div class="ir-amt">${rupiah(t.total)}</div>
      ${statusBadge(inv.status, inv.docType)}
    </div>
  </a>`;
}

export const sortInvoices = (list) =>
  list.sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || '') || (b.createdAt || 0) - (a.createdAt || 0));

/** Pratinjau invoice yang otomatis menyesuaikan lebar layar. */
export function mountPreview(container, html) {
  container.classList.add('pv');
  container.innerHTML = `<div class="pv-inner">${html}</div>`;
  const inner = container.firstElementChild;
  const fit = () => {
    const w = container.clientWidth;
    const paper = inner.firstElementChild;
    if (!w || !paper) return;
    const s = Math.min(1, w / INVOICE_WIDTH);
    inner.style.transform = `scale(${s})`;
    container.style.height = Math.ceil(paper.offsetHeight * s) + 'px';
  };
  const bindImgs = () => inner.querySelectorAll('img').forEach((img) => img.complete || img.addEventListener('load', fit, { once: true }));
  fit();
  bindImgs();
  let lastW = container.clientWidth;
  const ro = new ResizeObserver(() => {
    if (container.clientWidth !== lastW) {
      lastW = container.clientWidth;
      fit();
    }
  });
  ro.observe(container);
  document.fonts?.ready.then(fit);
  return {
    update(next) {
      inner.innerHTML = next;
      bindImgs();
      fit();
    },
    fit,
    destroy: () => ro.disconnect(),
  };
}

/**
 * Lembar pratinjau satu model invoice.
 * onUse (opsional) menampilkan tombol untuk langsung memakai model tsb.
 */
export function previewTemplate(tpl, inv, { note = '', useLabel = 'Pakai model ini', onUse, active = false } = {}) {
  const box = document.createElement('div');
  box.innerHTML = `${note ? `<p class="muted small pv-note">${icon('info', 15)} ${esc(note)}</p>` : ''}<div class="pv-box"><div class="pv-target"></div></div>`;
  const sh = sheet({
    title: `Contoh model ${TEMPLATES[tpl]?.name || ''}`,
    content: box,
    size: 'lg',
    actions: onUse
      ? [{ label: 'Tutup', kind: 'ghost', value: null }, { label: active ? 'Sedang dipakai' : useLabel, kind: 'primary', onClick: () => (active ? undefined : onUse()) }]
      : [],
  });
  const pv = mountPreview(box.querySelector('.pv-target'), renderInvoice({ ...inv, template: tpl }, getSettings(), tpl));
  sh.result.then(() => pv.destroy());
  return sh;
}
