// "מה בישלנו": ציר זמן של כל ההכנות בבית, מבט על מתכון אחד, והשוואה בין מתכונים
import { rpcCached, thumbImg } from '../api.js';
import { esc, avatar, loading, cookedAgo, $, $$ } from '../ui.js';
import { topBar } from './common.js';
import { panSVG } from '../decor.js';

const RANGES = [
  { id: '3', name: '3 חודשים', months: 3 },
  { id: '6', name: 'חצי שנה', months: 6 },
  { id: '12', name: 'שנה', months: 12 },
  { id: 'all', name: 'הכול', months: null },
];
const MAX_COMPARE = 4;
const state = new Map(); // מצב לכל בית: טווח, לשונית, מתכונים להשוואה

const ACCENT = '#E07A3F'; // צבע אחד לכל הסימונים: הזהות של כל שורה היא השם שלה, לא הצבע
const GRID = '#F0D9B5';

const dayDate = (day) => new Date(`${day}T00:00:00`);
const monthKey = (day) => day.slice(0, 7);
const monthLabel = (key, opts = { month: 'short' }) => dayDate(`${key}-01`).toLocaleDateString('he-IL', opts);
const fullDay = (day) => dayDate(day).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'long' });

function monthsBack(n) {
  const out = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

// רשימת חודשים לטווח שנבחר ("הכול" = מההכנה הראשונה, לפחות 6 חודשים)
function monthsForRange(range, cooks) {
  if (range.months) return monthsBack(range.months);
  if (!cooks.length) return monthsBack(6);
  const first = dayDate(cooks[cooks.length - 1].cooked_on);
  const now = new Date();
  const n = (now.getFullYear() - first.getFullYear()) * 12 + now.getMonth() - first.getMonth() + 1;
  return monthsBack(Math.max(6, n));
}

const avgGapDays = (days) => {
  if (days.length < 2) return null;
  const sorted = [...days].sort();
  const span = (dayDate(sorted.at(-1)) - dayDate(sorted[0])) / 86400000;
  return Math.round(span / (sorted.length - 1));
};

function topBy(list, key) {
  const counts = {};
  list.forEach((x) => x[key] && (counts[x[key]] = (counts[x[key]] || 0) + 1));
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

export async function renderTimeline(view, ctx, focusRecipeId = null, fresh = null) {
  if (!fresh && !view.app.querySelector('[data-timeline-page]')) view.app.innerHTML = loading('מדפדפים ביומן המטבח...');
  const data = fresh || (await rpcCached('get_timeline', { p_token: ctx.token }, (newer) => {
    if (!view.isCurrent()) return;
    const y = window.scrollY;
    renderTimeline(view, ctx, null, newer).then(() => window.scrollTo({ top: y }));
  }));
  if (!view.isCurrent()) return;

  const { house, recipes, cooks } = data;
  const memberById = Object.fromEntries(data.members.map((m) => [m.id, m]));
  const members = data.members.filter((m) => !m.archived);
  const recipeById = Object.fromEntries(recipes.map((r) => [r.id, r]));
  const st = state.get(ctx.token) || { range: '12', tab: 'all', focus: null, compare: [], who: new Set() };
  state.set(ctx.token, st);
  if (focusRecipeId && recipeById[focusRecipeId]) {
    st.tab = 'one';
    st.focus = focusRecipeId;
  }
  // ברירת מחדל להשוואה: שני המתכונים הכי מבושלים
  if (!st.compare.length) st.compare = topBy(cooks, 'recipe_id').slice(0, 2).map(([id]) => id);
  st.compare = st.compare.filter((id) => recipeById[id]);
  if (st.focus && !recipeById[st.focus]) st.focus = null;
  if (!st.focus) st.focus = topBy(cooks, 'recipe_id')[0]?.[0] || recipes[0]?.id || null;

  const recipeHref = (id) => `${ctx.base}/r/${id}`;

  view.mount(`
    <div data-timeline-page>
      ${topBar({ back: ctx.base, backLabel: house.name })}
      <div class="mb-5">
        <h1 class="text-3xl sm:text-4xl">📅 מה בישלנו</h1>
        <p class="text-cocoa-500">כל פעם שמישהו לוחץ "הכנתי!" במתכון, היא נרשמת כאן.</p>
      </div>

      ${!cooks.length ? `
        <section class="card p-10 text-center">
          <div class="mx-auto w-fit">${panSVG('h-32 w-32')}</div>
          <h2 class="mb-2 text-2xl">היומן עוד ריק</h2>
          <p class="text-cocoa-500">בפעם הבאה שמבשלים, לחצו על <b>"👩‍🍳 הכנתי!"</b> בדף של המתכון. ככה נדע מה הכי אוהבים לבשל, ומה נשכח במגירה.</p>
        </section>` : `
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div class="inline-flex rounded-2xl bg-cream-200 p-1" role="tablist">
            ${[['all', 'כל הבית'], ['one', 'מתכון אחד'], ['compare', 'השוואה']].map(([id, name]) => `
              <button role="tab" aria-selected="${st.tab === id}" data-tab="${id}" class="rounded-xl px-4 py-1.5 text-sm font-medium transition ${st.tab === id ? 'bg-white text-spice-700 shadow-soft' : 'text-cocoa-700 hover:bg-cream-100'}">${name}</button>`).join('')}
          </div>
          <div class="flex flex-wrap gap-1.5" aria-label="טווח זמן">
            ${RANGES.map((r) => `<button data-range="${r.id}" aria-pressed="${st.range === r.id}" class="chip-toggle text-xs ${st.range === r.id ? 'is-on' : ''}">${r.name}</button>`).join('')}
          </div>
        </div>
        <div id="tab-body"></div>`}
    </div>
    <div id="chart-tip" class="pointer-events-none fixed z-50 hidden rounded-xl bg-cocoa-900 px-3 py-1.5 text-xs text-cream-50 shadow-lift"></div>`);

  if (!cooks.length) return;
  const app = view.app;

  // ---------- תצוגות ----------

  const range = () => RANGES.find((r) => r.id === st.range);
  const inRange = (list) => {
    const months = monthsForRange(range(), cooks);
    const from = `${months[0]}-01`;
    return list.filter((k) => k.cooked_on >= from);
  };

  const statTile = (value, label, sub = '') => `
    <div class="card p-4">
      <p class="text-sm text-cocoa-500">${label}</p>
      <p class="font-display ${typeof value === 'number' ? 'text-3xl' : 'text-xl leading-tight'} text-cocoa-900 text-wrap-any">${value}</p>
      ${sub ? `<p class="truncate text-xs text-cocoa-500">${sub}</p>` : ''}
    </div>`;

  // עמודות חודשיות (סדרה אחת). הזמן זורם משמאל (ישן) לימין (חדש), כמו בגרפים רגילים.
  function monthlyBars(list, months) {
    const counts = months.map((m) => list.filter((k) => monthKey(k.cooked_on) === m).length);
    const max = Math.max(1, ...counts);
    const W = 600, H = 150, pad = { t: 10, b: 24, l: 4, r: 4 };
    const slot = (W - pad.l - pad.r) / months.length;
    const bw = Math.max(4, Math.min(28, slot - 6));
    const y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
    const every = months.length > 12 ? Math.ceil(months.length / 12) : 1;
    return `
      <div dir="ltr" class="relative">
        <svg viewBox="0 0 ${W} ${H}" class="h-40 w-full" role="img" aria-label="מספר הכנות בכל חודש">
          <line x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}" stroke="${GRID}" stroke-width="1"/>
          ${counts.map((c, i) => {
            const x = pad.l + slot * i + (slot - bw) / 2;
            const top = y(c);
            const h = H - pad.b - top;
            const r = Math.min(4, bw / 2, h);
            return `
              <g data-tip="${esc(monthLabel(months[i], { month: 'long', year: 'numeric' }))}: ${c} הכנות">
                <rect x="${pad.l + slot * i}" y="${pad.t}" width="${slot}" height="${H - pad.t}" fill="transparent"/>
                ${c ? `<path d="M${x},${H - pad.b} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${H - pad.b} Z" fill="${ACCENT}"/>` : ''}
              </g>
              ${i % every === 0 ? `<text x="${pad.l + slot * i + slot / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="#8A6E58">${esc(monthLabel(months[i]))}</text>` : ''}`;
          }).join('')}
        </svg>
      </div>`;
  }

  // שורה לכל מתכון, נקודה לכל הכנה, על ציר זמן משותף
  function swimlanes(ids, list, months) {
    const from = dayDate(`${months[0]}-01`).getTime();
    const end = new Date();
    end.setHours(23, 59, 59);
    const span = Math.max(1, end.getTime() - from);
    const W = 600, ROW = 40;
    const x = (day) => 8 + ((dayDate(day).getTime() - from) / span) * (W - 16);
    const ticks = months.filter((_, i) => i % Math.ceil(months.length / 6) === 0);
    return `
      <div class="space-y-1">
        ${ids.map((id) => {
          const rows = list.filter((k) => k.recipe_id === id);
          return `
            <div class="grid grid-cols-[minmax(0,7rem)_1fr_2.5rem] items-center gap-2 sm:grid-cols-[minmax(0,10rem)_1fr_3rem]">
              <a href="${recipeHref(id)}" class="truncate text-sm font-medium hover:text-spice-600" title="${esc(recipeById[id].title)}">${esc(recipeById[id].title)}</a>
              <div dir="ltr">
                <svg viewBox="0 0 ${W} ${ROW}" class="h-10 w-full" role="img" aria-label="${esc(recipeById[id].title)}: ${rows.length} הכנות">
                  <line x1="8" x2="${W - 8}" y1="${ROW / 2}" y2="${ROW / 2}" stroke="${GRID}" stroke-width="2" stroke-linecap="round"/>
                  ${rows.map((k) => `
                    <g data-tip="${esc(fullDay(k.cooked_on))}${memberById[k.member_id] ? ` · ${esc(memberById[k.member_id].name)}` : ''}">
                      <circle cx="${x(k.cooked_on)}" cy="${ROW / 2}" r="12" fill="transparent"/>
                      <circle cx="${x(k.cooked_on)}" cy="${ROW / 2}" r="6" fill="${ACCENT}" stroke="#fff" stroke-width="2"/>
                    </g>`).join('')}
                </svg>
              </div>
              <span class="text-left font-display text-lg text-cocoa-700">${rows.length}</span>
            </div>`;
        }).join('')}
        <div class="grid grid-cols-[minmax(0,7rem)_1fr_2.5rem] gap-2 sm:grid-cols-[minmax(0,10rem)_1fr_3rem]">
          <span></span>
          <div dir="ltr" class="relative h-5 text-[11px] text-cocoa-500">
            ${ticks.map((m) => `<span class="absolute -translate-x-1/2" style="left:${(x(`${m}-01`) / W) * 100}%">${esc(monthLabel(m))}</span>`).join('')}
          </div>
          <span></span>
        </div>
      </div>`;
  }

  function recipeStats(id, list) {
    const rows = list.filter((k) => k.recipe_id === id);
    const all = cooks.filter((k) => k.recipe_id === id);
    const chef = topBy(all, 'member_id')[0];
    return {
      count: rows.length,
      total: all.length,
      last: all[0]?.cooked_on || null,
      gap: avgGapDays(all.map((k) => k.cooked_on)),
      rating: recipeById[id].avg_rating,
      chef: chef ? memberById[chef[0]] : null,
    };
  }

  function entryRow(k, showRecipe = true) {
    const r = recipeById[k.recipe_id];
    const m = memberById[k.member_id];
    const thumb = r?.cover
      ? thumbImg(r.cover, 'h-11 w-11 shrink-0 rounded-xl object-cover')
      : '<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cream-200 text-xl">🍲</span>';
    return `
      <li class="relative flex items-start gap-3 py-2.5">
        <span class="absolute right-[5px] top-0 h-full w-0.5 bg-cream-300"></span>
        <span class="relative mt-4 h-3 w-3 shrink-0 rounded-full border-2 border-white bg-spice-500 shadow"></span>
        ${showRecipe ? thumb : ''}
        <div class="min-w-0 flex-1">
          ${showRecipe ? `<a href="${recipeHref(k.recipe_id)}" class="font-medium hover:text-spice-600 text-wrap-any">${esc(r?.title || 'מתכון שנמחק')}</a>` : ''}
          <p class="flex flex-wrap items-center gap-x-2 text-sm text-cocoa-500">${esc(fullDay(k.cooked_on))}
            ${m ? `<span class="flex items-center gap-1">· ${avatar(m, 6)} ${esc(m.name)}</span>` : ''}</p>
          ${k.note ? `<p class="text-sm text-cocoa-700 text-wrap-any">"${esc(k.note)}"</p>` : ''}
        </div>
      </li>`;
  }

  function groupedTimeline(list, showRecipe = true) {
    const groups = {};
    list.forEach((k) => (groups[monthKey(k.cooked_on)] ||= []).push(k));
    return Object.entries(groups).map(([m, rows]) => `
      <section class="mb-4">
        <h3 class="sticky top-0 z-[1] mb-1 bg-cream-100/90 py-1 font-display text-lg text-cocoa-700 backdrop-blur">${esc(monthLabel(m, { month: 'long', year: 'numeric' }))}
          <span class="text-sm font-normal text-cocoa-500">· ${rows.length} ${rows.length === 1 ? 'הכנה' : 'הכנות'}</span></h3>
        <ol class="pr-1">${rows.map((k) => entryRow(k, showRecipe)).join('')}</ol>
      </section>`).join('');
  }

  function tabAll() {
    const months = monthsForRange(range(), cooks);
    let list = inRange(cooks);
    if (st.who.size) list = list.filter((k) => st.who.has(k.member_id));
    const top = topBy(list, 'recipe_id');
    const chef = topBy(list, 'member_id')[0];
    const maxTop = top[0]?.[1] || 1;
    return `
      <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        ${statTile(list.length, 'הכנות בטווח')}
        ${statTile(new Set(list.map((k) => k.recipe_id)).size, 'מתכונים שונים')}
        ${statTile(top[0] ? esc(recipeById[top[0][0]]?.title || '') : '—', 'הכי מבושל', top[0] ? `${top[0][1]} פעמים` : '')}
        ${statTile(chef && memberById[chef[0]] ? esc(memberById[chef[0]].name) : '—', 'השף/ית של התקופה 👑', chef ? `${chef[1]} הכנות` : '')}
      </div>
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <span class="text-sm text-cocoa-500">מי בישל:</span>
        ${members.map((m) => `<button data-who="${esc(m.id)}" aria-pressed="${st.who.has(m.id)}" class="chip-toggle text-xs ${st.who.has(m.id) ? 'is-on' : ''}">${esc(m.name)}</button>`).join('')}
      </div>
      <div class="mb-6 grid gap-4 lg:grid-cols-2">
        <section class="card p-4">
          <h2 class="section-title mb-2 text-lg">📊 הכנות בכל חודש</h2>
          ${monthlyBars(list, months)}
        </section>
        <section class="card p-4">
          <h2 class="section-title mb-3 text-lg">🏆 המתכונים הכי מבושלים</h2>
          ${top.length ? `<ol class="space-y-2">${top.slice(0, 6).map(([id, c], i) => `
            <li>
              <a href="${recipeHref(id)}" class="group block">
                <div class="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span class="truncate font-medium group-hover:text-spice-600">${i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}${esc(recipeById[id]?.title || '')}</span>
                  <span class="shrink-0 text-cocoa-500">${c}</span>
                </div>
                <div class="h-2.5 rounded-full bg-cream-200"><div class="h-2.5 rounded-full bg-spice-500" style="width:${(c / maxTop) * 100}%"></div></div>
              </a>
            </li>`).join('')}</ol>` : '<p class="text-sm text-cocoa-500">אין הכנות בטווח הזה.</p>'}
        </section>
      </div>
      <section class="card p-4 sm:p-5">
        <h2 class="section-title mb-2 text-lg">🗓️ ציר הזמן</h2>
        ${list.length ? groupedTimeline(list) : '<p class="text-sm text-cocoa-500">אין הכנות בטווח הזה. אולי תבחרו טווח ארוך יותר?</p>'}
      </section>`;
  }

  function recipeSelect(id, attr) {
    return `<select ${attr} class="input max-w-sm">
      ${recipes.map((r) => `<option value="${esc(r.id)}" ${r.id === id ? 'selected' : ''}>${esc(r.title)}</option>`).join('')}
    </select>`;
  }

  function tabOne() {
    if (!st.focus) return '<p class="text-cocoa-500">אין מתכונים בבית עדיין.</p>';
    const months = monthsForRange(range(), cooks);
    const list = inRange(cooks).filter((k) => k.recipe_id === st.focus);
    const s = recipeStats(st.focus, inRange(cooks));
    const r = recipeById[st.focus];
    return `
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <label class="text-sm text-cocoa-500" for="focus-select">מתכון:</label>
        ${recipeSelect(st.focus, 'id="focus-select"')}
        <a href="${recipeHref(st.focus)}" class="btn-ghost btn-sm">לדף המתכון ←</a>
      </div>
      <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        ${statTile(s.count, 'הכנות בטווח', `${s.total} בסך הכול`)}
        ${statTile(s.last ? cookedAgo(s.last) : '—', 'הפעם האחרונה')}
        ${statTile(s.gap ? `כל ${s.gap} ימים` : '—', 'בממוצע מכינים')}
        ${statTile(s.chef ? esc(s.chef.name) : '—', 'מכין/ה הכי הרבה')}
      </div>
      <section class="card mb-4 p-4">
        <h2 class="section-title mb-2 text-lg">📊 ${esc(r.title)}: הכנות בכל חודש</h2>
        ${monthlyBars(list, months)}
      </section>
      <section class="card p-4 sm:p-5">
        <h2 class="section-title mb-2 text-lg">🗓️ כל הפעמים</h2>
        ${list.length ? groupedTimeline(list, false) : '<p class="text-sm text-cocoa-500">לא הכינו את המתכון הזה בטווח שנבחר.</p>'}
      </section>`;
  }

  function tabCompare() {
    const months = monthsForRange(range(), cooks);
    const list = inRange(cooks);
    const ids = st.compare;
    const rows = ids.map((id) => ({ id, ...recipeStats(id, list) }));
    return `
      <section class="card mb-4 p-4">
        <h2 class="section-title mb-1 text-lg">⚖️ בחרו עד ${MAX_COMPARE} מתכונים להשוואה</h2>
        <p class="mb-3 text-sm text-cocoa-500">לחיצה על מתכון מוסיפה או מורידה אותו.</p>
        <div class="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
          ${recipes.map((r) => `<button data-compare="${esc(r.id)}" aria-pressed="${ids.includes(r.id)}" class="chip-toggle text-xs ${ids.includes(r.id) ? 'is-on' : ''}">${esc(r.title)}</button>`).join('')}
        </div>
      </section>
      ${ids.length ? `
        <section class="card mb-4 p-4">
          <h2 class="section-title mb-3 text-lg">🗓️ מתי הכינו כל אחד</h2>
          ${swimlanes(ids, list, months)}
        </section>
        <section class="card overflow-x-auto p-4">
          <h2 class="section-title mb-3 text-lg">📋 בטבלה</h2>
          <table class="w-full min-w-[30rem] text-sm">
            <thead><tr class="border-b-2 border-cream-200 text-right text-cocoa-500">
              <th class="py-2 font-medium">מתכון</th><th class="font-medium">הכנות בטווח</th><th class="font-medium">פעם אחרונה</th>
              <th class="font-medium">מכינים כל</th><th class="font-medium">דירוג</th><th class="font-medium">מכין/ה הכי הרבה</th>
            </tr></thead>
            <tbody>${rows.map((x) => `
              <tr class="border-b border-cream-200 last:border-0">
                <td class="py-2 font-medium"><a href="${recipeHref(x.id)}" class="hover:text-spice-600">${esc(recipeById[x.id].title)}</a></td>
                <td>${x.count}</td>
                <td>${x.last ? cookedAgo(x.last) : '—'}</td>
                <td>${x.gap ? `${x.gap} ימים` : '—'}</td>
                <td>${x.rating ? `${x.rating}/10` : '—'}</td>
                <td>${x.chef ? esc(x.chef.name) : '—'}</td>
              </tr>`).join('')}</tbody>
          </table>
        </section>` : '<p class="text-center text-cocoa-500">בחרו מתכון אחד לפחות 👆</p>'}`;
  }

  function draw() {
    const body = $('#tab-body', app);
    body.innerHTML = st.tab === 'one' ? tabOne() : st.tab === 'compare' ? tabCompare() : tabAll();
  }

  function redrawShell() {
    $$('[data-tab]', app).forEach((b) => {
      const on = b.dataset.tab === st.tab;
      b.setAttribute('aria-selected', String(on));
      b.className = `rounded-xl px-4 py-1.5 text-sm font-medium transition ${on ? 'bg-white text-spice-700 shadow-soft' : 'text-cocoa-700 hover:bg-cream-100'}`;
    });
    $$('[data-range]', app).forEach((b) => {
      b.classList.toggle('is-on', b.dataset.range === st.range);
      b.setAttribute('aria-pressed', String(b.dataset.range === st.range));
    });
    draw();
  }

  app.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab],[data-range],[data-who],[data-compare]');
    if (!t) return;
    if (t.dataset.tab) st.tab = t.dataset.tab;
    if (t.dataset.range) st.range = t.dataset.range;
    if (t.dataset.who) st.who.has(t.dataset.who) ? st.who.delete(t.dataset.who) : st.who.add(t.dataset.who);
    if (t.dataset.compare) {
      const id = t.dataset.compare;
      if (st.compare.includes(id)) st.compare = st.compare.filter((x) => x !== id);
      else if (st.compare.length < MAX_COMPARE) st.compare = [...st.compare, id];
    }
    redrawShell();
  });
  app.addEventListener('change', (e) => {
    if (e.target.id === 'focus-select') {
      st.focus = e.target.value;
      draw();
    }
  });

  // חלונית מידע בריחוף או בנגיעה על עמודות ונקודות
  const tip = $('#chart-tip', app);
  const showTip = (e) => {
    const g = e.target.closest('[data-tip]');
    if (!g) return tip.classList.add('hidden');
    tip.textContent = g.dataset.tip;
    tip.classList.remove('hidden');
    const x = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, e.clientX - tip.offsetWidth / 2));
    tip.style.left = `${x}px`;
    tip.style.top = `${e.clientY - tip.offsetHeight - 12}px`;
  };
  app.addEventListener('pointermove', showTip);
  app.addEventListener('pointerdown', showTip);
  app.addEventListener('pointerleave', () => tip.classList.add('hidden'));

  draw();
}
