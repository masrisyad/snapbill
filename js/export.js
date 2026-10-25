/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Ekspor invoice ke PDF / PNG / JPG, cetak, dan bagikan (WhatsApp / Web Share). */
import { $, safeFileName, waNumber, isIOS } from './util.js';
import { renderInvoice } from './templates.js';
import { getSettings } from './state.js';
import { buildMessage } from './invoice-model.js';

const loaded = {};
function loadScript(src) {
  if (!loaded[src]) {
    loaded[src] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => {
        delete loaded[src];
        rej(new Error('Gagal memuat ' + src));
      };
      document.head.appendChild(s);
    });
  }
  return loaded[src];
}

export const fileBase = (inv) => safeFileName(`${inv.number || 'Invoice'} ${inv.client?.name || ''}`.trim());

async function settle(el) {
  if (document.fonts?.ready) await document.fonts.ready;
  await Promise.all(
    [...el.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((r) => (img.onload = img.onerror = r))))
  );
}

let queue = Promise.resolve();

/** Render invoice ke <canvas> resolusi tinggi (dijalankan berurutan). */
export function invoiceCanvas(inv, scale = 2) {
  const run = queue.then(() => renderCanvas(inv, scale));
  queue = run.catch(() => {});
  return run;
}

async function renderCanvas(inv, scale) {
  await loadScript('vendor/html2canvas.min.js');
  const root = $('#render-root');
  root.innerHTML = renderInvoice(inv, getSettings());
  const el = root.firstElementChild;
  await settle(el);
  try {
    return await window.html2canvas(el, {
      scale,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
      windowWidth: 1280,
      scrollX: 0,
      scrollY: 0,
    });
  } finally {
    root.innerHTML = '';
  }
}

const canvasBlob = (canvas, type, quality) => new Promise((res) => canvas.toBlob(res, type, quality));

export async function invoiceImage(inv, ext = 'png') {
  const canvas = await invoiceCanvas(inv, 2);
  const type = ext === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await canvasBlob(canvas, type, 0.93);
  return new File([blob], `${fileBase(inv)}.${ext}`, { type });
}

export async function invoicePDF(inv) {
  const [canvas] = await Promise.all([invoiceCanvas(inv, 2), loadScript('vendor/jspdf.umd.min.js')]);
  const { jsPDF } = window.jspdf;
  const img = canvas.toDataURL('image/jpeg', 0.92);
  const pxToMm = 25.4 / 96 / 2; // canvas skala 2
  let doc;
  if (getSettings().invoice.pdfSize === 'fit') {
    const w = canvas.width * pxToMm;
    const h = canvas.height * pxToMm;
    doc = new jsPDF({ unit: 'mm', format: [w, h], orientation: w > h ? 'l' : 'p', compress: true });
    doc.addImage(img, 'JPEG', 0, 0, w, h);
  } else {
    doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'p', compress: true });
    const margin = 10;
    const pw = 210 - margin * 2;
    const ph = 297 - margin * 2;
    const h = (canvas.height * pw) / canvas.width;
    if (h <= ph) {
      doc.addImage(img, 'JPEG', margin, margin, pw, h);
    } else {
      // Invoice panjang: potong per halaman A4.
      const slicePx = Math.floor((ph * canvas.width) / pw);
      for (let y = 0, page = 0; y < canvas.height; y += slicePx, page++) {
        const part = document.createElement('canvas');
        part.width = canvas.width;
        part.height = Math.min(slicePx, canvas.height - y);
        const ctx = part.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, part.width, part.height);
        ctx.drawImage(canvas, 0, -y);
        if (page) doc.addPage();
        doc.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, pw, (part.height * pw) / part.width);
      }
    }
  }
  doc.setProperties({ title: `${inv.number || 'Invoice'} - ${inv.client?.name || ''}`, creator: 'SnapBill by Silsilara' });
  const blob = doc.output('blob');
  return new File([blob], `${fileBase(inv)}.pdf`, { type: 'application/pdf' });
}

/* ---------- Distribusi ---------- */
export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export const canShareFiles = () => {
  try {
    const f = new File(['x'], 'x.pdf', { type: 'application/pdf' });
    return !!(navigator.canShare && navigator.canShare({ files: [f] }));
  } catch {
    return false;
  }
};

/** Bagikan file lewat share sheet (WhatsApp, Telegram, Simpan ke File, dll). */
export async function shareFile(file, { text = '', title = '' } = {}) {
  const data = { files: [file], title: title || file.name };
  if (text) data.text = text;
  try {
    await navigator.share(data);
    return true;
  } catch (e) {
    if (e?.name === 'AbortError') return false;
    throw e;
  }
}

/** Simpan file: iOS → share sheet (Simpan ke File), lainnya → unduh langsung. */
export async function saveFile(file) {
  if (isIOS() && canShareFiles()) {
    try {
      return await shareFile(file);
    } catch {}
  }
  downloadFile(file);
  return true;
}

export function openWhatsApp(inv, text) {
  const phone = waNumber(inv.client?.phone);
  const msg = text ?? buildMessage(inv);
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  const w = window.open(url, '_blank', 'noopener');
  if (!w) location.href = url;
}

export async function printInvoice(inv) {
  const root = $('#print-root');
  root.innerHTML = renderInvoice(inv, getSettings());
  await settle(root);
  document.body.classList.add('printing');
  const cleanup = () => {
    document.body.classList.remove('printing');
    root.innerHTML = '';
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
  setTimeout(() => document.body.classList.contains('printing') && !matchMedia('print').matches && cleanup(), 1500);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
