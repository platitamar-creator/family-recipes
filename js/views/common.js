// חלקים משותפים לכמה מסכים
import { esc } from '../ui.js';
import { isStandalone } from '../install.js';

export function topBar({ back = null, backLabel = 'חזרה', right = '' } = {}) {
  return `<header class="mb-5 flex items-center justify-between gap-3">
    ${back
      ? `<a href="${esc(back)}" class="btn-ghost btn-sm -mr-2"><span class="text-lg">→</span> ${esc(backLabel)}</a>`
      : `<a href="#/" class="flex items-center gap-2 text-cocoa-700 hover:text-spice-600">
           <span class="text-2xl">📖</span><span class="font-display text-lg">ספר המתכונים המשפחתי</span></a>`}
    <div class="flex items-center gap-2">${right}${isStandalone() ? '' : `
      <button data-install class="btn-soft btn-sm" title="התקנה כאפליקציה בטלפון">📲<span class="hidden sm:inline">התקנה</span></button>`}</div>
  </header>`;
}

// כתובת בסיס לקישורי שיתוף (עובד גם ב-GitHub Pages עם תת-תיקייה)
export const siteBase = () => location.origin + location.pathname;
export const shareLinks = {
  house: (viewToken) => `${siteBase()}#/v/${viewToken}`,
  join: (memberToken) => `${siteBase()}#/join/${memberToken}`,
  recipe: (shareToken) => `${siteBase()}#/r/${shareToken}`,
};
