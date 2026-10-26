// שיתוף והגדרות: קישורי צפייה והצטרפות, שם הבית, הפרופיל שלי
import { rpc, deleteImages, thumbImg } from '../api.js';
import { saveHouse, removeHouse } from '../store.js';
import { esc, loading, avatar, copyText, whatsappUrl, confirmDialog, onAction, busy, toast, timeAgo, $, emojiPicker, bindEmojiPicker, COLORS } from '../ui.js';
import { topBar, shareLinks } from './common.js';

export async function renderSettings(view, ctx) {
  if (!view.app.querySelector('[data-settings-page]')) view.app.innerHTML = loading();
  const data = await rpc('get_house', { p_token: ctx.token });
  if (!view.isCurrent()) return;
  const { house, me } = data;
  const active = data.members.filter((m) => !m.archived);
  const archived = data.members.filter((m) => m.archived);
  const reload = () => renderSettings(view, ctx);

  const viewLink = shareLinks.house(house.view_token);
  const joinLink = shareLinks.join(house.member_token);

  const linkCard = ({ icon, title, desc, link, waText, kind, tone }) => `
    <section class="card p-5">
      <div class="mb-3 flex items-start gap-3">
        <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone} text-2xl">${icon}</span>
        <div><h2 class="font-display text-xl">${title}</h2><p class="text-sm text-cocoa-500">${desc}</p></div>
      </div>
      <div class="mb-2 flex gap-2">
        <input class="input text-left text-xs" dir="ltr" readonly value="${esc(link)}">
        <button class="btn-soft shrink-0" data-action="copy" data-link="${esc(link)}">העתקה</button>
      </div>
      <div class="flex flex-wrap gap-2">
        <a class="btn btn-sm bg-[#25D366] text-white hover:bg-[#1FB457]" target="_blank" href="${esc(whatsappUrl(`${waText}\n${link}`))}">💬 שליחה בוואטסאפ</a>
        <button class="btn-ghost btn-sm" data-action="rotate" data-kind="${kind}">🔄 החלפת הקישור</button>
      </div>
    </section>`;

  view.mount(`
    <div data-settings-page>
    ${topBar({ back: ctx.base, backLabel: house.name })}
    <h1 class="mb-6 text-3xl">🔗 שיתוף והגדרות</h1>

    <div class="mb-8 space-y-4">
      ${linkCard({
        icon: '🤝', tone: 'bg-spice-100', kind: 'member',
        title: 'קישור הצטרפות לבני הבית',
        desc: 'מי שפותח אותו הופך לבן בית: יכול להוסיף, לערוך ולדרג מתכונים. לשלוח רק למשפחה!',
        link: joinLink, waText: `${house.emoji} בואו להצטרף לספר המתכונים של ${house.name}!`,
      })}
      ${linkCard({
        icon: '👀', tone: 'bg-sage-100', kind: 'view',
        title: 'קישור צפייה בכל הבית',
        desc: 'צפייה בכל המתכונים בלי אפשרות לערוך. אורחים יכולים רק להוסיף הערות וגרסאות.',
        link: viewLink, waText: `${house.emoji} ספר המתכונים של ${house.name}:`,
      })}
      <p class="text-xs text-cocoa-500">💡 קישור למתכון בודד נמצא בכפתור "שיתוף המתכון" בדף של כל מתכון. "החלפת הקישור" מבטלת את הקישור הישן מיד, למקרה שהגיע למי שלא צריך.</p>
    </div>

    <section class="card mb-4 p-5">
      <h2 class="section-title mb-4">🏡 הבית</h2>
      <form id="house-form" class="space-y-3">
        <input name="name" class="input" maxlength="60" required value="${esc(house.name)}">
        <div><span class="label">האמוג'י של הבית</span>${emojiPicker(house.emoji)}</div>
        <button class="btn-primary btn-sm" type="submit">שמירה</button>
      </form>
    </section>

    <section class="card mb-4 p-5">
      <h2 class="section-title mb-1">👨‍👩‍👧 בני הבית (${active.length})</h2>
      <p class="mb-3 text-sm text-cocoa-500">העברה לארכיון מנתקת את המכשירים של בן הבית ומסירה אותו מהרשימות. כל מה שהוא כתב, דירג ובישל נשאר.</p>
      <ul class="divide-y divide-cream-200">
        ${active.map((m) => `
          <li class="flex flex-wrap items-center gap-2 py-2">
            ${avatar(m, 9)} <span class="flex-1 font-medium">${esc(m.name)}${m.id === me.id ? ' <span class="text-xs text-cocoa-500">(זה את/ה)</span>' : ''}</span>
            <button data-action="revoke" data-id="${esc(m.id)}" data-name="${esc(m.name)}" class="btn-ghost btn-sm" title="למשל אם טלפון אבד">📵 ניתוק מכשירים</button>
            ${m.id !== me.id ? `<button data-action="archive" data-id="${esc(m.id)}" data-name="${esc(m.name)}" class="btn-ghost btn-sm text-berry-600">📦 לארכיון</button>` : ''}
          </li>`).join('')}
      </ul>
      ${archived.length ? `
        <details class="mt-3 rounded-2xl bg-cream-50 p-3">
          <summary class="cursor-pointer text-sm font-medium text-cocoa-700">בארכיון (${archived.length})</summary>
          <ul class="mt-2 divide-y divide-cream-200">
            ${archived.map((m) => `
              <li class="flex items-center gap-2 py-2 opacity-80">${avatar(m, 7)} <span class="flex-1">${esc(m.name)}</span>
                <button data-action="restore-member" data-id="${esc(m.id)}" class="btn-soft btn-sm">↩️ החזרה</button></li>`).join('')}
          </ul>
        </details>` : ''}
    </section>

    <section class="card mb-4 p-5">
      <h2 class="section-title mb-1">🗑️ סל המיחזור</h2>
      <p class="mb-3 text-sm text-cocoa-500">מתכונים שנמחקו נשמרים כאן 30 יום, עם כל ההיסטוריה שלהם, ואז נמחקים סופית.</p>
      <div id="trash">${data.trash_count ? '<p class="text-sm text-cocoa-500">טוען...</p>' : '<p class="text-sm text-cocoa-500">הסל ריק 🎉</p>'}</div>
    </section>

    <section class="card mb-4 p-5">
      <h2 class="section-title mb-4">${avatar(me, 9)} הפרופיל שלי</h2>
      <form id="me-form" class="space-y-3">
        <input name="name" class="input" maxlength="40" required value="${esc(me.name)}">
        <div class="flex flex-wrap gap-2" data-colors>
          ${COLORS.map((c) => `<button type="button" data-color="${c}" class="h-9 w-9 rounded-full border-4 ${c === me.color ? 'border-cocoa-700' : 'border-white'}" style="background:${c}"></button>`).join('')}
        </div>
        <button class="btn-primary btn-sm" type="submit">שמירה</button>
      </form>
    </section>

    <section class="card p-5">
      <h2 class="section-title mb-2">🚪 ניתוק המכשיר</h2>
      <p class="mb-3 text-sm text-cocoa-500">המכשיר הזה ישכח את הבית. אפשר תמיד לחזור עם קישור ההצטרפות.</p>
      <button class="btn-ghost btn-sm text-berry-600" data-action="leave">ניתוק המכשיר מהבית</button>
    </section>
    </div>`);

  const app = view.app;
  let emoji = house.emoji;
  let color = me.color;

  const picker = (sel, attr, set, onClass, offClass) =>
    $(sel, app).addEventListener('click', (e) => {
      const b = e.target.closest(`[${attr}]`);
      if (!b) return;
      set(b.getAttribute(attr));
      $(sel, app).querySelectorAll(`[${attr}]`).forEach((x) => {
        onClass.forEach((c) => x.classList.toggle(c, x === b));
        offClass.forEach((c) => x.classList.toggle(c, x !== b));
      });
    });
  bindEmojiPicker($('#house-form', app), (v) => (emoji = v));
  picker('[data-colors]', 'data-color', (v) => (color = v), ['border-cocoa-700'], ['border-white']);

  $('#house-form', app).addEventListener('submit', (e) => {
    e.preventDefault();
    busy(e.target.querySelector('[type=submit]'), async () => {
      const name = new FormData(e.target).get('name');
      await rpc('update_house', { p_token: ctx.token, p_name: name, p_emoji: emoji });
      saveHouse(ctx.houseId, { name, emoji });
      toast('נשמר ✓');
      reload();
    });
  });

  $('#me-form', app).addEventListener('submit', (e) => {
    e.preventDefault();
    busy(e.target.querySelector('[type=submit]'), async () => {
      const member = await rpc('update_me', { p_token: ctx.token, p_name: new FormData(e.target).get('name'), p_color: color });
      saveHouse(ctx.houseId, { member });
      toast('נשמר ✓');
      reload();
    });
  });

  // סל המיחזור: נטען בנפרד (וגם מנקה מתכונים ישנים מ-30 יום)
  if (data.trash_count) {
    rpc('get_trash', { p_token: ctx.token }).then((t) => {
      deleteImages(ctx.token, t.purged_paths || []);
      const box = $('#trash', app);
      if (!box) return;
      box.innerHTML = t.items.length ? `<ul class="divide-y divide-cream-200">${t.items.map((x) => {
        const daysLeft = Math.max(0, 30 - Math.floor((Date.now() - new Date(x.deleted_at)) / 86400000));
        return `<li class="flex items-center gap-3 py-2">
          ${x.cover ? thumbImg(x.cover, 'h-11 w-11 shrink-0 rounded-xl object-cover') : '<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cream-200">🍲</span>'}
          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">${esc(x.title)}</p>
            <p class="text-xs text-cocoa-500">נמחק ${timeAgo(x.deleted_at)}${x.deleted_by ? ` ע״י ${esc(x.deleted_by.name)}` : ''} · עוד ${daysLeft} ימים</p>
          </div>
          <button data-action="restore-recipe" data-id="${esc(x.id)}" class="btn-soft btn-sm shrink-0">↩️ שחזור</button>
        </li>`;
      }).join('')}</ul>` : '<p class="text-sm text-cocoa-500">הסל ריק 🎉</p>';
    }).catch(() => {});
  }

  onAction(app, {
    archive: async (el) => {
      if (!(await confirmDialog(`להעביר את ${esc(el.dataset.name)} לארכיון?<br><span class="text-sm text-cocoa-500">המכשירים שלו/ה יתנתקו. כל הדירוגים, ההערות וההכנות נשארים, ואפשר להחזיר בכל רגע.</span>`, { ok: 'להעביר לארכיון' }))) return;
      busy(el, async () => {
        await rpc('archive_member', { p_token: ctx.token, p_member_id: el.dataset.id });
        toast('הועבר לארכיון 📦');
        reload();
      });
    },
    'restore-member': (el) =>
      busy(el, async () => {
        await rpc('restore_member', { p_token: ctx.token, p_member_id: el.dataset.id });
        toast('חזר לבית 🏡 (צריך להתחבר שוב מקישור ההצטרפות)');
        reload();
      }),
    revoke: async (el) => {
      const self = el.dataset.id === me.id;
      if (!(await confirmDialog(`לנתק את כל המכשירים של ${esc(el.dataset.name)}?<br><span class="text-sm text-cocoa-500">${self ? 'גם המכשיר הזה יתנתק. ' : ''}כדי להיכנס שוב, פותחים את קישור ההצטרפות ובוחרים את השם. שום מידע לא נמחק.</span>`, { ok: 'לנתק' }))) return;
      busy(el, async () => {
        const n = await rpc('revoke_member_devices', { p_token: ctx.token, p_member_id: el.dataset.id });
        if (self) {
          removeHouse(ctx.houseId);
          location.hash = '#/';
          return;
        }
        toast(`נותקו ${n} מכשירים 📵`);
      });
    },
    'restore-recipe': (el) =>
      busy(el, async () => {
        await rpc('restore_recipe', { p_token: ctx.token, p_recipe_id: el.dataset.id });
        toast('המתכון חזר ✓');
        location.hash = `${ctx.base}/r/${el.dataset.id}`;
      }),
    copy: (el) => copyText(el.dataset.link),
    rotate: async (el) => {
      const what = el.dataset.kind === 'member' ? 'ההצטרפות' : 'הצפייה';
      if (!(await confirmDialog(`להחליף את קישור ${what}?<br><span class="text-sm text-cocoa-500">הקישור הישן יפסיק לעבוד מיד. מי שכבר הצטרף לא יושפע.</span>`, { ok: 'כן, להחליף' }))) return;
      busy(el, async () => {
        await rpc('rotate_link', { p_token: ctx.token, p_kind: el.dataset.kind });
        toast('הקישור הוחלף 🔄');
        reload();
      });
    },
    leave: async () => {
      if (!(await confirmDialog(`לנתק את המכשיר מ"${esc(house.name)}"?`, { ok: 'כן, לנתק' }))) return;
      removeHouse(ctx.houseId);
      location.hash = '#/';
    },
  });
}
