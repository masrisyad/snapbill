/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Detail tagihan: pratinjau, status, kirim/cetak. */
import { db } from '../db.js';
import { getSettings } from '../state.js';
import { esc, rupiah, fmtDate } from '../util.js';
import { icon, waIcon } from '../icons.js';
import { calc, buildMessage, saveInvoice, normalize, isQuote, quoteToInvoice } from '../invoice-model.js';
import { renderInvoice, TEMPLATES } from '../templates.js';
import { toast, sheet, confirmDialog, emptyState, busy, STATUS } from '../ui.js';
import { mountPreview } from './shared.js';
import { celebrate } from '../mode.js';
import { invoicePDF, invoiceImage, saveFile, shareFile, canShareFiles, openWhatsApp, printInvoice, copyText, downloadFile } from '../export.js';

export async function render(ctx) {
  const found = await db.get('invoices', ctx.params.id);
  if (!found) {
    ctx.setTitle('Tagihan');
    ctx.el.innerHTML = emptyState({ icon: 'alert', title: 'Dokumen tidak ditemukan', action: '<a class="btn btn-soft" role="link" tabindex="0" data-href="#/tagihan">Kembali ke daftar</a>' });
    return;
  }
  const inv = normalize(found);
  const quote = isQuote(inv);
  const docName = quote ? 'penawaran' : 'tagihan';
  ctx.setTitle(inv.number || (quote ? 'Penawaran' : 'Tagihan'));

  ctx.el.innerHTML = `
    <section class="card v-head">
      <div class="v-client">
        <div class="muted small">${quote ? 'Penawaran untuk' : 'Ditagihkan ke'}</div>
        <div class="v-name">${esc(inv.client.name)}</div>
        <div class="muted small" id="v-meta"></div>
      </div>
      <div class="v-total"><small id="v-total-l">Total</small><b id="v-total"></b><small id="v-total-sub"></small></div>
      <div class="seg seg-status" id="v-status">
        ${Object.entries(STATUS).map(([k, v]) => `<button type="button" data-s="${k}" class="${k}">${esc(v.label)}</button>`).join('')}
      </div>
      ${quote ? `<button type="button" class="btn btn-soft btn-block v-convert" id="v-convert">${icon('bills', 18)} <span id="v-convert-l"></span></button>` : ''}
      ${inv.fromQuote ? `<a class="muted small v-link" role="link" tabindex="0" data-href="#/tagihan/${encodeURIComponent(inv.fromQuote.id)}">${icon('send', 14)} Dari penawaran ${esc(inv.fromQuote.number || '')}</a>` : ''}
    </section>
    <div class="paper-frame"><div id="v-paper"></div></div>
    <div class="viewer-bar">
      <a class="btn btn-soft btn-tool" role="link" tabindex="0" data-href="#/tagihan/${encodeURIComponent(inv.id)}/ubah">${icon('edit', 18)}<span>Ubah</span></a>
      <a class="btn btn-soft btn-tool" role="link" tabindex="0" data-href="#/tagihan/baru?dari=${encodeURIComponent(inv.id)}" title="${quote ? 'Salin semua rincian ke penawaran baru' : 'Salin klien, lokasi & harga ke tagihan baru — tanggal dikosongkan'}">${icon('copy', 18)}<span>Duplikat</span></a>
      <button type="button" class="btn btn-danger-soft btn-tool" id="v-del">${icon('trash', 18)}<span>Hapus</span></button>
      <button type="button" class="btn btn-primary btn-grow" id="v-send">${icon('send', 18)}<span>Kirim / Cetak</span></button>
    </div>`;

  const preview = mountPreview(ctx.el.querySelector('#v-paper'), renderInvoice(inv, getSettings()));

  const paint = () => {
    const t = calc(inv);
    const showBal = t.paid > 0;
    ctx.el.querySelector('#v-total-l').textContent = showBal ? 'Sisa pembayaran' : 'Total';
    ctx.el.querySelector('#v-total').textContent = rupiah(showBal ? t.balance : t.total);
    ctx.el.querySelector('#v-total-sub').textContent = showBal ? `dari ${rupiah(t.total)} · DP ${rupiah(t.paid)}` : '';
    ctx.el.querySelector('#v-meta').textContent = [
      fmtDate(inv.issueDate),
      TEMPLATES[inv.template]?.name,
    ].filter(Boolean).join(' · ');
    ctx.el.querySelectorAll('#v-status [data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === inv.status));
    const conv = ctx.el.querySelector('#v-convert-l');
    if (conv) conv.textContent = inv.invoiceId ? 'Lihat invoice dari penawaran ini' : 'Jadikan invoice';
    preview.update(renderInvoice(inv, getSettings()));
  };

  const setStatus = async (st) => {
    if (st === inv.status) return;
    inv.status = st;
    await saveInvoice(inv, { learn: false });
    paint();
    toast(`Status: ${STATUS[st].label}`, { type: 'success' });
  };
  ctx.el.querySelector('#v-status').addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]');
    if (b) setStatus(b.dataset.s);
  });

  ctx.el.querySelector('#v-convert')?.addEventListener('click', async () => {
    if (inv.invoiceId && (await db.get('invoices', inv.invoiceId))) {
      location.hash = `#/tagihan/${encodeURIComponent(inv.invoiceId)}`;
      return;
    }
    const ok = await confirmDialog({
      title: 'Jadikan invoice?',
      message: 'Semua rincian, item tambahan, dan DP disalin ke invoice baru (draft). Penawaran ini tetap tersimpan.',
      ok: 'Buat invoice',
    });
    if (!ok) return;
    const created = await quoteToInvoice(inv);
    toast(created.number ? `Invoice ${created.number} dibuat` : 'Invoice baru dibuat', { type: 'success' });
    location.hash = `#/tagihan/${encodeURIComponent(created.id)}/ubah`;
  });

  const onSent = async () => {
    if (inv.status === 'draft') {
      inv.status = 'sent';
      inv.sentAt = Date.now();
      await saveInvoice(inv, { learn: false });
      paint();
      celebrate();
    }
  };
  ctx.el.querySelector('#v-send').onclick = () => sendSheet(inv, onSent);

  ctx.el.querySelector('#v-del').onclick = async () => {
    if (await confirmDialog({ title: `Hapus ${docName}?`, message: `<b>${esc(inv.number || inv.client.name)}</b> akan dihapus permanen dari perangkat ini.`, ok: 'Hapus', danger: true })) {
      await db.del('invoices', inv.id);
      toast(`${quote ? 'Penawaran' : 'Tagihan'} dihapus`);
      location.hash = '#/tagihan';
    }
  };

  paint();
  if (ctx.query.kirim) {
    history.replaceState(null, '', `#/tagihan/${encodeURIComponent(inv.id)}`);
    celebrate();
    sendSheet(inv, onSent);
  }
  return { destroy: () => preview.destroy() };
}

/** Menu distribusi: WhatsApp, PDF, gambar, cetak. */
function sendSheet(inv, onSent) {
  const shareable = canShareFiles();
  const hasPhone = !!inv.client.phone;
  const sh = sheet({
    title: 'Kirim / Cetak',
    content: `
      <div class="send-sum"><span>${esc(inv.number || (isQuote(inv) ? 'Penawaran' : 'Invoice'))} · ${esc(inv.client.name)}</span><b>${rupiah(calc(inv).paid ? calc(inv).balance : calc(inv).total)}</b></div>
      <div class="send-grid">
        ${shareable ? `<button type="button" class="send-btn wa" data-x="wa-pdf">${waIcon(26)}<b>Kirim PDF</b><small>via WhatsApp / aplikasi lain</small></button>` : `<button type="button" class="send-btn wa" data-x="wa-dl">${waIcon(26)}<b>PDF + WhatsApp</b><small>Unduh PDF lalu buka WhatsApp</small></button>`}
        <button type="button" class="send-btn wa-soft" data-x="wa-text">${icon('message', 24)}<b>Pesan WhatsApp</b><small>${hasPhone ? 'Langsung ke ' + esc(inv.client.phone) : 'Pilih kontak di WhatsApp'}</small></button>
        <button type="button" class="send-btn" data-x="pdf">${icon('pdf', 24)}<b>Unduh PDF</b><small>${getSettings().invoice.pdfSize === 'fit' ? 'Ukuran menyesuaikan' : 'Ukuran A4'}</small></button>
        <button type="button" class="send-btn" data-x="print">${icon('print', 24)}<b>Cetak</b><small>Printer / simpan PDF</small></button>
      </div>
      <div class="fld-label">Unduh sebagai gambar</div>
      <div class="row-btns">
        <button type="button" class="btn btn-soft btn-sm" data-x="png">${icon('image', 16)} PNG</button>
        <button type="button" class="btn btn-soft btn-sm" data-x="jpg">${icon('image', 16)} JPG</button>
        <button type="button" class="btn btn-soft btn-sm" data-x="jpeg">${icon('image', 16)} JPEG</button>
        ${shareable ? `<button type="button" class="btn btn-soft btn-sm" data-x="share-img">${icon('share', 16)} Bagikan gambar</button>` : ''}
      </div>
      <details class="msg-box">
        <summary>${icon('edit', 16)} Lihat / ubah teks pesan</summary>
        <textarea id="send-msg" rows="9">${esc(buildMessage(inv))}</textarea>
        <button type="button" class="btn btn-ghost btn-sm" data-x="copy">${icon('copy', 16)} Salin teks</button>
      </details>`,
  });
  const msg = () => sh.body.querySelector('#send-msg').value;

  // File dibuat lebih dulu & disimpan, supaya share() tetap dalam "gestur pengguna" (wajib di iOS Safari).
  const cache = {};
  const make = (kind) => (cache[kind] ||= (kind === 'pdf' ? invoicePDF(inv) : invoiceImage(inv, kind)).catch((e) => {
    delete cache[kind];
    throw e;
  }));
  if (shareable) make('pdf').catch(() => {});

  const ready = async (kind, label) => {
    let settled = false;
    const p = make(kind).finally(() => (settled = true));
    await Promise.resolve();
    if (settled) return p;
    const stop = busy(label);
    try {
      return await p;
    } finally {
      stop();
    }
  };
  const share = async (file, text) => {
    try {
      return await shareFile(file, { text, title: file.name });
    } catch (err) {
      if (err?.name === 'NotAllowedError') {
        toast('File sudah siap — ketuk sekali lagi untuk membagikan.', { timeout: 4000 });
        return false;
      }
      throw err;
    }
  };

  sh.body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]');
    if (!b) return;
    const x = b.dataset.x;
    try {
      if (x === 'copy') {
        (await copyText(msg())) && toast('Teks disalin', { type: 'success' });
      } else if (x === 'wa-text') {
        openWhatsApp(inv, msg());
        onSent();
      } else if (x === 'print') {
        sh.close();
        printInvoice(inv);
      } else if (x === 'wa-pdf') {
        if (await share(await ready('pdf', 'Membuat PDF…'), msg())) onSent();
      } else if (x === 'wa-dl') {
        downloadFile(await ready('pdf', 'Membuat PDF…'));
        toast('PDF diunduh. Lampirkan di WhatsApp.', { timeout: 4500 });
        openWhatsApp(inv, msg());
        onSent();
      } else if (x === 'pdf') {
        await saveFile(await ready('pdf', 'Membuat PDF…'));
      } else if (x === 'share-img') {
        if (await share(await ready('png', 'Membuat gambar…'), msg())) onSent();
      } else {
        await saveFile(await ready(x, 'Membuat gambar…'));
      }
    } catch (err) {
      console.error(err);
      toast('Gagal: ' + (err.message || err), { type: 'error', timeout: 5000 });
    }
  });
}
