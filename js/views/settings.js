/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Pengaturan: template, penomoran, pesan WhatsApp, keamanan, backup. */
import { db, meta } from '../db.js';
import { getSettings, saveSettings, replaceSettings, DEFAULT_WA_TEMPLATE, DEFAULT_WA_QUOTE_TEMPLATE, APP_VERSION } from '../state.js';
import { esc, relTime, todayISO, pickFile, readFileAsText, debounce } from '../util.js';
import { icon } from '../icons.js';
import { TEMPLATES, LABEL_FIELDS, labelsFor, renderInvoice } from '../templates.js';
import { formatNumber, getNextSeq, setNextSeq, buildMessage } from '../invoice-model.js';
import { toast, sheet, confirmDialog, busy } from '../ui.js';
import { unlockScreen, createPinFlow, lockNow, exitApp } from '../auth.js';
import { exportBackup, parseBackup, restoreBackup } from '../backup.js';
import { mountPreview, previewTemplate } from './shared.js';
import { demoInvoice } from '../sample.js';
import { excelBlockHTML, downloadExcelTemplate, runExcelImport } from './excel-import-ui.js';
import { modePickerHTML, bindModePicker, MODES } from '../mode.js';

export async function render(ctx) {
  ctx.setTitle('Pengaturan');
  const s = getSettings();
  const previews = [];

  ctx.el.innerHTML = `
    <section class="card set-mode" id="sec-mode">
      <div class="card-title">${icon('sparkle', 19)} Mode tampilan</div>
      ${modePickerHTML()}
      <p class="hint">Semua fitur sama persis — yang berbeda hanya tampilan. Bisa diganti kapan saja.</p>
    </section>

    <details class="card set" id="sec-template">
      <summary class="card-title">${icon('layout', 19)} Model invoice</summary>
      <p class="muted small">Pilih model default untuk tagihan baru. Setiap tagihan tetap bisa memakai model lain.</p>
      <div class="tpl-grid" id="tpl-grid">
        ${Object.entries(TEMPLATES).map(([k, t]) => `
          <div class="tpl-card" data-tpl="${k}" role="button" tabindex="0" aria-label="Jadikan ${esc(t.name)} model default">
            <div class="tpl-thumb" data-thumb="${k}"></div>
            <div class="tpl-meta"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></div>
            <span class="tpl-check">${icon('check', 16)}</span>
            <button type="button" class="tpl-eye-btn" data-eye="${k}" aria-label="Lihat contoh model ${esc(t.name)}" title="Lihat contoh">${icon('eye', 18)}</button>
          </div>`).join('')}
      </div>
      <div class="switches">
        <label class="switch"><input type="checkbox" id="opt-number" ${s.invoice.showNumber ? 'checked' : ''}><span></span><div><b>Tampilkan nomor & tanggal</b><small>Di pojok kanan atas invoice</small></div></label>
      </div>
      <div class="fld"><span class="fld-label">Ukuran PDF</span>
        <div class="seg seg-sm" id="opt-pdf">
          <button type="button" data-v="a4">Kertas A4</button>
          <button type="button" data-v="fit">Menyesuaikan isi (enak dilihat di HP)</button>
        </div>
      </div>
      <label class="fld"><span>Judul dokumen penawaran</span><input id="quote-title" value="${esc(s.invoice.quoteTitle)}" placeholder="PENAWARAN" autocapitalize="characters"></label>
      <details class="sub" id="labels-box">
        <summary>${icon('edit', 16)} Ubah teks label model <b id="lbl-name"></b></summary>
        <div id="labels-form" class="form"></div>
      </details>
    </details>

    <details class="card set" id="sec-number">
      <summary class="card-title">${icon('hash', 19)} Penomoran otomatis</summary>
      <label class="switch"><input type="checkbox" id="num-on" ${s.numbering.enabled ? 'checked' : ''}><span></span><div><b>Nomor invoice otomatis</b><small>Bertambah sendiri setiap tagihan baru disimpan</small></div></label>
      <div id="num-opts">
        <label class="fld"><span>Format</span><input id="num-pattern" value="${esc(s.numbering.pattern)}" autocapitalize="characters"></label>
        <div class="tokens" id="num-tokens">${['{YYYY}', '{YY}', '{MM}', '{DD}', '{SEQ:3}', '{SEQ:4}'].map((t) => `<button type="button" class="chip chip-sm" data-tok="${t}">${t}</button>`).join('')}</div>
        <div class="grid2">
          <label class="fld"><span>Nomor urut diulang</span>
            <select id="num-reset">
              <option value="monthly" ${s.numbering.reset === 'monthly' ? 'selected' : ''}>Setiap bulan</option>
              <option value="yearly" ${s.numbering.reset === 'yearly' ? 'selected' : ''}>Setiap tahun</option>
              <option value="never" ${s.numbering.reset === 'never' ? 'selected' : ''}>Tidak pernah</option>
            </select></label>
          <label class="fld"><span>Nomor urut berikutnya</span><input id="num-next" inputmode="numeric"></label>
        </div>
        <div class="preview-line">Berikutnya: <b id="num-preview"></b></div>
        <label class="fld" style="margin-top:12px"><span>Format nomor penawaran</span><input id="num-qpattern" value="${esc(s.numbering.quotePattern)}" autocapitalize="characters"></label>
        <div class="preview-line">Penawaran berikutnya: <b id="num-qpreview"></b></div>
      </div>
    </details>

    <details class="card set" id="sec-wa">
      <summary class="card-title">${icon('message', 19)} Pesan WhatsApp</summary>
      <p class="muted small">Teks pengantar otomatis saat mengirim dokumen. Ketuk kode untuk menyisipkan.</p>
      <div class="seg seg-sm" id="wa-kind"><button type="button" data-k="invoice">Pesan tagihan</button><button type="button" data-k="quote">Pesan penawaran</button></div>
      <div class="tokens" id="wa-tokens">${['{klien}', '{usaha}', '{nomor}', '{periode}', '{total}', '{rincian}', '{info_dp}', '{dp}', '{sisa}', '{tanggal}', '{jatuh_tempo}', '{pembayaran}'].map((t) => `<button type="button" class="chip chip-sm" data-tok="${t}">${t}</button>`).join('')}</div>
      <textarea id="wa-text" rows="9">${esc(s.waTemplate)}</textarea>
      <div class="row-btns spread">
        <button type="button" class="btn btn-ghost btn-sm" id="wa-reset">Kembalikan default</button>
        <button type="button" class="btn btn-soft btn-sm" id="wa-try">${icon('eye', 16)} Contoh hasil</button>
      </div>
    </details>

    <details class="card set" id="sec-security">
      <summary class="card-title">${icon('shield', 19)} Keamanan</summary>
      <label class="fld"><span>Kunci otomatis setelah tidak aktif</span>
        <select id="lock-min">${[1, 3, 5, 10, 15, 30, 60].map((m) => `<option value="${m}" ${Number(s.security.lockMinutes) === m ? 'selected' : ''}>${m} menit</option>`).join('')}</select></label>
      <div class="row-btns">
        <button type="button" class="btn btn-soft" id="pin-change">${icon('lock', 18)} Ubah PIN</button>
        <button type="button" class="btn btn-ghost" id="lock-now">Kunci aplikasi</button>
      </div>
      <p class="hint">PIN berfungsi sebagai kunci layar aplikasi. Untuk keamanan penuh, aktifkan juga kunci layar (sidik jari/Face ID) di perangkat Anda.</p>
    </details>

    <details class="card set" id="sec-backup">
      <summary class="card-title">${icon('database', 19)} Backup & pindah perangkat</summary>
      <div class="backup-info" id="bk-info"></div>
      <div class="row-btns">
        <button type="button" class="btn btn-primary" id="bk-export">${icon('download', 18)} Unduh backup (.json)</button>
        <button type="button" class="btn btn-soft" id="bk-import">${icon('upload', 18)} Pulihkan dari file</button>
      </div>
      <p class="hint">Ganti HP / buka di laptop: unduh backup di perangkat lama → buka SnapBill di perangkat baru → <b>Pulihkan dari file</b>. PIN tidak ikut di dalam file backup.</p>
      ${excelBlockHTML()}
      <div class="storage" id="storage"></div>
    </details>

    <details class="card set danger-zone">
      <summary class="card-title">${icon('alert', 19)} Zona berbahaya</summary>
      <p class="muted small">Menghapus seluruh tagihan, klien, layanan, pengaturan, dan PIN dari perangkat ini.</p>
      <button type="button" class="btn btn-danger" id="wipe">${icon('trash', 18)} Hapus semua data</button>
    </details>

    <div class="about">
      <img src="icons/icon-192.png" alt="" width="44" height="44">
      <div><b>SnapBill by Silsilara</b><small>Versi ${APP_VERSION} · Data tersimpan lokal di perangkat ini</small><small>© 2026 Risyad Abdala Ramadhan. Hak cipta dilindungi undang-undang.</small></div>
    </div>

    <section class="card session-card">
      <div class="row-btns">
        <button type="button" class="btn btn-soft grow" id="sess-lock">${icon('lock', 18)} Kunci aplikasi</button>
        <button type="button" class="btn btn-soft grow" id="sess-exit">${icon('close', 18)} Tutup aplikasi</button>
      </div>
      <p class="hint">Kunci: perlu PIN untuk membuka lagi. Tutup: kunci lalu tutup tab/aplikasi (bila perangkat mengizinkan).</p>
    </section>`;

  const $ = (sel) => ctx.el.querySelector(sel);

  /* ---------- Template ---------- */
  bindModePicker($('#sec-mode'), (m) => toast(`Mode ${MODES[m].name} aktif`, { type: 'success' }));

  const paintTpl = () => {
    const cur = getSettings().template;
    ctx.el.querySelectorAll('.tpl-card').forEach((b) => b.classList.toggle('on', b.dataset.tpl === cur));
    $('#lbl-name').textContent = TEMPLATES[cur].name;
    ctx.el.querySelectorAll('#opt-pdf [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === getSettings().invoice.pdfSize));
  };
  const thumbs = () => {
    previews.splice(0).forEach((p) => p.destroy());
    ctx.el.querySelectorAll('[data-thumb]').forEach((el) => previews.push(mountPreview(el, renderInvoice(demoInvoice(el.dataset.thumb), getSettings()))));
  };
  const labelsForm = () => {
    const tpl = getSettings().template;
    const L = labelsFor(tpl);
    const base = TEMPLATES[tpl].labels;
    $('#labels-form').innerHTML =
      Object.keys(base)
        .map((k) => `<label class="fld"><span>${esc(LABEL_FIELDS[k] || k)}</span><input data-lbl="${k}" value="${esc(L[k])}" placeholder="${esc(base[k])}"></label>`)
        .join('') + `<button type="button" class="btn btn-ghost btn-sm" id="lbl-reset">Kembalikan label default</button>`;
  };
  const setDefaultTemplate = async (tpl) => {
    await saveSettings({ template: tpl });
    paintTpl();
    labelsForm();
    toast(`Model default: ${TEMPLATES[tpl].name}`, { type: 'success' });
  };
  $('#tpl-grid').addEventListener('click', (e) => {
    const eye = e.target.closest('[data-eye]');
    if (eye) {
      const tpl = eye.dataset.eye;
      previewTemplate(tpl, demoInvoice(tpl), {
        note: 'Data contoh (fiktif) dengan kop usaha Anda.',
        useLabel: 'Jadikan model default',
        active: getSettings().template === tpl,
        onUse: () => setDefaultTemplate(tpl),
      });
      return;
    }
    const b = e.target.closest('[data-tpl]');
    if (b) setDefaultTemplate(b.dataset.tpl);
  });
  $('#tpl-grid').addEventListener('keydown', (e) => {
    const b = e.target.closest('.tpl-card');
    if (b && e.target === b && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setDefaultTemplate(b.dataset.tpl);
    }
  });
  $('#opt-number').onchange = async (e) => {
    await saveSettings({ invoice: { showNumber: e.target.checked } });
    thumbs();
  };
  $('#opt-pdf').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    await saveSettings({ invoice: { pdfSize: b.dataset.v } });
    paintTpl();
  });
  $('#labels-form').addEventListener(
    'input',
    debounce(async () => {
      const tpl = getSettings().template;
      const base = TEMPLATES[tpl].labels;
      const custom = {};
      ctx.el.querySelectorAll('[data-lbl]').forEach((i) => {
        if (i.value !== base[i.dataset.lbl]) custom[i.dataset.lbl] = i.value;
      });
      const all = { ...getSettings().templateLabels, [tpl]: custom };
      await replaceSettings({ ...getSettings(), templateLabels: all });
      thumbs();
    }, 400)
  );
  $('#labels-form').addEventListener('click', async (e) => {
    if (e.target.id !== 'lbl-reset') return;
    const all = { ...getSettings().templateLabels };
    delete all[getSettings().template];
    await replaceSettings({ ...getSettings(), templateLabels: all });
    labelsForm();
    thumbs();
    toast('Label dikembalikan');
  });

  /* ---------- Penomoran ---------- */
  const numPreview = async () => {
    const n = getSettings().numbering;
    $('#num-opts').classList.toggle('disabled', !n.enabled);
    const next = await getNextSeq(todayISO());
    if (document.activeElement !== $('#num-next')) $('#num-next').value = next;
    $('#num-preview').textContent = formatNumber(n.pattern, todayISO(), next);
    $('#num-qpreview').textContent = formatNumber(n.quotePattern, todayISO(), await getNextSeq(todayISO(), 'quote'));
  };
  $('#num-qpattern').addEventListener('input', debounce(async (e) => {
    await saveSettings({ numbering: { quotePattern: e.target.value.trim() || 'PNW/{SEQ:3}' } });
    numPreview();
  }, 300));
  $('#quote-title').addEventListener('input', debounce(async (e) => {
    await saveSettings({ invoice: { quoteTitle: e.target.value.trim() || 'PENAWARAN' } });
    thumbs();
  }, 400));
  $('#num-on').onchange = async (e) => {
    await saveSettings({ numbering: { enabled: e.target.checked } });
    numPreview();
  };
  $('#num-pattern').addEventListener('input', debounce(async (e) => {
    await saveSettings({ numbering: { pattern: e.target.value.trim() || '{SEQ:3}' } });
    numPreview();
  }, 300));
  $('#num-tokens').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tok]');
    if (b) insertAtCursor($('#num-pattern'), b.dataset.tok);
  });
  $('#num-reset').onchange = async (e) => {
    await saveSettings({ numbering: { reset: e.target.value } });
    numPreview();
  };
  $('#num-next').addEventListener('change', async (e) => {
    const n = Math.max(1, parseInt(e.target.value, 10) || 1);
    await setNextSeq(todayISO(), n);
    numPreview();
    toast(`Nomor urut berikutnya: ${n}`, { type: 'success' });
  });

  /* ---------- WhatsApp ---------- */
  let waKind = 'invoice';
  const waKey = () => (waKind === 'quote' ? 'waQuoteTemplate' : 'waTemplate');
  const waDefault = () => (waKind === 'quote' ? DEFAULT_WA_QUOTE_TEMPLATE : DEFAULT_WA_TEMPLATE);
  const paintWa = () => {
    ctx.el.querySelectorAll('#wa-kind [data-k]').forEach((b) => b.classList.toggle('on', b.dataset.k === waKind));
    $('#wa-text').value = getSettings()[waKey()];
  };
  $('#wa-kind').addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    waKind = b.dataset.k;
    paintWa();
  });
  paintWa();
  $('#wa-text').addEventListener('input', debounce((e) => saveSettings({ [waKey()]: e.target.value }), 400));
  $('#wa-tokens').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tok]');
    if (b) insertAtCursor($('#wa-text'), b.dataset.tok);
  });
  $('#wa-reset').onclick = async () => {
    $('#wa-text').value = waDefault();
    await saveSettings({ [waKey()]: waDefault() });
    toast('Pesan dikembalikan ke default');
  };
  $('#wa-try').onclick = async () => {
    const list = (await db.all('invoices')).filter((i) => (i.docType || 'invoice') === waKind);
    const inv = list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || demoInvoice(waKind === 'quote' ? 'kuantitas' : 'tabel');
    if (waKind === 'quote') inv.docType = 'quote';
    sheet({ title: 'Contoh pesan', content: `<pre class="wa-bubble">${esc(buildMessage(inv, $('#wa-text').value))}</pre>` });
  };

  /* ---------- Keamanan ---------- */
  $('#lock-min').onchange = (e) => saveSettings({ security: { lockMinutes: Number(e.target.value) } });
  $('#lock-now').onclick = () => lockNow();
  $('#sess-lock').onclick = () => lockNow();
  $('#sess-exit').onclick = () => exitApp();
  $('#pin-change').onclick = async () => {
    if (!(await unlockScreen({ title: 'PIN saat ini', subtitle: 'Masukkan PIN lama untuk melanjutkan.', cancellable: true }))) return;
    if (await createPinFlow({ title: 'PIN baru', subtitle: 'Pilih 4–6 digit angka.', cancellable: true })) toast('PIN berhasil diubah', { type: 'success' });
  };

  /* ---------- Backup ---------- */
  const backupInfo = async () => {
    const [nInv, nCli, nSvc, last] = await Promise.all([db.count('invoices'), db.count('clients'), db.count('services'), meta.get('lastBackup', 0)]);
    $('#bk-info').innerHTML = `
      <div><b>${nInv}</b><small>tagihan</small></div>
      <div><b>${nCli}</b><small>klien</small></div>
      <div><b>${nSvc}</b><small>layanan</small></div>
      <div class="${!last || Date.now() - last > 14 * 864e5 ? 'warn' : ''}"><b>${esc(relTime(last))}</b><small>backup terakhir</small></div>`;
    if (navigator.storage?.estimate) {
      const [est, persisted] = await Promise.all([navigator.storage.estimate(), navigator.storage.persisted?.() ?? false]);
      const mb = (n) => (n / 1048576).toFixed(n < 1048576 ? 2 : 1) + ' MB';
      $('#storage').innerHTML = `${icon('database', 15)} Terpakai ${mb(est.usage || 0)} · ${persisted ? 'Penyimpanan permanen aktif ✓' : 'Penyimpanan belum permanen'}`;
    }
  };
  $('#bk-export').onclick = async () => {
    const stop = busy('Menyiapkan backup…');
    try {
      const d = await exportBackup();
      toast(`Backup berisi ${d.invoices.length} tagihan`, { type: 'success' });
    } catch (e) {
      toast('Gagal backup: ' + e.message, { type: 'error' });
    } finally {
      stop();
      backupInfo();
    }
  };
  $('#sec-backup').addEventListener('click', async (e) => {
    const tpl = e.target.closest('[data-xtpl]');
    if (tpl) return downloadExcelTemplate(tpl.dataset.xtpl);
    if (e.target.closest('[data-ximport]') && (await runExcelImport())) location.hash = '#/';
  });
  $('#bk-import').onclick = async () => {
    const f = await pickFile('application/json,.json');
    if (!f) return;
    let obj;
    try {
      obj = parseBackup(await readFileAsText(f));
    } catch (e) {
      toast(e.message, { type: 'error', timeout: 5000 });
      return;
    }
    const d = obj.data;
    const mode = await sheet({
      title: 'Pulihkan data',
      content: `
        <div class="backup-info">
          <div><b>${d.invoices.length}</b><small>tagihan</small></div>
          <div><b>${d.clients.length}</b><small>klien</small></div>
          <div><b>${d.services.length}</b><small>layanan</small></div>
        </div>
        <p class="sheet-msg">Backup dibuat <b>${esc(new Date(obj.exportedAt).toLocaleString('id-ID'))}</b>.</p>
        <p class="sheet-msg"><b>Ganti semua</b>: data di perangkat ini diganti isi file. <b>Gabungkan</b>: data file ditambahkan; data dengan ID sama ditimpa.</p>`,
      actions: [
        { label: 'Gabungkan', kind: 'soft', value: 'merge' },
        { label: 'Ganti semua', kind: 'primary', value: 'replace' },
      ],
    }).result;
    if (!mode) return;
    const stop = busy('Memulihkan data…');
    try {
      await restoreBackup(obj, mode);
      toast('Data berhasil dipulihkan', { type: 'success' });
      location.hash = '#/';
    } catch (e) {
      toast('Gagal memulihkan: ' + e.message, { type: 'error', timeout: 5000 });
    } finally {
      stop();
    }
  };

  /* ---------- Hapus semua ---------- */
  $('#wipe').onclick = async () => {
    const ok = await confirmDialog({
      title: 'Hapus semua data?',
      message: 'Semua data di perangkat ini akan hilang permanen. Pastikan Anda sudah mengunduh backup.',
      ok: 'Ya, hapus semua',
      danger: true,
    });
    if (!ok) return;
    await db.wipe();
    try {
      sessionStorage.clear();
    } catch {}
    location.hash = '#/';
    location.reload();
  };

  paintTpl();
  labelsForm();
  numPreview();
  backupInfo();
  // Thumbnail dibuat setelah tampil agar halaman terasa cepat.
  requestAnimationFrame(thumbs);

  if (ctx.query.buka) {
    const sec = ctx.el.querySelector(`#sec-${ctx.query.buka}`);
    if (sec) {
      sec.open = true;
      setTimeout(() => sec.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    }
  }
  return { destroy: () => previews.forEach((p) => p.destroy()) };
}

function insertAtCursor(input, text) {
  const a = input.selectionStart ?? input.value.length;
  const b = input.selectionEnd ?? input.value.length;
  input.value = input.value.slice(0, a) + text + input.value.slice(b);
  input.focus();
  input.setSelectionRange(a + text.length, a + text.length);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
