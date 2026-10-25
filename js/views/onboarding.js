/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved. */
import { $, pickFile, readFileAsText } from '../util.js';
import { icon } from '../icons.js';
import { toast } from '../ui.js';
import { businessForm } from './business-form.js';
import { parseBackup, restoreBackup } from '../backup.js';
import { downloadExcelTemplate, runExcelImport } from './excel-import-ui.js';
import { modePickerHTML, bindModePicker } from '../mode.js';

/** Langkah setelah PIN dibuat: isi profil usaha (boleh dilewati). */
export function onboardingProfile() {
  return new Promise((resolve) => {
    $('#app').innerHTML = `
    <div class="welcome">
      <div class="welcome-card wide">
        <div class="step-pill">Langkah 2 dari 2</div>
        <h1 class="h-left">Profil usaha Anda</h1>
        <p class="muted">Diisi sekali, otomatis tampil di setiap invoice. Bisa diubah kapan saja di menu <b>Master</b>.</p>
        <div class="fld-label ob-mode-l">Pilih gaya tampilan</div>
        <div id="ob-mode">${modePickerHTML()}</div>
        <form id="ob-form" class="form"></form>
        <div class="row-btns end">
          <button type="button" class="btn btn-ghost" id="ob-skip">Lewati</button>
          <button type="button" class="btn btn-primary" id="ob-save">${icon('check', 18)} Simpan & mulai</button>
        </div>
        <div class="divider"><span>atau</span></div>
        <div class="ob-alt">
          <button type="button" class="tile" id="ob-restore">${icon('upload')}<span><b>Pulihkan dari backup</b><small>Pindah dari HP/laptop lain (.json)</small></span></button>
          <button type="button" class="tile" id="ob-excel">${icon('layout')}<span><b>Impor dari Excel</b><small>Pakai template SnapBill (.xlsx)</small></span></button>
          <div class="ob-tpl">Belum punya template? Unduh: <button type="button" class="link" data-xtpl="master">Data Master</button> · <button type="button" class="link" data-xtpl="lengkap">Lengkap</button></div>
        </div>
      </div>
    </div>`;
    bindModePicker($('#ob-mode'));
    const save = businessForm($('#ob-form'));
    const finish = () => {
      $('#app').innerHTML = '';
      resolve();
    };
    $('#ob-save').onclick = async () => {
      await save();
      finish();
    };
    $('#ob-skip').onclick = finish;
    $('#ob-excel').onclick = async () => {
      if (await runExcelImport()) finish();
    };
    $('.ob-alt').addEventListener('click', (e) => {
      const b = e.target.closest('[data-xtpl]');
      if (b) downloadExcelTemplate(b.dataset.xtpl);
    });
    $('#ob-restore').onclick = async () => {
      const f = await pickFile('application/json,.json');
      if (!f) return;
      try {
        const obj = parseBackup(await readFileAsText(f));
        await restoreBackup(obj, 'replace');
        toast(`Data dipulihkan: ${obj.data.invoices.length} tagihan`, { type: 'success' });
        finish();
      } catch (e) {
        toast(e.message, { type: 'error', timeout: 5000 });
      }
    };
  });
}
