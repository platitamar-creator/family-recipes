// מסך הבית: כל המתכונים, חיפוש וסינון לפי תגיות שמגיעות ממסד הנתונים
import { rpc, imageUrl } from '../api.js';
import { saveHouse, getHouse } from '../store.js';
import { esc, avatar, quoteCard, loading, difficultyIcons, totalTime, tagChip, $, $$ } from '../ui.js';
import { topBar } from './common.js';

// הסינון נשמר בזמן המעבר בין מסכים (לא בין פתיחות של האתר)
const filterState = new Map();
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

export async function renderHouse(view, ctx) {
  view.app.innerHTML = loading('פותחים את ספר המתכונים...');
  const data = await rpc('get_house', { p_token: ctx.token });
  if (!view.isCurrent()) return;

  const { house, members, tag_groups: groups, recipes, role, me } = data;
  const isMember = role === 'member';
  if (isMember && getHouse(house.id)) saveHouse(house.id, { name: house.name, emoji: house.emoji, member: me });

  const memberById = Object.fromEntries(members.map((m) => [m.id, m]));
  const f = filterState.get(ctx.token) || { text: '', tags: new Set(), loved: new Set(), diff: new Set(), open: window.innerWidth >= 768 };
  filterState.set(ctx.token, f);

  const lovedBy = (r) => r.ratings.filter((x) => x.score >= LOVED_SCORE).map((x) => x.member_id);

  view.mount(`
    ${topBar({
      right: isMember
        ? `<a href="${ctx.base}/settings" class="btn-soft btn-sm">🔗 <span class="hidden sm:inline">שיתוף והזמנה</span><span class="sm:hidden">שיתוף</span></a>`
        : '<span class="chip bg-sage-100 text-sage-700">👀 מצב צפייה</span>',
    })}

    <section class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div class="flex items-center gap-4">
        <span class="flex h-20 w-20 items-center justify-center rounded-3xl bg-white text-5xl shadow-soft">${esc(house.emoji)}</span>
        <div>
          <h1 class="text-3xl leading-tight sm:text-4xl">${esc(house.name)}</h1>
          <div class="mt-2 flex items-center">
            <div class="flex -space-x-2 space-x-reverse">${members.slice(0, 8).map((m) => avatar(m, 7)).join('')}</div>
            <span class="mr-3 text-sm text-cocoa-500">${recipes.length} מתכונים · ${members.length} בני בית</span>
          </div>
        </div>
      </div>
      <div class="sm:max-w-sm">${quoteCard(true)}</div>
    </section>

    ${isMember ? `
      <div class="mb-5 flex flex-wrap gap-2">
        <a href="${ctx.base}/edit/new" class="btn-primary">➕ מתכון חדש</a>
        <a href="${ctx.base}/tags" class="btn-soft">🏷️ ניהול תגיות</a>
      </div>` : ''}

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
            ${g.tags.map((t) => `<button class="chip-toggle" data-kind="tags" data-id="${esc(t.id)}">${esc(t.name)}</button>`).join('')}
          </div>`).join('')}
        ${members.length ? `
          <div class="flex flex-wrap items-center gap-2">
            <span class="ml-1 w-full text-sm font-medium text-cocoa-500 sm:w-28">❤️ אהוב על</span>
            ${members.map((m) => `<button class="chip-toggle" data-kind="loved" data-id="${esc(m.id)}">${esc(m.name)}</button>`).join('')}
          </div>` : ''}
        <div class="flex flex-wrap items-center gap-2">
          <span class="ml-1 w-full text-sm font-medium text-cocoa-500 sm:w-28">🥄 רמת קושי</span>
          ${DIFF_BUCKETS.map((d) => `<button class="chip-toggle" data-kind="diff" data-id="${d.id}">${d.name}</button>`).join('')}
        </div>
        <div class="flex justify-end">
          <button id="clear" class="btn-ghost btn-sm">ניקוי הסינון ✖</button>
        </div>
      </div>
    </section>

    <p id="result-line" class="mb-3 text-sm text-cocoa-500"></p>
    <section id="grid" class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"></section>`);

  const recipeHref = (r) => `${ctx.base}/r/${r.id}`;

  function card(r, i) {
    const cover = r.cover
      ? `<img src="${esc(imageUrl(r.cover))}" alt="" loading="lazy" class="h-full w-full object-cover transition duration-500 group-hover:scale-105">`
      : `<div class="flex h-full w-full items-center justify-center text-7xl" style="background:${BG[hashOf(r.title) % BG.length]}">
           <span class="transition group-hover:animate-wiggle">${FOOD[hashOf(r.title) % FOOD.length]}</span></div>`;
    const tags = r.tag_ids.map((id) => tagById[id]).filter(Boolean);
    const loved = lovedBy(r).map((id) => memberById[id]).filter(Boolean);
    const time = totalTime(r);
    return `
      <a href="${recipeHref(r)}" class="card group flex flex-col overflow-hidden transition hover:-translate-y-1 hover:shadow-lift animate-rise" style="animation-delay:${Math.min(i, 8) * 40}ms">
        <div class="relative aspect-[4/3] overflow-hidden bg-cream-200">
          ${cover}
          ${loved.length ? `<div class="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-white/90 py-0.5 pl-1 pr-2 text-xs shadow-soft">❤️
             <span class="flex -space-x-1.5 space-x-reverse">${loved.slice(0, 4).map((m) => avatar(m, 6)).join('')}</span></div>` : ''}
        </div>
        <div class="flex flex-1 flex-col gap-2 p-4">
          <h3 class="text-xl leading-snug">${esc(r.title)}${r.has_link ? ' <span class="text-base" title="יש קישור למתכון באינטרנט">🌐</span>' : ''}</h3>
          ${r.description ? `<p class="line-clamp-2 text-sm text-cocoa-500">${esc(r.description)}</p>` : ''}
          <div class="mt-auto flex items-center justify-between pt-1 text-sm text-cocoa-500">
            ${difficultyIcons(r.difficulty, 'text-sm')}
            ${time ? `<span>⏱️ ${time}</span>` : ''}
          </div>
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
      const hay = [r.title, r.description, ...(r.ingredients || [])].join(' ').toLowerCase();
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
    return true;
  }

  function update() {
    // ניקוי תגיות שנמחקו
    [...f.tags].forEach((id) => !tagById[id] && f.tags.delete(id));
    $$('[data-kind]', view.app).forEach((b) => b.classList.toggle('is-on', f[b.dataset.kind].has(b.dataset.id)));
    const count = f.tags.size + f.loved.size + f.diff.size;
    const badge = $('#filter-count', view.app);
    badge.textContent = count;
    badge.classList.toggle('hidden', !count);

    const list = recipes.filter(matches);
    const grid = $('#grid', view.app);
    const line = $('#result-line', view.app);
    const filtering = count || f.text.trim();
    line.textContent = filtering ? `נמצאו ${list.length} מתכונים` : '';

    if (!recipes.length) {
      grid.innerHTML = `<div class="col-span-full card p-10 text-center">
        <div class="mb-3 text-6xl">🍳</div>
        <h2 class="mb-2 text-2xl">אין מתכונים עדיין...</h2>
        <p class="mb-5 text-cocoa-500">מישהו פה בכלל מבשל? 😄 זה הזמן להעלות את המתכון הראשון!</p>
        ${isMember ? `<a href="${ctx.base}/edit/new" class="btn-primary">➕ המתכון הראשון</a>` : ''}
      </div>`;
    } else if (!list.length) {
      grid.innerHTML = `<div class="col-span-full card p-10 text-center">
        <div class="mb-3 text-6xl">🕵️</div>
        <h2 class="mb-2 text-2xl">לא מצאנו כלום</h2>
        <p class="text-cocoa-500">אולי כדאי לוותר על אחד המסננים? או להזמין פיצה 🍕</p>
      </div>`;
    } else {
      grid.innerHTML = list.map(card).join('');
    }
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

