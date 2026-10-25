/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved. */
import { esc, pickFile, readFileAsDataURL, shrinkImage } from '../util.js';
import { icon } from '../icons.js';
import { getSettings, saveSettings } from '../state.js';
import { toast } from '../ui.js';

/** Form profil usaha (kop invoice). Mengembalikan fungsi save(). */
export function businessForm(container) {
  const b = { ...getSettings().business };
  const inv = getSettings().invoice;
  container.innerHTML = `
    <div class="logo-field">
      <div class="logo-box" id="bf-logo">${b.logo ? `<img src="${b.logo}" alt="Logo">` : icon('image', 30)}</div>
      <div class="logo-actions">
        <div class="fld-label">Logo usaha</div>
        <div class="row-btns">
          <button type="button" class="btn btn-soft btn-sm" id="bf-pick">${icon('upload', 18)} Pilih gambar</button>
          <button type="button" class="btn btn-ghost btn-sm" id="bf-clear" ${b.logo ? '' : 'hidden'}>Hapus</button>
        </div>
        <small class="hint">PNG transparan paling bagus. Otomatis diperkecil.</small>
      </div>
    </div>
    <label class="fld"><span>Nama usaha</span><input name="name" value="${esc(b.name)}" placeholder="mis. CV MAJU BERSAMA" autocomplete="organization"></label>
    <label class="fld"><span>Slogan / keterangan</span><input name="tagline" value="${esc(b.tagline)}" placeholder="mis. Servis & Instalasi AC"></label>
    <div class="grid2">
      <label class="fld"><span>No. telepon</span><input name="phone" value="${esc(b.phone)}" inputmode="tel" placeholder="0812 xxxx xxxx" autocomplete="tel"></label>
      <label class="fld"><span>Email (opsional)</span><input name="email" type="email" value="${esc(b.email)}" autocomplete="email"></label>
    </div>
    <label class="fld"><span>Alamat (opsional)</span><input name="address" value="${esc(b.address)}" autocomplete="street-address"></label>
    <div class="grid2">
      <label class="fld"><span>Nama penanda tangan</span><input name="signName" value="${esc(b.signName)}" placeholder="mis. BUDI SANTOSO"></label>
      <label class="fld"><span>Layanan utama (default)</span><input name="defaultService" value="${esc(inv.defaultService)}" placeholder="mis. Servis AC"></label>
    </div>
    <label class="fld"><span>Info pembayaran (opsional)</span><textarea name="paymentInfo" rows="2" placeholder="mis. BCA 1234567890 a.n. Nama Anda">${esc(b.paymentInfo)}</textarea><small class="hint">Tampil di invoice & pesan WhatsApp.</small></label>`;

  let logo = b.logo || '';
  const box = container.querySelector('#bf-logo');
  const clearBtn = container.querySelector('#bf-clear');
  container.querySelector('#bf-pick').onclick = async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    try {
      logo = await shrinkImage(await readFileAsDataURL(f), 480);
      box.innerHTML = `<img src="${logo}" alt="Logo">`;
      clearBtn.hidden = false;
    } catch {
      toast('Gambar tidak bisa dibaca', { type: 'error' });
    }
  };
  clearBtn.onclick = () => {
    logo = '';
    box.innerHTML = icon('image', 30);
    clearBtn.hidden = true;
  };

  return async function save() {
    const v = (n) => container.querySelector(`[name="${n}"]`).value.trim();
    await saveSettings({
      business: {
        name: v('name'),
        tagline: v('tagline'),
        phone: v('phone'),
        email: v('email'),
        address: v('address'),
        signName: v('signName'),
        paymentInfo: v('paymentInfo'),
        logo,
      },
      invoice: { defaultService: v('defaultService') },
    });
  };
}
