/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Impor data dari template Excel (Data Master / Lengkap).
 * Aturan: nama klien, nama item, dan nomor dokumen yang sama DIPERBARUI; sisanya ditambahkan; tidak ada yang dihapus. */
import { db } from './db.js';
import { getSettings, saveSettings } from './state.js';
import { uid, toISO, parseMoney, parseQty, MONTHS } from './util.js';
import { newInvoice, newGroup, newItem, newPayment, normalize, DOC } from './invoice-model.js';
import { TEMPLATES } from './templates.js';
import { readXlsx } from './xlsx-reader.js';

export const EXCEL_TEMPLATES = {
  master: { file: 'templates/snapbill-template-data-master.xlsx', label: 'Data Master' },
  lengkap: { file: 'templates/snapbill-template-lengkap.xlsx', label: 'Lengkap' },
};

/* ---------- Kolom (dicocokkan lewat judul, tidak peka urutan & huruf besar) ---------- */
const key = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const COLUMNS = {
  Klien: { name: ['namaklien', 'nama'], phone: ['nowhatsapp', 'whatsapp', 'nowa', 'nohp', 'telepon'], address: ['alamat'], fee: ['biayabulanan'], locations: ['lokasi'], notes: ['catatan'] },
  'Item & Harga': { name: ['namaitem', 'nama'], unit: ['satuan'], price: ['hargasatuan', 'harga'] },
  Dokumen: {
    number: ['nodokumen', 'nomordokumen', 'nomor'], docType: ['jenis'], client: ['namaklien', 'klien'], date: ['tanggal'],
    period: ['periode', 'bulan'], due: ['jatuhtempo', 'berlaku'], model: ['model'], lump: ['hargaborongan', 'borongan'],
    discount: ['diskon'], tax: ['pajak'], status: ['status'], notes: ['catatan'],
  },
  Rincian: {
    number: ['nodokumen', 'nomordokumen', 'nomor'], type: ['tipe'], group: ['lokasibagian', 'lokasi', 'bagian'], desc: ['rincian'],
    date: ['tanggal'], qty: ['jumlah', 'qty'], unit: ['satuan'], price: ['hargasatuan', 'harga'],
  },
};
const PROFILE = {
  namausaha: 'name', slogan: 'tagline', notelepon: 'phone', telepon: 'phone', email: 'email', alamat: 'address',
  namapenandatangan: 'signName', penandatangan: 'signName', infopembayaran: 'paymentInfo', layananutama: 'defaultService',
};

/** Pemetaan field → indeks kolom dari baris judul. */
function mapHeader(header, spec) {
  const heads = (header || []).map(key);
  const map = {};
  for (const [field, aliases] of Object.entries(spec)) {
    const i = heads.findIndex((h) => h && aliases.some((a) => h.startsWith(a)));
    if (i >= 0) map[field] = i;
  }
  return map;
}

/** Baris data: lewati judul (baris 1), baris keterangan template (baris 2), dan baris kosong. */
function dataRows(rows) {
  const out = [];
  rows.forEach((cells, i) => {
    if (i === 0 || !cells || !cells.some((v) => v !== undefined && String(v).trim() !== '')) return;
    if (i === 1 && /^(wajib|jangan ubah)/i.test(String(cells[0] ?? '').trim())) return;
    out.push({ excelRow: i + 1, cells });
  });
  return out;
}

/* ---------- Normalisasi nilai sel ---------- */
const str = (v) => (v === undefined || v === null ? '' : typeof v === 'number' ? String(v) : String(v).trim());
const phoneStr = (v) => {
  const s = str(v);
  return typeof v === 'number' && s.startsWith('8') ? '0' + s : s;
};
const money = (v) => (typeof v === 'number' ? Math.round(v) : parseMoney(v));
const percent = (v) => {
  if (v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace('%', '').replace(',', '.'));
  if (!Number.isFinite(n)) return 0;
  return n > 0 && n < 1 ? Math.round(n * 10000) / 100 : n;
};

function serialToISO(n, date1904) {
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const d = new Date(base + Math.round(n) * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

const MONTH_INDEX = (() => {
  const m = {};
  MONTHS.forEach((name, i) => {
    m[name.toLowerCase()] = i + 1;
    m[name.slice(0, 3).toLowerCase()] = i + 1;
  });
  ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].forEach((n, i) => {
    m[n] = i + 1;
    m[n.slice(0, 3)] = i + 1;
  });
  m.agt = 8;
  return m;
})();

/** Tanggal → 'YYYY-MM-DD'. '' bila kosong, null bila tidak terbaca. */
function toDate(v, date1904) {
  if (v === undefined || v === '') return '';
  if (typeof v === 'number') return v > 0 && v < 2958466 ? serialToISO(v, date1904) : null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[\s-]+([a-z]+)[\s-]+(\d{2,4})$/i);
  if (m && MONTH_INDEX[m[2].toLowerCase()]) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], MONTH_INDEX[m[2].toLowerCase()], +m[1]);
  return null;
}
function valid(y, mo, d) {
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? toISO(dt) : null;
}

/** Periode → 'YYYY-MM'. '' bila kosong, null bila tidak terbaca. */
function toPeriod(v, date1904) {
  if (v === undefined || v === '') return '';
  if (typeof v === 'number') return serialToISO(v, date1904).slice(0, 7);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = s.match(/^([a-z]+)\s+(\d{4})$/i);
  if (m && MONTH_INDEX[m[1].toLowerCase()]) return `${m[2]}-${String(MONTH_INDEX[m[1].toLowerCase()]).padStart(2, '0')}`;
  const d = toDate(v, date1904);
  return d ? d.slice(0, 7) : null;
}

function toQty(qtyCell, unitCell) {
  let unit = str(unitCell);
  if (qtyCell === undefined || qtyCell === '') return { qty: 1, unit };
  if (typeof qtyCell === 'number') return { qty: qtyCell, unit };
  const p = parseQty(qtyCell);
  return { qty: p.qty || 1, unit: unit || p.unit };
}

const MODEL_KEYS = Object.fromEntries(Object.entries(TEMPLATES).flatMap(([k, t]) => [[key(k), k], [key(t.name), k]]));
const docKey = (docType, number) => `${docType}|${String(number).trim().toLowerCase()}`;
const nameKey = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/* ---------- 1. Baca & validasi ---------- */
export async function parseExcelFile(file) {
  const { sheets, date1904 } = await readXlsx(await file.arrayBuffer());
  const errors = [];
  const warnings = [];
  const err = (sheet, row, msg) => errors.push(`${sheet} baris ${row}: ${msg}`);
  const warn = (sheet, row, msg) => warnings.push(`${sheet} baris ${row}: ${msg}`);
  const sheet = (name) => {
    const found = Object.keys(sheets).find((n) => key(n) === key(name));
    return found ? sheets[found] : null;
  };

  const known = ['Profil Usaha', 'Klien', 'Item & Harga', 'Dokumen', 'Rincian'].filter((n) => sheet(n));
  if (!known.length) throw new Error('Sheet template SnapBill tidak ditemukan. Gunakan template dari menu Pengaturan → Backup.');
  const kind = sheet('Dokumen') ? 'lengkap' : 'master';

  /* Profil usaha */
  const business = {};
  for (const { cells } of dataRows(sheet('Profil Usaha') || [])) {
    const field = PROFILE[key(cells[0])];
    const value = str(cells[1]);
    if (field && value) business[field] = field === 'phone' ? phoneStr(cells[1]) : value;
  }

  /* Klien */
  const clients = new Map();
  const kRows = sheet('Klien');
  if (kRows) {
    const c = mapHeader(kRows[0], COLUMNS.Klien);
    if (c.name === undefined) err('Klien', 1, 'kolom "Nama Klien" tidak ditemukan');
    else
      for (const { excelRow, cells } of dataRows(kRows)) {
        const name = str(cells[c.name]);
        if (!name) {
          err('Klien', excelRow, 'Nama Klien kosong — baris dilewati');
          continue;
        }
        if (clients.has(nameKey(name))) warn('Klien', excelRow, `"${name}" muncul lebih dari sekali — digabung`);
        const prev = clients.get(nameKey(name)) || { name, phone: '', address: '', monthlyFee: 0, locations: [], notes: '' };
        const locs = str(cells[c.locations]).split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
        clients.set(nameKey(name), {
          name,
          phone: phoneStr(cells[c.phone]) || prev.phone,
          address: str(cells[c.address]) || prev.address,
          monthlyFee: money(cells[c.fee]) || prev.monthlyFee,
          locations: [...new Set([...prev.locations, ...locs])],
          notes: str(cells[c.notes]) || prev.notes,
        });
      }
  }

  /* Item & harga */
  const items = new Map();
  const iRows = sheet('Item & Harga');
  if (iRows) {
    const c = mapHeader(iRows[0], COLUMNS['Item & Harga']);
    if (c.name === undefined) err('Item & Harga', 1, 'kolom "Nama Item" tidak ditemukan');
    else
      for (const { excelRow, cells } of dataRows(iRows)) {
        const name = str(cells[c.name]);
        if (!name) {
          err('Item & Harga', excelRow, 'Nama Item kosong — baris dilewati');
          continue;
        }
        if (items.has(nameKey(name))) warn('Item & Harga', excelRow, `"${name}" muncul lebih dari sekali — yang terakhir dipakai`);
        items.set(nameKey(name), { name, unit: str(cells[c.unit]), price: money(cells[c.price]) });
      }
  }

  /* Dokumen */
  const docs = new Map(); // nomor (huruf kecil) → dokumen
  const dRows = sheet('Dokumen');
  if (dRows) {
    const c = mapHeader(dRows[0], COLUMNS.Dokumen);
    for (const need of ['number', 'client']) if (c[need] === undefined) err('Dokumen', 1, `kolom "${need === 'number' ? 'No. Dokumen' : 'Nama Klien'}" tidak ditemukan`);
    if (c.number !== undefined && c.client !== undefined)
      for (const { excelRow, cells } of dataRows(dRows)) {
        const number = str(cells[c.number]);
        const clientName = str(cells[c.client]);
        if (!number) {
          err('Dokumen', excelRow, 'No. Dokumen kosong — baris dilewati');
          continue;
        }
        if (!clientName) {
          err('Dokumen', excelRow, `Nama Klien kosong untuk ${number} — baris dilewati`);
          continue;
        }
        if (docs.has(number.toLowerCase())) {
          err('Dokumen', excelRow, `No. Dokumen ${number} sudah dipakai di baris lain — baris dilewati`);
          continue;
        }
        const jenis = key(cells[c.docType]);
        let docType = DOC.invoice;
        if (/^(penawaran|quote|quotation)/.test(jenis)) docType = DOC.quote;
        else if (jenis && !/^(invoice|tagihan|faktur)/.test(jenis)) warn('Dokumen', excelRow, `Jenis "${str(cells[c.docType])}" tidak dikenal → Invoice`);

        const date = toDate(cells[c.date], date1904);
        if (date === null) warn('Dokumen', excelRow, `Tanggal "${str(cells[c.date])}" tidak terbaca → dikosongkan`);
        else if (!date) warn('Dokumen', excelRow, `Tanggal ${number} kosong`);
        const due = toDate(cells[c.due], date1904);
        if (due === null) warn('Dokumen', excelRow, `Jatuh Tempo "${str(cells[c.due])}" tidak terbaca → dikosongkan`);
        const period = toPeriod(cells[c.period], date1904);
        if (period === null) warn('Dokumen', excelRow, `Periode "${str(cells[c.period])}" tidak terbaca → dikosongkan`);

        let template = MODEL_KEYS[key(cells[c.model])];
        if (!template) {
          if (str(cells[c.model])) warn('Dokumen', excelRow, `Model "${str(cells[c.model])}" tidak dikenal → ${docType === DOC.quote ? 'Kuantitas' : 'Klasik'}`);
          template = docType === DOC.quote ? 'kuantitas' : getSettings().template || 'klasik';
        }

        const inv = newInvoice(docType);
        const lump = money(cells[c.lump]);
        Object.assign(inv, {
          number,
          autoNumber: false,
          status: key(cells[c.status]) === 'draft' ? 'draft' : 'sent',
          client: { id: '', name: clientName, phone: '', address: '' },
          issueDate: date || '',
          dueDate: due || '',
          period: period || (date ? date.slice(0, 7) : ''),
          template,
          pricing: lump > 0 ? 'lump' : 'item',
          lumpAmount: lump,
          groups: [],
          discount: { type: 'percent', value: percent(cells[c.discount]) },
          tax: { label: 'PPN', rate: percent(cells[c.tax]) },
          notes: str(cells[c.notes]),
        });
        inv._row = excelRow;
        docs.set(number.toLowerCase(), inv);
      }
  }

  /* Rincian */
  const rRows = sheet('Rincian');
  if (rRows) {
    const c = mapHeader(rRows[0], COLUMNS.Rincian);
    if (c.number === undefined) err('Rincian', 1, 'kolom "No. Dokumen" tidak ditemukan');
    else
      for (const { excelRow, cells } of dataRows(rRows)) {
        const number = str(cells[c.number]);
        if (!number) {
          err('Rincian', excelRow, 'No. Dokumen kosong — baris dilewati');
          continue;
        }
        const inv = docs.get(number.toLowerCase());
        if (!inv) {
          err('Rincian', excelRow, `No. Dokumen ${number} tidak ada di sheet Dokumen — baris dilewati`);
          continue;
        }
        const tipe = key(cells[c.type]);
        const desc = str(cells[c.desc]);
        const price = money(cells[c.price]);
        const date = toDate(cells[c.date], date1904);
        if (date === null) warn('Rincian', excelRow, `Tanggal "${str(cells[c.date])}" tidak terbaca → dikosongkan`);
        const { qty, unit } = toQty(cells[c.qty], cells[c.unit]);

        if (tipe.startsWith('dp') || tipe.startsWith('uangmuka') || tipe.startsWith('bayar')) {
          if (!price) {
            err('Rincian', excelRow, `DP untuk ${number} tanpa nominal di "Harga Satuan" — baris dilewati`);
            continue;
          }
          inv.payments.push(newPayment({ label: desc || `DP ${inv.payments.length + 1}`, amount: price, date: date || '' }));
          continue;
        }
        if (!desc && !date && !price) {
          err('Rincian', excelRow, 'Rincian, Tanggal, dan Harga kosong — baris dilewati');
          continue;
        }
        const line = newItem({ desc: desc || getSettings().invoice.defaultService || '', date: date || '', qty, unit, price });
        if (tipe.startsWith('tambah') || tipe.startsWith('material') || tipe.startsWith('extra')) {
          inv.extras.push(line);
        } else {
          if (tipe && !tipe.startsWith('kunjungan') && !tipe.startsWith('layanan') && !tipe.startsWith('item'))
            warn('Rincian', excelRow, `Tipe "${str(cells[c.type])}" tidak dikenal → Kunjungan`);
          const gname = str(cells[c.group]);
          let g = inv.groups.find((x) => x.name.toLowerCase() === gname.toLowerCase());
          if (!g) {
            g = newGroup({ name: gname, items: [] });
            inv.groups.push(g);
          }
          g.items.push(line);
        }
      }
  }

  for (const [k, inv] of docs) {
    if (!inv.groups.length && !inv.extras.length && !(inv.pricing === 'lump' && inv.lumpAmount)) {
      err('Dokumen', inv._row, `${inv.number} tidak punya rincian di sheet Rincian — dokumen dilewati`);
      docs.delete(k);
    }
  }

  return { kind, business, clients: [...clients.values()], items: [...items.values()], docs: [...docs.values()], errors, warnings };
}

/* ---------- 2. Rencana impor (baru vs diperbarui) ---------- */
export async function planImport(parsed) {
  const [clients, services, invoices] = await Promise.all([db.all('clients'), db.all('services'), db.all('invoices')]);
  const cMap = new Map(clients.map((c) => [nameKey(c.name), c]));
  const sMap = new Map(services.map((s) => [nameKey(s.name), s]));
  const dMap = new Map(invoices.map((i) => [docKey(i.docType || DOC.invoice, i.number || ''), i]));

  // Klien yang hanya muncul di sheet Dokumen ikut ditambahkan.
  const allClients = [...parsed.clients];
  const seen = new Set(allClients.map((c) => nameKey(c.name)));
  for (const d of parsed.docs) {
    const k = nameKey(d.client.name);
    if (!seen.has(k)) {
      seen.add(k);
      allClients.push({ name: d.client.name, phone: '', address: '', monthlyFee: 0, locations: [], notes: '' });
    }
  }
  const count = (list, has) => ({ new: list.filter((x) => !has(x)).length, updated: list.filter(has).length });
  return {
    parsed,
    clients: allClients,
    existing: { cMap, sMap, dMap },
    counts: {
      business: Object.keys(parsed.business).length,
      clients: count(allClients, (c) => cMap.has(nameKey(c.name))),
      items: count(parsed.items, (s) => sMap.has(nameKey(s.name))),
      docs: count(parsed.docs, (d) => dMap.has(docKey(d.docType, d.number))),
      quotes: parsed.docs.filter((d) => d.docType === DOC.quote).length,
    },
  };
}

/* ---------- 3. Tulis ke database ---------- */
export async function applyImport(plan) {
  const { parsed, existing } = plan;
  const now = Date.now();

  const { defaultService, ...biz } = parsed.business;
  if (Object.keys(biz).length || defaultService) {
    await saveSettings({ business: biz, ...(defaultService ? { invoice: { defaultService } } : {}) });
  }

  const clientOut = new Map();
  for (const c of plan.clients) {
    const old = existing.cMap.get(nameKey(c.name));
    const locNames = new Set((old?.locations || []).map((l) => l.name.toLowerCase()));
    const locations = [...(old?.locations || []), ...c.locations.filter((n) => !locNames.has(n.toLowerCase())).map((name) => ({ name, note: '' }))];
    const rec = old
      ? { ...old, phone: c.phone || old.phone, address: c.address || old.address, notes: c.notes || old.notes, monthlyFee: c.monthlyFee || old.monthlyFee || 0, locations, updatedAt: now }
      : { id: uid(), name: c.name, phone: c.phone, address: c.address, monthlyFee: c.monthlyFee, locations, notes: c.notes, createdAt: now, updatedAt: now };
    clientOut.set(nameKey(c.name), rec);
  }
  await db.putMany('clients', [...clientOut.values()]);

  const services = parsed.items.map((s) => {
    const old = existing.sMap.get(nameKey(s.name));
    return old
      ? { ...old, unit: s.unit || old.unit || '', price: s.price || old.price || 0, updatedAt: now }
      : { id: uid(), name: s.name, unit: s.unit, price: s.price, createdAt: now };
  });
  await db.putMany('services', services);

  const docs = parsed.docs.map((d) => {
    const { _row, ...doc } = d;
    const c = clientOut.get(nameKey(doc.client.name)) || existing.cMap.get(nameKey(doc.client.name));
    if (c) doc.client = { id: c.id, name: c.name, phone: c.phone || '', address: c.address || '' };
    const old = existing.dMap.get(docKey(doc.docType, doc.number));
    const created = doc.issueDate ? new Date(doc.issueDate).getTime() : now;
    return normalize({ ...doc, id: old?.id || doc.id, createdAt: old?.createdAt || created, updatedAt: now, source: { excelImport: true } });
  });
  await db.putMany('invoices', docs);

  return { clients: clientOut.size, items: services.length, docs: docs.length };
}
