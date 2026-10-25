/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved. */
import { meta } from './db.js';
import { clone, deepMerge } from './util.js';

export const APP_VERSION = '1.0.0';

export const DEFAULT_WA_TEMPLATE =
  'Halo {klien},\n\n' +
  'Berikut kami kirimkan tagihan dari *{usaha}*:\n' +
  'No. Invoice: {nomor}\n' +
  'Periode: {periode}\n\n' +
  '{rincian}\n\n' +
  'Total tagihan: *{total}*\n' +
  '{info_dp}\n\n' +
  '{pembayaran}\n\n' +
  'Terima kasih 🙏';

export const DEFAULT_WA_QUOTE_TEMPLATE =
  'Halo {klien},\n\n' +
  'Berikut kami kirimkan penawaran dari *{usaha}*:\n' +
  'No. Penawaran: {nomor}\n\n' +
  '{rincian}\n\n' +
  'Total penawaran: *{total}*\n' +
  '{info_dp}\n\n' +
  'Silakan dipertimbangkan, kami tunggu kabar baiknya. Terima kasih 🙏';

export const DEFAULT_SETTINGS = {
  business: {
    name: '',
    tagline: '',
    phone: '',
    email: '',
    address: '',
    logo: '',
    signName: '',
    paymentInfo: '',
  },
  template: 'klasik',
  templateLabels: {},
  invoice: {
    showNumber: false,
    pdfSize: 'a4', // a4 | fit
    defaultService: '',
    quoteTitle: 'PENAWARAN',
  },
  numbering: {
    enabled: false,
    pattern: 'INV/{YYYY}/{MM}/{SEQ:3}',
    quotePattern: 'PNW/{YYYY}/{MM}/{SEQ:3}',
    reset: 'monthly', // monthly | yearly | never
  },
  security: {
    lockMinutes: 5,
  },
  ui: {
    mode: 'modern', // modern (bawaan) | classic — pilihan pengguna tersimpan dan dipakai seterusnya
  },
  waTemplate: DEFAULT_WA_TEMPLATE,
  waQuoteTemplate: DEFAULT_WA_QUOTE_TEMPLATE,
};

let settings = clone(DEFAULT_SETTINGS);

export async function loadSettings() {
  const saved = await meta.get('settings', {});
  settings = deepMerge(clone(DEFAULT_SETTINGS), saved || {});
  return settings;
}

export const getSettings = () => settings;

export async function saveSettings(patch) {
  settings = deepMerge(settings, clone(patch));
  await meta.set('settings', settings);
  return settings;
}

export async function replaceSettings(next) {
  settings = deepMerge(clone(DEFAULT_SETTINGS), next || {});
  await meta.set('settings', settings);
  return settings;
}
