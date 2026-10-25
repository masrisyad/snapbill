/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Beranda. Classic: menu tombol besar + tagihan terbaru. Modern: statistik & grafik + tagihan terbaru. */
import { db, meta } from '../db.js';
import { esc, relTime, isIOS, isStandalone } from '../util.js';
import { icon } from '../icons.js';
import { emptyState } from '../ui.js';
import { invoiceRow, sortInvoices } from './shared.js';
import { pwa, promptInstall } from '../pwa.js';
import { getSettings } from '../state.js';
import { isModern } from '../mode.js';
import { insightsHTML, bindInsights } from './insights.js';

const RECENT = 20;

export async function render(ctx) {
  ctx.setTitle('Beranda');
  const [all, lastBackup] = await Promise.all([db.all('invoices'), meta.get('lastBackup', 0)]);

  const draw = () => {
    const modern = isModern();
    const recent = sortInvoices([...all]).slice(0, RECENT);
    const needBackup = all.length > 0 && (!lastBackup || Date.now() - lastBackup > 14 * 86400000);
    const showInstall = !isStandalone() && localStorage.getItem('sb_hide_install') !== '1' && (pwa.installEvent || isIOS());

    ctx.el.innerHTML = `
      ${showInstall ? `
      <div class="banner banner-brand" id="install-banner">
        ${icon('install')}
        <div class="banner-txt">${pwa.installEvent ? '<b>Pasang SnapBill</b> di layar utama agar terbuka instan & bisa offline.' : '<b>Pasang di iPhone:</b> ketuk tombol <b>Bagikan</b> ' + icon('share', 16) + ' di Safari, lalu pilih <b>Tambah ke Layar Utama</b>.'}</div>
        ${pwa.installEvent ? '<button type="button" class="btn btn-primary btn-sm" id="do-install">Pasang</button>' : ''}
        <button type="button" class="icon-btn" id="hide-install" aria-label="Tutup">${icon('close', 18)}</button>
      </div>` : ''}

      ${needBackup ? `
      <a class="banner banner-warn" role="link" tabindex="0" data-href="#/pengaturan?buka=backup">
        ${icon('database')}
        <div class="banner-txt"><b>Backup data Anda.</b> Backup terakhir: ${esc(relTime(lastBackup))}. Data hanya ada di perangkat ini.</div>
        ${icon('chevron', 18)}
      </a>` : ''}

      ${modern ? insightsHTML(all, getSettings().business.name) : `
      <section class="home-hello">
        <div class="muted">Selamat datang,</div>
        <h2>${esc(getSettings().business.name || 'SnapBill')}</h2>
      </section>
      <nav class="home-menu" aria-label="Menu utama">
        <a class="primary" role="link" tabindex="0" data-href="#/tagihan/baru"><span class="hm-ic">${icon('plus', 26)}</span><span><b>Buat Tagihan</b><small>Invoice untuk klien</small></span></a>
        <a class="gold" role="link" tabindex="0" data-href="#/tagihan/baru?jenis=penawaran"><span class="hm-ic">${icon('send', 24)}</span><span><b>Buat Penawaran</b><small>Harga proyek baru</small></span></a>
        <a role="link" tabindex="0" data-href="#/tagihan"><span class="hm-ic">${icon('bills', 24)}</span><span><b>Semua Tagihan</b><small>Cari & kirim ulang</small></span></a>
        <a role="link" tabindex="0" data-href="#/master?tab=klien"><span class="hm-ic">${icon('users', 24)}</span><span><b>Data Klien</b><small>Nama, nomor, biaya</small></span></a>
      </nav>`}

      <div class="section-head"><h3>Tagihan terbaru</h3>${all.length > RECENT ? '<a role="link" tabindex="0" data-href="#/tagihan">Lihat semua</a>' : ''}</div>
      ${recent.length
        ? `<div class="list card-list">${recent.map(invoiceRow).join('')}</div>`
        : emptyState({
            icon: 'bills',
            title: 'Belum ada tagihan',
            text: 'Ketuk tombol <b>+</b> untuk membuat tagihan atau penawaran pertama Anda.',
            action: `<div class="row-btns center"><a class="btn btn-primary" role="link" tabindex="0" data-href="#/tagihan/baru">${icon('plus', 18)} Buat tagihan</a><a class="btn btn-soft" role="link" tabindex="0" data-href="#/tagihan/baru?jenis=penawaran">${icon('send', 18)} Buat penawaran</a></div>`,
          })}`;

    if (modern) bindInsights(ctx.el, all);
    ctx.el.querySelector('#hide-install')?.addEventListener('click', () => {
      localStorage.setItem('sb_hide_install', '1');
      ctx.el.querySelector('#install-banner').remove();
    });
    ctx.el.querySelector('#do-install')?.addEventListener('click', async () => {
      await promptInstall();
      draw();
    });
  };

  draw();
  const onInstallable = () => draw();
  document.addEventListener('sb:installable', onInstallable);
  return { destroy: () => document.removeEventListener('sb:installable', onInstallable) };
}
