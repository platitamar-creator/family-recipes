// כלים קטנים לממשק: הגנה על טקסט, הודעות קופצות, חלונות, תאריכים ותצוגות קטנות.
import { quoteOfTheDay } from './quotes.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// טקסט חופשי עם שבירות שורה
export const multiline = (s) => esc(s).replace(/\n/g, '<br>');

export function toast(message, kind = 'ok') {
  const box = $('#toasts');
  const el = document.createElement('div');
  const colors = kind === 'error' ? 'bg-berry-500 text-white' : 'bg-cocoa-900 text-cream-50';
  el.className = `pointer-events-auto animate-rise rounded-2xl px-5 py-3 shadow-lift ${colors} max-w-md text-center`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 300);
  }, kind === 'error' ? 4500 : 2600);
}

export const showError = (err) => toast(err?.message || 'אופס, משהו השתבש 🔥', 'error');

// חלון קופץ. מחזיר את האלמנט ופונקציית סגירה.
export function modal(innerHtml, { wide = false, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'fixed inset-0 z-40 flex items-end justify-center bg-cocoa-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4';
  wrap.innerHTML = `
    <div class="animate-pop max-h-[92vh] w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} overflow-y-auto rounded-t-3xl bg-cream-50 p-5 shadow-lift sm:rounded-3xl sm:p-6" role="dialog" aria-modal="true">
      ${innerHtml}
    </div>`;
  const close = () => {
    wrap.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => e.key === 'Escape' && close();
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
  wrap.querySelector('input, textarea, select')?.focus();
  return { el: wrap, close };
}

export function confirmDialog(text, { ok = 'כן, בטוח', cancel = 'התחרטתי', danger = true } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const { el, close } = modal(
      `<p class="mb-5 text-lg leading-relaxed">${text}</p>
       <div class="flex gap-2">
         <button class="${danger ? 'btn bg-berry-500 text-white hover:bg-berry-600' : 'btn-primary'} flex-1" data-ok>${ok}</button>
         <button class="btn-soft flex-1" data-close>${cancel}</button>
       </div>`,
      { onClose: () => !answered && resolve(false) },
    );
    el.querySelector('[data-ok]').addEventListener('click', () => {
      answered = true;
      close();
      resolve(true);
    });
  });
}

export async function copyText(text, message = 'הועתק! עכשיו רק להדביק 📋') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(message);
}

export const whatsappUrl = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;

const rtf = new Intl.RelativeTimeFormat('he', { numeric: 'auto' });
export function timeAgo(iso) {
  const sec = (new Date(iso) - Date.now()) / 1000;
  const units = [
    ['year', 31536000], ['month', 2592000], ['week', 604800],
    ['day', 86400], ['hour', 3600], ['minute', 60],
  ];
  for (const [unit, s] of units) {
    if (Math.abs(sec) >= s) return rtf.format(Math.round(sec / s), unit);
  }
  return 'הרגע';
}

export const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });

export const DIFFICULTY = {
  1: { label: 'קל כמו לחתוך חמאה', short: 'קל מאוד' },
  2: { label: 'קליל, גם אחרי יום עבודה', short: 'קל' },
  3: { label: 'צריך קצת להתרכז', short: 'בינוני' },
  4: { label: 'מאתגר, אבל שווה את זה', short: 'מאתגר' },
  5: { label: 'רק לאמיצים ולמי שיש לו זמן', short: 'לאמיצים' },
};

// רמת קושי: חמישה פסים, כמו מד חום של תנור
export function difficultyIcons(n, size = 'text-base') {
  const h = size === 'text-sm' ? 'h-2.5' : 'h-3';
  let bars = '';
  for (let i = 1; i <= 5; i++) bars += `<span class="${h} w-1.5 rounded-full ${i <= n ? 'bg-spice-500' : 'bg-cream-300'}"></span>`;
  return `<span class="inline-flex items-end gap-0.5" title="${esc(DIFFICULTY[n]?.label)}" aria-label="רמת קושי ${n} מתוך 5">${bars}</span>`;
}

export function totalTime(r) {
  const t = (r.prep_minutes || 0) + (r.cook_minutes || 0);
  if (!t) return '';
  if (t < 60) return `${t} דק׳`;
  const h = Math.floor(t / 60);
  const m = t % 60;
  return m ? `${h}:${String(m).padStart(2, '0')} שע׳` : `${h} שע׳`;
}

export function avatar(member, size = 9) {
  if (!member) return '';
  const px = { 6: 'h-6 w-6 text-[11px]', 7: 'h-7 w-7 text-xs', 9: 'h-9 w-9 text-sm', 12: 'h-12 w-12 text-lg', 14: 'h-14 w-14 text-xl' }[size];
  const initial = esc([...member.name.trim()][0] || '?');
  return `<span class="avatar ${px}" style="background:${esc(member.color)}" title="${esc(member.name)}">${initial}</span>`;
}

export function tagChip(tag, extra = '') {
  return `<span class="chip ${extra}" style="background:${esc(tag.color)}">${esc(tag.name)}</span>`;
}

export function quoteCard(compact = false) {
  const q = quoteOfTheDay();
  if (compact) {
    return `<div class="sticky-note flex items-center gap-3 px-4 py-2.5">
      <span class="text-2xl">${q.emoji}</span>
      <p class="font-hand text-2xl leading-tight text-cocoa-700">${esc(q.text)}</p>
    </div>`;
  }
  return `<div class="sticky-note relative px-6 py-5">
    <span class="absolute -top-3 right-8 h-6 w-20 rotate-2 rounded-sm bg-spice-200/70"></span>
    <p class="mb-1 text-xs font-medium tracking-wide text-cocoa-500">הציטוט היומי</p>
    <div class="flex items-center gap-3">
      <span class="text-4xl">${q.emoji}</span>
      <p class="font-hand text-3xl leading-tight text-cocoa-900">${esc(q.text)}</p>
    </div>
  </div>`;
}

export function loading(text = 'מערבבים את הסיר...') {
  return `<div class="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-cocoa-500">
    <span class="animate-bounce text-5xl">🍲</span><p>${esc(text)}</p></div>`;
}

export function errorPage(err, { homeLink = true } = {}) {
  return `<div class="card mx-auto mt-10 max-w-md p-8 text-center animate-rise">
    <div class="mb-3 text-6xl">🥲</div>
    <h1 class="mb-2 text-2xl">אוי, משהו לא הסתדר</h1>
    <p class="mb-6 text-cocoa-700">${esc(err?.message || 'שגיאה לא צפויה')}</p>
    ${homeLink ? '<a href="#/" class="btn-primary">חזרה לדף הבית 🏠</a>' : ''}
  </div>`;
}

// מאזין ללחיצות על [data-action] בתוך אזור מסוים
export function onAction(root, handlers) {
  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || !root.contains(el)) return;
    const fn = handlers[el.dataset.action];
    if (fn) {
      e.preventDefault();
      fn(el, e);
    }
  });
}

// מנטרל כפתור בזמן פעולה, מציג שגיאות
export async function busy(button, fn) {
  const original = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.innerHTML = '<span class="animate-spin inline-block">🥄</span>';
  }
  try {
    return await fn();
  } catch (err) {
    showError(err);
    return undefined;
  } finally {
    if (button && button.isConnected) {
      button.disabled = false;
      button.innerHTML = original;
    }
  }
}

export const EMOJIS = ['🏠', '🏡', '🍲', '🥘', '🍰', '🥐', '🍕', '🌮', '🫖', '🧁', '🍋', '🌻', '🐓', '❤️'];
export const COLORS = ['#E07A3F', '#7A9E7E', '#D4A24C', '#C4626B', '#6C8EAD', '#9C7BB0', '#B5835A', '#5E9C94'];
export const TAG_COLORS = ['#F6D5CF', '#FBE0C8', '#FBE7B5', '#FFF0C2', '#E3EEDC', '#D5E8E4', '#DCE9F5', '#DAD7EE', '#F8D9E6', '#EADFCF'];
