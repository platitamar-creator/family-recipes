// רשימת קניות לכמה מתכונים יחד: מאוחדת (מצרכים זהים מתחברים) או לפי מתכון, עם סימון "יש לי" ושליחה בוואטסאפ
import { rpcCached } from '../api.js';
import { esc, loading, toast, copyText, whatsappUrl, onAction, $ } from '../ui.js';
import { topBar } from './common.js';
import { mergeIngredients } from '../shopping.js';
import { setPicked } from './house.js';

const FACTORS = [0.5, 1, 2, 3];
const factorLabel = (f) => ({ 0.5: '½', 1: '×1', 2: '×2', 3: '×3' })[f];

function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}
function save(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* כלום */
  }
}

export async function renderShop(view, ctx, idsText) {
  view.app.innerHTML = loading('אוספים את כל המצרכים לסל...');
  const data = await rpcCached('get_house', { p_token: ctx.token });
  if (!view.isCurrent()) return;

  const ids = [...new Set((idsText || '').split(',').filter(Boolean))];
  const recipes = ids.map((id) => data.recipes.find((r) => r.id === id)).filter(Boolean);
  const storeKey = `frb.shop.${ctx.token.slice(0, 8)}.${[...ids].sort().join(',').slice(0, 300)}`;
  const st = { mode: 'merged', have: {}, factors: {}, ...load(storeKey) };
  const persist = () => save(storeKey, st);
  const href = (list) => `${ctx.base}/shop/${list.join(',')}`;

  function lists() {
    const withFactor = recipes.map((r) => ({ ...r, factor: st.factors[r.id] || 1 }));
    const merged = mergeIngredients(withFactor).map((g) => ({ id: `m:${g.key}`, label: g.label, items: g.items }));
    const byRecipe = withFactor.map((r) => ({
      recipe: r,
      lines: mergeIngredients([r]).map((g) => ({ id: `r:${r.id}:${g.key}`, label: g.label, items: g.items })),
    }));
    return { merged, byRecipe };
  }

  function lineHtml(l, showSources) {
    const have = !!st.have[l.id];
    const sources = showSources && recipes.length > 1
      ? [...new Set(l.items.map((i) => i.recipe))].join(' · ')
      : '';
    return `<li><label class="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-1.5 hover:bg-cream-100">
      <input type="checkbox" data-have="${esc(l.id)}" ${have ? 'checked' : ''} class="mt-1 h-5 w-5 shrink-0 accent-sage-500">
      <span class="min-w-0 ${have ? 'text-cocoa-300 line-through' : ''}">
        <span class="text-wrap-any">${esc(l.label)}</span>
        ${sources ? `<span class="block text-xs text-cocoa-500">${esc(sources)}</span>` : ''}
      </span></label></li>`;
  }

  function draw() {
    const { merged, byRecipe } = lists();
    const all = st.mode === 'merged' ? merged : byRecipe.flatMap((x) => x.lines);
    const missing = all.filter((l) => !st.have[l.id]).length;

    view.mount(`
      ${topBar({ back: ctx.base, backLabel: data.house.name })}
      <h1 class="mb-2 text-3xl">🛒 רשימת קניות משותפת</h1>
      <p class="mb-5 text-cocoa-500">סמנו מה כבר יש בבית, ושלחו את השאר לוואטסאפ.</p>

      ${!recipes.length ? `<div class="card p-8 text-center">
          <div class="mb-3 text-5xl">🧺</div>
          <p class="mb-4 text-cocoa-500">עוד לא נבחרו מתכונים.</p>
          <a href="${ctx.base}" data-action="pick-more" class="btn-primary">בחירת מתכונים</a></div>` : `

      <section class="card mb-5 p-4">
        <h2 class="section-title mb-3">המתכונים (${recipes.length})</h2>
        <ul class="space-y-2">
          ${recipes.map((r) => `<li class="flex flex-wrap items-center gap-2">
            <a href="${ctx.base}/r/${r.id}" class="min-w-0 flex-1 font-medium hover:text-spice-600 text-wrap-any">${esc(r.title)}</a>
            <span class="flex overflow-hidden rounded-full border-2 border-cream-200 text-sm" title="כמה מנות להכין">
              ${FACTORS.map((f) => `<button data-action="factor" data-id="${r.id}" data-f="${f}" class="px-2 py-0.5 ${(st.factors[r.id] || 1) === f ? 'bg-spice-500 text-white' : 'bg-white hover:bg-cream-100'}">${factorLabel(f)}</button>`).join('')}
            </span>
            <button data-action="remove" data-id="${r.id}" class="p-1 text-cocoa-300 hover:text-berry-500" title="הסרה מהרשימה">✕</button>
          </li>`).join('')}
        </ul>
        <a href="${ctx.base}" data-action="pick-more" class="btn-ghost btn-sm mt-3">➕ להוסיף עוד מתכונים</a>
      </section>

      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div class="flex overflow-hidden rounded-full border-2 border-cream-200 text-sm">
          <button data-action="mode" data-mode="merged" class="px-3 py-1 ${st.mode === 'merged' ? 'bg-spice-500 text-white' : 'bg-white'}">🧺 מאוחד</button>
          <button data-action="mode" data-mode="recipe" class="px-3 py-1 ${st.mode === 'recipe' ? 'bg-spice-500 text-white' : 'bg-white'}">📖 לפי מתכון</button>
        </div>
        <span class="text-sm text-cocoa-500">חסרים ${missing} מתוך ${all.length}</span>
      </div>

      <section class="card mb-5 p-3">
        ${st.mode === 'merged'
          ? `<ul>${merged.map((l) => lineHtml(l, true)).join('')}</ul>`
          : byRecipe.map((x) => `<h3 class="mb-1 mt-3 px-2 font-display text-lg first:mt-0">${esc(x.recipe.title)}${x.recipe.factor !== 1 ? ` <span class="text-sm text-spice-600">${factorLabel(x.recipe.factor)}</span>` : ''}</h3>
              <ul>${x.lines.map((l) => lineHtml(l, false)).join('') || '<li class="px-2 text-sm text-cocoa-500">אין מצרכים רשומים</li>'}</ul>`).join('')}
      </section>

      <div class="sticky bottom-3 z-10 flex gap-2 rounded-3xl bg-cream-100/90 p-2 backdrop-blur no-print">
        <button data-action="whatsapp" class="btn flex-1 bg-[#25D366] text-white hover:bg-[#1FB457]" ${missing ? '' : 'disabled'}>💬 שליחה לוואטסאפ (${missing})</button>
        <button data-action="copy" class="btn-soft" title="העתקה">📋</button>
        <button data-action="reset" class="btn-soft" title="איפוס הסימונים">↺</button>
      </div>`}`);

    view.app.addEventListener('change', (e) => {
      const id = e.target.dataset.have;
      if (id === undefined) return;
      if (e.target.checked) st.have[id] = 1;
      else delete st.have[id];
      persist();
      draw();
    });

    onAction(view.app, {
      mode: (el) => {
        st.mode = el.dataset.mode === 'recipe' ? 'recipe' : 'merged';
        persist();
        draw();
      },
      factor: (el) => {
        st.factors[el.dataset.id] = Number(el.dataset.f);
        persist();
        draw();
      },
      remove: (el) => {
        location.hash = href(ids.filter((id) => id !== el.dataset.id));
      },
      'pick-more': () => {
        setPicked(ctx.token, ids);
        location.hash = ctx.base;
      },
      reset: () => {
        st.have = {};
        persist();
        draw();
      },
      whatsapp: () => window.open(whatsappUrl(text()), '_blank'),
      copy: () => copyText(text()).then(() => toast('הרשימה הועתקה 📋')),
    });
  }

  function text() {
    const { merged, byRecipe } = lists();
    const titles = recipes.map((r) => r.title + (st.factors[r.id] && st.factors[r.id] !== 1 ? ` (${factorLabel(st.factors[r.id])})` : '')).join(', ');
    const head = `🛒 רשימת קניות\nבשביל: ${titles}\n`;
    if (st.mode === 'merged') {
      return head + '\n' + merged.filter((l) => !st.have[l.id]).map((l) => `▫️ ${l.label}`).join('\n');
    }
    return head + byRecipe.map((x) => {
      const lines = x.lines.filter((l) => !st.have[l.id]);
      return lines.length ? `\n*${x.recipe.title}*\n${lines.map((l) => `▫️ ${l.label}`).join('\n')}` : '';
    }).join('\n');
  }

  draw();
}
