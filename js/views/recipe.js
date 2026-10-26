// מסך מתכון: תמונות, מצרכים (עם רשימת קניות לוואטסאפ), שלבים,
// אפשרויות לשינוי, דירוגי בני הבית ויומן הערות.
import { rpc, rpcCached, imageUrl, analyzeNutrition } from '../api.js';
import { getChecks, setChecks, getGuestName, setGuestName } from '../store.js';
import {
  esc, multiline, avatar, loading, difficultyIcons, tagChip, totalTime, timeAgo, formatDate,
  modal, confirmDialog, copyText, whatsappUrl, onAction, busy, toast, cookedAgo, $, DIFFICULTY,
} from '../ui.js';
import { topBar, shareLinks } from './common.js';
import { confetti } from '../decor.js';

// מצב הממשק נשמר בין רענונים של אותו מתכון
const ui = { shopMode: false, doneSteps: new Set(), recipeId: null, nutScope: 'serving' };

// ערכים יומיים מומלצים (למבוגר, 2000 קק״ל) לחישוב "% מהיומי"
const DAILY = { kcal: 2000, protein_g: 50, carbs_g: 275, fiber_g: 28, fat_g: 78, sat_fat_g: 20 };
const NUTRIENTS = [
  ['protein_g', 'חלבון', '💪'],
  ['carbs_g', 'פחמימות', '🍞'],
  ['fiber_g', 'סיבים', '🌾'],
  ['fat_g', 'שומן', '🫒'],
  ['sat_fat_g', 'שומן רווי', '🧈'],
];
const fmtG = (v) => (v < 10 ? Math.round(v * 10) / 10 : Math.round(v));
const fmtIls = (v) => `₪${v < 10 ? (Math.round(v * 10) / 10).toFixed(1) : Math.round(v)}`;

// רק קישורי http/https, למקרה שמשהו מוזר נכנס
const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : '#');
const hostOf = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
};

const formatDay = (day) =>
  new Date(`${day}T00:00:00`).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });

const FACES = (s) => (s >= 10 ? '🤩' : s >= 8 ? '😋' : s >= 6 ? '🙂' : s >= 4 ? '😐' : '😖');

// cached: נתונים שכבר נטענו, לשינויי תצוגה מקומיים (סימון שלב, רשימת קניות) בלי לפנות לשרת.
// fresh: אחרי פעולה (דירוג, הערה...) מביאים גרסה טרייה מהשרת ולא מהזיכרון המקומי.
export async function renderRecipe(view, ctx, recipeId, cached = null, { fresh = false } = {}) {
  if (!cached && !view.app.querySelector('[data-recipe-page]')) view.app.innerHTML = loading('מחממים את התנור...');
  const args = { p_token: ctx.token, p_recipe_id: recipeId };
  const data = cached || (fresh
    ? await rpc('get_recipe', args)
    : await rpcCached('get_recipe', args, (newer) => {
      if (!view.isCurrent()) return;
      const y = window.scrollY;
      renderRecipe(view, ctx, recipeId, newer).then(() => window.scrollTo({ top: y }));
    }));
  if (!view.isCurrent()) return;

  const { recipe: r, house, members, role, me, variations, ratings, comments } = data;
  const cooks = data.cooks || [];
  const isMember = role === 'member';
  if (ui.recipeId !== r.id) {
    ui.recipeId = r.id;
    ui.shopMode = false;
    ui.doneSteps = new Set();
  }
  const memberById = Object.fromEntries(members.map((m) => [m.id, m]));
  const activeMembers = members.filter((m) => !m.archived);
  const reload = async (local = false) => {
    const y = window.scrollY;
    await renderRecipe(view, ctx, r.id, local ? data : null, { fresh: !local });
    window.scrollTo({ top: y });
  };

  const time = totalTime(r);
  const ingredientItems = r.ingredients.map((it, i) => ({ ...it, i })).filter((it) => it.text);
  const realItems = ingredientItems.filter((it) => !it.header);
  const checks = getChecks(r.id);
  const missing = realItems.filter((it) => !checks[it.i]);

  // ---------- חלקי המסך ----------

  const gallery = r.images.length
    ? `<section class="mb-6">
        <div class="flex snap-x snap-mandatory gap-3 overflow-x-auto scrollbar-none pb-2">
          ${r.images.map((img, i) => `
            <button data-action="lightbox" data-index="${i}" class="relative shrink-0 snap-center overflow-hidden rounded-3xl bg-cream-200 shadow-soft ${r.images.length === 1 ? 'w-full' : 'w-[85%] sm:w-[60%]'}">
              <img src="${esc(imageUrl(img.path))}" alt="${esc(r.title)}" class="aspect-[4/3] w-full object-cover" ${i ? 'loading="lazy"' : ''}>
            </button>`).join('')}
        </div>
        ${r.images.length > 1 ? `<p class="mt-1 text-center text-xs text-cocoa-500">← ${r.images.length} תמונות, אפשר לגלול →</p>` : ''}
      </section>`
    : '';

  const header = `
    <section class="mb-6">
      <h1 class="mb-2 text-4xl leading-tight sm:text-5xl">${esc(r.title)}</h1>
      ${r.description ? `<p class="mb-4 text-lg leading-relaxed text-cocoa-700">${multiline(r.description)}</p>` : ''}
      <div class="mb-3 flex flex-wrap gap-2 text-sm">
        <span class="chip bg-white shadow-soft">${difficultyIcons(r.difficulty, 'text-sm')} <span class="mr-1">${esc(DIFFICULTY[r.difficulty]?.short)}</span></span>
        ${r.prep_minutes ? `<span class="chip bg-white shadow-soft">🔪 הכנה ${r.prep_minutes} דק׳</span>` : ''}
        ${r.cook_minutes ? `<span class="chip bg-white shadow-soft">🔥 בישול ${r.cook_minutes} דק׳</span>` : ''}
        ${time && r.prep_minutes && r.cook_minutes ? `<span class="chip bg-white shadow-soft">⏱️ סה״כ ${time}</span>` : ''}
        ${r.servings_count || r.servings ? `<span class="chip bg-white shadow-soft">🍽️ ${r.servings_count ? `${r.servings_count} מנות` : ''}${r.servings_count && r.servings ? ' · ' : ''}${esc(r.servings || '')}</span>` : ''}
      </div>
      ${r.tags.length ? `<div class="mb-3 flex flex-wrap gap-1.5">${r.tags.map((t) => tagChip(t)).join('')}</div>` : ''}
      ${(data.editing || []).length ? `<p class="mb-3 flex items-center gap-2 rounded-2xl bg-honey-100 px-4 py-2 text-sm no-print">✏️
          <span><b>${data.editing.map((e) => esc(e.member?.name || '')).join(', ')}</b> ${data.editing.length === 1 ? 'עורך/ת' : 'עורכים'} את המתכון הזה עכשיו</span></p>` : ''}
      ${r.source_url ? `<a href="${esc(safeUrl(r.source_url))}" target="_blank" rel="noopener noreferrer"
          class="mb-3 flex items-center gap-3 rounded-2xl border-2 border-dashed border-sage-300 bg-sage-50 px-4 py-3 transition hover:bg-sage-100">
          <span class="text-2xl">🌐</span>
          <span class="min-w-0 flex-1"><span class="block text-sm font-medium text-sage-700">המתכון המקורי באינטרנט</span>
            <span class="block truncate text-xs text-cocoa-500" dir="ltr">${esc(hostOf(r.source_url))}</span></span>
          <span class="btn-sage btn-sm shrink-0">פתיחה ↗</span></a>` : ''}
      <p class="text-xs text-cocoa-500">
        ${r.created_by ? `נוסף ע״י ${esc(r.created_by.name)} · ` : ''}${formatDate(r.created_at)}
        ${r.updated_by && r.updated_at !== r.created_at ? ` · עודכן ${timeAgo(r.updated_at)} ע״י ${esc(r.updated_by.name)}` : ''}
      </p>
      ${isMember || cooks.length ? `
        <div class="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-sage-100 p-3 no-print">
          ${isMember ? '<button data-action="cooked" class="btn-sage wiggle-hover">👩‍🍳 הכנתי!</button>' : ''}
          <span class="text-sm text-sage-700">${cooks.length
            ? `בושל ${cooks.length === 1 ? 'פעם אחת' : `${cooks.length} פעמים`} · לאחרונה ${cookedAgo(cooks[0].cooked_on)}`
            : 'עוד לא סימנו שמישהו הכין את זה. מי ראשון? 🏁'}</span>
        </div>` : ''}
      <div class="mt-4 flex flex-wrap gap-2 no-print">
        ${isMember ? `<a href="${ctx.base}/edit/${r.id}" class="btn-soft btn-sm">✏️ עריכה</a>` : ''}
        <button data-action="share" class="btn-soft btn-sm">🔗 שיתוף המתכון</button>
        <button data-action="print" class="btn-soft btn-sm">🖨️ הדפסה</button>
        ${isMember ? '<button data-action="delete" class="btn-ghost btn-sm text-berry-600">🗑️ מחיקה</button>' : ''}
      </div>
    </section>`;

  const ingredients = `
    <section class="card p-5 lg:sticky lg:top-4">
      <div class="mb-3 flex items-center justify-between gap-2">
        <h2 class="section-title">🧺 מצרכים</h2>
        ${realItems.length ? `<button data-action="shop-mode" class="${ui.shopMode ? 'btn-sage' : 'btn-soft'} btn-sm no-print">
          ${ui.shopMode ? '✓ סיימתי לבדוק' : '🛒 מה חסר בבית?'}</button>` : ''}
      </div>
      ${ui.shopMode ? `<p class="mb-3 rounded-2xl bg-sage-50 p-3 text-sm text-sage-700">סמנו את מה שכבר יש בבית. מה שלא מסומן ייכנס לרשימת הקניות 🛍️</p>` : ''}
      ${ingredientItems.length ? `<ul class="space-y-1">
        ${ingredientItems.map((it) => it.header
          ? `<li class="pt-3 font-display text-spice-700 first:pt-0">${esc(it.text)}</li>`
          : ui.shopMode
            ? `<li><label class="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-1.5 transition hover:bg-cream-100">
                 <input type="checkbox" data-check="${it.i}" ${checks[it.i] ? 'checked' : ''} class="mt-1 h-5 w-5 shrink-0 accent-sage-500">
                 <span class="${checks[it.i] ? 'text-cocoa-300 line-through' : ''}">${esc(it.text)}</span></label></li>`
            : `<li class="flex items-start gap-3 px-2 py-1"><span class="mt-2 h-2 w-2 shrink-0 rounded-full bg-spice-400"></span><span>${esc(it.text)}</span></li>`,
        ).join('')}
      </ul>` : '<p class="text-cocoa-500">עוד לא נכתבו מצרכים 🤷</p>'}
      ${ui.shopMode ? `
        <div class="mt-4 border-t-2 border-dashed border-cream-200 pt-4 no-print">
          <p class="mb-3 text-center text-sm font-medium ${missing.length ? 'text-spice-700' : 'text-sage-700'}">
            ${missing.length ? `חסרים ${missing.length} מתוך ${realItems.length} מצרכים` : 'יש הכול! אפשר להתחיל לבשל 🎉'}</p>
          <div class="flex gap-2">
            <button data-action="whatsapp" class="btn flex-1 bg-[#25D366] text-white hover:bg-[#1FB457]" ${missing.length ? '' : 'disabled'}>💬 רשימת קניות לוואטסאפ</button>
            <button data-action="reset-checks" class="btn-soft" title="איפוס">↺</button>
          </div>
        </div>` : ''}
    </section>`;

  const steps = `
    <section class="card p-5">
      <h2 class="section-title mb-4">👩‍🍳 אופן ההכנה</h2>
      ${r.steps.filter((s) => s.text).length ? `<ol class="space-y-3">
        ${r.steps.filter((s) => s.text).map((s, i) => `
          <li><button data-action="step" data-index="${i}" class="flex w-full items-start gap-4 rounded-2xl p-2 text-right transition hover:bg-cream-100 ${ui.doneSteps.has(i) ? 'opacity-50' : ''}">
            <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-lg ${ui.doneSteps.has(i) ? 'bg-sage-500 text-white' : 'bg-spice-100 text-spice-700'}">${ui.doneSteps.has(i) ? '✓' : i + 1}</span>
            <span class="pt-1 leading-relaxed ${ui.doneSteps.has(i) ? 'line-through' : ''}">${multiline(s.text)}</span>
          </button></li>`).join('')}
      </ol>
      <p class="mt-3 text-center text-xs text-cocoa-500 no-print">טיפ: לחיצה על שלב מסמנת אותו כגמור ✓</p>` : '<p class="text-cocoa-500">עוד לא נכתבו שלבים. אולי זה מתכון "בעין"? 👀</p>'}
    </section>`;

  // ----- דירוגי בני הבית: אזור בולט ונפרד -----
  const rated = ratings.map((x) => ({ ...x, member: memberById[x.member_id] })).filter((x) => x.member);
  const notRated = activeMembers.filter((m) => !ratings.some((x) => x.member_id === m.id));
  const myRating = me ? ratings.find((x) => x.member_id === me.id) : null;
  const avg = rated.length ? rated.reduce((s, x) => s + x.score, 0) / rated.length : null;

  const membersSection = `
    <section class="mb-8 rounded-[2rem] bg-sage-100 p-5 sm:p-6">
      <div class="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 class="section-title text-2xl">⭐ מה בני הבית אומרים</h2>
          <p class="text-sm text-sage-700">הדירוגים של המשפחה, מ-1 עד 10</p>
        </div>
        ${avg !== null ? `<div class="rounded-2xl bg-white px-4 py-2 text-center shadow-soft">
          <span class="font-display text-3xl text-sage-700">${avg.toFixed(1)}</span><span class="text-sm text-cocoa-500"> / 10 ממוצע</span></div>` : ''}
      </div>
      ${rated.length ? `<div class="grid gap-3 sm:grid-cols-2">
        ${rated.map((x) => `
          <div class="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-soft">
            ${avatar(x.member, 12)}
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline justify-between gap-2">
                <span class="truncate font-display text-lg">${esc(x.member.name)}</span>
                <span class="shrink-0 font-display text-2xl text-sage-700">${x.score}<span class="text-sm text-cocoa-500">/10</span> ${FACES(x.score)}</span>
              </div>
              ${x.note ? `<p class="text-sm text-cocoa-700">"${esc(x.note)}"</p>` : ''}
            </div>
          </div>`).join('')}
      </div>` : '<p class="rounded-2xl bg-white/60 p-4 text-center text-sage-700">עוד אף אחד לא דירג. מי יהיה הראשון? 🏆</p>'}
      ${notRated.length ? `<p class="mt-3 text-xs text-sage-700">עוד לא דירגו: ${notRated.map((m) => esc(m.name)).join(', ')}</p>` : ''}
      ${isMember ? `
        <div class="mt-4 rounded-2xl bg-white p-4 no-print">
          <p class="mb-2 font-medium">${myRating ? 'הדירוג שלך' : 'ומה את/ה אומר/ת?'} ${avatar(me, 6)}</p>
          <div class="mb-3 grid grid-cols-5 gap-1.5 sm:grid-cols-10" id="score-pick">
            ${Array.from({ length: 10 }, (_, i) => i + 1).map((n) => `
              <button type="button" data-score="${n}" class="rounded-xl border-2 py-1.5 font-display text-lg transition ${myRating?.score === n ? 'border-sage-500 bg-sage-500 text-white' : 'border-cream-200 hover:border-sage-300'}">${n}</button>`).join('')}
          </div>
          <div class="flex flex-col gap-2 sm:flex-row">
            <input id="rate-note" class="input" maxlength="300" placeholder="מילה או שתיים (לא חובה): &quot;עם יותר שום!&quot;" value="${esc(myRating?.note || '')}">
            <div class="flex gap-2">
              <button data-action="save-rating" class="btn-sage flex-1 sm:flex-none">שמירה</button>
              ${myRating ? '<button data-action="clear-rating" class="btn-ghost btn-sm" title="מחיקת הדירוג">🗑️</button>' : ''}
            </div>
          </div>
        </div>` : ''}
    </section>`;

  // ----- אפשרויות לשינוי -----
  const variationsSection = `
    <section class="mb-8">
      <div class="mb-3">
        <h2 class="section-title text-2xl">🔄 אפשרויות לשינוי</h2>
        <p class="text-sm text-cocoa-500">גרסה טבעונית? בלי גלוטן? עם טוויסט של דודה? כל אחד יכול להוסיף.</p>
      </div>
      ${variations.length ? `<div class="mb-4 grid gap-3 sm:grid-cols-2">
        ${variations.map((v) => `
          <article class="card relative p-4">
            <h3 class="mb-1 text-lg text-spice-700">${esc(v.title)}</h3>
            <p class="mb-2 leading-relaxed">${multiline(v.body)}</p>
            <p class="text-xs text-cocoa-500">${esc(v.author_name)} · ${timeAgo(v.created_at)}</p>
            ${isMember ? `<button data-action="del-variation" data-id="${esc(v.id)}" class="absolute left-3 top-3 grayscale hover:grayscale-0 no-print" title="מחיקה" aria-label="מחיקת הגרסה">🗑️</button>` : ''}
          </article>`).join('')}
      </div>` : ''}
      <details class="card p-4" ${variations.length ? '' : 'open'}>
        <summary class="cursor-pointer font-medium text-spice-700">➕ הוספת גרסה</summary>
        <form id="variation-form" class="mt-3 space-y-2">
          <input name="title" class="input" maxlength="80" required placeholder="שם הגרסה, למשל: גרסה טבעונית 🌱">
          <textarea name="body" class="input min-h-[90px]" maxlength="3000" required placeholder="מה משנים? למשל: במקום ביצים, 3 כפות רסק תפוחים..."></textarea>
          ${isMember ? '' : `<input name="author" class="input" maxlength="40" placeholder="השם שלך" value="${esc(getGuestName())}">`}
          <button class="btn-primary" type="submit">הוספה</button>
        </form>
      </details>
    </section>`;

  // ----- יומן הערות: כרונולוגי, בסגנון מחברת -----
  const pinned = comments.filter((c) => c.is_pinned);
  const logSection = `
    <section class="mb-8">
      <div class="mb-3">
        <h2 class="section-title text-2xl">📝 יומן הערות</h2>
        <p class="text-sm text-cocoa-500">הערות, טיפים וחוויות מכל מי שבישל, לפי הסדר.</p>
      </div>
      <div class="notebook overflow-hidden rounded-3xl border border-cream-200 shadow-soft">
        ${pinned.length ? `<div class="space-y-2 border-b-2 border-dashed border-spice-200 bg-honey-100/70 p-4">
          ${pinned.map((c) => `<p class="leading-relaxed"><span class="ml-1">📌</span><b>חשוב:</b> ${multiline(c.body)} <span class="text-xs text-cocoa-500">(${esc(c.author_name)})</span></p>`).join('')}
        </div>` : ''}
        <ul class="divide-y divide-transparent px-4 py-2 sm:px-6">
          ${comments.length ? comments.map((c) => `
            <li class="group flex items-start gap-3 py-2 leading-8">
              <span class="shrink-0 pt-px text-xs leading-8 text-cocoa-500" title="${esc(new Date(c.created_at).toLocaleString('he-IL'))}">${timeAgo(c.created_at)}</span>
              <p class="min-w-0 flex-1"><b class="${c.member_id ? 'text-sage-700' : 'text-spice-700'}">${esc(c.author_name)}:</b> ${multiline(c.body)}</p>
              ${isMember ? `<span class="flex shrink-0 gap-1.5 no-print">
                <button data-action="pin" data-id="${esc(c.id)}" data-pinned="${c.is_pinned}" title="${c.is_pinned ? 'ביטול הצמדה' : 'הצמדה כ"חשוב"'}" class="${c.is_pinned ? '' : 'grayscale'}">📌</button>
                <button data-action="del-comment" data-id="${esc(c.id)}" title="מחיקת ההודעה" aria-label="מחיקת ההודעה" class="grayscale hover:grayscale-0">🗑️</button>
              </span>` : ''}
            </li>`).join('') : '<li class="py-4 text-center text-cocoa-500">היומן ריק. בישלתם? ספרו איך יצא! ✍️</li>'}
        </ul>
        <form id="comment-form" class="flex flex-col gap-2 border-t border-cream-200 bg-white/70 p-3 sm:flex-row">
          ${isMember ? '' : `<input name="author" class="input sm:w-40" maxlength="40" placeholder="השם שלך" value="${esc(getGuestName())}">`}
          <input name="body" class="input flex-1" maxlength="2000" required placeholder="למשל: האחיין ביקש עוד 😄">
          <button class="btn-primary shrink-0" type="submit">הוספה ליומן</button>
        </form>
      </div>
    </section>`;

  // ----- ערכים תזונתיים ומחיר (הערכת AI) -----
  const nut = data.nutrition;
  const hasIngredients = realItems.length > 0;
  let nutritionSection = '';
  if (nut?.data) {
    const n = nut.data;
    const per = ui.nutScope === 'serving';
    const vals = per ? n.per_serving : n.total;
    const pct = (k) => Math.round((vals[k] / DAILY[k]) * 100);
    nutritionSection = `
      <section class="mb-8">
        <div class="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 class="section-title text-2xl">🥗 ערכים תזונתיים ומחיר</h2>
            <p class="text-sm text-cocoa-500">הערכה של AI. לא מדויקת, אבל נותנת כיוון.</p>
          </div>
          <div class="inline-flex rounded-2xl bg-cream-200 p-1 text-sm no-print" role="tablist">
            <button data-action="nut-scope" data-scope="serving" role="tab" aria-selected="${per}" class="rounded-xl px-3 py-1 ${per ? 'bg-white text-spice-700 shadow-soft' : 'text-cocoa-700'}">למנה</button>
            <button data-action="nut-scope" data-scope="total" role="tab" aria-selected="${!per}" class="rounded-xl px-3 py-1 ${!per ? 'bg-white text-spice-700 shadow-soft' : 'text-cocoa-700'}">לכל המתכון (${n.servings} מנות)</button>
          </div>
        </div>
        ${nut.stale ? `<div class="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-honey-100 px-4 py-2 text-sm no-print">
            <span>⚠️ המצרכים או מספר המנות השתנו מאז החישוב.</span>
            ${isMember ? '<button data-action="nutrition" class="btn-soft btn-sm">🔄 לחשב מחדש</button>' : ''}</div>` : ''}
        <div class="card p-4 sm:p-5">
          <div class="mb-4 grid grid-cols-2 gap-3">
            <div class="rounded-2xl bg-spice-100 p-3 text-center">
              <p class="text-xs text-spice-700">קלוריות ${per ? 'למנה' : 'בכל המתכון'}</p>
              <p class="font-display text-4xl text-spice-700">${Math.round(vals.kcal)}</p>
              ${per ? `<p class="text-xs text-cocoa-500">${pct('kcal')}% מהיומי</p>` : ''}
            </div>
            <div class="rounded-2xl bg-sage-100 p-3 text-center">
              <p class="text-xs text-sage-700">מחיר משוער ${per ? 'למנה' : 'לכל המתכון'}</p>
              <p class="font-display text-4xl text-sage-700">${fmtIls(vals.price_ils)}</p>
              <p class="text-xs text-cocoa-500">${per ? `${fmtIls(n.total.price_ils)} לכל המתכון` : `${fmtIls(n.per_serving.price_ils)} למנה`}</p>
            </div>
          </div>
          <ul class="mb-4 space-y-2">
            ${NUTRIENTS.map(([k, label, icon]) => `
              <li>
                <div class="mb-0.5 flex items-baseline justify-between text-sm">
                  <span>${icon} ${label}</span>
                  <span><b>${fmtG(vals[k])}</b> ג׳${per ? ` <span class="text-xs text-cocoa-500">· ${pct(k)}% מהיומי</span>` : ''}</span>
                </div>
                ${per ? `<div class="h-2 rounded-full bg-cream-200"><div class="h-2 rounded-full ${k === 'sat_fat_g' && pct(k) > 30 ? 'bg-berry-500' : 'bg-sage-500'}" style="width:${Math.min(100, pct(k))}%"></div></div>` : ''}
              </li>`).join('')}
          </ul>
          ${n.highlights?.length ? `
            <div class="mb-3 flex flex-wrap gap-2">
              ${n.highlights.map((h) => `<span class="chip bg-honey-100" title="${esc(h.detail)}">${esc(h.emoji)} ${esc(h.label)}</span>`).join('')}
            </div>
            <ul class="mb-3 space-y-1 text-xs text-cocoa-500">${n.highlights.map((h) => `<li>${esc(h.emoji)} <b>${esc(h.label)}:</b> ${esc(h.detail)}</li>`).join('')}</ul>` : ''}
          ${n.servings_assumed ? `<p class="mb-3 rounded-xl bg-cream-100 p-2 text-xs text-cocoa-700">ℹ️ מספר המנות (${n.servings}) הוא הערכה של ה-AI. כדאי למלא "מספר מנות" בעריכת המתכון.</p>` : ''}
          <details class="rounded-2xl bg-cream-50 p-3 text-sm">
            <summary class="cursor-pointer font-medium text-spice-700">פירוט לפי מצרכים והנחות</summary>
            <div class="mt-2 overflow-x-auto">
              <table class="w-full min-w-[28rem] text-xs">
                <thead><tr class="border-b border-cream-200 text-right text-cocoa-500">
                  <th class="py-1 font-medium">מצרך</th><th class="font-medium">כמות</th><th class="font-medium">קק״ל</th>
                  <th class="font-medium">חלבון</th><th class="font-medium">שומן</th><th class="font-medium">מחיר</th></tr></thead>
                <tbody>${n.ingredients.map((i) => `<tr class="border-b border-cream-200 last:border-0">
                  <td class="py-1">${esc(i.name)}</td><td>${esc(i.amount)}</td><td>${Math.round(i.kcal)}</td>
                  <td>${fmtG(i.protein_g)}</td><td>${fmtG(i.fat_g)}</td><td>${fmtIls(i.price_ils)}</td></tr>`).join('')}</tbody>
              </table>
            </div>
            ${n.assumptions?.length ? `<p class="mt-3 font-medium">הנחות:</p><ul class="list-disc pr-5 text-cocoa-700">${n.assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
            <p class="mt-2 text-xs text-cocoa-500">חושב ${timeAgo(nut.created_at)} · ${esc(nut.model)} · ביטחון: ${{ low: 'נמוך', medium: 'בינוני', high: 'גבוה' }[n.confidence] || 'בינוני'}</p>
          </details>
          ${isMember && !nut.stale ? '<button data-action="nutrition" class="btn-ghost btn-sm mt-2 no-print">🔄 לחשב מחדש</button>' : ''}
        </div>
      </section>`;
  } else if (isMember) {
    nutritionSection = `
      <section class="mb-8 no-print">
        <div class="card flex flex-col items-center gap-3 p-5 text-center sm:flex-row sm:text-right">
          <span class="text-4xl">🥗</span>
          <div class="flex-1">
            <h2 class="font-display text-xl">כמה קלוריות? כמה זה עולה?</h2>
            <p class="text-sm text-cocoa-500">${hasIngredients ? 'ה-AI יעריך ערכים תזונתיים ומחיר, למנה ולכל המתכון.' : 'כדי לחשב, צריך קודם לכתוב מצרכים במתכון.'}</p>
          </div>
          <button data-action="nutrition" class="btn-primary shrink-0" ${hasIngredients ? '' : 'disabled'}>✨ לחשב עכשיו</button>
        </div>
      </section>`;
  }

  // ----- היסטוריית הכנות -----
  const cooksSection = cooks.length ? `
    <section class="mb-8">
      <div class="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 class="section-title text-2xl">🍳 היסטוריית הכנות</h2>
          <p class="text-sm text-cocoa-500">מתי הכינו את זה בבית, ומי.</p>
        </div>
        ${ctx.base ? `<a href="${ctx.base}/timeline/${r.id}" class="btn-soft btn-sm no-print">📅 בציר הזמן</a>` : ''}
      </div>
      <ol class="card relative space-y-0 p-4 sm:p-5">
        ${cooks.slice(0, 12).map((k, i) => `
          <li class="relative flex items-start gap-3 pb-4 last:pb-0">
            ${i < Math.min(cooks.length, 12) - 1 ? '<span class="absolute right-[13px] top-7 h-full w-0.5 bg-sage-200"></span>' : ''}
            <span class="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sage-500 text-xs text-white">✓</span>
            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-center gap-2"><b>${esc(formatDay(k.cooked_on))}</b>
                ${memberById[k.member_id] ? `<span class="flex items-center gap-1 text-sm text-cocoa-500">${avatar(memberById[k.member_id], 6)} ${esc(memberById[k.member_id].name)}</span>` : ''}</p>
              ${k.note ? `<p class="text-sm text-cocoa-700 text-wrap-any">${esc(k.note)}</p>` : ''}
            </div>
            ${isMember ? `<button data-action="del-cook" data-id="${esc(k.id)}" class="text-cocoa-300 hover:text-berry-500 no-print" title="מחיקה">✕</button>` : ''}
          </li>`).join('')}
      </ol>
      ${cooks.length > 12 ? `<p class="mt-2 text-center text-xs text-cocoa-500">ועוד ${cooks.length - 12} פעמים קודמות</p>` : ''}
    </section>` : '';

  view.mount(`
    <div data-recipe-page>
      ${topBar(ctx.base
        ? { back: ctx.base, backLabel: house.name }
        : { right: `<span class="chip bg-white shadow-soft">${esc(house.emoji)} ${esc(house.name)}</span>` })}
      ${gallery}
      ${header}
      <div class="mb-8 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        ${ingredients}
        ${steps}
      </div>
      ${nutritionSection}
      ${membersSection}
      ${cooksSection}
      ${variationsSection}
      ${logSection}
    </div>`);

  // ---------- פעולות ----------

  // "הכנתי!": מתי, מי, ומילה על איך יצא
  function openCooked(fromBtn) {
    const today = new Date().toLocaleDateString('en-CA');
    let who = me?.id;
    const { el, close } = modal(`
      <div class="mb-4 text-center">
        <div class="mx-auto w-fit">${'<span class="text-5xl">👩‍🍳</span>'}</div>
        <h2 class="text-2xl">כל הכבוד! מה הכנתם?</h2>
        <p class="text-sm text-cocoa-500">${esc(r.title)}</p>
      </div>
      <form class="space-y-4">
        <div><label class="label" for="c-date">מתי?</label>
          <input id="c-date" name="date" type="date" class="input" value="${today}" max="${today}" required></div>
        <div><span class="label">מי בישל?</span>
          <div class="flex flex-wrap gap-2" data-who>
            ${activeMembers.map((m) => `<button type="button" data-member="${esc(m.id)}" aria-pressed="${m.id === who}" class="chip-toggle ${m.id === who ? 'is-on' : ''}">${esc(m.name)}</button>`).join('')}
          </div></div>
        <div><label class="label" for="c-note">איך יצא? (לא חובה)</label>
          <input id="c-note" name="note" class="input" maxlength="300" placeholder="למשל: עם יותר שום, ונגמר תוך 5 דקות 😄"></div>
        <div class="flex gap-2 pt-1">
          <button class="btn-sage flex-1" type="submit">שמירה 🎉</button>
          <button class="btn-soft" type="button" data-close>ביטול</button>
        </div>
      </form>`);
    el.querySelector('[data-who]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-member]');
      if (!b) return;
      who = b.dataset.member;
      el.querySelectorAll('[data-member]').forEach((x) => {
        x.classList.toggle('is-on', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      });
    });
    el.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      busy(e.target.querySelector('[type=submit]'), async () => {
        await rpc('log_cook', { p_token: ctx.token, p_recipe_id: r.id, p_cooked_on: fd.get('date'), p_member_id: who, p_note: fd.get('note') });
        close();
        confetti(fromBtn?.isConnected ? fromBtn : null);
        toast('בתיאבון! נרשם בהיסטוריה 🍽️');
        await reload();
      });
    });
  }

  const app = view.app;
  let pickedScore = myRating?.score || null;

  app.querySelector('#score-pick')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-score]');
    if (!b) return;
    pickedScore = Number(b.dataset.score);
    app.querySelectorAll('[data-score]').forEach((x) => {
      const on = x === b;
      x.classList.toggle('bg-sage-500', on);
      x.classList.toggle('text-white', on);
      x.classList.toggle('border-sage-500', on);
    });
  });

  app.querySelectorAll('[data-check]').forEach((cb) =>
    cb.addEventListener('change', () => {
      const c = getChecks(r.id);
      c[cb.dataset.check] = cb.checked;
      setChecks(r.id, c);
      reload(true);
    }),
  );

  onAction(app, {
    cooked: (el) => openCooked(el),
    nutrition: (el) => {
      el.innerHTML = '<span class="animate-spin inline-block">🥄</span> מחשבים...';
      el.disabled = true;
      busy(null, async () => {
        try {
          data.nutrition = await analyzeNutrition(ctx.token, r.id);
          toast('הערכים חושבו ✨');
          await reload(true);
        } finally {
          if (el.isConnected) { el.disabled = false; el.textContent = '✨ לחשב עכשיו'; }
        }
      });
    },
    'nut-scope': (el) => {
      ui.nutScope = el.dataset.scope;
      reload(true);
    },
    'del-cook': async (el) => {
      if (!(await confirmDialog('למחוק את ההכנה הזו מההיסטוריה?'))) return;
      busy(null, async () => {
        await rpc('delete_cook', { p_token: ctx.token, p_id: el.dataset.id });
        await reload();
      });
    },
    'shop-mode': () => {
      ui.shopMode = !ui.shopMode;
      reload(true);
    },
    'reset-checks': () => {
      setChecks(r.id, {});
      reload(true);
    },
    whatsapp: () => {
      const lines = [];
      let lastHeader = null;
      for (const it of ingredientItems) {
        if (it.header) lastHeader = it.text;
        else if (!checks[it.i]) {
          if (lastHeader) {
            lines.push(`\n*${lastHeader}*`);
            lastHeader = null;
          }
          lines.push(`▫️ ${it.text}`);
        }
      }
      const text = `🛒 *רשימת קניות: ${r.title}*\n${lines.join('\n').trim()}\n\n_מספר המתכונים של ${house.name}_ ${house.emoji}`;
      window.open(whatsappUrl(text), '_blank');
    },
    step: (el) => {
      const i = Number(el.dataset.index);
      ui.doneSteps.has(i) ? ui.doneSteps.delete(i) : ui.doneSteps.add(i);
      reload(true);
    },
    lightbox: (el) => openLightbox(r.images, Number(el.dataset.index)),
    print: () => window.print(),
    share: () => openShare(r, house),
    delete: async () => {
      if (!(await confirmDialog(`למחוק את "${esc(r.title)}"? <br><span class="text-sm text-cocoa-500">המתכון יעבור לסל המיחזור לשלושים יום, ואפשר לשחזר אותו משם (בהגדרות).</span>`))) return;
      await busy(null, async () => {
        await rpc('delete_recipe', { p_token: ctx.token, p_recipe_id: r.id });
        toast('המתכון הועבר לסל המיחזור 🗑️', 'ok', {
          label: 'ביטול',
          onClick: async () => {
            await rpc('restore_recipe', { p_token: ctx.token, p_recipe_id: r.id });
            toast('המתכון חזר ✓');
            location.hash = `${ctx.base}/r/${r.id}`;
          },
        });
        location.hash = ctx.base;
      });
    },
    'save-rating': (el) => {
      if (!pickedScore) return toast('בחרו ציון מ-1 עד 10 👆', 'error');
      busy(el, async () => {
        await rpc('rate_recipe', { p_token: ctx.token, p_recipe_id: r.id, p_score: pickedScore, p_note: $('#rate-note', app).value });
        toast(pickedScore >= 8 ? 'נשמר! נשמע שזה מנצח 🏆' : 'הדירוג נשמר ✓');
        await reload();
      });
    },
    'clear-rating': (el) =>
      busy(el, async () => {
        await rpc('rate_recipe', { p_token: ctx.token, p_recipe_id: r.id, p_score: null, p_note: null });
        await reload();
      }),
    'del-variation': async (el) => {
      if (!(await confirmDialog('למחוק את הגרסה הזו?'))) return;
      busy(null, async () => {
        await rpc('delete_variation', { p_token: ctx.token, p_id: el.dataset.id });
        await reload();
      });
    },
    pin: (el) =>
      busy(el, async () => {
        await rpc('pin_comment', { p_token: ctx.token, p_id: el.dataset.id, p_pinned: el.dataset.pinned !== 'true' });
        await reload();
      }),
    'del-comment': async (el) => {
      if (!(await confirmDialog('למחוק את ההערה הזו מהיומן?'))) return;
      busy(null, async () => {
        await rpc('delete_comment', { p_token: ctx.token, p_id: el.dataset.id });
        await reload();
      });
    },
  });

  $('#variation-form', app).addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (fd.get('author')) setGuestName(fd.get('author'));
    busy(e.target.querySelector('button'), async () => {
      await rpc('add_variation', {
        p_token: ctx.token, p_recipe_id: r.id, p_title: fd.get('title'), p_body: fd.get('body'), p_author_name: fd.get('author') || null,
      });
      toast('הגרסה נוספה! 🌟');
      await reload();
    });
  });

  $('#comment-form', app).addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (fd.get('author')) setGuestName(fd.get('author'));
    busy(e.target.querySelector('button'), async () => {
      await rpc('add_comment', { p_token: ctx.token, p_recipe_id: r.id, p_body: fd.get('body'), p_author_name: fd.get('author') || null });
      await reload();
    });
  });
}

function openShare(r, house) {
  const link = shareLinks.recipe(r.share_token);
  const text = `${house.emoji} מתכון ל${r.title}, מספר המתכונים של ${house.name}:\n${link}`;
  const { el } = modal(`
    <h2 class="mb-1 text-2xl">שיתוף המתכון 🔗</h2>
    <p class="mb-4 text-sm text-cocoa-500">מי שיקבל את הקישור יראה רק את המתכון הזה (ויוכל להוסיף הערות וגרסאות), בלי שאר הבית.</p>
    <div class="mb-3 flex gap-2">
      <input class="input text-left text-sm" dir="ltr" readonly value="${esc(link)}">
      <button class="btn-soft shrink-0" data-copy>העתקה</button>
    </div>
    <a class="btn w-full bg-[#25D366] text-white hover:bg-[#1FB457]" target="_blank" href="${esc(whatsappUrl(text))}">💬 שליחה בוואטסאפ</a>`);
  el.querySelector('[data-copy]').addEventListener('click', () => copyText(link));
}

function openLightbox(images, start) {
  let i = start;
  const { el } = modal(`
    <div class="relative">
      <img data-img class="max-h-[75vh] w-full rounded-2xl object-contain" alt="">
      ${images.length > 1 ? `
        <button data-prev class="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-xl shadow-soft">→</button>
        <button data-next class="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 px-3 py-2 text-xl shadow-soft">←</button>` : ''}
    </div>
    <div class="mt-3 flex items-center justify-between text-sm text-cocoa-500">
      <span data-count></span><button class="btn-soft btn-sm" data-close>סגירה</button>
    </div>`, { wide: true });
  const show = () => {
    el.querySelector('[data-img]').src = imageUrl(images[i].path);
    el.querySelector('[data-count]').textContent = `${i + 1} / ${images.length}`;
  };
  el.querySelector('[data-prev]')?.addEventListener('click', () => { i = (i - 1 + images.length) % images.length; show(); });
  el.querySelector('[data-next]')?.addEventListener('click', () => { i = (i + 1) % images.length; show(); });
  // החלקה בין תמונות בטלפון (בעברית: החלקה ימינה = הבאה)
  let startX = null;
  const img = el.querySelector('[data-img]');
  img.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
  img.addEventListener('touchend', (e) => {
    if (startX === null || images.length < 2) return;
    const dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) < 40) return;
    i = dx > 0 ? (i + 1) % images.length : (i - 1 + images.length) % images.length;
    show();
  });
  show();
}
