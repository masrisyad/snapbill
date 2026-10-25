/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Form cepat buat / ubah tagihan & penawaran. */
import { db } from '../db.js';
import { getSettings } from '../state.js';
import { esc, clone, uid, rupiah, todayISO, thisMonth, addDays, parseDecimal, parseQty, fmtQty } from '../util.js';
import { icon } from '../icons.js';
import { newInvoice, newGroup, newItem, newPayment, normalize, calc, lineTotal, saveInvoice, peekNumber, isQuote, DOC } from '../invoice-model.js';
import { TEMPLATES, renderInvoice } from '../templates.js';
import { toast, sheet, confirmDialog, emptyState, formatMoneyInput, bindMoneyInput, moneyValue } from '../ui.js';
import { mountPreview, sortInvoices, previewTemplate } from './shared.js';
import { demoInvoice } from '../sample.js';
import { currentMode } from '../mode.js';
import { comboField } from '../combo.js';

const lower = (s) => String(s || '').trim().toLowerCase();
const qtyText = (it) => (it.unit || Number(it.qty) !== 1 ? fmtQty(it) : '1');

export async function render(ctx) {
  const s = getSettings();
  const editing = !!ctx.params.id;
  let inv;

  if (editing) {
    const found = await db.get('invoices', ctx.params.id);
    if (!found) {
      ctx.setTitle('Tagihan');
      ctx.el.innerHTML = emptyState({ icon: 'alert', title: 'Dokumen tidak ditemukan' });
      return;
    }
    inv = normalize(clone(found));
  } else if (ctx.query.dari) {
    const src = await db.get('invoices', ctx.query.dari);
    inv = newInvoice(src?.docType);
    if (src) Object.assign(inv, copyStructure(normalize(src)));
  } else {
    inv = newInvoice(ctx.query.jenis === 'penawaran' ? DOC.quote : DOC.invoice);
  }

  const docName = () => (isQuote(inv) ? 'Penawaran' : 'Tagihan');
  ctx.setTitle(`${editing ? 'Ubah' : isQuote(inv) ? 'Buat' : 'Buat'} ${docName()}`);
  ctx.setBack(editing ? `#/tagihan/${encodeURIComponent(inv.id)}` : '#/tagihan');

  const [clients, services, allInvoices] = await Promise.all([db.all('clients'), db.all('services'), db.all('invoices')]);
  clients.sort((a, b) => a.name.localeCompare(b.name));
  services.sort((a, b) => a.name.localeCompare(b.name));
  let dirty = !!ctx.query.dari;
  let templateTouched = editing || !!ctx.query.dari;
  let pricingTouched = editing || !!ctx.query.dari;
  const markDirty = () => (dirty = true);

  ctx.el.innerHTML = `
  <form class="editor ${inv.pricing === 'lump' ? 'is-lump' : ''}" id="ed" autocomplete="off" novalidate>

    <nav class="wiz-steps" id="wiz-steps" aria-label="Langkah pengisian">
      ${['Klien', 'Rincian', 'Detail', 'Periksa'].map((t, i) => `<button type="button" data-go="${i + 1}"><i>${i + 1}</i><span>${t}</span></button>`).join('')}
    </nav>
    <div class="wiz-title" data-step="1"><div class="wiz-step-title">Untuk siapa?<small>Pilih jenis dokumen, lalu isi nama klien.</small></div></div>
    <div class="seg seg-doc" id="doctype" role="tablist" aria-label="Jenis dokumen" data-step="1">
      <button type="button" data-doc="invoice">${icon('bills', 17)} Invoice / tagihan</button>
      <button type="button" data-doc="quote">${icon('send', 17)} Penawaran</button>
    </div>

    <section class="card" data-step="1">
      <div class="card-title">${icon('users', 19)} Klien</div>
      <label class="fld"><span>Nama klien</span><input name="clientName" value="${esc(inv.client.name)}" placeholder="Ketik atau pilih klien" enterkeyhint="next"></label>
      <div class="grid2">
        <label class="fld"><span>No. WhatsApp</span><input name="clientPhone" inputmode="tel" value="${esc(inv.client.phone)}" placeholder="08xx (opsional)"></label>
        <label class="fld"><span>Alamat</span><input name="clientAddress" value="${esc(inv.client.address)}" placeholder="(opsional)"></label>
      </div>
      <div class="quick" id="client-quick"></div>
    </section>

    <div class="wiz-title" data-step="3"><div class="wiz-step-title">Tanggal, model & tambahan<small>Semua opsional — boleh langsung ketuk "Periksa".</small></div></div>
    <section class="card" data-step="3">
      <div class="card-title">${icon('calendar', 19)} Detail <span class="doc-name"></span></div>
      <div class="grid2">
        <label class="fld"><span>Nomor <span class="doc-name-l"></span></span><input name="number" value="${esc(inv.number)}" placeholder="${s.numbering.enabled ? 'Otomatis' : 'mis. 001/IV/2023'}"><small class="hint" id="num-hint"></small></label>
        <label class="fld"><span>Periode (bulan) <em class="quote-only">opsional</em></span><input name="period" type="month" value="${esc(inv.period)}" placeholder="2026-10"></label>
      </div>
      <div class="grid2">
        <label class="fld"><span>Tanggal</span><input name="issueDate" type="date" value="${esc(inv.issueDate)}"></label>
        <label class="fld"><span id="due-label">Jatuh tempo</span><input name="dueDate" type="date" value="${esc(inv.dueDate)}"></label>
      </div>
      <div class="fld"><span class="fld-label">Model</span>
        <div class="tpl-chips" id="tpl-chips">
          ${Object.entries(TEMPLATES).map(([k, t]) => `
            <div class="tpl-chip" data-tpl="${k}">
              <button type="button" class="tpl-pick" data-pick="${k}"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></button>
              <button type="button" class="tpl-eye" data-eye="${k}" aria-label="Lihat contoh model ${esc(t.name)}" title="Lihat contoh">${icon('eye', 18)}</button>
            </div>`).join('')}
        </div>
      </div>
    </section>

    <div class="wiz-title" data-step="2"><div class="wiz-step-title">Apa yang ditagih?<small>Isi tanggal kunjungan & harga, atau pilih Borongan.</small></div></div>
    <section class="card" data-step="2">
      <div class="card-title spread">
        <span>${icon('bills', 19)} <span id="rincian-title">Kunjungan / layanan</span></span>
        <div class="seg seg-xs" id="pricing">
          <button type="button" data-p="item">Harga per item</button>
          <button type="button" data-p="lump">Borongan</button>
        </div>
      </div>
      <label class="fld lump-only"><span>Biaya borongan / bulanan (Rp)</span><input name="lumpAmount" inputmode="numeric" value="${moneyValue(inv.lumpAmount)}" placeholder="mis. 600.000"><small class="hint">Satu harga untuk semua kunjungan di bawah. Material tambahan dihitung terpisah.</small></label>
      <div id="groups"></div>
      <button type="button" class="btn btn-dashed btn-block" data-act="add-group">${icon('pin', 18)} <span id="add-group-l">Tambah lokasi / grup</span></button>
    </section>

    <section class="card" data-step="2">
      <div class="card-title spread"><span>${icon('box', 19)} Item tambahan <em>material, barang, jasa lain</em></span><b class="ex-sum" id="ex-sum"></b></div>
      <div id="extras"></div>
      <button type="button" class="btn btn-dashed btn-block" data-act="add-extra">${icon('plus', 18)} Tambah item</button>
      <small class="hint">Tulis jumlah beserta satuan, mis. <b>2 unit</b>, <b>5 m</b>, <b>1 kg</b>, <b>3 jam</b>.</small>
    </section>

    <details class="card" data-step="3" id="pay-card" ${inv.payments.length ? 'open' : ''}>
      <summary class="card-title">${icon('money', 19)} DP / uang muka <em>opsional</em></summary>
      <div id="payments"></div>
      <button type="button" class="btn btn-ghost btn-sm" data-act="add-pay">${icon('plus', 16)} Tambah DP / pembayaran</button>
      <small class="hint">Sisa pembayaran dihitung otomatis dan tampil di bawah TOTAL.</small>
    </details>

    <details class="card" data-step="3" id="adj" ${inv.discount.value || inv.tax.rate ? 'open' : ''}>
      <summary class="card-title">${icon('hash', 19)} Diskon & pajak <em>opsional</em></summary>
      <div class="grid2">
        <div class="fld"><span class="fld-label">Diskon</span>
          <div class="input-group">
            <input name="discountValue" inputmode="decimal" placeholder="0">
            <select name="discountType"><option value="percent">%</option><option value="amount">Rp</option></select>
          </div>
        </div>
        <div class="fld"><span class="fld-label">Pajak</span>
          <div class="input-group">
            <input name="taxLabel" placeholder="PPN" class="w-label">
            <input name="taxRate" inputmode="decimal" placeholder="0">
            <span class="addon">%</span>
          </div>
        </div>
      </div>
    </details>

    <section class="card" data-step="3">
      <label class="fld"><span>${icon('message', 17)} Catatan <em>opsional</em></span><textarea name="notes" rows="2" placeholder="mis. Terima kasih atas kepercayaan Anda">${esc(inv.notes)}</textarea></label>
    </section>

    <section class="wiz-review" data-step="4">
      <div class="wiz-step-title">Periksa hasilnya<small>Begini tampilan yang akan dikirim. Ketuk <b>Selesai</b> untuk menyimpan & mengirim.</small></div>
      <div class="pv-wrap"><div id="wiz-preview"></div></div>
    </section>
  </form>

  <div class="editor-bar">
    <div class="eb-total"><small id="ed-total-l">Total</small><b id="ed-total">Rp 0</b><span id="ed-breakdown"></span></div>
    <button type="button" class="btn btn-soft wiz-only" id="wiz-back" aria-label="Kembali">${icon('back', 18)}<span class="wb-label"> Kembali</span></button>
    <button type="button" class="btn btn-primary wiz-only" id="wiz-next"><span>Lanjut</span> ${icon('chevron', 18)}</button>
    <button type="button" class="icon-btn icon-btn-soft no-wiz" id="ed-preview" aria-label="Pratinjau" title="Pratinjau">${icon('eye')}</button>
    <button type="button" class="btn btn-soft wiz-final" id="ed-draft">Draft</button>
    <button type="button" class="btn btn-primary wiz-final" id="ed-finish">${icon('check', 18)} Selesai</button>
  </div>`;

  const form = ctx.el.querySelector('#ed');
  const groupsEl = form.querySelector('#groups');
  const extrasEl = form.querySelector('#extras');
  const paysEl = form.querySelector('#payments');
  const F = (n) => form.querySelector(`[name="${n}"]`);
  const serviceByName = (name) => services.find((x) => lower(x.name) === lower(name));

  /* Pilihan klien & layanan dengan pencarian (pengganti datalist bawaan browser). */
  comboField(form, 'input[name="clientName"]', {
    title: 'Pilih klien, atau ketik nama baru',
    newLabel: 'klien baru',
    emptyText: 'Belum ada klien tersimpan — ketik nama klien.',
    options: () => clients.map((c) => ({ value: c.name, hint: [c.phone, c.monthlyFee ? `${rupiah(c.monthlyFee)}/bln` : ''].filter(Boolean).join(' · ') })),
  });
  comboField(form, 'input.it-desc, input.ex-desc', {
    title: 'Pilih layanan / item, atau ketik baru',
    newLabel: 'item baru',
    emptyText: 'Belum ada layanan tersimpan — ketik nama layanan.',
    options: () => services.map((x) => ({ value: x.name, hint: x.price ? `${rupiah(x.price)}${x.unit ? ' / ' + x.unit : ''}` : '' })),
  });

  /* ---------- Total ---------- */
  const updateTotals = () => {
    const t = calc(inv);
    const hasPay = t.paid > 0;
    ctx.el.querySelector('#ed-total-l').textContent = hasPay ? 'Sisa pembayaran' : 'Total';
    ctx.el.querySelector('#ed-total').textContent = rupiah(hasPay ? t.balance : t.total);
    const parts = [];
    if (hasPay) parts.push(`total ${rupiah(t.total)}`, `DP ${rupiah(t.paid)}`);
    if (t.extrasTotal) parts.push(`tambahan ${rupiah(t.extrasTotal)}`);
    if (t.discountAmt) parts.push(`diskon ${rupiah(t.discountAmt)}`);
    if (t.taxAmt) parts.push(`${inv.tax.label || 'pajak'} ${rupiah(t.taxAmt)}`);
    ctx.el.querySelector('#ed-breakdown').textContent = parts.join(' · ');
    form.querySelector('#ex-sum').textContent = t.extrasTotal ? rupiah(t.extrasTotal) : '';
    groupsEl.querySelectorAll('.grp').forEach((gEl) => {
      const g = inv.groups.find((x) => x.id === gEl.dataset.g);
      const out = gEl.querySelector('.grp-sub');
      if (out) out.textContent = !g || inv.pricing === 'lump' || inv.groups.length < 2 ? '' : rupiah(g.items.reduce((a, it) => a + lineTotal(it), 0));
    });
    extrasEl.querySelectorAll('.ex').forEach((row) => {
      const it = inv.extras.find((x) => x.id === row.dataset.x);
      if (it) row.querySelector('.ex-total').textContent = rupiah(lineTotal(it));
    });
  };

  /* ---------- Jenis dokumen & nomor ---------- */
  const updateNumberHint = async () => {
    const hint = form.querySelector('#num-hint');
    if (!s.numbering.enabled) hint.textContent = 'Opsional — kosongkan jika tidak perlu. Nomor tampil di dokumen bila "Tampilkan nomor & tanggal" aktif.';
    else if (inv.autoNumber && !inv.number) hint.textContent = 'Otomatis: ' + (await peekNumber(inv.issueDate || todayISO(), inv.docType));
    else hint.textContent = inv.autoNumber ? '' : 'Nomor manual';
  };

  const syncDocType = () => {
    const q = isQuote(inv);
    form.classList.toggle('is-quote', q);
    form.querySelectorAll('[data-doc]').forEach((b) => b.classList.toggle('on', b.dataset.doc === inv.docType));
    form.querySelectorAll('.doc-name').forEach((el) => (el.textContent = q ? 'penawaran' : 'tagihan'));
    form.querySelectorAll('.doc-name-l').forEach((el) => (el.textContent = q ? 'penawaran' : 'invoice'));
    form.querySelector('#due-label').innerHTML = q ? 'Berlaku sampai <em>opsional</em>' : 'Jatuh tempo <em>opsional</em>';
    form.querySelector('#rincian-title').textContent = q ? 'Rincian pekerjaan' : 'Kunjungan / layanan';
    form.querySelector('#add-group-l').textContent = q ? 'Tambah bagian (mis. TAHAP 2)' : 'Tambah lokasi / grup';
    ctx.setTitle(`${editing ? 'Ubah' : 'Buat'} ${docName()}`);
    updateNumberHint();
  };
  form.querySelector('#doctype').addEventListener('click', (e) => {
    const b = e.target.closest('[data-doc]');
    if (!b || b.dataset.doc === inv.docType) return;
    markDirty();
    inv.docType = b.dataset.doc;
    inv.status = 'draft';
    if (!templateTouched) inv.template = isQuote(inv) ? 'kuantitas' : s.template || 'klasik';
    syncDocType();
    syncTemplate();
    renderGroups();
    renderClientQuick();
  });

  /* ---------- Kunjungan / rincian utama ---------- */
  const itemRow = (it, i) => `
    <div class="it" data-i="${it.id}">
      <span class="it-no">${i + 1}</span>
      <input class="it-desc" data-f="desc" value="${esc(it.desc)}" placeholder="${isQuote(inv) ? 'mis. AC Split 1 PK' : 'Rincian layanan'}" aria-label="Rincian">
      <label class="mini it-date"><small>Tanggal</small><input data-f="date" type="date" value="${esc(it.date)}"></label>
      <label class="mini it-qty"><small>Jumlah</small><input data-f="qty" value="${esc(qtyText(it))}" aria-label="Jumlah & satuan"></label>
      <label class="mini it-price"><small>Harga</small><input data-f="price" inputmode="numeric" value="${moneyValue(it.price)}" placeholder="0"></label>
      <button type="button" class="icon-btn it-del" data-act="del-item" aria-label="Hapus baris">${icon('trash', 18)}</button>
    </div>`;

  const renderGroups = () => {
    const many = inv.groups.length > 1;
    const q = isQuote(inv);
    groupsEl.innerHTML = inv.groups
      .map(
        (g, gi) => `
      <div class="grp" data-g="${g.id}">
        <div class="grp-head">
          ${many ? `<span class="grp-no">${gi + 1}</span>` : ''}
          <input class="g-name" data-gf="name" value="${esc(g.name)}" placeholder="${q ? 'Bagian, mis. TAHAP 1 (opsional)' : many ? 'Nama lokasi / grup' : 'Lokasi / grup (opsional)'}" aria-label="Nama grup">
          <input class="g-note" data-gf="note" value="${esc(g.note)}" placeholder="${q ? 'Keterangan' : 'Ket. mis. (3 unit)'}" aria-label="Keterangan grup">
          ${many ? `<button type="button" class="icon-btn" data-act="del-group" aria-label="Hapus grup">${icon('close', 18)}</button>` : ''}
        </div>
        <div class="items">${g.items.map(itemRow).join('')}</div>
        <div class="grp-foot">
          <button type="button" class="btn btn-ghost btn-sm" data-act="add-item">${icon('plus', 16)} Baris</button>
          ${q ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-act="add-week" title="Salin baris terakhir, tanggal +7 hari">${icon('copy', 16)} Kunjungan +7 hari</button>`}
          <span class="grp-sub"></span>
        </div>
      </div>`
      )
      .join('');
    updateTotals();
  };

  const findCtx = (el) => {
    const gEl = el.closest('.grp');
    const g = gEl && inv.groups.find((x) => x.id === gEl.dataset.g);
    const iEl = el.closest('.it');
    const it = g && iEl && g.items.find((x) => x.id === iEl.dataset.i);
    return { g, it, iEl };
  };

  /** Isi harga & satuan dari master layanan bila masih kosong. */
  const applyService = (it, row, sel) => {
    const sv = serviceByName(it.desc);
    if (!sv) return;
    if (sv.price && !it.price) {
      it.price = sv.price;
      row.querySelector(sel.price).value = moneyValue(sv.price);
    }
    if (sv.unit && !it.unit) {
      it.unit = sv.unit;
      row.querySelector(sel.qty).value = fmtQty(it);
    }
  };

  const setQty = (it, input) => {
    const { qty, unit } = parseQty(input.value);
    it.qty = qty;
    it.unit = unit;
  };
  const fixQtyOnBlur = (it, input) => {
    if (!input.value.trim()) {
      it.qty = 1;
      it.unit = '';
      input.value = '1';
    } else input.value = qtyText(it);
  };

  groupsEl.addEventListener('input', (e) => {
    const t = e.target;
    const { g, it, iEl } = findCtx(t);
    if (!g) return;
    markDirty();
    if (t.dataset.gf) {
      g[t.dataset.gf] = t.value;
      return;
    }
    if (!it) return;
    const f = t.dataset.f;
    if (f === 'price') it.price = formatMoneyInput(t);
    else if (f === 'qty') setQty(it, t);
    else if (f === 'desc') {
      it.desc = t.value;
      applyService(it, iEl, { price: '[data-f="price"]', qty: '[data-f="qty"]' });
    } else it[f] = t.value;
    updateTotals();
  });
  groupsEl.addEventListener('focusout', (e) => {
    if (e.target.dataset.f !== 'qty') return;
    const { it } = findCtx(e.target);
    if (it) fixQtyOnBlur(it, e.target);
    updateTotals();
  });

  const focusLast = (gid, sel = '[data-f="date"]') =>
    requestAnimationFrame(() => {
      const rows = groupsEl.querySelectorAll(`.grp[data-g="${gid}"] .it`);
      rows[rows.length - 1]?.querySelector(sel)?.focus();
    });

  /* ---------- Item tambahan ---------- */
  const extraRow = (it) => `
    <div class="ex" data-x="${it.id}">
      <input class="ex-desc" data-xf="desc" value="${esc(it.desc)}" placeholder="mis. Freon R32" aria-label="Nama item">
      <label class="mini ex-qty"><small>Jumlah</small><input data-xf="qty" value="${esc(qtyText(it))}" placeholder="1 kg"></label>
      <label class="mini ex-price"><small>Harga satuan</small><input data-xf="price" inputmode="numeric" value="${moneyValue(it.price)}" placeholder="0"></label>
      <div class="ex-total"></div>
      <button type="button" class="icon-btn ex-del" data-act="del-extra" aria-label="Hapus item">${icon('trash', 18)}</button>
    </div>`;
  const renderExtras = () => {
    extrasEl.innerHTML = inv.extras.map(extraRow).join('');
    updateTotals();
  };
  const findExtra = (el) => {
    const row = el.closest('.ex');
    return { row, it: row && inv.extras.find((x) => x.id === row.dataset.x) };
  };
  extrasEl.addEventListener('input', (e) => {
    const t = e.target;
    const { row, it } = findExtra(t);
    if (!it) return;
    markDirty();
    const f = t.dataset.xf;
    if (f === 'price') it.price = formatMoneyInput(t);
    else if (f === 'qty') setQty(it, t);
    else if (f === 'desc') {
      it.desc = t.value;
      applyService(it, row, { price: '[data-xf="price"]', qty: '[data-xf="qty"]' });
    }
    updateTotals();
  });
  extrasEl.addEventListener('focusout', (e) => {
    if (e.target.dataset.xf !== 'qty') return;
    const { it } = findExtra(e.target);
    if (it) fixQtyOnBlur(it, e.target);
    updateTotals();
  });

  /* ---------- DP / pembayaran ---------- */
  const payRow = (p) => `
    <div class="pay-row" data-p="${p.id}">
      <input data-pf="label" value="${esc(p.label)}" placeholder="DP 1" aria-label="Keterangan">
      <input data-pf="amount" inputmode="numeric" value="${moneyValue(p.amount)}" placeholder="Nominal" aria-label="Nominal">
      <input data-pf="date" type="date" value="${esc(p.date)}" aria-label="Tanggal bayar">
      <button type="button" class="icon-btn" data-act="del-pay" aria-label="Hapus">${icon('trash', 18)}</button>
    </div>`;
  const renderPays = () => {
    paysEl.innerHTML = inv.payments.map(payRow).join('');
    updateTotals();
  };
  paysEl.addEventListener('input', (e) => {
    const row = e.target.closest('.pay-row');
    const p = row && inv.payments.find((x) => x.id === row.dataset.p);
    if (!p) return;
    markDirty();
    const f = e.target.dataset.pf;
    if (f === 'amount') p.amount = formatMoneyInput(e.target);
    else p[f] = e.target.value;
    updateTotals();
  });

  /* ---------- Aksi tombol ---------- */
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    markDirty();
    if (act === 'add-extra') {
      inv.extras.push(newItem({ qty: 1 }));
      renderExtras();
      requestAnimationFrame(() => extrasEl.lastElementChild?.querySelector('.ex-desc')?.focus());
      return;
    }
    if (act === 'del-extra') {
      const { it } = findExtra(b);
      inv.extras = inv.extras.filter((x) => x !== it);
      renderExtras();
      return;
    }
    if (act === 'add-pay') {
      inv.payments.push(newPayment({ label: `DP ${inv.payments.length + 1}` }));
      renderPays();
      requestAnimationFrame(() => paysEl.lastElementChild?.querySelector('[data-pf="amount"]')?.focus());
      return;
    }
    if (act === 'del-pay') {
      const id = b.closest('.pay-row')?.dataset.p;
      inv.payments = inv.payments.filter((x) => x.id !== id);
      renderPays();
      return;
    }
    const { g, it } = findCtx(b);
    if (act === 'add-group') {
      const last = inv.groups[inv.groups.length - 1]?.items.slice(-1)[0];
      const ng = newGroup({ items: [newItem(isQuote(inv) ? {} : { desc: last?.desc || s.invoice.defaultService || '', price: last?.price || 0 })] });
      inv.groups.push(ng);
      renderGroups();
      requestAnimationFrame(() => groupsEl.querySelector(`.grp[data-g="${ng.id}"] .g-name`)?.focus());
    } else if (act === 'del-group' && g) {
      inv.groups = inv.groups.filter((x) => x !== g);
      renderGroups();
    } else if ((act === 'add-item' || act === 'add-week') && g) {
      const last = g.items[g.items.length - 1];
      const date = act === 'add-week' && last?.date ? addDays(last.date, 7) : '';
      const copy = isQuote(inv) ? {} : { desc: last?.desc ?? s.invoice.defaultService ?? '', price: last?.price || 0, qty: last?.qty || 1, unit: last?.unit || '' };
      g.items.push(newItem({ ...copy, date }));
      renderGroups();
      focusLast(g.id, isQuote(inv) ? '.it-desc' : '[data-f="date"]');
    } else if (act === 'del-item' && g && it) {
      g.items = g.items.filter((x) => x !== it);
      if (!g.items.length) inv.groups = inv.groups.filter((x) => x !== g);
      renderGroups();
    }
  });

  /* ---------- Klien ---------- */
  const matchClient = () => clients.find((c) => c.id === inv.client.id) || clients.find((c) => lower(c.name) === lower(inv.client.name));

  /** Biaya bulanan dari master klien → otomatis jadi harga borongan. */
  const applyMonthlyFee = (c) => {
    if (!c?.monthlyFee || isQuote(inv) || pricingTouched) return false;
    inv.pricing = 'lump';
    inv.lumpAmount = Number(c.monthlyFee);
    syncPricing();
    return true;
  };

  const renderClientQuick = () => {
    const box = form.querySelector('#client-quick');
    const c = matchClient();
    if (!c) {
      box.innerHTML = inv.client.name.trim() ? `<span class="hint">${icon('sparkle', 14)} Klien baru — otomatis disimpan ke Master.</span>` : '';
      return;
    }
    const q = isQuote(inv);
    const used = new Set(inv.groups.map((g) => lower(g.name)));
    const locs = q ? [] : (c.locations || []).filter((l) => !used.has(lower(l.name)));
    const last = sortInvoices(allInvoices.filter((x) => x.client.id === c.id && x.id !== inv.id && (x.docType || DOC.invoice) === inv.docType))[0];
    const feeOn = !q && c.monthlyFee && inv.pricing === 'lump' && Number(inv.lumpAmount) === Number(c.monthlyFee);
    box.innerHTML = `
      ${!q && c.monthlyFee ? `<button type="button" class="chip ${feeOn ? 'chip-on' : ''}" data-q="fee">${icon(feeOn ? 'check' : 'money', 15)} Biaya bulanan ${rupiah(c.monthlyFee)}</button>` : ''}
      ${last ? `<button type="button" class="chip chip-brand" data-q="last">${icon('refresh', 15)} Salin rincian ${q ? 'penawaran' : 'tagihan'} terakhir</button>` : ''}
      ${locs.map((l, i) => `<button type="button" class="chip" data-q="loc" data-li="${i}">${icon('plus', 14)} ${esc(l.name)} ${esc(l.note || '')}</button>`).join('')}`;
    box.onclick = (e) => {
      const b = e.target.closest('[data-q]');
      if (!b) return;
      markDirty();
      if (b.dataset.q === 'fee') {
        inv.pricing = 'lump';
        inv.lumpAmount = Number(c.monthlyFee);
        pricingTouched = true;
        syncPricing();
      } else if (b.dataset.q === 'last') {
        const copy = copyStructure(last);
        Object.assign(inv, { groups: copy.groups, pricing: copy.pricing, lumpAmount: copy.lumpAmount, template: copy.template, discount: copy.discount, tax: copy.tax });
        if (copy.extras) inv.extras = copy.extras;
        pricingTouched = templateTouched = true;
        syncPricing();
        syncTemplate();
        syncAdj();
        renderGroups();
        renderExtras();
        toast(q ? 'Rincian penawaran disalin' : 'Rincian disalin — tinggal isi tanggal', { type: 'success' });
      } else {
        const l = locs[Number(b.dataset.li)];
        const blank = inv.groups.length === 1 && !inv.groups[0].name.trim();
        const sv = serviceByName(s.invoice.defaultService);
        if (blank) Object.assign(inv.groups[0], { name: l.name, note: l.note || '' });
        else inv.groups.push(newGroup({ name: l.name, note: l.note || '', items: [newItem({ desc: s.invoice.defaultService || '', price: sv?.price || 0 })] }));
        renderGroups();
      }
      renderClientQuick();
    };
  };

  F('clientName').addEventListener('input', (e) => {
    markDirty();
    inv.client.name = e.target.value;
    const c = clients.find((x) => lower(x.name) === lower(e.target.value));
    inv.client.id = c?.id || '';
    if (c) {
      if (!F('clientPhone').value && c.phone) F('clientPhone').value = inv.client.phone = c.phone;
      if (!F('clientAddress').value && c.address) F('clientAddress').value = inv.client.address = c.address;
      applyMonthlyFee(c);
    }
    renderClientQuick();
  });
  F('clientPhone').addEventListener('input', (e) => {
    markDirty();
    inv.client.phone = e.target.value.trim();
  });
  F('clientAddress').addEventListener('input', (e) => {
    markDirty();
    inv.client.address = e.target.value.trim();
  });

  /* ---------- Detail ---------- */
  F('number').addEventListener('input', (e) => {
    markDirty();
    inv.number = e.target.value.trim();
    inv.autoNumber = s.numbering.enabled && !inv.number;
    updateNumberHint();
  });
  F('period').addEventListener('input', (e) => {
    markDirty();
    inv.period = e.target.value;
  });
  F('issueDate').addEventListener('input', (e) => {
    markDirty();
    inv.issueDate = e.target.value || todayISO();
    updateNumberHint();
  });
  F('dueDate').addEventListener('input', (e) => {
    markDirty();
    inv.dueDate = e.target.value;
  });

  const syncTemplate = () => form.querySelectorAll('[data-tpl]').forEach((b) => b.classList.toggle('on', b.dataset.tpl === inv.template));
  const useTemplate = (tpl) => {
    markDirty();
    templateTouched = true;
    inv.template = tpl;
    syncTemplate();
  };
  /** Ikon mata: pratinjau model memakai isi form (atau data contoh bila form masih kosong). */
  const showTemplatePreview = async (tpl) => {
    const out = cleaned();
    let doc = out;
    let note = 'Memakai data yang sedang Anda isi.';
    if (!out.client.name || (!out.groups.length && !out.extras.length)) {
      doc = demoInvoice(tpl);
      note = 'Data contoh (fiktif). Isi form untuk melihat tagihan Anda sendiri dalam model ini.';
    } else if (out.autoNumber && !out.number) out.number = await peekNumber(out.issueDate, out.docType);
    previewTemplate(tpl, doc, { note, active: inv.template === tpl, onUse: () => useTemplate(tpl) });
  };
  form.querySelector('#tpl-chips').addEventListener('click', (e) => {
    const eye = e.target.closest('[data-eye]');
    if (eye) return showTemplatePreview(eye.dataset.eye);
    const pick = e.target.closest('[data-pick]');
    if (pick) useTemplate(pick.dataset.pick);
  });

  const syncPricing = () => {
    form.classList.toggle('is-lump', inv.pricing === 'lump');
    form.querySelectorAll('[data-p]').forEach((b) => b.classList.toggle('on', b.dataset.p === inv.pricing));
    F('lumpAmount').value = moneyValue(inv.lumpAmount);
    updateTotals();
  };
  form.querySelector('#pricing').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    markDirty();
    pricingTouched = true;
    inv.pricing = b.dataset.p;
    if (inv.pricing === 'lump' && !inv.lumpAmount) inv.lumpAmount = calc({ ...inv, pricing: 'item' }).itemsTotal;
    syncPricing();
    renderClientQuick();
  });
  bindMoneyInput(F('lumpAmount'), (v) => {
    markDirty();
    pricingTouched = true;
    inv.lumpAmount = v;
    updateTotals();
  });

  /* ---------- Diskon & pajak ---------- */
  const syncAdj = () => {
    F('discountType').value = inv.discount.type;
    F('discountValue').value = inv.discount.value ? (inv.discount.type === 'amount' ? moneyValue(inv.discount.value) : inv.discount.value) : '';
    F('taxLabel').value = inv.tax.label;
    F('taxRate').value = inv.tax.rate || '';
  };
  F('discountValue').addEventListener('input', (e) => {
    markDirty();
    inv.discount.value = inv.discount.type === 'amount' ? formatMoneyInput(e.target) : Math.min(100, parseDecimal(e.target.value));
    updateTotals();
  });
  F('discountType').addEventListener('change', (e) => {
    markDirty();
    inv.discount = { type: e.target.value, value: 0 };
    F('discountValue').value = '';
    updateTotals();
  });
  F('taxLabel').addEventListener('input', (e) => {
    markDirty();
    inv.tax.label = e.target.value;
    updateTotals();
  });
  F('taxRate').addEventListener('input', (e) => {
    markDirty();
    inv.tax.rate = Math.min(100, parseDecimal(e.target.value));
    updateTotals();
  });
  F('notes').addEventListener('input', (e) => {
    markDirty();
    inv.notes = e.target.value;
  });

  /* ---------- Simpan ---------- */
  const filled = (it) => it.desc.trim() || it.date || Number(it.price);
  const cleaned = () => {
    const out = clone(inv);
    out.client.name = out.client.name.trim();
    out.groups = out.groups
      .map((g) => ({ ...g, name: g.name.trim(), note: g.note.trim(), items: g.items.filter(filled) }))
      .filter((g) => g.items.length);
    out.extras = out.extras.filter(filled).map((it) => ({ ...it, desc: it.desc.trim() }));
    out.payments = out.payments.filter((p) => Number(p.amount));
    return out;
  };

  const save = async (finish) => {
    const out = cleaned();
    if (!out.client.name) {
      toast('Isi nama klien dulu', { type: 'error' });
      F('clientName').focus();
      return;
    }
    if (!out.groups.length && !out.extras.length) {
      toast('Tambahkan minimal satu rincian', { type: 'error' });
      return;
    }
    if (finish) out.status = 'sent';
    try {
      await saveInvoice(out);
      dirty = false;
      toast(finish ? `${docName()} siap dikirim` : 'Draft tersimpan', { type: 'success' });
      location.hash = `#/tagihan/${encodeURIComponent(out.id)}${finish ? '?kirim=1' : ''}`;
    } catch (err) {
      toast('Gagal menyimpan: ' + err.message, { type: 'error', timeout: 5000 });
    }
  };

  ctx.el.querySelector('#ed-draft').onclick = () => save(false);
  ctx.el.querySelector('#ed-finish').onclick = () => save(true);
  ctx.el.querySelector('#ed-preview').onclick = async () => {
    const out = cleaned();
    if (out.autoNumber && !out.number) out.number = await peekNumber(out.issueDate, out.docType);
    const box = document.createElement('div');
    const sh = sheet({ title: 'Pratinjau', content: box, size: 'lg' });
    const pv = mountPreview(box, renderInvoice(out, getSettings()));
    sh.result.then(() => pv.destroy());
  };
  form.addEventListener('submit', (e) => e.preventDefault());

  const onBeforeUnload = (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  /* ---------- Form bertahap (mode Classic) ---------- */
  const wizard = currentMode() === 'classic';
  const bar = ctx.el.querySelector('.editor-bar');
  let step = 1;
  let reviewPv = null;
  const goStep = async (n) => {
    const target = Math.max(1, Math.min(4, n));
    if (target >= 2 && !inv.client.name.trim()) {
      if (step !== 1) await goStep(1);
      toast('Isi nama klien dulu', { type: 'error' });
      F('clientName').focus();
      return;
    }
    if (target >= 3) {
      const out = cleaned();
      if (!out.groups.length && !out.extras.length && !(out.pricing === 'lump' && out.lumpAmount)) {
        if (step !== 2) await goStep(2);
        toast('Tambahkan minimal satu rincian', { type: 'error' });
        return;
      }
    }
    step = target;
    form.dataset.step = bar.dataset.step = String(step);
    ctx.el.querySelectorAll('#wiz-steps [data-go]').forEach((b) => {
      const i = Number(b.dataset.go);
      b.classList.toggle('on', i === step);
      b.classList.toggle('done', i < step);
    });
    ctx.el.querySelector('#wiz-next span').textContent = step === 3 ? 'Periksa' : 'Lanjut';
    if (step === 4) {
      const out = cleaned();
      if (out.autoNumber && !out.number) out.number = await peekNumber(out.issueDate, out.docType);
      reviewPv?.destroy();
      reviewPv = mountPreview(ctx.el.querySelector('#wiz-preview'), renderInvoice(out, getSettings()));
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  if (wizard) {
    ctx.el.classList.add('is-wizard');
    form.classList.add('wizard');
    ctx.el.querySelector('#wiz-next').onclick = () => goStep(step + 1);
    ctx.el.querySelector('#wiz-back').onclick = () => goStep(step - 1);
    ctx.el.querySelector('#wiz-steps').addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]');
      if (b) goStep(Number(b.dataset.go));
    });
    goStep(1);
  }

  syncDocType();
  syncTemplate();
  syncPricing();
  syncAdj();
  renderGroups();
  renderExtras();
  renderPays();
  renderClientQuick();

  return {
    guard: async () =>
      !dirty ||
      confirmDialog({ title: 'Keluar tanpa menyimpan?', message: 'Perubahan pada dokumen ini belum disimpan.', ok: 'Keluar', cancel: 'Tetap di sini', danger: true }),
    // Dipakai saat pembaruan wajib: simpan isian sebagai draft lalu kembalikan alamat untuk membukanya lagi.
    unsaved: () => dirty,
    flush: async () => {
      if (!dirty) return null;
      dirty = false;
      const out = cleaned();
      if (!out.client.name || (!out.groups.length && !out.extras.length && !(out.pricing === 'lump' && out.lumpAmount))) return null;
      await saveInvoice(out);
      return `#/tagihan/${encodeURIComponent(out.id)}/ubah`;
    },
    destroy: () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      reviewPv?.destroy();
    },
  };
}

/**
 * Salin struktur dokumen untuk dokumen berikutnya.
 * Tagihan bulanan: klien, lokasi, layanan & harga (tanggal dikosongkan, material tidak ikut).
 * Penawaran: seluruh rincian termasuk item tambahan.
 */
function copyStructure(src) {
  const c = clone(src);
  const quote = isQuote(c);
  const reid = (items, keepDate) => items.map((it) => ({ ...it, id: uid(), date: keepDate ? it.date : '' }));
  return {
    client: c.client,
    template: c.template,
    pricing: c.pricing,
    lumpAmount: c.lumpAmount,
    discount: c.discount,
    tax: c.tax,
    notes: c.notes,
    period: quote ? c.period : thisMonth(),
    groups: c.groups.map((g) => ({ ...g, id: uid(), items: reid(g.items, false) })),
    ...(quote ? { extras: reid(c.extras || [], false) } : {}),
  };
}
