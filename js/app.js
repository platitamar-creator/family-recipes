// נקודת הכניסה: ניתוב לפי הכתובת (#/...) והצגת המסך המתאים.
//
// #/                     דף הבית: הציטוט היומי והבתים שלי
// #/join/<קוד>           הצטרפות לבית
// #/h/<בית>              הבית שלי (בן בית, עם מפתח שנשמר במכשיר)
// #/h/<בית>/r/<מתכון>    מתכון
// #/h/<בית>/edit/<מתכון|new>
// #/h/<בית>/tags         ניהול תגיות
// #/h/<בית>/settings     שיתוף והגדרות
// #/h/<בית>/timeline[/<מתכון>]  מה בישלנו (גם #/v/<קוד>/timeline)
// #/h/<בית>/shop/<מתכון,מתכון...>  רשימת קניות משותפת לכמה מתכונים (גם #/v/<קוד>/shop/...)
// #/v/<קוד צפייה>        צפייה בבית (קריאה בלבד)
// #/v/<קוד צפייה>/r/<מתכון>
// #/r/<קוד מתכון>        צפייה במתכון בודד
import { getHouse, getHouses } from './store.js';
import { errorPage } from './ui.js';
import { renderHome } from './views/home.js';
import { renderJoin } from './views/join.js';
import { renderHouse } from './views/house.js';
import { renderRecipe } from './views/recipe.js';
import { renderEditor } from './views/editor.js';
import { renderTags } from './views/tags.js';
import { renderSettings } from './views/settings.js';
import { renderTimeline } from './views/timeline.js';
import { renderShop } from './views/shop.js';
import { registerServiceWorker, handleInstallClick } from './install.js';
import { mountSideDecor } from './decor.js';

// הקשר הגישה: איזה קוד שולחים לשרת, ומה כתובת הבסיס לקישורים פנימיים
function memberCtx(houseId) {
  const local = getHouse(houseId);
  if (!local) return null;
  return { token: local.key, base: `#/h/${houseId}`, houseId, isMember: true };
}

function notConnected() {
  return errorPage({
    message: 'המכשיר הזה עוד לא מחובר לבית הזה. בקשו מבן בית את קישור ההצטרפות ופתחו אותו כאן 🔑',
  });
}

let renderId = 0;

async function route() {
  const id = ++renderId;
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [kind, a, sub, b] = parts;
  window.scrollTo({ top: 0 });

  // מסך ישן לא ידרוס מסך חדש אם המשתמש עבר מהר.
  // mount מחליף את המיכל באחד חדש, כדי שמאזינים של מסך קודם לא יצטברו.
  const view = {
    app: document.getElementById('app'),
    isCurrent: () => id === renderId,
    mount(html) {
      const fresh = this.app.cloneNode(false);
      fresh.innerHTML = html;
      this.app.replaceWith(fresh);
      this.app = fresh;
      return fresh;
    },
  };

  try {
    if (!kind) return await renderHome(view);
    if (kind === 'join' && a) return await renderJoin(view, a);
    if (kind === 'r' && a) return await renderRecipe(view, { token: a, base: null, isMember: false }, null);

    if (kind === 'v' && a) {
      const ctx = { token: a, base: `#/v/${a}`, isMember: false };
      if (sub === 'r' && b) return await renderRecipe(view, ctx, b);
      if (sub === 'timeline') return await renderTimeline(view, ctx, b || null);
      if (sub === 'shop') return await renderShop(view, ctx, b || '');
      return await renderHouse(view, ctx);
    }

    if (kind === 'h' && a) {
      const ctx = memberCtx(a);
      if (!ctx) {
        view.mount(notConnected());
        return;
      }
      if (sub === 'r' && b) return await renderRecipe(view, ctx, b);
      if (sub === 'edit' && b) return await renderEditor(view, ctx, b === 'new' ? null : b);
      if (sub === 'tags') return await renderTags(view, ctx);
      if (sub === 'settings') return await renderSettings(view, ctx);
      if (sub === 'timeline') return await renderTimeline(view, ctx, b || null);
      if (sub === 'shop') return await renderShop(view, ctx, b || '');
      return await renderHouse(view, ctx);
    }

    view.mount(errorPage({ message: 'הדף הזה לא נמצא במטבח 🧐' }));
  } catch (err) {
    console.error(err);
    if (view.isCurrent()) view.mount(errorPage(err));
  }
}

// שיתוף מאפליקציה אחרת (אנדרואיד): "שיתוף ← המתכונים" פותח את האתר עם הטקסט/הקישור.
// שומרים אותו, ומסך הבית של הבית פותח איתו את "מתכון מקישור".
function receiveShare() {
  const q = new URLSearchParams(location.search);
  if (!q.has('share_text') && !q.has('share_url') && !q.has('share_title')) return;
  const text = [q.get('share_title'), q.get('share_text'), q.get('share_url')]
    .filter((x, i, all) => x && !all.slice(0, i).some((y) => y && y.includes(x)))
    .join('\n');
  history.replaceState(null, '', location.pathname + location.hash);
  if (!text) return;
  try {
    sessionStorage.setItem('frb.shared', text);
  } catch {
    /* כלום */
  }
  const ids = Object.keys(getHouses());
  if (ids.length === 1 && !location.hash.startsWith(`#/h/${ids[0]}`)) location.hash = `#/h/${ids[0]}`;
}

receiveShare();
window.addEventListener('hashchange', route);
// כפתור ההתקנה (📲) מופיע בכל מסך
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-install]')) handleInstallClick();
});
mountSideDecor();
route();
registerServiceWorker();
