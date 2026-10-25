/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Tampilan impor dari Excel: unduh template, pilih file, ringkasan, lalu impor. */
import { esc, pickFile } from '../util.js';
import { icon } from '../icons.js';
import { toast, sheet, busy } from '../ui.js';
import { saveFile } from '../export.js';
import { EXCEL_TEMPLATES, parseExcelFile, planImport, applyImport } from '../excel-import.js';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_LIST = 40;

/** Tombol-tombol blok "Pindahkan dari Excel" (dipakai di Pengaturan). */
export const excelBlockHTML = () => `
  <div class="excel-block">
    <div class="fld-label">${icon('layout', 16)} Pindahkan dari Excel</div>
    <p class="hint">Unduh template, isi data lama Anda, lalu impor. Pilih <b>Data Master</b> (profil, klien, item & harga) atau <b>Lengkap</b> (+ invoice/penawaran beserta rinciannya).</p>
    <div class="row-btns">
      <button type="button" class="btn btn-ghost btn-sm" data-xtpl="master">${icon('download', 16)} Template Data Master</button>
      <button type="button" class="btn btn-ghost btn-sm" data-xtpl="lengkap">${icon('download', 16)} Template Lengkap</button>
    </div>
    <button type="button" class="btn btn-soft btn-block" data-ximport>${icon('upload', 18)} Impor file Excel (.xlsx)</button>
  </div>`;

export async function downloadExcelTemplate(kind) {
  const t = EXCEL_TEMPLATES[kind];
  try {
    const res = await fetch(t.file);
    if (!res.ok) throw new Error('File template tidak ditemukan');
    const file = new File([await res.blob()], t.file.split('/').pop(), { type: XLSX_TYPE });
    await saveFile(file);
  } catch (e) {
    toast('Gagal mengunduh template: ' + e.message, { type: 'error' });
  }
}

const list = (items) =>
  `<ul>${items.slice(0, MAX_LIST).map((m) => `<li>${esc(m)}</li>`).join('')}${items.length > MAX_LIST ? `<li><i>…dan ${items.length - MAX_LIST} lainnya</i></li>` : ''}</ul>`;

const stat = (n, label, c) =>
  `<div><b>${n}</b><small>${label}${c ? `<br>${c.new} baru · ${c.updated} diperbarui` : ''}</small></div>`;

/** Pilih file .xlsx → ringkasan → impor. Resolve true bila data berhasil diimpor. */
export async function runExcelImport() {
  const file = await pickFile(`.xlsx,${XLSX_TYPE}`);
  if (!file) return false;
  let plan;
  const stop = busy('Membaca file Excel…');
  try {
    plan = await planImport(await parseExcelFile(file));
  } catch (e) {
    stop();
    toast(e.message || 'File tidak bisa dibaca', { type: 'error', timeout: 6000 });
    return false;
  }
  stop();

  const { counts, parsed } = plan;
  const total = counts.clients.new + counts.clients.updated + counts.items.new + counts.items.updated + counts.docs.new + counts.docs.updated + counts.business;
  const sh = sheet({
    title: 'Impor dari Excel',
    content: `
      <p class="sheet-msg"><b>${esc(file.name)}</b> · template ${parsed.kind === 'lengkap' ? 'Lengkap' : 'Data Master'}</p>
      <div class="backup-info">
        ${stat(counts.clients.new + counts.clients.updated, 'klien', counts.clients)}
        ${stat(counts.items.new + counts.items.updated, 'item & harga', counts.items)}
        ${parsed.kind === 'lengkap' ? stat(counts.docs.new + counts.docs.updated, `dokumen${counts.quotes ? ` (${counts.quotes} penawaran)` : ''}`, counts.docs) : ''}
        ${counts.business ? stat(counts.business, 'isian profil usaha') : ''}
      </div>
      ${parsed.errors.length ? `<details class="imp-issues imp-err" open><summary>${icon('alert', 16)} ${parsed.errors.length} baris tidak bisa diimpor</summary>${list(parsed.errors)}</details>` : ''}
      ${parsed.warnings.length ? `<details class="imp-issues imp-warn"><summary>${icon('info', 16)} ${parsed.warnings.length} catatan</summary>${list(parsed.warnings)}</details>` : ''}
      <p class="hint">${total ? 'Data dengan nama klien, nama item, atau nomor dokumen yang sama akan <b>diperbarui</b>. Data lain di aplikasi tidak dihapus.' : 'Tidak ada data yang bisa diimpor. Periksa isi file Anda.'}</p>`,
    actions: total
      ? [
          { label: 'Batal', kind: 'ghost', value: false },
          {
            label: 'Impor sekarang',
            kind: 'primary',
            onClick: async () => {
              const stopApply = busy('Mengimpor data…');
              try {
                const r = await applyImport(plan);
                toast(`Berhasil: ${r.clients} klien, ${r.items} item, ${r.docs} dokumen`, { type: 'success', timeout: 4000 });
              } catch (e) {
                toast('Gagal mengimpor: ' + e.message, { type: 'error', timeout: 6000 });
                return false;
              } finally {
                stopApply();
              }
              return undefined;
            },
            value: true,
          },
        ]
      : [{ label: 'Tutup', kind: 'primary', value: false }],
  });
  return (await sh.result) === true;
}
