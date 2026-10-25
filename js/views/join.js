// הצטרפות לבית מקישור הזמנה: "מי את/ה?"
import { rpc } from '../api.js';
import { getHouse, saveHouse } from '../store.js';
import { esc, avatar, loading, onAction, busy, $ } from '../ui.js';
import { topBar } from './common.js';

export async function renderJoin(view, memberToken) {
  view.app.innerHTML = loading('מחפשים את הבית...');
  const house = await rpc('house_preview', { p_member_token: memberToken });
  if (!view.isCurrent()) return;

  const already = getHouse(house.house_id);

  view.mount(`
    ${topBar()}
    <section class="card mx-auto max-w-lg p-6 text-center animate-rise sm:p-8">
      <div class="mb-2 text-6xl">${esc(house.emoji)}</div>
      <p class="text-cocoa-500">הוזמנת להצטרף ל...</p>
      <h1 class="mb-6 text-3xl">${esc(house.name)}</h1>

      ${already ? `
        <div class="mb-6 rounded-2xl bg-sage-100 p-4 text-sage-700">
          המכשיר הזה כבר מחובר לבית בתור <b>${esc(already.member?.name)}</b> 🙂
          <a href="#/h/${esc(house.house_id)}" class="btn-sage btn-sm mt-3 w-full">כניסה לבית</a>
        </div>
        <p class="mb-3 text-sm text-cocoa-500">או להתחבר בתור מישהו אחר:</p>` : ''}

      <h2 class="mb-4 text-2xl">מי את/ה? 👋</h2>

      ${house.members.length ? `
        <div class="mb-5 flex flex-wrap justify-center gap-2">
          ${house.members.map((m) => `
            <button class="flex items-center gap-2 rounded-full border-2 border-cream-200 bg-white py-1.5 pl-4 pr-1.5 transition hover:border-spice-300 hover:shadow-soft" data-action="pick" data-id="${esc(m.id)}">
              ${avatar(m, 9)}<span class="font-medium">${esc(m.name)}</span>
            </button>`).join('')}
        </div>
        <div class="mb-4 flex items-center gap-3 text-sm text-cocoa-300"><span class="h-px flex-1 bg-cream-300"></span>או<span class="h-px flex-1 bg-cream-300"></span></div>` : ''}

      <form class="flex gap-2" id="new-member">
        <input class="input" id="m-name" maxlength="40" required placeholder="אני חדש/ה! קוראים לי...">
        <button class="btn-primary shrink-0" type="submit">הצטרפות 🎉</button>
      </form>
      <p class="mt-5 text-xs text-cocoa-500">בפעם הבאה המכשיר יזכור אותך, ותיכנס/י ישר לבית.</p>
    </section>`);

  const join = (button, memberId, name) =>
    busy(button, async () => {
      const r = await rpc('join_house', { p_member_token: memberToken, p_name: name, p_member_id: memberId });
      saveHouse(r.house_id, { key: r.key, member: r.member, name: r.house_name, emoji: r.emoji, joinedAt: Date.now() });
      location.hash = `#/h/${r.house_id}`;
    });

  onAction(view.app, { pick: (el) => join(el, el.dataset.id, null) });
  $('#new-member', view.app).addEventListener('submit', (e) => {
    e.preventDefault();
    join($('#new-member button', view.app), null, $('#m-name', view.app).value);
  });
}
