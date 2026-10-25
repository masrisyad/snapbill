/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Model data tagihan & penawaran, perhitungan total, dan penomoran otomatis. */
import { db, meta } from './db.js';
import { getSettings } from './state.js';
import { uid, todayISO, thisMonth, parseISO, fmtPeriod, rupiah, fmtDate, fmtQty, MON } from './util.js';

export const DOC = { invoice: 'invoice', quote: 'quote' };
export const isQuote = (inv) => inv.docType === DOC.quote;

export function newItem(partial = {}) {
  return { id: uid(), desc: '', date: '', qty: 1, unit: '', price: 0, ...partial };
}
export function newGroup(partial = {}) {
  return { id: uid(), name: '', note: '', items: [newItem()], ...partial };
}
export function newPayment(partial = {}) {
  return { id: uid(), label: 'DP', amount: 0, date: todayISO(), ...partial };
}

export function newInvoice(docType = DOC.invoice) {
  const s = getSettings();
  const quote = docType === DOC.quote;
  return {
    id: uid(),
    docType,
    number: '',
    autoNumber: !!s.numbering.enabled,
    status: 'draft',
    client: { id: '', name: '', phone: '', address: '' },
    issueDate: todayISO(),
    dueDate: '',
    period: quote ? '' : thisMonth(),
    template: quote ? 'kuantitas' : s.template || 'klasik',
    pricing: 'item', // item | lump (borongan untuk kunjungan/layanan)
    lumpAmount: 0,
    groups: [newGroup({ items: [newItem({ desc: quote ? '' : s.invoice.defaultService || '' })] })],
    extras: [], // item tambahan: material, tanaman, jasa lain (qty + satuan × harga)
    payments: [], // DP / pembayaran yang sudah diterima
    discount: { type: 'percent', value: 0 },
    tax: { label: 'PPN', rate: 0 },
    notes: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** Lengkapi field baru untuk data lama / hasil restore. */
export function normalize(inv) {
  inv.docType ||= DOC.invoice;
  inv.status = inv.status === 'draft' ? 'draft' : 'sent';
  delete inv.paidAt;
  inv.extras ||= [];
  inv.payments ||= [];
  inv.groups ||= [];
  inv.groups.forEach((g) => g.items.forEach((it) => (it.unit ??= '')));
  return inv;
}

export const lineTotal = (it) => (Number(it.qty) || 0) * (Number(it.price) || 0);
const sumLines = (items) => items.reduce((a, it) => a + lineTotal(it), 0);

export function calc(inv) {
  const groups = inv.groups || [];
  const itemsTotal = groups.reduce((s, g) => s + sumLines(g.items), 0);
  const base = inv.pricing === 'lump' ? Number(inv.lumpAmount) || 0 : itemsTotal;
  const extrasTotal = sumLines(inv.extras || []);
  const subtotal = base + extrasTotal;
  const dv = Number(inv.discount?.value) || 0;
  const discountAmt = Math.min(subtotal, inv.discount?.type === 'amount' ? dv : Math.round((subtotal * dv) / 100));
  const afterDisc = subtotal - discountAmt;
  const taxAmt = Math.round((afterDisc * (Number(inv.tax?.rate) || 0)) / 100);
  const total = afterDisc + taxAmt;
  const paid = (inv.payments || []).reduce((a, p) => a + (Number(p.amount) || 0), 0);
  return { itemsTotal, base, extrasTotal, subtotal, discountAmt, taxAmt, total, paid, balance: total - paid };
}

/** Data lama (Belum Dibayar / Lunas / Disetujui) → "Terkirim". */
export async function migrateStatuses() {
  const all = await db.all('invoices');
  const stale = all.filter((i) => !['draft', 'sent'].includes(i.status) || 'paidAt' in i);
  if (stale.length) await db.putMany('invoices', stale.map(normalize));
}

/* ---------- Penomoran otomatis ---------- */
function periodKey(reset, d, docType) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const k = reset === 'monthly' ? `${y}-${m}` : reset === 'yearly' ? `${y}` : 'all';
  return docType === DOC.quote ? `q:${k}` : k;
}

const patternFor = (docType) => {
  const n = getSettings().numbering;
  return docType === DOC.quote ? n.quotePattern || 'PNW/{YYYY}/{MM}/{SEQ:3}' : n.pattern;
};

export function formatNumber(pattern, dateISO, seq) {
  const d = parseISO(dateISO) || new Date();
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return String(pattern || '{SEQ}')
    .replace(/\{YYYY\}/g, y)
    .replace(/\{YY\}/g, y.slice(2))
    .replace(/\{MM\}/g, m)
    .replace(/\{DD\}/g, dd)
    .replace(/\{SEQ(?::(\d))?\}/g, (_, n) => String(seq).padStart(Number(n || 1), '0'));
}

const keyFor = (dateISO, docType) => periodKey(getSettings().numbering.reset, parseISO(dateISO) || new Date(), docType);

/** Nomor berikutnya tanpa menaikkan penghitung (untuk pratinjau). */
export async function peekNumber(dateISO, docType = DOC.invoice) {
  const counters = (await meta.get('counters')) || {};
  return formatNumber(patternFor(docType), dateISO, (counters[keyFor(dateISO, docType)] || 0) + 1);
}

/** Nomor urut berikutnya untuk periode tanggal tsb. */
export async function getNextSeq(dateISO, docType = DOC.invoice) {
  const counters = (await meta.get('counters')) || {};
  return (counters[keyFor(dateISO, docType)] || 0) + 1;
}

export async function setNextSeq(dateISO, next, docType = DOC.invoice) {
  const counters = (await meta.get('counters')) || {};
  counters[keyFor(dateISO, docType)] = Math.max(0, Math.floor(next) - 1);
  await meta.set('counters', counters);
}

/** Ambil nomor & naikkan penghitung. */
export async function takeNumber(dateISO, docType = DOC.invoice) {
  const counters = (await meta.get('counters')) || {};
  const key = keyFor(dateISO, docType);
  const seq = (counters[key] || 0) + 1;
  counters[key] = seq;
  await meta.set('counters', counters);
  return formatNumber(patternFor(docType), dateISO, seq);
}

/* ---------- Simpan + belajar master data otomatis ---------- */
export async function saveInvoice(inv, { learn = true } = {}) {
  normalize(inv);
  inv.updatedAt = Date.now();
  if (inv.autoNumber && !inv.number) inv.number = await takeNumber(inv.issueDate, inv.docType);
  if (learn) await learnFromInvoice(inv);
  await db.put('invoices', inv);
  return inv;
}

async function learnFromInvoice(inv) {
  const name = inv.client.name.trim();
  if (name) {
    const clients = await db.all('clients');
    let c = clients.find((x) => x.id === inv.client.id) || clients.find((x) => x.name.trim().toLowerCase() === name.toLowerCase());
    const groupLocs = inv.groups.filter((g) => g.name.trim()).map((g) => ({ name: g.name.trim(), note: g.note.trim() }));
    // Lokasi hanya dipelajari dari tagihan bulanan (bukan "Tahap 1/2" di penawaran proyek).
    const locs = isQuote(inv) ? [] : groupLocs;
    if (!c) {
      c = { id: uid(), name, phone: inv.client.phone || '', address: inv.client.address || '', locations: locs, monthlyFee: 0, notes: '', createdAt: Date.now() };
    } else {
      c.name = name;
      if (inv.client.phone) c.phone = inv.client.phone;
      if (inv.client.address) c.address = inv.client.address;
      c.locations = c.locations || [];
      for (const l of locs) if (!c.locations.some((x) => x.name.toLowerCase() === l.name.toLowerCase())) c.locations.push(l);
    }
    if (!isQuote(inv) && inv.pricing === 'lump' && !c.monthlyFee && inv.lumpAmount) c.monthlyFee = Number(inv.lumpAmount);
    c.updatedAt = Date.now();
    inv.client.id = c.id;
    await db.put('clients', c);
  }
  const services = await db.all('services');
  const fresh = [];
  const lines = [...inv.groups.flatMap((g) => g.items), ...(inv.extras || [])];
  for (const it of lines) {
    const desc = it.desc.trim();
    if (!desc) continue;
    if ([...services, ...fresh].some((s) => s.name.trim().toLowerCase() === desc.toLowerCase())) continue;
    fresh.push({ id: uid(), name: desc, price: Number(it.price) || 0, unit: it.unit || '', createdAt: Date.now() });
  }
  if (fresh.length) await db.putMany('services', fresh);
}

/** Penawaran yang disetujui → invoice baru (draft), penawaran ditandai "Disetujui". */
export async function quoteToInvoice(quote) {
  const inv = newInvoice(DOC.invoice);
  const src = structuredClone(quote);
  Object.assign(inv, {
    client: src.client,
    template: src.template,
    pricing: src.pricing,
    lumpAmount: src.lumpAmount,
    groups: src.groups.map((g) => ({ ...g, id: uid(), items: g.items.map((it) => ({ ...it, id: uid() })) })),
    extras: (src.extras || []).map((it) => ({ ...it, id: uid() })),
    payments: (src.payments || []).map((p) => ({ ...p, id: uid() })),
    discount: src.discount,
    tax: src.tax,
    notes: src.notes,
    period: src.period,
    fromQuote: { id: quote.id, number: quote.number },
  });
  await saveInvoice(inv, { learn: false });
  quote.invoiceId = inv.id;
  await saveInvoice(quote, { learn: false });
  return inv;
}

/* ---------- Teks pesan WhatsApp ---------- */
function shortDay(iso) {
  const d = parseISO(iso);
  return d ? `${d.getDate()} ${MON[d.getMonth()]}` : '';
}

const MAX_LINES = 12;

export function summaryLines(inv) {
  const lines = [];
  for (const g of inv.groups.filter((x) => x.items.length)) {
    const dated = g.items.some((it) => it.date) && !isQuote(inv);
    if (dated) {
      const dates = g.items.map((it) => shortDay(it.date)).filter(Boolean);
      const label = g.name.trim() || g.items[0]?.desc || 'Layanan';
      lines.push(`• ${label}${g.note ? ' ' + g.note : ''}: ${g.items.length}x${dates.length ? ` (${dates.join(', ')})` : ''}`);
    } else {
      if (g.name.trim()) lines.push(`*${g.name.trim()}*`);
      g.items.forEach((it) => lines.push(`• ${it.desc || 'Item'} — ${fmtQty(it)}`));
    }
  }
  (inv.extras || []).forEach((it) => lines.push(`• ${it.desc || 'Tambahan'} — ${fmtQty(it)}`));
  if (lines.length > MAX_LINES) return [...lines.slice(0, MAX_LINES - 1), `• dan ${lines.length - MAX_LINES + 1} item lainnya`].join('\n');
  return lines.join('\n');
}

export function buildMessage(inv, template) {
  const s = getSettings();
  const t = calc(inv);
  const pay = s.business.paymentInfo?.trim() ? `Pembayaran dapat ditransfer ke:\n${s.business.paymentInfo.trim()}` : '';
  const map = {
    klien: inv.client.name || 'Bapak/Ibu',
    usaha: s.business.name || 'kami',
    nomor: inv.number || '-',
    periode: fmtPeriod(inv.period) || fmtDate(inv.issueDate),
    total: rupiah(t.total),
    dp: rupiah(t.paid),
    sisa: rupiah(t.balance),
    info_dp: t.paid ? `Sudah dibayar (DP): ${rupiah(t.paid)}\nSisa pembayaran: *${rupiah(t.balance)}*` : '',
    tanggal: fmtDate(inv.issueDate),
    jatuh_tempo: inv.dueDate ? fmtDate(inv.dueDate) : '-',
    rincian: summaryLines(inv),
    pembayaran: isQuote(inv) ? '' : pay,
  };
  const tpl = template ?? (isQuote(inv) ? s.waQuoteTemplate : s.waTemplate);
  return String(tpl)
    .split('\n')
    .filter((line) => inv.number || !line.includes('{nomor}')) // dokumen tanpa nomor: baris "No. ..." dibuang
    .join('\n')
    .replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
