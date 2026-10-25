/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Beranda mode Modern: angka utama bulan ini, ringkasan, grafik 6 bulan, dan klien teratas.
 * Dihitung dari invoice berstatus Terkirim (draft & penawaran tidak dihitung sebagai tagihan). */
import { esc, rupiah, MON, MONTHS, thisMonth } from '../util.js';
import { calc } from '../invoice-model.js';
import { icon } from '../icons.js';

const isInvoice = (i) => i.docType !== 'quote';

/** 1.250.000 → "1,25 jt"; 450.000 → "450 rb" */
export function compact(n) {
  const v = Math.abs(n);
  const f = (x) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: x >= 100 ? 0 : x >= 10 ? 1 : 2 }).format(x);
  if (v >= 1e9) return f(n / 1e9) + ' M';
  if (v >= 1e6) return f(n / 1e6) + ' jt';
  if (v >= 1e3) return f(n / 1e3) + ' rb';
  return String(Math.round(n));
}

function monthKeys(count) {
  const [y, m] = thisMonth().split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(y, m - 1 - (count - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}
const monthOf = (inv) => (inv.issueDate || '').slice(0, 7) || inv.period || '';

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam';
}

/** Tick sumbu Y yang "bulat" (0, setengah, puncak). */
function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

// W = lebar asli grafik dalam px (diukur saat tampil), jadi huruf & tinggi tidak ikut membesar di tablet/desktop.
function chartSVG(series, W = 320) {
  const H = 168, top = 22, base = 136, left = 34, right = 6;
  const slot = (W - left - right) / series.length;
  const bw = Math.min(28, slot * 0.55);
  const max = niceMax(Math.max(...series.map((s) => s.total)));
  const y = (v) => base - (v / max) * (base - top);
  const grid = [0, max / 2, max]
    .map((v) => `<line class="grid" x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}"/><text class="axis-t" x="${left - 6}" y="${y(v) + 3}" text-anchor="end">${v ? compact(v) : '0'}</text>`)
    .join('');
  const bars = series
    .map((s, i) => {
      const cx = left + slot * i + slot / 2;
      const h = base - y(s.total);
      const x = cx - bw / 2;
      const r = Math.min(4, h);
      // Ujung data membulat 4px, rata di garis dasar.
      const d = h > 0 ? `M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + bw - r} Q${x + bw},${base - h} ${x + bw},${base - h + r} V${base} Z` : '';
      const last = i === series.length - 1;
      return `
        <rect class="hit" data-i="${i}" x="${left + slot * i}" y="${top - 14}" width="${slot}" height="${base - top + 14}"></rect>
        <path class="bar${last ? ' on' : ''}" d="${d}"></path>
        ${last && s.total ? `<text class="val-t" x="${cx}" y="${base - h - 6}" text-anchor="middle">${compact(s.total)}</text>` : ''}
        <text class="axis-t" x="${cx}" y="${base + 16}" text-anchor="middle">${MON[Number(s.key.slice(5)) - 1]}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik total tagihan 6 bulan terakhir">${grid}${bars}</svg>`;
}

const sentInvoices = (all) => all.filter((i) => isInvoice(i) && i.status !== 'draft');
const seriesOf = (invoices, keys) =>
  keys.map((key) => {
    const list = invoices.filter((i) => monthOf(i) === key);
    return { key, total: list.reduce((a, i) => a + calc(i).total, 0), count: list.length };
  });

export function insightsHTML(all, businessName) {
  const invoices = sentInvoices(all);
  const keys = monthKeys(6);
  const series = seriesOf(invoices, keys);
  const cur = series[series.length - 1];
  const prev = series[series.length - 2];
  const curList = invoices.filter((i) => monthOf(i) === cur.key);
  const quotes = all.filter((i) => i.docType === 'quote' && monthOf(i) === cur.key).length;
  const dp = curList.reduce((a, i) => a + calc(i).paid, 0);
  const avg = curList.length ? Math.round(cur.total / curList.length) : 0;
  const curMonthName = MONTHS[Number(cur.key.slice(5)) - 1];
  const prevMonthName = MONTHS[Number(prev.key.slice(5)) - 1];

  let delta = `Bulan lalu (${prevMonthName}) belum ada tagihan`;
  if (prev.total) {
    const pct = Math.round(((cur.total - prev.total) / prev.total) * 100);
    delta = `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% dibanding ${prevMonthName}`;
  }

  // Klien teratas: bulan ini; bila kosong, 6 bulan terakhir.
  const pool = curList.length ? curList : invoices.filter((i) => keys.includes(monthOf(i)));
  const byClient = new Map();
  pool.forEach((i) => byClient.set(i.client.name, (byClient.get(i.client.name) || 0) + calc(i).total));
  const top = [...byClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topMax = top[0]?.[1] || 1;
  const hello = greeting();
  const hasHistory = series.some((s) => s.total);
  const tile = (ic, label, value) => `<div class="md-tile"><div class="md-ic">${icon(ic, 17)}</div><div class="md-tl">${label}</div><div class="md-tv">${value}</div></div>`;

  return `
    <section class="md-hello">
      <div><div class="muted">${esc(hello)}${businessName ? ',' : ''}</div><h2>${businessName ? esc(businessName) : 'Siap menagih hari ini?'}</h2></div>
      <img src="icons/logo.svg" alt="" width="42" height="42">
    </section>

    <section class="md-hero">
      <div class="md-label">${icon('money', 15)} Ditagih bulan ${esc(curMonthName)}</div>
      <div class="md-value">${rupiah(cur.total)}</div>
      <div class="md-delta">${esc(delta)}</div>
    </section>

    <section class="md-tiles">
      ${tile('send', 'Tagihan terkirim', cur.count)}
      ${tile('bills', 'Penawaran dibuat', quotes)}
      ${tile('download', 'DP diterima', dp ? compact(dp) : '0')}
      ${tile('hash', 'Rata-rata / tagihan', avg ? compact(avg) : '0')}
    </section>

    <section class="card md-chart" id="md-chart">
      <div class="md-card-head"><h3>Tagihan 6 bulan terakhir</h3><span>ketuk batang untuk detail</span></div>
      ${hasHistory ? chartSVG(series) : '<div class="md-empty">Belum ada tagihan terkirim dalam 6 bulan terakhir.</div>'}
    </section>

    <section class="card md-top">
      <div class="md-card-head"><h3>Klien teratas</h3><span>${curList.length ? `bulan ${esc(curMonthName)}` : '6 bulan terakhir'}</span></div>
      ${top.length
        ? top.map(([name, total]) => `
          <div class="md-top-row">
            <span class="nm">${esc(name)}</span><span class="vl">${compact(total)}</span>
            <div class="track"><div class="fill" style="width:${Math.max(4, Math.round((total / topMax) * 100))}%"></div></div>
          </div>`).join('')
        : '<div class="md-empty">Belum ada data klien.</div>'}
    </section>`;
}

/** Tooltip batang grafik (hover di desktop, ketuk di HP). */
export function bindInsights(root, all) {
  const box = root.querySelector('#md-chart');
  let svg = box?.querySelector('svg');
  if (!svg) return;
  const invoices = sentInvoices(all);
  const keys = monthKeys(6);
  const series = seriesOf(invoices, keys);
  const tip = document.createElement('div');
  tip.className = 'md-tip';
  tip.hidden = true;
  box.appendChild(tip);
  const show = (rect) => {
    const i = Number(rect.dataset.i);
    const key = keys[i];
    const list = invoices.filter((x) => monthOf(x) === key);
    const total = list.reduce((a, x) => a + calc(x).total, 0);
    tip.textContent = `${MONTHS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)} · ${rupiah(total)} · ${list.length} tagihan`;
    const r = rect.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    tip.hidden = false;
    const x = Math.min(Math.max(r.left + r.width / 2 - b.left, tip.offsetWidth / 2 + 4), b.width - tip.offsetWidth / 2 - 4);
    tip.style.left = `${x}px`;
    tip.style.top = `${r.top - b.top + 8}px`;
    svg.querySelectorAll('.bar').forEach((p, j) => p.classList.toggle('on', j === i));
  };
  const bind = () => {
    svg.querySelectorAll('.hit').forEach((rect) => {
      rect.addEventListener('pointerenter', () => show(rect));
      rect.addEventListener('click', () => show(rect));
    });
    svg.addEventListener('pointerleave', () => (tip.hidden = true));
  };
  // Gambar ulang selebar kartu (juga saat layar diputar / jendela diubah ukurannya).
  let drawnW = 0;
  const redraw = () => {
    const w = Math.round(svg.getBoundingClientRect().width);
    if (!w || Math.abs(w - drawnW) < 2) return;
    drawnW = w;
    svg.outerHTML = chartSVG(series, Math.max(260, w));
    svg = box.querySelector('svg');
    tip.hidden = true;
    bind();
  };
  bind();
  redraw();
  new ResizeObserver(redraw).observe(box);
}
