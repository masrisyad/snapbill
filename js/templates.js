/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Model invoice bawaan. */
import { esc, num, fmtDate, fmtDateShort, fmtPeriod, fmtQty } from './util.js';
import { calc, lineTotal, isQuote } from './invoice-model.js';
import { getSettings } from './state.js';

const BASE_LABELS = {
  title: 'INVOICE',
  billTo: 'Tagihan kepada :',
  period: 'Bulan :',
  colDesc: 'Rincian',
  colVisit: 'Kunjungan ke-',
  colDate: 'Tanggal',
  colAmount: 'Jumlah',
  total: 'TOTAL',
  balance: 'Sisa Pembayaran',
  signLabel: '',
};

export const TEMPLATES = {
  klasik: {
    name: 'Klasik',
    desc: 'Kop logo, kolom kunjungan, jumlah digabung.',
    labels: { ...BASE_LABELS },
  },
  lokasi: {
    name: 'Grup Lokasi',
    desc: 'Dikelompokkan per lokasi dengan daftar tanggal.',
    labels: { ...BASE_LABELS, groupHeader: 'Layanan :', extrasTitle: 'Tambahan :' },
  },
  ringkas: {
    name: 'Ringkas',
    desc: 'Baris rapat, cocok untuk banyak kunjungan.',
    labels: { ...BASE_LABELS },
  },
  tabel: {
    name: 'Tabel Rincian',
    desc: 'Judul berwarna, biaya per kunjungan per lokasi.',
    labels: {
      title: 'TAGIHAN JASA',
      subtitle: 'BULAN {periode}',
      billTo: 'Untuk :',
      colGroup: 'Lokasi',
      colVisit: 'Kunjungan ke-',
      colDate: 'Tanggal',
      colAmount: 'Biaya',
      datePrefix: 'Kunjungan tanggal',
      extrasTitle: 'Tambahan',
      total: 'Total',
      balance: 'Sisa Pembayaran',
      signLabel: '',
    },
  },
  kuantitas: {
    name: 'Kuantitas',
    desc: 'No, kuantitas & harga satuan. Untuk penawaran/proyek.',
    labels: {
      ...BASE_LABELS,
      billTo: 'Kepada :',
      period: '',
      colNo: 'No.',
      colQty: 'Kuantitas',
      colPrice: 'Harga Satuan',
      lumpLabel: 'Biaya borongan',
      extrasTitle: 'Tambahan',
    },
  },
};

export const LABEL_FIELDS = {
  title: 'Judul dokumen',
  subtitle: 'Sub judul ({periode} = bulan & tahun)',
  billTo: 'Label klien',
  period: 'Label periode (kosongkan untuk menyembunyikan)',
  groupHeader: 'Judul kelompok layanan',
  colNo: 'Kolom nomor',
  colGroup: 'Kolom lokasi',
  colDesc: 'Kolom rincian',
  colVisit: 'Kolom kunjungan',
  colDate: 'Kolom tanggal',
  colQty: 'Kolom kuantitas',
  colPrice: 'Kolom harga satuan',
  colAmount: 'Kolom jumlah',
  datePrefix: 'Awalan tanggal',
  lumpLabel: 'Label biaya borongan',
  extrasTitle: 'Judul item tambahan',
  total: 'Label total',
  balance: 'Label sisa pembayaran',
  signLabel: 'Teks di atas tanda tangan',
};

export function labelsFor(tpl, settings = getSettings()) {
  const t = TEMPLATES[tpl] || TEMPLATES.klasik;
  return { ...t.labels, ...(settings.templateLabels?.[tpl] || {}) };
}

const nl2br = (s) => esc(s).replace(/\n/g, '<br>');
const rp = (n, blank = false) => `<div class="rp"><span>Rp</span><span>${blank ? '' : num(n)}</span></div>`;
const docTitle = (L, inv, s) => (isQuote(inv) ? s.invoice.quoteTitle || 'PENAWARAN' : L.title);
/** Keterangan jumlah di belakang rincian, mis. "(2 unit)" — hanya jika bukan 1 unit polos. */
const qtyNote = (it) => (it.unit || Number(it.qty) !== 1 ? ` <span class="q">(${esc(fmtQty(it))})</span>` : '');

function brandHead(s, L, inv) {
  const b = s.business;
  const contact = [b.phone && `Telp: ${esc(b.phone)}`, b.email && esc(b.email)].filter(Boolean).join(' &nbsp;·&nbsp; ');
  return `
  <div class="i-head">
    ${b.logo ? `<div class="i-logo"><img src="${b.logo}" alt=""></div>` : ''}
    <div class="i-brand">
      <div class="i-name">${esc(b.name || 'Nama Usaha Anda')}</div>
      ${b.tagline ? `<div class="i-tag">${esc(b.tagline)}</div>` : ''}
      ${b.address ? `<div class="i-tag i-addr">${esc(b.address)}</div>` : ''}
      ${contact ? `<div class="i-tel">${contact}</div>` : ''}
    </div>
    <div class="i-title">
      <div class="i-title-t">${esc(docTitle(L, inv, s))}</div>
      ${numberBlock(s, inv)}
    </div>
  </div>
  <div class="i-rule"></div>`;
}

function numberBlock(s, inv) {
  if (!s.invoice.showNumber) return '';
  return `<div class="i-no">
    ${inv.number ? `<div>No. ${esc(inv.number)}</div>` : ''}
    ${inv.issueDate ? `<div>Tanggal: ${esc(fmtDate(inv.issueDate))}</div>` : ''}
    ${inv.dueDate ? `<div>${isQuote(inv) ? 'Berlaku s/d' : 'Jatuh tempo'}: ${esc(fmtDate(inv.dueDate))}</div>` : ''}
  </div>`;
}

function metaTable(L, inv) {
  return `
  <table class="i-meta">
    <tr><td>${esc(L.billTo)}</td><td>${esc(inv.client.name)}</td></tr>
    ${inv.period && L.period ? `<tr><td>${esc(L.period)}</td><td>${esc(fmtPeriod(inv.period))}</td></tr>` : ''}
  </table>`;
}

/** Baris subtotal/diskon/pajak (hanya jika ada diskon atau pajak). */
function adjustRows(inv, t, span) {
  if (!t.discountAmt && !t.taxAmt) return '';
  const rows = [`<tr class="adj"><td colspan="${span}">Subtotal</td><td>${rp(t.subtotal)}</td></tr>`];
  if (t.discountAmt) {
    const lbl = inv.discount.type === 'percent' ? `Diskon ${num(inv.discount.value)}%` : 'Diskon';
    rows.push(`<tr class="adj"><td colspan="${span}">${esc(lbl)}</td><td>${rp(-t.discountAmt).replace('<span>-', '<span>- ')}</td></tr>`);
  }
  if (t.taxAmt) rows.push(`<tr class="adj"><td colspan="${span}">${esc(inv.tax.label || 'Pajak')} ${esc(String(inv.tax.rate))}%</td><td>${rp(t.taxAmt)}</td></tr>`);
  return rows.join('');
}

/** TOTAL + baris DP / pembayaran + sisa (seperti invoice proyek di Excel). */
function totalRows(inv, t, span, L) {
  let html = `<tr class="tot"><td colspan="${span}">${esc(L.total)}</td><td>${rp(t.total)}</td></tr>`;
  const pays = (inv.payments || []).filter((p) => Number(p.amount));
  if (pays.length) {
    html += pays
      .map((p) => `<tr class="pay"><td colspan="${span}">${esc(p.label || 'DP')}${p.date ? ` <span class="q">(${esc(fmtDate(p.date))})</span>` : ''}</td><td>${rp(p.amount)}</td></tr>`)
      .join('');
    html += `<tr class="bal"><td colspan="${span}">${esc(L.balance || 'Sisa Pembayaran')}</td><td>${rp(t.balance)}</td></tr>`;
  }
  return html;
}

function footer(s, L, inv, { brandLine = false } = {}) {
  const b = s.business;
  const notes = inv.notes?.trim();
  const pay = isQuote(inv) ? '' : b.paymentInfo?.trim();
  const line = brandLine && (b.name || b.phone)
    ? `<div class="i-brandline">${esc(b.name)}${b.phone ? ` &nbsp;·&nbsp; Telp: ${esc(b.phone)}` : ''}</div>`
    : '';
  return `
  <div class="i-foot">
    <div class="i-notes">
      ${notes ? `<div><b>Catatan:</b><br>${nl2br(notes)}</div>` : ''}
      ${pay ? `<div><b>Pembayaran:</b><br>${nl2br(pay)}</div>` : ''}
      ${line}
    </div>
    ${b.signName ? `<div class="i-sign">${L.signLabel ? `<div class="i-sign-l">${esc(L.signLabel)}</div>` : ''}<div class="i-sign-n">(${esc(b.signName)})</div></div>` : ''}
  </div>`;
}

const itemLabel = (it) => esc(it.desc || '-') + qtyNote(it);
const visitGroups = (inv) => inv.groups.filter((g) => g.items.length);

/* ---------- Model 1 & 3: Klasik / Ringkas ---------- */
function renderKlasik(inv, s, variant) {
  const L = labelsFor(variant, s);
  const t = calc(inv);
  const groups = visitGroups(inv);
  const multi = groups.length > 1 || groups.some((g) => g.name.trim());
  const totals = groups.flatMap((g) => g.items.map(lineTotal));
  const merged = inv.pricing === 'lump' || totals.every((v) => v === totals[0]);

  const rows = [];
  groups.forEach((g) => {
    if (multi && (g.name.trim() || g.note.trim())) rows.push({ type: 'group', g });
    g.items.forEach((it, i) => rows.push({ type: 'item', it, visit: i + 1 }));
  });
  const amtCell = `<td class="amt" rowspan="${rows.length}">${rp(t.base)}</td>`;
  const body = rows
    .map((r, i) => {
      const amount = merged ? (i === 0 ? amtCell : '') : r.type === 'item' ? `<td class="amt">${rp(lineTotal(r.it))}</td>` : '<td></td>';
      if (r.type === 'group') return `<tr class="grp"><td colspan="3">${esc(r.g.name)} ${esc(r.g.note)}</td>${amount}</tr>`;
      return `<tr><td class="desc">${itemLabel(r.it)}</td><td class="c">${r.visit}</td><td class="c">${esc(fmtDateShort(r.it.date) || '-')}</td>${amount}</tr>`;
    })
    .join('');
  // Item tambahan: Rincian | "2 unit" | harga satuan | jumlah.
  const extras = (inv.extras || [])
    .map((it) => `<tr class="ext"><td class="desc">${esc(it.desc || '-')}</td><td class="c">${esc(fmtQty(it))}</td><td>${rp(it.price)}</td><td class="amt">${rp(lineTotal(it))}</td></tr>`)
    .join('');

  return `
  <div class="inv tpl-${variant} framed">
    ${brandHead(s, L, inv)}
    ${metaTable(L, inv)}
    <table class="i-grid">
      <colgroup><col style="width:31%"><col style="width:16%"><col style="width:24%"><col style="width:29%"></colgroup>
      <thead><tr><th>${esc(L.colDesc)}</th><th>${esc(L.colVisit)}</th><th>${esc(L.colDate)}</th><th>${esc(L.colAmount)}</th></tr></thead>
      <tbody>${body}${extras}</tbody>
      <tfoot>${adjustRows(inv, t, 3)}${totalRows(inv, t, 3, L)}</tfoot>
    </table>
    ${footer(s, L, inv)}
  </div>`;
}

/* ---------- Model 2: Grup Lokasi ---------- */
function renderLokasi(inv, s) {
  const L = labelsFor('lokasi', s);
  const t = calc(inv);
  const groups = visitGroups(inv);
  const rows = [];
  if (L.groupHeader && groups.length) rows.push(`<td colspan="2" class="ghead">${esc(L.groupHeader)}</td>`);
  groups.forEach((g, gi) => {
    if (gi > 0) rows.push('<td colspan="2" class="sp"></td>');
    const name = g.name.trim() || g.items[0]?.desc || '';
    g.items.forEach((it, i) => {
      const left = i === 0 ? `<td class="gname" rowspan="${g.items.length}">${esc(name)}${g.note ? ' ' + esc(g.note) : ''}</td>` : '';
      const right = it.date ? esc(fmtDateShort(it.date)) : esc(it.desc || '-');
      rows.push(`${left}<td class="c date">${right}${qtyNote(it)}</td>`);
    });
  });
  const body = rows
    .map((r, i) => `<tr${r.includes('class="sp"') ? ' class="sp"' : ''}>${r}${i === 0 ? `<td class="amt mid" rowspan="${rows.length}">${rp(t.base)}</td>` : ''}</tr>`)
    .join('');
  const ex = inv.extras || [];
  const extras = ex.length
    ? `${rows.length ? '<tr class="sp"><td colspan="3"></td></tr>' : ''}
       ${L.extrasTitle ? `<tr><td colspan="3" class="ghead">${esc(L.extrasTitle)}</td></tr>` : ''}
       ${ex.map((it) => `<tr class="ext"><td>${esc(it.desc || '-')}</td><td class="c">${esc(fmtQty(it))} × ${num(it.price)}</td><td class="amt">${rp(lineTotal(it))}</td></tr>`).join('')}`
    : '';

  return `
  <div class="inv tpl-lokasi framed">
    ${brandHead(s, L, inv)}
    ${metaTable(L, inv)}
    <table class="i-grid">
      <colgroup><col style="width:50%"><col style="width:22%"><col style="width:28%"></colgroup>
      <thead><tr><th>${esc(L.colDesc)}</th><th>${esc(L.colDate)}</th><th>${esc(L.colAmount)}</th></tr></thead>
      <tbody>${body}${extras}</tbody>
      <tfoot>${adjustRows(inv, t, 2)}${totalRows(inv, t, 2, L)}</tfoot>
    </table>
    ${footer(s, L, inv)}
  </div>`;
}

/* ---------- Model 4: Tabel Rincian ---------- */
function renderTabel(inv, s) {
  const L = labelsFor('tabel', s);
  const t = calc(inv);
  const lump = inv.pricing === 'lump';
  const groups = visitGroups(inv);
  const numbered = groups.length > 1;
  const sub = L.subtitle && inv.period ? L.subtitle.replace(/\{periode\}/gi, fmtPeriod(inv.period)).toUpperCase() : '';

  const body = groups
    .map((g, gi) => {
      const name = g.name.trim() || g.items[0]?.desc || '';
      const firstDesc = g.items[0]?.desc;
      const spacer = gi > 0 ? '<tr class="sp"><td colspan="4"></td></tr>' : '';
      return (
        spacer +
        g.items
          .map((it, i) => {
            let text = it.date ? `${L.datePrefix ? esc(L.datePrefix) + ' ' : ''}${esc(fmtDate(it.date))}` : esc(it.desc || '-');
            if (it.date && it.desc && it.desc !== firstDesc) text = `${esc(it.desc)} – ${esc(fmtDate(it.date))}`;
            text += qtyNote(it);
            const left = i === 0 ? `<td class="gname" rowspan="${g.items.length}">${numbered ? `${gi + 1}) ` : ''}${esc(name)}${g.note ? ' ' + esc(g.note) : ''}</td>` : '';
            return `<tr>${left}<td class="c">${i + 1}</td><td>${text}</td><td class="amt">${rp(lineTotal(it), lump)}</td></tr>`;
          })
          .join('')
      );
    })
    .join('');
  const lumpRow = lump && groups.length ? `<tr class="adj"><td colspan="3">Biaya borongan</td><td>${rp(t.base)}</td></tr>` : '';
  const ex = inv.extras || [];
  const extras = ex.length
    ? `${groups.length ? '<tr class="sp"><td colspan="4"></td></tr>' : ''}
       ${ex.map((it, i) => `<tr class="ext">${i === 0 ? `<td class="gname" rowspan="${ex.length}">${esc(L.extrasTitle || 'Tambahan')}</td>` : ''}<td class="c">${esc(fmtQty(it))}</td><td>${esc(it.desc || '-')} <span class="q">@ ${num(it.price)}</span></td><td class="amt">${rp(lineTotal(it))}</td></tr>`).join('')}`
    : '';

  return `
  <div class="inv tpl-tabel">
    <div class="t4-bars"><div>${esc(isQuote(inv) ? docTitle(L, inv, s) : L.title)}</div>${sub ? `<div>${esc(sub)}</div>` : ''}</div>
    <div class="t4-to">
      <div><b>${esc(L.billTo)} ${esc(inv.client.name)}</b></div>
      ${numberBlock(s, inv)}
    </div>
    <table class="i-grid">
      <colgroup><col style="width:20%"><col style="width:17%"><col style="width:37%"><col style="width:26%"></colgroup>
      <thead><tr><th>${esc(L.colGroup)}</th><th>${esc(L.colVisit)}</th><th>${esc(L.colDate)}</th><th>${esc(L.colAmount)}</th></tr></thead>
      <tbody>${body}${lumpRow}${extras}</tbody>
      <tfoot>${adjustRows(inv, t, 3)}${totalRows(inv, t, 3, L)}</tfoot>
    </table>
    ${footer(s, L, inv, { brandLine: true })}
  </div>`;
}

/* ---------- Model 5: Kuantitas (penawaran / invoice proyek) ---------- */
function renderKuantitas(inv, s) {
  const L = labelsFor('kuantitas', s);
  const t = calc(inv);
  const lump = inv.pricing === 'lump';
  const groups = visitGroups(inv);
  const sections = groups.length > 1 || groups.some((g) => g.name.trim());
  let no = 0;
  const line = (it, blank) =>
    `<tr><td class="c">${++no}</td><td>${esc(it.desc || '-')}${it.date ? ` <span class="q">(${esc(fmtDateShort(it.date))})</span>` : ''}</td>` +
    `<td class="c">${esc(fmtQty(it))}</td><td>${blank ? '' : rp(it.price)}</td><td class="amt">${blank ? '' : rp(lineTotal(it))}</td></tr>`;
  const section = (title) => `<tr class="grp"><td></td><td colspan="4">${title}</td></tr>`;

  let body = groups
    .map((g) => (sections && (g.name.trim() || g.note.trim()) ? section(`${esc(g.name)} ${esc(g.note)}`) : '') + g.items.map((it) => line(it, lump)).join(''))
    .join('');
  if (lump && groups.length) body += `<tr class="adj"><td colspan="4">${esc(L.lumpLabel || 'Biaya borongan')}</td><td>${rp(t.base)}</td></tr>`;
  const ex = inv.extras || [];
  if (ex.length) body += (groups.length ? section(esc(L.extrasTitle || 'Tambahan')) : '') + ex.map((it) => line(it, false)).join('');

  return `
  <div class="inv tpl-kuantitas framed">
    ${brandHead(s, L, inv)}
    ${metaTable(L, inv)}
    <table class="i-grid">
      <colgroup><col style="width:7%"><col style="width:37%"><col style="width:15%"><col style="width:19%"><col style="width:22%"></colgroup>
      <thead><tr><th>${esc(L.colNo)}</th><th>${esc(L.colDesc)}</th><th>${esc(L.colQty)}</th><th>${esc(L.colPrice)}</th><th>${esc(L.colAmount)}</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot>${adjustRows(inv, t, 4)}${totalRows(inv, t, 4, L)}</tfoot>
    </table>
    ${footer(s, L, inv)}
  </div>`;
}

export function renderInvoice(inv, settings = getSettings(), tplOverride) {
  const tpl = tplOverride || inv.template || settings.template || 'klasik';
  if (tpl === 'lokasi') return renderLokasi(inv, settings);
  if (tpl === 'tabel') return renderTabel(inv, settings);
  if (tpl === 'kuantitas') return renderKuantitas(inv, settings);
  return renderKlasik(inv, settings, tpl === 'ringkas' ? 'ringkas' : 'klasik');
}
