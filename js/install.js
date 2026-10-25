// התקנה כאפליקציה: כפתור התקנה באנדרואיד/כרום, והוראות קצרות באייפון.
let deferredPrompt = null;
const listeners = new Set();

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  listeners.forEach((fn) => fn());
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  listeners.forEach((fn) => fn());
});

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const canPrompt = () => !!deferredPrompt;
export const onInstallChange = (fn) => listeners.add(fn);

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
}

const DISMISS = 'frb.installDismissed';
export const isDismissed = () => {
  try {
    return localStorage.getItem(DISMISS) === '1';
  } catch {
    return false;
  }
};
export const dismiss = () => {
  try {
    localStorage.setItem(DISMISS, '1');
  } catch {
    /* כלום */
  }
};

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}
