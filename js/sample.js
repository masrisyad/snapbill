/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Dokumen contoh (studi kasus fiktif: jasa servis & instalasi AC) untuk pratinjau model invoice. */
import { newInvoice, newGroup, newItem } from './invoice-model.js';

const visits = (desc, price, dates) => dates.map((date) => newItem({ desc, price, date }));

/** Dokumen contoh untuk model tertentu. Nama klien & usaha fiktif. */
export function demoInvoice(tpl) {
  const inv = newInvoice();
  inv.template = tpl;
  inv.number = 'INV/2026/10/001';
  inv.client.name = 'Bu Sinta';
  inv.period = '2026-10';
  inv.issueDate = '2026-10-31';
  const S = 'Servis AC';

  if (tpl === 'kuantitas') {
    inv.docType = 'quote';
    inv.number = 'PNW/2026/10/001';
    inv.client.name = 'PT Sumber Rejeki';
    inv.period = '';
    inv.groups = [
      newGroup({
        name: 'TAHAP 1 — Ruang Rapat',
        items: [
          newItem({ desc: 'AC Split 1 PK', qty: 2, unit: 'unit', price: 3500000 }),
          newItem({ desc: 'Pipa AC + insulasi', qty: 10, unit: 'm', price: 120000 }),
          newItem({ desc: 'Kabel listrik', qty: 15, unit: 'm', price: 15000 }),
        ],
      }),
    ];
    inv.extras = [newItem({ desc: 'Jasa pemasangan', qty: 2, unit: 'unit', price: 350000 })];
    inv.payments = [{ id: 'dp1', label: 'DP 1', amount: 4000000, date: '' }];
    return inv;
  }

  if (tpl === 'klasik' || tpl === 'ringkas') {
    inv.pricing = 'lump';
    inv.lumpAmount = 450000;
    inv.groups = [newGroup({ items: visits(S, 0, ['2026-10-04', '2026-10-18']) })];
    inv.extras = [newItem({ desc: 'Isi freon R32', qty: 1, unit: 'kg', price: 150000 })];
    return inv;
  }

  const many = tpl === 'lokasi';
  inv.client.name = 'CV Maju Bersama';
  if (many) {
    inv.pricing = 'lump';
    inv.lumpAmount = 1200000;
  }
  inv.groups = [
    newGroup({ name: many ? 'Kantor Lt. 1' : 'Ruko Blok A', note: many ? '(3 unit)' : '', items: visits(S, 225000, ['2026-10-04', '2026-10-21']) }),
    newGroup({ name: many ? 'Kantor Lt. 2' : 'Ruko Blok B', note: many ? '(2 unit)' : '', items: visits(S, 150000, ['2026-10-16', '2026-10-29']) }),
  ];
  return inv;
}
