/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Daftar tagihan dengan pencarian & filter status. */
import { db } from '../db.js';
import { esc, rupiah, debounce, fmtPeriod } from '../util.js';
import { icon } from '../icons.js';
import { calc } from '../invoice-model.js';
import { emptyState } from '../ui.js';
import { invoiceRow, sortInvoices } from './shared.js';

const PAGE = 50;
const isQ = (i) => i.docType === 'quote';

export async function render(ctx) {
  ctx.setTitle('Tagihan');
  const all = sortInvoices(await db.all('invoices'));
  let status = ctx.query.status || 'all';
  let q = ctx.query.q || '';
  let sort = 'new';
  let limit = PAGE;

  ctx.el.innerHTML = `
    <div class="searchbar">
      ${icon('search', 20)}
      <input type="search" id="q" placeholder="Cari klien, nomor, atau periode…" value="${esc(q)}" autocomplete="off">
    </div>
    <div class="filters">
      <div class="chips" id="status-chips">
        ${[['all', 'Semua'], ['invoice', 'Invoice'], ['quote', 'Penawaran'], ['draft', 'Draft']]
          .map(([k, v]) => `<button type="button" class="chip ${k === status ? 'on' : ''}" data-st="${k}">${esc(v)}</button>`)
          .join('')}
      </div>
      <select id="sort" class="select-sm" aria-label="Urutkan">
        <option value="new">Terbaru</option>
        <option value="old">Terlama</option>
        <option value="big">Terbesar</option>
      </select>
    </div>
    <div id="summary" class="list-summary"></div>
    <div id="list"></div>`;

  const listEl = ctx.el.querySelector('#list');
  const sumEl = ctx.el.querySelector('#summary');

  const draw = () => {
    const needle = q.trim().toLowerCase();
    const match = (i) =>
      status === 'quote' ? isQ(i) : status === 'invoice' ? !isQ(i) : status === 'draft' ? i.status === 'draft' : true;
    let rows = all.filter((i) => match(i) &&
      (!needle || [i.client.name, i.number, fmtPeriod(i.period), i.notes].join(' ').toLowerCase().includes(needle)));
    if (sort === 'old') rows = [...rows].reverse();
    if (sort === 'big') rows = [...rows].sort((a, b) => calc(b).total - calc(a).total);
    const total = rows.reduce((s, i) => s + calc(i).total, 0);
    sumEl.innerHTML = rows.length ? `${rows.length} ${status === 'quote' ? 'penawaran' : 'dokumen'} · <b>${rupiah(total)}</b>` : '';
    if (!all.length) {
      listEl.innerHTML = emptyState({
        title: 'Belum ada tagihan / penawaran',
        text: 'Tagihan yang Anda buat akan muncul di sini.',
        action: `<div class="row-btns center"><a class="btn btn-primary" role="link" tabindex="0" data-href="#/tagihan/baru">${icon('plus', 18)} Buat tagihan</a><a class="btn btn-soft" role="link" tabindex="0" data-href="#/tagihan/baru?jenis=penawaran">${icon('send', 18)} Buat penawaran</a></div>`,
      });
      return;
    }
    if (!rows.length) {
      listEl.innerHTML = emptyState({ icon: 'search', title: 'Tidak ditemukan', text: 'Coba kata kunci atau filter lain.' });
      return;
    }
    listEl.innerHTML = `<div class="list card-list">${rows.slice(0, limit).map(invoiceRow).join('')}</div>
      ${rows.length > limit ? `<button type="button" class="btn btn-soft btn-block more" id="more">Tampilkan ${Math.min(PAGE, rows.length - limit)} lagi</button>` : ''}`;
    listEl.querySelector('#more')?.addEventListener('click', () => {
      limit += PAGE;
      draw();
    });
  };

  const syncHash = () => {
    const p = new URLSearchParams();
    if (status !== 'all') p.set('status', status);
    if (q) p.set('q', q);
    const h = '#/tagihan' + (p.toString() ? '?' + p : '');
    history.replaceState(null, '', h);
  };

  ctx.el.querySelector('#q').addEventListener('input', debounce((e) => {
    q = e.target.value;
    limit = PAGE;
    syncHash();
    draw();
  }, 180));
  ctx.el.querySelector('#status-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-st]');
    if (!b) return;
    status = b.dataset.st;
    limit = PAGE;
    ctx.el.querySelectorAll('[data-st]').forEach((x) => x.classList.toggle('on', x === b));
    syncHash();
    draw();
  });
  ctx.el.querySelector('#status-chips .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  ctx.el.querySelector('#sort').addEventListener('change', (e) => {
    sort = e.target.value;
    draw();
  });
  draw();
}
