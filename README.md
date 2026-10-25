# SnapBill by Silsilara

Aplikasi invoice berbasis **Progressive Web App (PWA)** — cepat, ringan, bisa dipasang di iPhone, Android, dan desktop, serta tetap jalan tanpa internet. Semua data tersimpan **lokal di perangkat** (IndexedDB), tanpa server dan tanpa biaya database.

> © 2026 Risyad Abdala Ramadhan. Hak cipta dilindungi undang-undang. Kode ini **bukan open source** — lihat [LICENSE](LICENSE).

## Fitur

- **PIN 4–6 digit** (hash PBKDF2), kunci otomatis saat tidak aktif, jeda bertahap setelah 5x salah.
- **Database lokal IndexedDB** — ribuan invoice tetap ringan.
- **Backup & restore** satu file `.json` (pindah HP / laptop). PIN tidak ikut di file.
- **Ekspor PDF (A4 / menyesuaikan), PNG, JPG, JPEG**, cetak, dan **kirim WhatsApp** dengan pesan otomatis.
- **Master data**: profil usaha (logo, nama, slogan, telp, penanda tangan, info rekening), klien + lokasi, layanan + harga default. Klien & layanan baru otomatis tersimpan saat membuat tagihan.
- **Penomoran otomatis** (mis. `INV/{YYYY}/{MM}/{SEQ:3}`), reset bulanan/tahunan, bisa dimatikan.
- **Branding Silsilara** (hijau beringin, emas, terakota, krem; font Plus Jakarta Sans; logo struk emas + petir).
- **2 mode** (fitur sama, UX berbeda): **Classic** — terang krem, huruf & tombol besar, beranda menu 4 tombol, form tagihan **4 langkah** (Klien → Rincian → Detail → Periksa); **Modern** — terang dengan kartu kaca, menu bawah mengambang, beranda statistik + grafik 6 bulan + klien teratas, form satu halaman, animasi & konfeti. Diatur di Pengaturan / saat pertama buka.
- **Beranda** berisi tagihan & penawaran terbaru. Status hanya **Draft** dan **Terkirim**.
- **Penawaran** (model Kuantitas), item tambahan bersatuan (`2 unit`, `5 m`), DP & sisa pembayaran otomatis.
- **5 model**: Klasik, Grup Lokasi, Ringkas, Tabel Rincian, Kuantitas — ada pratinjau (ikon mata) dan label tiap model bisa diubah.
- Diskon (% / Rp), pajak (%), harga per item atau **borongan**, duplikat tagihan untuk bulan berikutnya.

## Impor dari Excel

Pengguna yang punya data lama di Excel bisa memindahkannya lewat template resmi:

- `templates/snapbill-template-data-master.xlsx` — Profil Usaha, Klien (+ biaya bulanan & lokasi), Item & Harga.
- `templates/snapbill-template-lengkap.xlsx` — Data Master + Dokumen (invoice/penawaran) dan Rincian (Kunjungan / Tambahan / DP).

Di aplikasi: **Pengaturan → Backup & pindah perangkat → Pindahkan dari Excel** (unduh template, lalu **Impor file Excel**). Nama klien, nama item, dan nomor dokumen yang sama akan diperbarui; data lain tidak dihapus. File dibaca langsung di browser (tanpa server).

Template dibuat ulang dengan `python tools/make_excel_templates.py` (butuh `openpyxl`). Jika judul kolom diubah, sesuaikan juga `js/excel-import.js`.

## Menjalankan secara lokal

Butuh server statis (service worker & `crypto.subtle` hanya berjalan di `https://` atau `localhost`):

```bash
npx serve -l 5173 .
```

Lalu buka `http://localhost:5173`.

## Rilis ke GitHub Pages

1. Buat repository di GitHub, push seluruh isi folder ini ke branch `main`.
2. Buka **Settings → Pages** → *Source*: **Deploy from a branch** → `main` / `(root)` → **Save**.
3. Aplikasi tersedia di `https://<username>.github.io/<nama-repo>/`.
4. Setiap rilis baru, naikkan `VERSION` di `sw.js` (dan `APP_VERSION` di `js/state.js`, nilainya harus sama) agar pengguna menerima pembaruan — perangkat versi lama akan mendapat pop-up wajib muat ulang. Rilis pertama: **1.0.0**. Pola `MAYOR.MINOR.PERBAIKAN`: perbaikan kecil → `1.0.1`, fitur baru → `1.1.0`, perubahan besar → `2.0.0`.

Semua path bersifat relatif, jadi aplikasi berjalan di sub-folder GitHub Pages tanpa konfigurasi tambahan.

## Struktur

```
index.html            kerangka aplikasi
manifest.webmanifest  metadata PWA
sw.js                 service worker (cache offline)
css/app.css           tampilan aplikasi (light & dark)
css/invoice.css       tampilan kertas invoice
js/app.js             boot, router, onboarding
js/auth.js            PIN & kunci otomatis
js/db.js              IndexedDB
js/invoice-model.js   perhitungan, penomoran, pesan WhatsApp
js/templates.js       4 model invoice
js/export.js          PDF / gambar / cetak / bagikan
js/backup.js          backup & restore .json
js/views/*            halaman-halaman
vendor/               jsPDF, html2canvas (lokal, agar offline)
fonts/                Barlow Semi Condensed, Fredoka (lokal)
```
