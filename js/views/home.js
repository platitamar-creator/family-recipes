// דף הבית: הציטוט היומי, הבתים שהמכשיר מחובר אליהם ופתיחת בית חדש
import { rpc } from '../api.js';
import { getHouses, saveHouse } from '../store.js';
import { esc, quoteCard, modal, onAction, busy, avatar, EMOJIS, $ } from '../ui.js';
import { topBar } from './common.js';

export async function renderHome(view) {
  const houses = Object.entries(getHouses()).sort((a, b) => (b[1].joinedAt || 0) - (a[1].joinedAt || 0));

  view.mount(`
    ${topBar()}
    <section class="mb-8 animate-rise">${quoteCard()}</section>

    ${houses.length ? `
      <section class="mb-8">
        <h2 class="section-title mb-4">הבתים שלי 🏡</h2>
        <div class="grid gap-4 sm:grid-cols-2">
          ${houses.map(([id, h], i) => `
            <a href="#/h/${esc(id)}" class="card group flex items-center gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-lift animate-rise" style="animation-delay:${i * 60}ms">
              <span class="flex h-16 w-16 items-center justify-center rounded-2xl bg-cream-200 text-4xl transition group-hover:animate-wiggle">${esc(h.emoji || '🏠')}</span>
              <span class="min-w-0 flex-1">
                <span class="block truncate font-display text-xl">${esc(h.name)}</span>
                <span class="mt-1 flex items-center gap-2 text-sm text-cocoa-500">${avatar(h.member, 6)} נכנסת בתור ${esc(h.member?.name)}</span>
              </span>
              <span class="text-2xl text-cocoa-300 transition group-hover:-translate-x-1 group-hover:text-spice-500">←</span>
            </a>`).join('')}
        </div>
      </section>` : `
      <section class="card mb-8 p-8 text-center animate-rise">
        <div class="mb-3 text-6xl">👩‍🍳👨‍🍳</div>
        <h1 class="mb-2 text-3xl">ברוכים הבאים למטבח!</h1>
        <p class="mx-auto mb-1 max-w-md text-cocoa-700">כאן שומרים את כל המתכונים של המשפחה: של סבתא, של אבא, וגם את הניסוי ההוא שהצליח במקרה.</p>
        <p class="mx-auto max-w-md text-sm text-cocoa-500">קיבלתם קישור הצטרפות מבן משפחה? פשוט פתחו אותו. אין בית עדיין? פתחו אחד עכשיו 👇</p>
      </section>`}

    <section class="text-center">
      <button class="btn-primary px-6 py-3 text-lg" data-action="new-house">✨ פתיחת בית חדש</button>
    </section>`);

  onAction(view.app, { 'new-house': openCreateHouse });
}

function openCreateHouse() {
  let emoji = EMOJIS[0];
  const { el, close } = modal(`
    <h2 class="mb-1 text-2xl">בית חדש 🏡</h2>
    <p class="mb-5 text-sm text-cocoa-500">אחר כך תוכלו להזמין את כל המשפחה בקישור.</p>
    <form class="space-y-4">
      <div>
        <label class="label" for="h-name">איך קוראים לבית?</label>
        <input id="h-name" class="input" maxlength="60" required placeholder="למשל: המטבח של משפחת כהן">
      </div>
      <div>
        <span class="label">אימוג'י לבית</span>
        <div class="flex flex-wrap gap-1.5" id="emoji-pick">
          ${EMOJIS.map((e) => `<button type="button" data-emoji="${e}" class="h-11 w-11 rounded-xl text-2xl transition hover:bg-cream-200 ${e === emoji ? 'bg-spice-100 ring-2 ring-spice-400' : ''}">${e}</button>`).join('')}
        </div>
      </div>
      <div>
        <label class="label" for="h-me">ואיך קוראים לך?</label>
        <input id="h-me" class="input" maxlength="40" required placeholder="השם שבני הבית יראו">
      </div>
      <div class="flex gap-2 pt-2">
        <button class="btn-primary flex-1" type="submit">פותחים את המטבח! 🎉</button>
        <button class="btn-soft" type="button" data-close>ביטול</button>
      </div>
    </form>`);

  el.querySelector('#emoji-pick').addEventListener('click', (e) => {
    const b = e.target.closest('[data-emoji]');
    if (!b) return;
    emoji = b.dataset.emoji;
    el.querySelectorAll('[data-emoji]').forEach((x) => x.classList.toggle('bg-spice-100', x === b));
    el.querySelectorAll('[data-emoji]').forEach((x) => x.classList.toggle('ring-2', x === b));
    el.querySelectorAll('[data-emoji]').forEach((x) => x.classList.toggle('ring-spice-400', x === b));
  });

  el.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    busy($('button[type=submit]', el), async () => {
      const r = await rpc('create_house', {
        p_name: $('#h-name', el).value,
        p_emoji: emoji,
        p_member_name: $('#h-me', el).value,
      });
      saveHouse(r.house_id, { key: r.key, member: r.member, name: r.house_name, emoji: r.emoji, joinedAt: Date.now() });
      close();
      location.hash = `#/h/${r.house_id}`;
    });
  });
}
