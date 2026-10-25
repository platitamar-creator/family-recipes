// התקנה כאפליקציה: כפתור התקנה באנדרואיד/כרום, והוראות קצרות באייפון.
import { modal, toast } from './ui.js';

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
    const go = () => navigator.serviceWorker.register('sw.js').catch(() => {});
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go);
  }
}

// ---------- כפתור "📲" בכל מסך ----------

const ua = navigator.userAgent;
export const isAndroid = () => /android/i.test(ua);
// דפדפנים פנימיים של אפליקציות (וואטסאפ, פייסבוק, אינסטגרם וכו') לא יודעים להתקין
export const isInAppBrowser = () => /FBAN|FBAV|Instagram|WhatsApp|Line\/|Telegram|; wv\)/i.test(ua);

export async function handleInstallClick() {
  if (canPrompt()) {
    if (await promptInstall()) toast('הותקן! עכשיו המטבח במסך הבית 🎉');
    return;
  }
  openInstallHelp();
}

const step = (n, html) => `<li class="flex gap-3"><span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-spice-100 font-display text-spice-700">${n}</span><span class="pt-0.5">${html}</span></li>`;
const key = (t) => `<span class="mx-0.5 inline-block rounded-lg bg-cream-200 px-1.5 py-0.5 text-sm">${t}</span>`;

function helpBody() {
  const inApp = isInAppBrowser()
    ? `<p class="mb-4 rounded-2xl bg-berry-100 p-3 text-sm leading-relaxed">⚠️ נראה שהאתר נפתח מתוך אפליקציה אחרת (למשל וואטסאפ). משם אי אפשר להתקין.
       לחצו על ${key('⋮')} או ${key('⬆️')} ובחרו <b>"פתיחה בדפדפן"</b>, ואז חזרו לכאן.</p>`
    : '';

  if (isIOS()) {
    return `${inApp}
      <ol class="mb-4 space-y-3">
        ${step(1, 'פתחו את האתר ב-<b>Safari</b> (באייפון אין כפתור התקנה, אבל זה לוקח 10 שניות)')}
        ${step(2, `לחצו על כפתור השיתוף ${key('⬆️')} בתחתית המסך (או ליד שורת הכתובת)`)}
        ${step(3, 'גללו מטה ובחרו <b>"הוספה למסך הבית"</b>')}
        ${step(4, 'לחצו <b>"הוסף"</b>. האייקון יופיע במסך הבית 🎉')}
      </ol>
      <p class="rounded-2xl bg-honey-100 p-3 text-xs leading-relaxed">💡 בפתיחה הראשונה של האפליקציה, הדביקו בדף הבית (בתיבה "קיבלת קישור?") את קישור ההצטרפות ובחרו את השם שלכם. אפל לא מעבירה את הכניסה מ-Safari לאפליקציה.</p>`;
  }
  if (isAndroid()) {
    return `${inApp}
      <ol class="mb-4 space-y-3">
        ${step(1, 'פתחו את האתר ב-<b>Chrome</b>')}
        ${step(2, `לחצו על התפריט ${key('⋮')} בפינה העליונה`)}
        ${step(3, 'בחרו <b>"התקנת אפליקציה"</b> או <b>"הוספה למסך הבית"</b>')}
      </ol>
      <p class="text-xs leading-relaxed text-cocoa-500">בדפדפן של סמסונג: תפריט ${key('≡')} ← "הוספת דף ל..." ← "מסך הבית".
      אם האפשרות לא מופיעה, ייתכן שהאפליקציה כבר מותקנת. חפשו את האייקון "המתכונים".</p>`;
  }
  return `${inApp}
    <ol class="mb-4 space-y-3">
      ${step(1, `ב-Chrome או Edge: לחצו על סמל ההתקנה ${key('⊕')} בצד שורת הכתובת`)}
      ${step(2, `או: תפריט ${key('⋮')} ← "שמירה ושיתוף" ← <b>"התקנת הדף כאפליקציה"</b>`)}
    </ol>
    <p class="text-xs text-cocoa-500">בטלפון זה עובד הכי טוב: פתחו את האתר בטלפון ולחצו שם על 📲.</p>`;
}

export function openInstallHelp() {
  modal(`
    <div class="mb-4 flex items-center gap-3">
      <img src="icons/icon-192.png" alt="" class="h-14 w-14 rounded-2xl shadow-soft">
      <div><h2 class="text-2xl">📲 המטבח במסך הבית</h2><p class="text-sm text-cocoa-500">ככה פותחים את ספר המתכונים כמו אפליקציה</p></div>
    </div>
    ${helpBody()}
    <button class="btn-primary mt-4 w-full" data-close>הבנתי!</button>`);
}
