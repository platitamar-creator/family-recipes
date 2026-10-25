// דף הבית: הציטוט היומי, הבתים שהמכשיר מחובר אליהם ופתיחת בית חדש
import { rpc } from '../api.js';
import { getHouses, saveHouse } from '../store.js';
import { esc, quoteCard, modal, onAction, busy, avatar, toast, EMOJIS, $ } from '../ui.js';
import { isStandalone, isIOS, canPrompt, promptInstall, onInstallChange, isDismissed, dismiss } from '../install.js';
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

    <section class="mb-10 text-center">
      <button class="btn-primary px-6 py-3 text-lg" data-action="new-house">✨ פתיחת בית חדש</button>
    </section>

    <section class="card mb-5 p-5">
      <h2 class="section-title mb-1">🔗 קיבלת קישור?</h2>
      <p class="mb-3 text-sm text-cocoa-500">הדביקו כאן קישור הצטרפות, קישור לבית או קישור למתכון.</p>
      <form id="paste-link" class="flex gap-2">
        <input name="link" class="input text-left text-sm" dir="ltr" inputmode="url" placeholder="https://...#/join/..." required>
        <button class="btn-soft shrink-0" type="submit">פתיחה</button>
      </form>
    </section>

    <div id="install-slot"></div>`);

  const app = view.app;
  onAction(app, {
    'new-house': openCreateHouse,
    install: async () => {
      if (await promptInstall()) toast('הותקן! עכשיו המטבח במסך הבית 🎉');
      drawInstall();
    },
    'dismiss-install': () => {
      dismiss();
      drawInstall();
    },
  });

  $('#paste-link', app).addEventListener('submit', (e) => {
    e.preventDefault();
    const text = new FormData(e.target).get('link').trim();
    const m = text.match(/#\/(join|v|r)\/([A-Za-z0-9_-]{20,})/);
    if (!m) return toast('זה לא נראה כמו קישור של ספר המתכונים 🤔', 'error');
    location.hash = `#/${m[1]}/${m[2]}`;
  });

  function drawInstall() {
    const slot = $('#install-slot', app);
    if (!slot || !app.isConnected) return;
    slot.innerHTML = installCard();
  }
  onInstallChange(drawInstall);
  drawInstall();
}

// כרטיס "להוסיף למסך הבית"
function installCard() {
  if (isStandalone() || isDismissed()) return '';
  const close = '<button data-action="dismiss-install" class="absolute left-3 top-3 text-cocoa-300 hover:text-cocoa-700" title="לא עכשיו">✕</button>';
  if (canPrompt()) {
    return `<section class="card relative flex items-center gap-4 p-5">${close}
      <img src="icons/icon-192.png" alt="" class="h-14 w-14 rounded-2xl shadow-soft">
      <div class="flex-1"><h2 class="font-display text-lg">📲 המטבח במסך הבית</h2>
        <p class="text-sm text-cocoa-500">התקינו את ספר המתכונים כמו אפליקציה, ותפתחו אותו בלחיצה אחת.</p></div>
      <button data-action="install" class="btn-primary shrink-0">התקנה</button>
    </section>`;
  }
  if (isIOS()) {
    return `<section class="card relative p-5">${close}
      <div class="mb-3 flex items-center gap-3">
        <img src="icons/icon-192.png" alt="" class="h-12 w-12 rounded-2xl shadow-soft">
        <h2 class="font-display text-lg">📲 להוסיף את המטבח למסך הבית</h2>
      </div>
      <ol class="mb-3 space-y-1.5 text-sm">
        <li>1. פתחו את האתר ב-<b>Safari</b></li>
        <li>2. לחצו על כפתור השיתוף <span class="inline-block rounded bg-cream-200 px-1.5">⬆️</span> בתחתית המסך</li>
        <li>3. בחרו <b>"הוספה למסך הבית"</b> ואז <b>"הוסף"</b></li>
      </ol>
      <p class="rounded-xl bg-honey-100 p-3 text-xs leading-relaxed text-cocoa-700">💡 באייפון האפליקציה לא זוכרת את הכניסה מ-Safari. בפתיחה הראשונה, הדביקו בתיבה "קיבלת קישור?" את קישור ההצטרפות ובחרו את השם שלכם.</p>
    </section>`;
  }
  return `<section class="card relative flex items-center gap-4 p-5">${close}
    <img src="icons/icon-192.png" alt="" class="h-12 w-12 rounded-2xl shadow-soft">
    <p class="text-sm text-cocoa-700"><b>📲 רוצים את זה כאפליקציה?</b><br>בתפריט הדפדפן (⋮) בחרו "התקנת אפליקציה" או "הוספה למסך הבית".</p>
  </section>`;
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
