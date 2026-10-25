/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Dua mode dengan fitur yang sama, branding Silsilara:
 *  - classic : terang krem, huruf & tombol besar, beranda menu, form bertahap (pengguna 45+)
 *  - modern  : terang krem, kartu kaca, menu mengambang, beranda statistik & grafik, animasi (pengguna muda) */
import { getSettings, saveSettings } from './state.js';
import { icon } from './icons.js';

export const MODES = {
  classic: { name: 'Classic', desc: 'Terang, huruf & tombol besar, isi tagihan langkah demi langkah.', theme: '#f5f2ea' },
  modern: { name: 'Modern', desc: 'Kartu kaca, statistik & grafik, semua di satu halaman.', theme: '#f5f2ea' },
};

/** Bawaan Modern; Classic hanya bila dipilih pengguna. ('genz' = nama lama mode modern.) */
export const currentMode = () => (getSettings().ui?.mode === 'classic' ? 'classic' : 'modern');
export const isModern = () => currentMode() === 'modern';

export function applyMode(mode = currentMode()) {
  document.documentElement.dataset.mode = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', MODES[mode].theme);
}

export async function setMode(mode) {
  await saveSettings({ ui: { mode } });
  applyMode(mode);
}

/** Dua kartu pilihan mode (Pengaturan & onboarding), dengan cuplikan tampilan mini. */
export const modePickerHTML = () => `
  <div class="mode-pick">
    ${Object.entries(MODES)
      .map(([k, m]) => `
    <button type="button" data-pick="${k}">
      <span class="mode-shot ${k}" aria-hidden="true"><i></i><i></i><i></i>${k === 'classic' ? '<i></i>' : ''}</span>
      <b>${m.name}</b><small>${m.desc}</small>
      <span class="mode-check">${icon('check', 14)}</span>
    </button>`)
      .join('')}
  </div>`;

export function bindModePicker(root, onChange) {
  const paint = () => root.querySelectorAll('[data-pick]').forEach((b) => b.classList.toggle('on', b.dataset.pick === currentMode()));
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b || b.dataset.pick === currentMode()) return;
    await setMode(b.dataset.pick);
    paint();
    onChange?.(b.dataset.pick);
  });
  paint();
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Konfeti kecil saat dokumen selesai / terkirim (hanya mode Modern). */
export function celebrate() {
  if (!isModern() || reducedMotion()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const colors = ['#f2b544', '#e8704e', '#3f9e89', '#fff4e0', '#6bbda9'];
  const parts = Array.from({ length: 110 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 80,
    y: innerHeight * 0.55,
    vx: (Math.random() - 0.5) * 11,
    vy: -Math.random() * 13 - 5,
    r: Math.random() * 6 + 3,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    c: colors[(Math.random() * colors.length) | 0],
  }));
  const start = performance.now();
  const frame = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of parts) {
      p.vy += 0.38;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 1700);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      ctx.restore();
    }
    if (t < 1700) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
