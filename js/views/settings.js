// שיתוף והגדרות: קישורי צפייה והצטרפות, שם הבית, הפרופיל שלי
import { rpc } from '../api.js';
import { saveHouse, removeHouse } from '../store.js';
import { esc, loading, avatar, copyText, whatsappUrl, confirmDialog, onAction, busy, toast, $, EMOJIS, COLORS } from '../ui.js';
import { topBar, shareLinks } from './common.js';

export async function renderSettings(view, ctx) {
  if (!view.app.querySelector('[data-settings-page]')) view.app.innerHTML = loading();
  const data = await rpc('get_house', { p_token: ctx.token });
  if (!view.isCurrent()) return;
  const { house, me, members } = data;
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
        <div class="flex flex-wrap gap-1.5" data-emojis>
          ${EMOJIS.map((e) => `<button type="button" data-emoji="${e}" class="h-10 w-10 rounded-xl text-xl ${e === house.emoji ? 'bg-spice-100 ring-2 ring-spice-400' : 'hover:bg-cream-200'}">${e}</button>`).join('')}
        </div>
        <button class="btn-primary btn-sm" type="submit">שמירה</button>
      </form>
      <div class="mt-5 border-t border-cream-200 pt-4">
        <p class="mb-2 text-sm font-medium text-cocoa-700">בני הבית (${members.length})</p>
        <div class="flex flex-wrap gap-2">${members.map((m) => `<span class="flex items-center gap-1.5 rounded-full bg-cream-100 py-1 pl-3 pr-1 text-sm">${avatar(m, 6)} ${esc(m.name)}</span>`).join('')}</div>
      </div>
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
  picker('[data-emojis]', 'data-emoji', (v) => (emoji = v), ['bg-spice-100', 'ring-2', 'ring-spice-400'], []);
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

  onAction(app, {
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
