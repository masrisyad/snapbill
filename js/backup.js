/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Backup & restore seluruh data ke satu file .json (PIN tidak ikut diekspor). */
import { db, meta } from './db.js';
import { getSettings, replaceSettings, APP_VERSION } from './state.js';
import { saveFile } from './export.js';
import { toISO } from './util.js';
import { migrateStatuses } from './invoice-model.js';

const FORMAT = 'snapbill-backup';

export async function buildBackup() {
  const [clients, services, invoices, counters] = await Promise.all([
    db.all('clients'),
    db.all('services'),
    db.all('invoices'),
    meta.get('counters', {}),
  ]);
  return {
    format: FORMAT,
    version: 1,
    app: 'SnapBill by Silsilara',
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { settings: getSettings(), counters, clients, services, invoices },
  };
}

export async function exportBackup() {
  const payload = await buildBackup();
  const now = new Date();
  const stamp = `${toISO(now).replace(/-/g, '')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const file = new File([JSON.stringify(payload, null, 1)], `snapbill-backup-${stamp}.json`, { type: 'application/json' });
  await saveFile(file);
  await meta.set('lastBackup', Date.now());
  return payload.data;
}

export function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('File bukan JSON yang valid.');
  }
  if (obj?.format !== FORMAT || !obj.data) throw new Error('File ini bukan backup SnapBill.');
  const d = obj.data;
  for (const k of ['clients', 'services', 'invoices']) {
    if (!Array.isArray(d[k])) throw new Error(`Data "${k}" di file backup rusak.`);
    if (d[k].some((x) => !x || typeof x.id !== 'string')) throw new Error(`Ada data "${k}" tanpa ID di file backup.`);
  }
  return obj;
}

/** mode: 'replace' (ganti semua) | 'merge' (gabungkan, ID sama ditimpa) */
export async function restoreBackup(obj, mode = 'replace') {
  const d = obj.data;
  if (mode === 'replace') {
    await db.restore({ clients: d.clients, services: d.services, invoices: d.invoices, meta: [{ key: 'counters', value: d.counters || {} }] }, { clear: true });
    if (d.settings) await replaceSettings(d.settings);
  } else {
    const current = (await meta.get('counters')) || {};
    const counters = { ...current };
    for (const [k, v] of Object.entries(d.counters || {})) counters[k] = Math.max(counters[k] || 0, v);
    await db.restore({ clients: d.clients, services: d.services, invoices: d.invoices, meta: [{ key: 'counters', value: counters }] }, { clear: false });
    if (d.settings && !getSettings().business.name) await replaceSettings(d.settings);
  }
  await migrateStatuses();
}
