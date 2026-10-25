// נקודת הכניסה: ניתוב לפי הכתובת (#/...) והצגת המסך המתאים.
//
// #/                     דף הבית: הציטוט היומי והבתים שלי
// #/join/<קוד>           הצטרפות לבית
// #/h/<בית>              הבית שלי (בן בית, עם מפתח שנשמר במכשיר)
// #/h/<בית>/r/<מתכון>    מתכון
// #/h/<בית>/edit/<מתכון|new>
// #/h/<בית>/tags         ניהול תגיות
// #/h/<בית>/settings     שיתוף והגדרות
// #/v/<קוד צפייה>        צפייה בבית (קריאה בלבד)
// #/v/<קוד צפייה>/r/<מתכון>
// #/r/<קוד מתכון>        צפייה במתכון בודד
import { getHouse } from './store.js';
import { errorPage } from './ui.js';
import { renderHome } from './views/home.js';
import { renderJoin } from './views/join.js';
import { renderHouse } from './views/house.js';
import { renderRecipe } from './views/recipe.js';
import { renderEditor } from './views/editor.js';
import { renderTags } from './views/tags.js';
import { renderSettings } from './views/settings.js';
import { registerServiceWorker, handleInstallClick } from './install.js';

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
      return await renderHouse(view, ctx);
    }

    view.mount(errorPage({ message: 'הדף הזה לא נמצא במטבח 🧐' }));
  } catch (err) {
    console.error(err);
    if (view.isCurrent()) view.mount(errorPage(err));
  }
}

window.addEventListener('hashchange', route);
// כפתור ההתקנה (📲) מופיע בכל מסך
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-install]')) handleInstallClick();
});
route();
registerServiceWorker();
