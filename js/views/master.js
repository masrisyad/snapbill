/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Master data: profil usaha, klien (beserta lokasi), dan layanan/harga. */
import { db } from '../db.js';
import { esc, uid, rupiah, debounce, parseMoney } from '../util.js';
import { icon } from '../icons.js';
import { toast, sheet, confirmDialog, emptyState, bindMoneyInput, moneyValue } from '../ui.js';
import { businessForm } from './business-form.js';
import { initials } from './shared.js';
import { comboField } from '../combo.js';

const TABS = { usaha: 'Usaha', klien: 'Klien', layanan: 'Item & Harga' };
const UNITS = ['unit', 'pcs', 'set', 'm', 'kg', 'liter', 'jam', 'hari', 'org', 'paket', 'btl', 'krg', 'phn'];
const TAB_KEY = 'sb_master_tab';

export async function render(ctx) {
  ctx.setTitle('Master Data');
  let tab = ctx.query.tab || localStorage.getItem(TAB_KEY) || 'usaha';
  ctx.el.innerHTML = `
    <div class="seg seg-tabs" id="m-tabs">${Object.entries(TABS).map(([k, v]) => `<button type="button" data-t="${k}">${v}</button>`).join('')}</div>
    <div id="m-body"></div>`;
  const body = ctx.el.querySelector('#m-body');

  const show = async () => {
    localStorage.setItem(TAB_KEY, tab);
    ctx.el.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    if (tab === 'usaha') usahaTab(body);
    else if (tab === 'klien') await klienTab(body);
    else await layananTab(body);
  };
  ctx.el.querySelector('#m-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (b) {
      tab = b.dataset.t;
      show();
    }
  });
  await show();
}

/* ---------- Usaha ---------- */
function usahaTab(body) {
  body.innerHTML = `
    <section class="card">
      <p class="muted small">Data ini menjadi kop di setiap invoice — cukup isi sekali.</p>
      <form class="form" id="biz"></form>
      <div class="row-btns end"><button type="button" class="btn btn-primary" id="biz-save">${icon('check', 18)} Simpan profil</button></div>
    </section>`;
  const save = businessForm(body.querySelector('#biz'));
  body.querySelector('#biz-save').onclick = async () => {
    await save();
    toast('Profil usaha tersimpan', { type: 'success' });
  };
}

/* ---------- Klien ---------- */
async function klienTab(body) {
  const [clients, invoices] = await Promise.all([db.all('clients'), db.all('invoices')]);
  clients.sort((a, b) => a.name.localeCompare(b.name));
  const counts = {};
  invoices.forEach((i) => (counts[i.client.id] = (counts[i.client.id] || 0) + 1));

  body.innerHTML = `
    <div class="toolbar">
      <div class="searchbar grow">${icon('search', 20)}<input type="search" id="k-q" placeholder="Cari klien…"></div>
      <button type="button" class="btn btn-primary" id="k-add">${icon('plus', 18)} Klien</button>
    </div>
    <div id="k-sum" class="list-summary"></div>
    <div id="k-list"></div>`;
  const list = body.querySelector('#k-list');
  const withFee = clients.filter((c) => Number(c.monthlyFee) > 0);
  body.querySelector('#k-sum').innerHTML = clients.length
    ? `${clients.length} klien${withFee.length ? ` · ${withFee.length} langganan bulanan · <b>${rupiah(withFee.reduce((a, c) => a + Number(c.monthlyFee), 0))}</b> / bulan` : ''}`
    : '';
  const draw = (q = '') => {
    const rows = clients.filter((c) => !q || `${c.name} ${c.phone} ${c.address}`.toLowerCase().includes(q.toLowerCase()));
    list.innerHTML = rows.length
      ? `<div class="list card-list">${rows
          .map(
            (c) => `
        <button type="button" class="inv-row" data-id="${c.id}">
          <div class="avatar">${esc(initials(c.name))}</div>
          <div class="ir-main"><div class="ir-name">${esc(c.name)}</div>
            <div class="ir-sub">${[c.monthlyFee ? `${rupiah(c.monthlyFee)}/bln` : '', c.phone, (c.locations || []).length ? `${c.locations.length} lokasi` : ''].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}</div></div>
          <div class="ir-right"><span class="muted small">${counts[c.id] || 0} tagihan</span>${icon('chevron', 18)}</div>
        </button>`
          )
          .join('')}</div>`
      : emptyState({ icon: 'users', title: q ? 'Tidak ditemukan' : 'Belum ada klien', text: q ? '' : 'Klien juga otomatis tersimpan saat Anda membuat tagihan.' });
  };
  draw();
  body.querySelector('#k-q').addEventListener('input', debounce((e) => draw(e.target.value), 150));
  body.querySelector('#k-add').onclick = () => clientSheet(null, () => klienTab(body));
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) clientSheet(clients.find((c) => c.id === b.dataset.id), () => klienTab(body), counts[b.dataset.id] || 0);
  });
}

function clientSheet(client, onDone, invoiceCount = 0) {
  const c = client ? structuredClone(client) : { id: uid(), name: '', phone: '', address: '', locations: [], monthlyFee: 0, notes: '', createdAt: Date.now() };
  c.locations = c.locations || [];
  const locRow = (l, i) => `
    <div class="loc-row" data-li="${i}">
      <input data-lf="name" value="${esc(l.name)}" placeholder="Nama lokasi, mis. Kantor Lt. 2">
      <input data-lf="note" value="${esc(l.note || '')}" placeholder="Ket. (3 unit)" class="w-note">
      <button type="button" class="icon-btn" data-del="${i}" aria-label="Hapus lokasi">${icon('close', 18)}</button>
    </div>`;
  const sh = sheet({
    title: client ? 'Ubah klien' : 'Klien baru',
    content: `
      <form class="form" id="cf">
        <label class="fld"><span>Nama</span><input name="name" value="${esc(c.name)}" placeholder="mis. Bu Sinta" required></label>
        <div class="grid2">
          <label class="fld"><span>No. WhatsApp</span><input name="phone" value="${esc(c.phone)}" inputmode="tel" placeholder="08xx"></label>
          <label class="fld"><span>Alamat</span><input name="address" value="${esc(c.address)}"></label>
        </div>
        <label class="fld"><span>Biaya bulanan / borongan (Rp) <em>opsional</em></span><input name="monthlyFee" inputmode="numeric" value="${moneyValue(c.monthlyFee)}" placeholder="mis. 600.000"><small class="hint">Otomatis terisi sebagai harga borongan saat membuat tagihan untuk klien ini.</small></label>
        <div class="fld"><span class="fld-label">Lokasi / properti <em>untuk template grup</em></span>
          <div id="locs">${c.locations.map(locRow).join('')}</div>
          <button type="button" class="btn btn-ghost btn-sm" id="loc-add">${icon('plus', 16)} Tambah lokasi</button>
        </div>
        <label class="fld"><span>Catatan</span><textarea name="notes" rows="2">${esc(c.notes || '')}</textarea></label>
        ${client ? `<a class="btn btn-soft btn-block" role="link" tabindex="0" data-href="#/tagihan?q=${encodeURIComponent(c.name)}">${icon('bills', 18)} Lihat ${invoiceCount} tagihan</a>` : ''}
      </form>`,
    actions: [
      ...(client ? [{ label: 'Hapus', kind: 'danger-ghost', onClick: async ({ close }) => {
        if (await confirmDialog({ title: 'Hapus klien?', message: `Klien <b>${esc(c.name)}</b> dihapus dari master. Tagihan lama tetap tersimpan.`, ok: 'Hapus', danger: true })) {
          await db.del('clients', c.id);
          close();
          toast('Klien dihapus');
          onDone();
        }
        return false;
      } }] : []),
      { label: 'Simpan', kind: 'primary', onClick: async ({ body }) => {
        const v = (n) => body.querySelector(`[name="${n}"]`).value.trim();
        if (!v('name')) {
          toast('Nama klien wajib diisi', { type: 'error' });
          return false;
        }
        Object.assign(c, { name: v('name'), phone: v('phone'), address: v('address'), notes: v('notes'), monthlyFee: parseMoney(v('monthlyFee')), updatedAt: Date.now() });
        c.locations = c.locations.filter((l) => l.name.trim());
        await db.put('clients', c);
        toast('Klien tersimpan', { type: 'success' });
        onDone();
      } },
    ],
  });
  bindMoneyInput(sh.body.querySelector('[name="monthlyFee"]'));
  const locs = sh.body.querySelector('#locs');
  const redraw = () => (locs.innerHTML = c.locations.map(locRow).join(''));
  sh.body.querySelector('#loc-add').onclick = () => {
    c.locations.push({ name: '', note: '' });
    redraw();
    locs.lastElementChild?.querySelector('input')?.focus();
  };
  locs.addEventListener('input', (e) => {
    const row = e.target.closest('[data-li]');
    if (row && e.target.dataset.lf) c.locations[Number(row.dataset.li)][e.target.dataset.lf] = e.target.value;
  });
  locs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    c.locations.splice(Number(b.dataset.del), 1);
    redraw();
  });
}

/* ---------- Layanan ---------- */
async function layananTab(body) {
  const services = await db.all('services');
  services.sort((a, b) => a.name.localeCompare(b.name));
  body.innerHTML = `
    <div class="toolbar">
      <p class="muted small grow">Layanan, tanaman & material. Harga di sini jadi harga awal — tetap bisa diubah di setiap dokumen.</p>
      <button type="button" class="btn btn-primary" id="s-add">${icon('plus', 18)} Item</button>
    </div>
    <div id="s-list">${services.length
      ? `<div class="list card-list">${services
          .map(
            (x) => `
        <button type="button" class="inv-row" data-id="${x.id}">
          <div class="avatar avatar-soft">${icon('box', 20)}</div>
          <div class="ir-main"><div class="ir-name">${esc(x.name)}</div></div>
          <div class="ir-right"><div class="ir-amt">${x.price ? rupiah(x.price) + (x.unit ? `<small class="muted"> / ${esc(x.unit)}</small>` : '') : '<span class="muted">—</span>'}</div></div>
        </button>`
          )
          .join('')}</div>`
      : emptyState({ icon: 'box', title: 'Belum ada item', text: 'Contoh: Servis AC — Rp 75.000 / unit, Freon R32 — Rp 150.000 / kg' })}</div>`;
  body.querySelector('#s-add').onclick = () => serviceSheet(null, () => layananTab(body));
  body.querySelector('#s-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) serviceSheet(services.find((x) => x.id === b.dataset.id), () => layananTab(body));
  });
}

function serviceSheet(svc, onDone) {
  const x = svc ? { unit: '', ...svc } : { id: uid(), name: '', price: 0, unit: '', createdAt: Date.now() };
  const sh = sheet({
    title: svc ? 'Ubah item' : 'Item baru',
    content: `
      <form class="form">
        <label class="fld"><span>Nama layanan / barang / material</span><input name="name" value="${esc(x.name)}" placeholder="mis. Freon R32"></label>
        <div class="grid2">
          <label class="fld"><span>Harga default (Rp)</span><input name="price" inputmode="numeric" value="${moneyValue(x.price)}" placeholder="0"></label>
          <label class="fld"><span>Satuan <em>opsional</em></span><input name="unit" value="${esc(x.unit)}" placeholder="unit, m, kg, jam…"></label>
        </div>

      </form>`,
    actions: [
      ...(svc ? [{ label: 'Hapus', kind: 'danger-ghost', onClick: async ({ close }) => {
        await db.del('services', x.id);
        close();
        toast('Layanan dihapus');
        onDone();
        return false;
      } }] : []),
      { label: 'Simpan', kind: 'primary', onClick: async ({ body }) => {
        x.name = body.querySelector('[name="name"]').value.trim();
        x.unit = body.querySelector('[name="unit"]').value.trim();
        if (!x.name) {
          toast('Nama layanan wajib diisi', { type: 'error' });
          return false;
        }
        x.updatedAt = Date.now();
        await db.put('services', x);
        toast('Layanan tersimpan', { type: 'success' });
        onDone();
      } },
    ],
  });
  bindMoneyInput(sh.body.querySelector('[name="price"]'), (v) => (x.price = v));
  comboField(sh.body, 'input[name="unit"]', { title: 'Pilih satuan, atau ketik sendiri', newLabel: 'satuan baru', options: () => UNITS.map((u) => ({ value: u })) });
  sh.body.querySelector('[name="name"]').focus();
}
