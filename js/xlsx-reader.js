/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Pembaca .xlsx mini tanpa library: ZIP dibuka dengan DecompressionStream bawaan browser,
 * XML dibaca dengan DOMParser. Cukup untuk template impor SnapBill (teks, angka, tanggal). */

const SIG_EOCD = 0x06054b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export const canReadXlsx = () => typeof DecompressionStream === 'function' && typeof DOMParser === 'function';

/** Daftar isi ZIP: nama file → fungsi untuk mengambil isinya (Uint8Array). */
function readZip(buf) {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('File bukan .xlsx yang valid (bukan arsip ZIP).');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const entries = {};
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== SIG_CEN) throw new Error('Struktur file .xlsx rusak.');
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries[name] = { method, size, local };
    p += 46 + nameLen + extraLen + commentLen;
  }
  const open = async (name) => {
    const e = entries[name];
    if (!e) return null;
    if (view.getUint32(e.local, true) !== SIG_LOC) throw new Error('Struktur file .xlsx rusak.');
    const start = e.local + 30 + view.getUint16(e.local + 26, true) + view.getUint16(e.local + 28, true);
    const data = bytes.subarray(start, start + e.size);
    if (e.method === 0) return data;
    if (e.method !== 8) throw new Error('Kompresi file .xlsx tidak didukung.');
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };
  return { entries, open };
}

const xml = (u8) => new DOMParser().parseFromString(new TextDecoder().decode(u8), 'application/xml');
const tags = (el, name) => [...el.getElementsByTagNameNS('*', name)];

/** "AB12" → indeks kolom 27 (0-based). */
function colIndex(ref) {
  const letters = String(ref).match(/^[A-Z]+/i)?.[0].toUpperCase() || 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function resolveTarget(target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = ('xl/' + target).split('/');
  const out = [];
  for (const s of parts) {
    if (s === '..') out.pop();
    else if (s && s !== '.') out.push(s);
  }
  return out.join('/');
}

/**
 * Baca workbook. Mengembalikan { sheets: { [nama]: rows }, date1904 }.
 * rows[i][j] = nilai sel baris ke-(i+1), kolom ke-(j+1): string, number, boolean, atau undefined.
 */
export async function readXlsx(arrayBuffer) {
  if (!canReadXlsx()) throw new Error('Browser ini belum bisa membaca file Excel. Perbarui browser Anda.');
  const zip = readZip(arrayBuffer);
  const wbBytes = await zip.open('xl/workbook.xml');
  if (!wbBytes) throw new Error('File ini bukan workbook Excel (.xlsx).');
  const wb = xml(wbBytes);
  const date1904 = tags(wb, 'workbookPr')[0]?.getAttribute('date1904') === '1' || tags(wb, 'workbookPr')[0]?.getAttribute('date1904') === 'true';

  const relsBytes = await zip.open('xl/_rels/workbook.xml.rels');
  const rels = {};
  if (relsBytes) tags(xml(relsBytes), 'Relationship').forEach((r) => (rels[r.getAttribute('Id')] = resolveTarget(r.getAttribute('Target'))));

  const shared = [];
  const sstBytes = await zip.open('xl/sharedStrings.xml');
  if (sstBytes) tags(xml(sstBytes), 'si').forEach((si) => shared.push(tags(si, 't').map((t) => t.textContent).join('')));

  const sheets = {};
  for (const sh of tags(wb, 'sheet')) {
    const name = sh.getAttribute('name');
    const rid = sh.getAttributeNS(REL_NS, 'id') || sh.getAttribute('r:id');
    const path = rels[rid];
    const data = path && (await zip.open(path));
    if (!data) continue;
    const rows = [];
    for (const row of tags(xml(data), 'row')) {
      const r = Number(row.getAttribute('r')) || rows.length + 1;
      const cells = [];
      let next = 0;
      for (const c of tags(row, 'c')) {
        const ref = c.getAttribute('r');
        const ci = ref ? colIndex(ref) : next;
        next = ci + 1;
        const type = c.getAttribute('t');
        const v = tags(c, 'v')[0]?.textContent;
        let value;
        if (type === 's') value = v !== undefined ? shared[Number(v)] : undefined;
        else if (type === 'inlineStr') value = tags(c, 't').map((t) => t.textContent).join('');
        else if (type === 'str' || type === 'e') value = v;
        else if (type === 'b') value = v === '1';
        else if (v !== undefined && v !== '') value = Number(v);
        if (value !== undefined && value !== '') cells[ci] = value;
      }
      if (cells.length) rows[r - 1] = cells;
    }
    sheets[name] = rows;
  }
  return { sheets, date1904 };
}
