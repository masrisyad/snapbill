/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved. */
import { toast } from './ui.js';

/** Event "beforeinstallprompt" (Android/desktop Chrome) disimpan untuk tombol Pasang. */
export const pwa = { installEvent: null };

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  pwa.installEvent = e;
  document.dispatchEvent(new CustomEvent('sb:installable'));
});

window.addEventListener('appinstalled', () => {
  pwa.installEvent = null;
  toast('SnapBill terpasang di perangkat Anda 🎉', { type: 'success' });
});

export async function promptInstall() {
  const e = pwa.installEvent;
  if (!e) return false;
  e.prompt();
  const choice = await e.userChoice.catch(() => null);
  pwa.installEvent = null;
  return choice?.outcome === 'accepted';
}
