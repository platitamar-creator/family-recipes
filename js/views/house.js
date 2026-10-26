// מסך הבית: כל המתכונים, חיפוש וסינון לפי תגיות שמגיעות ממסד הנתונים
import { rpc, rpcCached, thumbImg, importRecipe, forgetCache } from '../api.js';
import { saveHouse, getHouse } from '../store.js';
import { esc, avatar, quoteCard, loading, difficultyIcons, totalTime, tagChip, modal, busy, toast, emojiPicker, bindEmojiPicker, $, $$ } from '../ui.js';
import { saveImportedDraft } from './editor.js';
import { topBar } from './common.js';
import { panSVG } from '../decor.js';
import { cookedAgo } from '../ui.js';

// הסינון נשמר בזמן המעבר בין מסכים (לא בין פתיחות של האתר)
const filterState = new Map();

// מיונים. כדי להוסיף מיון חדש מוסיפים שורה: key מחזיר ערך למיון (null = אין מידע, תמיד בסוף), desc = מהגדול לקטן
const avgScore = (r) => (r.ratings.length ? r.ratings.reduce((s, x) => s + x.score, 0) / r.ratings.length : null);
const minutes = (r) => (r.prep_minutes || r.cook_minutes ? (r.prep_minutes || 0) + (r.cook_minutes || 0) : null);
const SORTS = [
  { id: 'new', name: '✏️ עודכנו לאחרונה', key: (r) => r.updated_at, desc: true },
  { id: 'added', name: '🆕 נוספו לאחרונה', key: (r) => r.created_at, desc: true },
  { id: 'loved', name: '❤️ ממוצע דירוג', key: avgScore, desc: true },
  { id: 'cooked', name: '👩‍🍳 הכי הרבה פעמים', key: (r) => r.cook_count || null, desc: true },
  { id: 'recent', name: '📅 בושלו לאחרונה', key: (r) => r.last_cooked, desc: true },
  { id: 'forgotten', name: '🕸️ לא בושלו הכי הרבה זמן', key: (r) => r.last_cooked || '0000' },
  { id: 'fast', name: '⏱️ הכי מהירים', key: minutes },
  { id: 'easy', name: '🥄 הכי קלים', key: (r) => r.difficulty },
  { id: 'cheap', name: '💰 הכי זולים למנה', key: (r) => r.price_per_serving ?? null, needs: 'price' },
  { id: 'light', name: '🥗 הכי מעט קלוריות', key: (r) => r.kcal_per_serving ?? null, needs: 'kcal' },
  { id: 'abc', name: '🔤 לפי א-ב', key: (r) => r.title, text: true },
];
function sorter(sort, reverse) {
  const s = SORTS.find((x) => x.id === sort) || SORTS[0];
  const dir = (s.desc ? -1 : 1) * (reverse ? -1 : 1);
  return (a, b) => {
    const ka = s.key(a);
    const kb = s.key(b);
    if (ka == null || kb == null) return ka == null && kb == null ? a.title.localeCompare(b.title, 'he') : ka == null ? 1 : -1;
    const c = s.text || typeof ka === 'string' ? String(ka).localeCompare(String(kb), 'he') : ka - kb;
    return c * dir || a.title.localeCompare(b.title, 'he');
  };
}

// בחירת כמה מתכונים לרשימת קניות משותפת (נשמרת במעבר בין מסכים)
const picking = new Map();
export function setPicked(token, ids) {
  picking.set(token, { on: true, ids: new Set(ids) });
}

// מתכון ששותף לאפליקציה (מוואטסאפ, אינסטגרם...) ממתין לייבוא
const SHARED = 'frb.shared';
function takeShared() {
  try {
    const t = sessionStorage.getItem(SHARED);
    sessionStorage.removeItem(SHARED);
    return t;
  } catch {
    return null;
  }
}

const LOVED_SCORE = 8;

const DIFF_BUCKETS = [
  { id: 'easy', name: 'קל', test: (d) => d <= 2 },
  { id: 'mid', name: 'בינוני', test: (d) => d === 3 },
  { id: 'hard', name: 'מאתגר', test: (d) => d >= 4 },
];

const FOOD = ['🍲', '🥘', '🍝', '🥗', '🍰', '🥧', '🍪', '🥐', '🍛', '🥟', '🍜', '🧆', '🥙', '🍳', '🫕', '🍞'];
const BG = ['#FDE6D4', '#E5EEE2', '#FFF1CC', '#F8DEE0', '#DCE9F5', '#EADFCF'];
function hashOf(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.codePointAt(0)) | 0;
  return Math.abs(h);
}

export async function renderHouse(view, ctx, fresh = null) {
  if (!fresh) view.app.innerHTML = loading('פותחים את ספר המתכונים...');
  // מציגים מיד את מה ששמור במכשיר, ומתרעננים כשמגיעה גרסה חדשה
  const data = fresh || (await rpcCached('get_house', { p_token: ctx.token }, (newer) => {
    if (!view.isCurrent()) return;
    const y = window.scrollY;
    renderHouse(view, ctx, newer).then(() => window.scrollTo({ top: y }));
  }));
  if (!view.isCurrent()) return;

  const { house, tag_groups: groups, recipes, role, me } = data;
  const allMembers = data.members;
  const members = allMembers.filter((m) => !m.archived);
  const isMember = role === 'member';
  if (isMember && getHouse(house.id)) saveHouse(house.id, { name: house.name, emoji: house.emoji, member: me });

  const memberById = Object.fromEntries(allMembers.map((m) => [m.id, m]));
  const f = filterState.get(ctx.token) || { text: '', tags: new Set(), loved: new Set(), diff: new Set(), untried: new Set(), sort: 'new', reverse: false, open: window.innerWidth >= 768 };
  filterState.set(ctx.token, f);
  if (!SORTS.some((x) => x.id === f.sort)) f.sort = 'new';
  f.untried ||= new Set();
  const untriedCount = recipes.filter((r) => r.untried).length;
  const pick = picking.get(ctx.token) || { on: false, ids: new Set() };
  picking.set(ctx.token, pick);
  // מתכון שנמחק לא נשאר בבחירה
  [...pick.ids].forEach((id) => !recipes.some((r) => r.id === id) && pick.ids.delete(id));

  const lovedBy = (r) => r.ratings.filter((x) => x.score >= LOVED_SCORE).map((x) => x.member_id);

  view.mount(`
    ${topBar({
      right: isMember
        ? `<a href="${ctx.base}/settings" class="btn-soft btn-sm">🔗 <span class="hidden sm:inline">שיתוף והזמנה</span><span class="sm:hidden">שיתוף</span></a>`
        : '<span class="chip bg-sage-100 text-sage-700">👀 מצב צפייה</span>',
    })}

    <section class="hero mb-5 px-5 pb-9 pt-6 sm:px-8 animate-rise">
      <div class="relative flex items-center gap-4">
        <span ${isMember ? 'data-house-emoji role="button" tabindex="0" title="החלפת האמוג\'י של הבית"' : ''} class="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-white text-5xl shadow-lift wiggle-hover ${isMember ? 'cursor-pointer' : ''}">
          <svg class="absolute -top-9 left-1/2 h-10 w-12 -translate-x-1/2" viewBox="-30 -46 60 50" aria-hidden="true">
            <g class="steam" stroke="#FFFBF5" stroke-width="5" stroke-linecap="round" fill="none">
              <path class="steam-1" d="M-14 0 C-22 -14 -6 -22 -14 -36"/><path class="steam-2" d="M0 -4 C-8 -18 8 -26 0 -42"/><path class="steam-3" d="M14 0 C6 -14 22 -22 14 -36"/>
            </g>
          </svg>
          ${esc(house.emoji)}
          ${isMember ? '<span class="absolute -bottom-1 -left-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm shadow-soft">✏️</span>' : ''}
        </span>
        <div class="min-w-0">
          <p class="text-sm text-white/80">ספר המתכונים של</p>
          <h1 class="text-3xl leading-tight text-white drop-shadow-sm sm:text-4xl text-wrap-any">${esc(house.name)}</h1>
          <div class="mt-2 flex flex-wrap items-center gap-y-1">
            <div class="flex -space-x-2 space-x-reverse">${members.slice(0, 8).map((m) => avatar(m, 7)).join('')}</div>
            <span class="mr-3 text-sm text-white/90">${recipes.length} מתכונים · ${members.length} בני בית</span>
          </div>
        </div>
      </div>
    </section>
    <div class="mb-6">${quoteCard(true)}</div>

    <div class="mb-5 flex flex-wrap gap-2">
      ${isMember ? `<a href="${ctx.base}/edit/new" class="btn-primary">➕ מתכון חדש</a>
        <button data-import class="btn-primary bg-honey-500 hover:bg-spice-500">✨ מתכון מקישור / טקסט</button>` : ''}
      <button id="pick-toggle" class="btn-soft">🛒 קניות לכמה מתכונים</button>
      <a href="${ctx.base}/timeline" class="btn-sage">📅 מה בישלנו</a>
      ${isMember ? `<a href="${ctx.base}/tags" class="btn-soft">🏷️ ניהול תגיות</a>` : ''}
    </div>

    <section class="card mb-6 p-4">
      <div class="flex gap-2">
        <div class="relative flex-1">
          <span class="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lg">🔍</span>
          <input id="q" class="input pr-11" placeholder="מה בא לך? שם של מנה, או מצרך שיש בבית..." value="${esc(f.text)}">
        </div>
        <button id="toggle-filters" class="btn-soft shrink-0">
          <span>סינון</span><span id="filter-count" class="hidden rounded-full bg-spice-500 px-2 text-xs text-white"></span>
        </button>
      </div>
      <div id="filters" class="${f.open ? '' : 'hidden'} mt-4 space-y-3">
        ${groups.filter((g) => g.tags.length).map((g) => `
          <div class="flex flex-wrap items-center gap-2">
            <span class="ml-1 w-full text-sm font-medium text-cocoa-500 sm:w-28">${esc(g.icon)} ${esc(g.name)}</span>
            ${g.tags.map((t) => `<button class="chip-toggle" aria-pressed="false" data-kind="tags" data-id="${esc(t.id)}">${esc(t.name)}</button>`).join('')}
          </div>`).join('')}
        ${members.length ? `
          <div class="flex flex-wrap items-center gap-2">
            <span class="ml-1 w-full text-sm font-medium text-cocoa-500 sm:w-28">❤️ אהוב על</span>
            ${members.map((m) => `<button class="chip-toggle" aria-pressed="false" data-kind="loved" data-id="${esc(m.id)}">${esc(m.name)}</button>`).join('')}
          </div>` : ''}
        <div class="flex flex-wrap items-center gap-2">
          <span class="ml-1 w-full text-sm font-medium text-cocoa-500 sm:w-28">🥄 רמת קושי</span>
          ${DIFF_BUCKETS.map((d) => `<button class="chip-toggle" aria-pressed="false" data-kind="diff" data-id="${d.id}">${d.name}</button>`).join('')}
        </div>
        ${untriedCount ? `<div class="flex flex-wrap items-center gap-2">
          <span class="ml-1 w-full text-sm font-medium text-cocoa-500 sm:w-28">🕰️ לניסיון</span>
          <button class="chip-toggle" aria-pressed="false" data-kind="untried" data-id="only">רק מה שעוד לא הכנו (${untriedCount})</button>
        </div>` : ''}
        <div class="flex justify-end">
          <button id="clear" class="btn-ghost btn-sm">ניקוי הסינון ✖</button>
        </div>
      </div>
    </section>

    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <p id="result-line" class="text-sm text-cocoa-500"></p>
      <div class="flex items-center gap-2 text-sm text-cocoa-500">
        <label for="sort">מיון:</label>
        <select id="sort" class="rounded-xl border-2 border-cream-200 bg-white px-2 py-1 text-cocoa-700 focus:border-spice-300 focus:outline-none">
          ${SORTS.map((x) => `<option value="${x.id}" ${f.sort === x.id ? 'selected' : ''}>${x.name}</option>`).join('')}
        </select>
        <button id="reverse" class="rounded-xl border-2 border-cream-200 bg-white px-2 py-1 text-cocoa-700 hover:border-spice-300" title="הפיכת הסדר" aria-pressed="${f.reverse}">${f.reverse ? '⬆️' : '⬇️'}</button>
      </div>
    </div>
    <p id="sort-note" class="mb-3 hidden text-xs text-cocoa-500"></p>
    <div id="pick-help" class="mb-4 hidden rounded-2xl bg-honey-100 px-4 py-3 text-sm">🛒 לחצו על המתכונים שתרצו לבשל, ונאחד לכם את כל המצרכים לרשימה אחת.</div>
    <section id="grid" class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"></section>
    <div id="pick-bar" class="sticky bottom-3 z-10 mt-5 hidden"></div>`);

  const recipeHref = (r) => `${ctx.base}/r/${r.id}`;
  // אנימציית הכניסה רק בציור הראשון, לא בכל לחיצה
  let firstDraw = true;

  function card(r, i) {
    const cover = r.cover
      ? thumbImg(r.cover, 'h-full w-full object-cover transition duration-500 group-hover:scale-105')
      : `<div class="flex h-full w-full items-center justify-center text-7xl" style="background:${BG[hashOf(r.title) % BG.length]}">
           <span class="transition group-hover:animate-wiggle">${FOOD[hashOf(r.title) % FOOD.length]}</span></div>`;
    const tags = r.tag_ids.map((id) => tagById[id]).filter(Boolean);
    const loved = lovedBy(r).map((id) => memberById[id]).filter(Boolean);
    const time = totalTime(r);
    return `
      <a href="${recipeHref(r)}" data-recipe="${r.id}" class="card group flex flex-col overflow-hidden transition hover:-translate-y-1 hover:shadow-lift ${firstDraw ? 'animate-rise' : ''} ${r.untried ? 'is-untried' : ''} ${pick.on && pick.ids.has(r.id) ? 'ring-4 ring-sage-500' : ''}" style="animation-delay:${Math.min(i, 8) * 40}ms">
        <div class="relative aspect-[4/3] overflow-hidden bg-cream-200">
          <div class="cover h-full w-full">${cover}</div>
          ${r.untried ? '<span class="absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-cocoa-700 shadow-soft">🕰️ עוד לא הכנו</span>' : ''}
          ${pick.on ? `<span class="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-lg shadow-soft ${pick.ids.has(r.id) ? 'bg-sage-500 text-white' : 'bg-white/80'}">${pick.ids.has(r.id) ? '✓' : ''}</span>` : ''}
          ${loved.length ? `<div class="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-white/90 py-0.5 pl-1 pr-2 text-xs shadow-soft">❤️
             <span class="flex -space-x-1.5 space-x-reverse">${loved.slice(0, 4).map((m) => avatar(m, 6)).join('')}</span></div>` : ''}
        </div>
        <div class="flex flex-1 flex-col gap-2 p-4">
          <h3 class="text-xl leading-snug text-wrap-any">${esc(r.title)}${r.has_link ? ' <span class="text-base" title="יש קישור למתכון באינטרנט">🌐</span>' : ''}</h3>
          ${r.description ? `<p class="line-clamp-2 text-sm text-cocoa-500">${esc(r.description)}</p>` : ''}
          <div class="mt-auto flex items-center justify-between pt-1 text-sm text-cocoa-500">
            ${difficultyIcons(r.difficulty, 'text-sm')}
            <span class="flex items-center gap-2">
              ${r.kcal_per_serving ? `<span title="קלוריות למנה (הערכה)">🔥 ${Math.round(r.kcal_per_serving)}</span>` : ''}
              ${r.price_per_serving ? `<span title="מחיר משוער למנה">₪${r.price_per_serving < 10 ? Number(r.price_per_serving.toFixed(1)) : Math.round(r.price_per_serving)}</span>` : ''}
              ${time ? `<span>⏱️ ${time}</span>` : ''}
            </span>
          </div>
          ${r.cook_count ? `<p class="text-xs text-sage-700">👩‍🍳 בושל ${r.cook_count === 1 ? 'פעם אחת' : `${r.cook_count} פעמים`} · לאחרונה ${cookedAgo(r.last_cooked)}</p>` : ''}
          ${tags.length ? `<div class="flex flex-wrap gap-1">${tags.slice(0, 4).map((t) => tagChip(t, 'text-xs px-2 py-0.5')).join('')}</div>` : ''}
        </div>
      </a>`;
  }

  const tagById = {};
  groups.forEach((g) => g.tags.forEach((t) => (tagById[t.id] = t)));
  const tagGroupOf = {};
  groups.forEach((g) => g.tags.forEach((t) => (tagGroupOf[t.id] = g.id)));

  function matches(r) {
    const q = f.text.trim().toLowerCase();
    if (q) {
      const tagNames = r.tag_ids.map((id) => tagById[id]?.name || '');
      const hay = [r.title, r.description, ...(r.ingredients || []), ...tagNames].join(' ').toLowerCase();
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    // בתוך קבוצה: "או". בין קבוצות: "וגם".
    const byGroup = {};
    f.tags.forEach((id) => (byGroup[tagGroupOf[id]] ||= []).push(id));
    for (const ids of Object.values(byGroup)) if (!ids.some((id) => r.tag_ids.includes(id))) return false;
    if (f.loved.size) {
      const l = lovedBy(r);
      if (![...f.loved].some((id) => l.includes(id))) return false;
    }
    if (f.diff.size && !DIFF_BUCKETS.some((d) => f.diff.has(d.id) && d.test(r.difficulty))) return false;
    // "עוד לא הכנו": רק אם ביקשו אותם במפורש. בלי סינון הם מופיעים בנפרד בסוף
    if (f.untried.has('only')) return r.untried;
    if (r.untried && (f.text.trim() || f.tags.size || f.loved.size || f.diff.size)) return false;
    return true;
  }

  function update() {
    // ניקוי תגיות שנמחקו
    [...f.tags].forEach((id) => !tagById[id] && f.tags.delete(id));
    $$('[data-kind]', view.app).forEach((b) => {
      const on = f[b.dataset.kind].has(b.dataset.id);
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const count = f.tags.size + f.loved.size + f.diff.size + f.untried.size;
    const badge = $('#filter-count', view.app);
    badge.textContent = count;
    badge.classList.toggle('hidden', !count);

    const all = recipes.filter(matches).sort(sorter(f.sort, f.reverse));
    const onlyUntried = f.untried.has('only');
    const list = onlyUntried ? all : all.filter((r) => !r.untried);
    const later = onlyUntried ? [] : all.filter((r) => r.untried);
    const sortDef = SORTS.find((x) => x.id === f.sort);
    const note = $('#sort-note', view.app);
    const missingInfo = list.filter((r) => sortDef.key(r) == null).length;
    note.classList.toggle('hidden', !missingInfo || !sortDef.needs);
    note.textContent = sortDef.needs ? `${missingInfo} מתכונים עוד בלי חישוב ${sortDef.needs === 'price' ? 'מחיר' : 'קלוריות'} מופיעים בסוף (אפשר לחשב בדף המתכון ✨)` : '';
    drawPickBar();
    const grid = $('#grid', view.app);
    const line = $('#result-line', view.app);
    const filtering = count || f.text.trim();
    line.textContent = filtering ? `נמצאו ${list.length} מתכונים` : '';

    if (!recipes.length) {
      grid.innerHTML = `<div class="col-span-full card p-10 text-center">
        <div class="mx-auto w-fit">${panSVG('h-32 w-32')}</div>
        <h2 class="mb-2 text-2xl">אין מתכונים עדיין...</h2>
        <p class="mb-5 text-cocoa-500">מישהו פה בכלל מבשל? 😄 זה הזמן להעלות את המתכון הראשון!</p>
        ${isMember ? `<a href="${ctx.base}/edit/new" class="btn-primary">➕ המתכון הראשון</a>` : ''}
      </div>`;
    } else if (!list.length && !later.length) {
      grid.innerHTML = `<div class="col-span-full card p-10 text-center">
        <div class="mb-3 text-6xl">🕵️</div>
        <h2 class="mb-2 text-2xl">לא מצאנו כלום</h2>
        <p class="text-cocoa-500">אולי כדאי לוותר על אחד המסננים? או להזמין פיצה 🍕</p>
      </div>`;
    } else {
      grid.innerHTML = list.map(card).join('') + (later.length ? `
        <div class="col-span-full mt-4 flex flex-wrap items-baseline gap-x-3 border-t-2 border-dashed border-cream-300 pt-5">
          <h2 class="text-2xl text-cocoa-500">🕰️ עוד לא הכנו (${later.length})</h2>
          <span class="text-sm text-cocoa-500">מתכונים ששמרנו לניסיון. אחרי "הכנתי!" הם עוברים לספר.</span>
        </div>${later.map((r, i) => card(r, list.length + i)).join('')}` : '');
    }
    firstDraw = false;
  }

  $('#q', view.app).addEventListener('input', (e) => {
    f.text = e.target.value;
    update();
  });
  $('#filters', view.app).addEventListener('click', (e) => {
    const b = e.target.closest('[data-kind]');
    if (!b) return;
    const set = f[b.dataset.kind];
    set.has(b.dataset.id) ? set.delete(b.dataset.id) : set.add(b.dataset.id);
    update();
  });
  $('#sort', view.app).addEventListener('change', (e) => {
    f.sort = e.target.value;
    update();
  });
  $('#reverse', view.app).addEventListener('click', (e) => {
    f.reverse = !f.reverse;
    e.currentTarget.textContent = f.reverse ? '⬆️' : '⬇️';
    e.currentTarget.setAttribute('aria-pressed', String(f.reverse));
    update();
  });

  // ---------- בחירת מתכונים לרשימת קניות ----------
  function drawPickBar() {
    const bar = $('#pick-bar', view.app);
    $('#pick-help', view.app).classList.toggle('hidden', !pick.on);
    $('#pick-toggle', view.app).classList.toggle('is-on', pick.on);
    $('#pick-toggle', view.app).textContent = pick.on ? '✖ סיום בחירה' : '🛒 קניות לכמה מתכונים';
    bar.classList.toggle('hidden', !pick.on);
    if (!pick.on) return;
    const n = pick.ids.size;
    bar.innerHTML = `<div class="flex items-center gap-2 rounded-3xl bg-cream-100/95 p-2 shadow-lift backdrop-blur">
      <span class="px-2 text-sm">נבחרו <b>${n}</b></span>
      ${n ? '<button data-pick-clear class="btn-ghost btn-sm">ניקוי</button>' : ''}
      <a href="${ctx.base}/shop/${[...pick.ids].join(',')}" class="btn-primary flex-1 ${n ? '' : 'pointer-events-none opacity-50'}">🛒 לרשימה המשותפת</a>
    </div>`;
  }
  $('#pick-toggle', view.app).addEventListener('click', () => {
    pick.on = !pick.on;
    update();
  });
  $('#pick-bar', view.app).addEventListener('click', (e) => {
    if (e.target.closest('[data-pick-clear]')) {
      pick.ids.clear();
      update();
    }
    if (e.target.closest('a[href*="/shop/"]')) pick.on = false;
  });
  $('#grid', view.app).addEventListener('click', (e) => {
    if (!pick.on) return;
    const a = e.target.closest('[data-recipe]');
    if (!a) return;
    e.preventDefault();
    const id = a.dataset.recipe;
    pick.ids.has(id) ? pick.ids.delete(id) : pick.ids.add(id);
    const y = window.scrollY;
    update();
    window.scrollTo({ top: y });
  });

  // ---------- מתכון מקישור או מטקסט ----------
  function openImport(prefill = '') {
    const { el, close } = modal(`
      <h2 class="mb-1 text-2xl">✨ מתכון מקישור או מטקסט</h2>
      <p class="mb-4 text-sm text-cocoa-500">הדביקו כאן קישור למתכון (אתר, אינסטגרם, יוטיוב), או את הטקסט שלו, למשל הודעה מוואטסאפ. אנחנו נמלא את הטופס, ואתם רק בודקים ושומרים.</p>
      <textarea name="src" class="input min-h-[120px]" dir="auto" placeholder="https://...">${esc(prefill)}</textarea>
      <div class="mt-3 flex flex-wrap gap-2">
        <button class="btn-primary flex-1" data-go>✨ למלא לי את המתכון</button>
        ${navigator.clipboard?.readText ? '<button class="btn-soft" data-paste>📋 הדבקה</button>' : ''}
        <button class="btn-soft" data-close>ביטול</button>
      </div>
      <p class="mt-3 text-xs leading-relaxed text-cocoa-500">⏱️ לוקח בדרך כלל 5–30 שניות.<br>💡 טיפ לאנדרואיד: אחרי שמתקינים את האפליקציה, אפשר ללחוץ "שיתוף" על מתכון בכל אפליקציה ולבחור "המתכונים".</p>`);
    const area = el.querySelector('[name=src]');
    el.querySelector('[data-paste]')?.addEventListener('click', async () => {
      try {
        area.value = await navigator.clipboard.readText();
      } catch {
        toast('לא הצלחנו לקרוא מהלוח. אפשר להדביק ידנית (לחיצה ארוכה ← הדבקה)', 'error');
      }
    });
    const go = el.querySelector('[data-go]');
    go.addEventListener('click', () => {
      if (!area.value.trim()) return toast('הדביקו קודם קישור או טקסט 📋', 'error');
      busy(go, async () => {
        go.innerHTML = '<span class="animate-spin inline-block">🥄</span> קוראים את המתכון...';
        const r = await importRecipe(ctx.token, area.value);
        saveImportedDraft(ctx.houseId, r);
        close();
        toast('המתכון מוכן לבדיקה ✨');
        location.hash = `${ctx.base}/edit/new`;
      });
    });
  }
  view.app.querySelector('[data-import]')?.addEventListener('click', () => openImport());

  // ---------- החלפת האמוג'י של הבית ----------
  const emojiBtn = view.app.querySelector('[data-house-emoji]');
  const openEmoji = () => {
    let chosen = house.emoji;
    const { el, close } = modal(`
      <h2 class="mb-4 text-2xl">האמוג'י של הבית</h2>
      ${emojiPicker(house.emoji)}
      <div class="mt-5 flex gap-2"><button class="btn-primary flex-1" data-save>שמירה</button><button class="btn-soft" data-close>ביטול</button></div>`);
    bindEmojiPicker(el, (v) => (chosen = v));
    const save = el.querySelector('[data-save]');
    save.addEventListener('click', () => busy(save, async () => {
      await rpc('update_house', { p_token: ctx.token, p_name: house.name, p_emoji: chosen });
      saveHouse(house.id, { emoji: chosen });
      forgetCache('get_house', { p_token: ctx.token });
      close();
      toast('הבית קיבל אמוג\'י חדש ' + chosen);
      renderHouse(view, ctx);
    }));
  };
  emojiBtn?.addEventListener('click', openEmoji);
  emojiBtn?.addEventListener('keydown', (e) => e.key === 'Enter' && openEmoji());
  if (isMember) {
    const shared = takeShared();
    if (shared) openImport(shared);
  }
  $('#toggle-filters', view.app).addEventListener('click', () => {
    f.open = !f.open;
    $('#filters', view.app).classList.toggle('hidden', !f.open);
  });
  $('#clear', view.app).addEventListener('click', () => {
    f.tags.clear();
    f.loved.clear();
    f.diff.clear();
    f.text = '';
    $('#q', view.app).value = '';
    update();
  });

  update();
}

