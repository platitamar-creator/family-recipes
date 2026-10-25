// הוספה ועריכה של מתכון (בני בית בלבד)
import { rpc, imageUrl, deleteImages } from '../api.js';
import { uploadImages } from '../images.js';
import { esc, loading, toast, showError, onAction, $, $$, DIFFICULTY } from '../ui.js';
import { topBar } from './common.js';

const MAX_IMAGES = 12;

// "מצרך בכל שורה. שורה שמסתיימת בנקודתיים היא כותרת"
const ingredientsToText = (list) => list.map((i) => (i.header ? `${i.text}:` : i.text)).join('\n');
function textToIngredients(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/[:׃]$/.test(l) && l.length > 1 ? { text: l.replace(/[:׃]$/, '').trim(), header: true } : { text: l.replace(/^[-•*▫️]\s*/u, '') }));
}

export async function renderEditor(view, ctx, recipeId) {
  view.app.innerHTML = loading(recipeId ? 'פותחים את המתכון לעריכה...' : 'מכינים דף חדש...');
  const [house, existing] = await Promise.all([
    rpc('get_house', { p_token: ctx.token }),
    recipeId ? rpc('get_recipe', { p_token: ctx.token, p_recipe_id: recipeId }) : null,
  ]);
  if (!view.isCurrent()) return;

  const r = existing?.recipe || { title: '', description: '', difficulty: 2, ingredients: [], steps: [{ text: '' }], images: [], tags: [] };
  const selectedTags = new Set(r.tags.map((t) => t.id));
  // תמונות: קיימות (path) או חדשות (file)
  let images = r.images.map((img) => ({ path: img.path, width: img.width, height: img.height }));
  const originalPaths = images.map((i) => i.path);
  let steps = r.steps.length ? r.steps.map((s) => s.text) : [''];
  let difficulty = r.difficulty;

  const backHref = recipeId ? `${ctx.base}/r/${recipeId}` : ctx.base;

  view.mount(`
    ${topBar({ back: backHref, backLabel: recipeId ? 'חזרה למתכון' : house.house.name })}
    <h1 class="mb-6 text-3xl">${recipeId ? '✏️ עריכת מתכון' : '✨ מתכון חדש'}</h1>

    <form id="recipe-form" class="space-y-5">
      <section class="card space-y-4 p-5">
        <div>
          <label class="label" for="f-title">שם המתכון *</label>
          <input id="f-title" class="input text-lg" maxlength="120" required value="${esc(r.title)}" placeholder="למשל: העוגה של סבתא רחל">
        </div>
        <div>
          <label class="label" for="f-desc">כמה מילים על המתכון</label>
          <textarea id="f-desc" class="input min-h-[80px]" maxlength="2000" placeholder="מאיפה הוא הגיע? למה כולם מבקשים אותו?">${esc(r.description)}</textarea>
        </div>
        <div>
          <span class="label">רמת קושי</span>
          <div class="grid grid-cols-5 gap-2" id="diff-pick">
            ${[1, 2, 3, 4, 5].map((n) => `
              <button type="button" data-diff="${n}" class="rounded-2xl border-2 p-2 text-center transition">
                <span class="block text-lg">${'🥄'.repeat(n)}</span>
                <span class="block text-xs">${DIFFICULTY[n].short}</span>
              </button>`).join('')}
          </div>
          <p id="diff-label" class="mt-1.5 text-sm text-cocoa-500"></p>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div><label class="label" for="f-prep">הכנה (דקות)</label><input id="f-prep" type="number" min="0" max="10000" inputmode="numeric" class="input" value="${r.prep_minutes ?? ''}"></div>
          <div><label class="label" for="f-cook">בישול (דקות)</label><input id="f-cook" type="number" min="0" max="10000" inputmode="numeric" class="input" value="${r.cook_minutes ?? ''}"></div>
          <div><label class="label" for="f-serv">כמות</label><input id="f-serv" class="input" maxlength="40" value="${esc(r.servings ?? '')}" placeholder="6 מנות"></div>
        </div>
      </section>

      <section class="card p-5">
        <h2 class="section-title mb-1">📸 תמונות</h2>
        <p class="mb-3 text-sm text-cocoa-500">התמונה הראשונה תהיה תמונת השער. אפשר לסדר עם החצים.</p>
        <div id="images" class="grid grid-cols-3 gap-3 sm:grid-cols-4"></div>
        <input id="f-files" type="file" accept="image/*" multiple class="hidden">
      </section>

      <section class="card p-5">
        <h2 class="section-title mb-1">🧺 מצרכים</h2>
        <p class="mb-3 text-sm text-cocoa-500">כל מצרך בשורה נפרדת. שורה שמסתיימת בנקודתיים היא כותרת, למשל <b>לרוטב:</b></p>
        <textarea id="f-ingr" class="input min-h-[180px] leading-relaxed" placeholder="2 כוסות קמח&#10;1 כוס סוכר&#10;3 ביצים&#10;&#10;לציפוי:&#10;100 גרם שוקולד מריר">${esc(ingredientsToText(r.ingredients))}</textarea>
      </section>

      <section class="card p-5">
        <h2 class="section-title mb-3">👩‍🍳 שלבי הכנה</h2>
        <div id="steps" class="space-y-2"></div>
        <button type="button" data-action="add-step" class="btn-soft btn-sm mt-3">➕ עוד שלב</button>
      </section>

      <section class="card p-5">
        <h2 class="section-title mb-1">🏷️ תגיות</h2>
        <p class="mb-3 text-sm text-cocoa-500">עוזרות למצוא את המתכון בחיפוש. <a href="${ctx.base}/tags" class="text-spice-600 underline">ניהול תגיות</a></p>
        <div class="space-y-3">
          ${house.tag_groups.filter((g) => g.tags.length).map((g) => `
            <div class="flex flex-wrap items-center gap-2">
              <span class="ml-1 w-full text-sm font-medium text-cocoa-500 sm:w-28">${esc(g.icon)} ${esc(g.name)}</span>
              ${g.tags.map((t) => `<button type="button" class="chip-toggle ${selectedTags.has(t.id) ? 'is-on' : ''}" data-tag="${esc(t.id)}">${esc(t.name)}</button>`).join('')}
            </div>`).join('') || '<p class="text-cocoa-500">אין עדיין תגיות.</p>'}
        </div>
      </section>

      <div class="sticky bottom-3 z-10 flex gap-2 rounded-3xl bg-cream-100/90 p-2 backdrop-blur">
        <button type="submit" id="save" class="btn-primary flex-1 py-3 text-lg">${recipeId ? 'שמירת השינויים 💾' : 'הוספה לספר המתכונים 📖'}</button>
        <a href="${backHref}" class="btn-soft py-3">ביטול</a>
      </div>
    </form>`);

  const app = view.app;

  function drawDifficulty() {
    $$('[data-diff]', app).forEach((b) => {
      const on = Number(b.dataset.diff) === difficulty;
      b.className = `rounded-2xl border-2 p-2 text-center transition ${on ? 'border-spice-500 bg-spice-100 text-spice-700' : 'border-cream-200 bg-white hover:border-spice-200'}`;
    });
    $('#diff-label', app).textContent = DIFFICULTY[difficulty].label;
  }

  function drawImages() {
    const box = $('#images', app);
    box.innerHTML = images.map((img, i) => `
      <div class="group relative aspect-square overflow-hidden rounded-2xl bg-cream-200 shadow-soft">
        <img src="${esc(img.file ? img.preview : imageUrl(img.path))}" class="h-full w-full object-cover" alt="">
        ${i === 0 ? '<span class="absolute right-1.5 top-1.5 rounded-full bg-spice-500 px-2 py-0.5 text-[10px] text-white">שער</span>' : ''}
        <div class="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/50 to-transparent p-1.5">
          <span class="flex gap-1">
            ${i > 0 ? `<button type="button" data-action="img-left" data-i="${i}" class="h-7 w-7 rounded-full bg-white/90 text-sm">→</button>` : ''}
            ${i < images.length - 1 ? `<button type="button" data-action="img-right" data-i="${i}" class="h-7 w-7 rounded-full bg-white/90 text-sm">←</button>` : ''}
          </span>
          <button type="button" data-action="img-del" data-i="${i}" class="h-7 w-7 rounded-full bg-white/90 text-sm" title="הסרה">🗑️</button>
        </div>
      </div>`).join('') + (images.length < MAX_IMAGES ? `
      <button type="button" data-action="img-add" class="flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-spice-300 bg-spice-100/40 text-spice-700 transition hover:bg-spice-100">
        <span class="text-3xl">📷</span><span class="text-xs font-medium">הוספת תמונות</span>
      </button>` : '');
  }

  function drawSteps() {
    $('#steps', app).innerHTML = steps.map((s, i) => `
      <div class="flex items-start gap-2">
        <span class="mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-spice-100 font-display text-spice-700">${i + 1}</span>
        <textarea data-step="${i}" class="input min-h-[64px]" maxlength="3000" placeholder="${i === 0 ? 'מחממים תנור ל-180 מעלות...' : 'ואז...'}">${esc(s)}</textarea>
        <button type="button" data-action="del-step" data-i="${i}" class="mt-2 p-2 text-cocoa-300 hover:text-berry-500" title="מחיקת שלב">✕</button>
      </div>`).join('');
  }

  drawDifficulty();
  drawImages();
  drawSteps();

  $('#diff-pick', app).addEventListener('click', (e) => {
    const b = e.target.closest('[data-diff]');
    if (b) {
      difficulty = Number(b.dataset.diff);
      drawDifficulty();
    }
  });

  $('#steps', app).addEventListener('input', (e) => {
    if (e.target.dataset.step !== undefined) steps[Number(e.target.dataset.step)] = e.target.value;
  });

  app.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tag]');
    if (!t) return;
    selectedTags.has(t.dataset.tag) ? selectedTags.delete(t.dataset.tag) : selectedTags.add(t.dataset.tag);
    t.classList.toggle('is-on');
  });

  $('#f-files', app).addEventListener('change', (e) => {
    const files = [...e.target.files].slice(0, MAX_IMAGES - images.length);
    files.forEach((file) => images.push({ file, preview: URL.createObjectURL(file) }));
    if (e.target.files.length > files.length) toast(`אפשר עד ${MAX_IMAGES} תמונות למתכון 📸`, 'error');
    e.target.value = '';
    drawImages();
  });

  const move = (i, d) => {
    [images[i], images[i + d]] = [images[i + d], images[i]];
    drawImages();
  };

  onAction(app, {
    'img-add': () => $('#f-files', app).click(),
    'img-left': (el) => move(Number(el.dataset.i), -1),
    'img-right': (el) => move(Number(el.dataset.i), 1),
    'img-del': (el) => {
      images.splice(Number(el.dataset.i), 1);
      drawImages();
    },
    'add-step': () => {
      steps.push('');
      drawSteps();
      $$('[data-step]', app).at(-1).focus();
    },
    'del-step': (el) => {
      steps.splice(Number(el.dataset.i), 1);
      if (!steps.length) steps = [''];
      drawSteps();
    },
  });

  $('#recipe-form', app).addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#save', app);
    const label = btn.innerHTML;
    btn.disabled = true;
    try {
      const newOnes = images.filter((i) => i.file);
      if (newOnes.length) {
        btn.innerHTML = `מעלים תמונות... 0/${newOnes.length} 📸`;
        const uploaded = await uploadImages(ctx.token, newOnes.map((i) => i.file), (done, total) => {
          btn.innerHTML = `מעלים תמונות... ${done}/${total} 📸`;
        });
        newOnes.forEach((img, k) => Object.assign(img, uploaded[k], { file: null }));
      }
      btn.innerHTML = 'שומרים... 🥄';
      const id = await rpc('save_recipe', {
        p_token: ctx.token,
        p_data: {
          id: recipeId,
          title: $('#f-title', app).value,
          description: $('#f-desc', app).value,
          difficulty,
          prep_minutes: $('#f-prep', app).value,
          cook_minutes: $('#f-cook', app).value,
          servings: $('#f-serv', app).value,
          ingredients: textToIngredients($('#f-ingr', app).value),
          steps: steps.map((s) => s.trim()).filter(Boolean).map((text) => ({ text })),
          tag_ids: [...selectedTags],
          images: images.map(({ path, width, height }) => ({ path, width, height })),
        },
      });
      const kept = new Set(images.map((i) => i.path));
      await deleteImages(ctx.token, originalPaths.filter((p) => !kept.has(p)));
      toast(recipeId ? 'נשמר! 💾' : 'המתכון נכנס לספר! 🎉');
      location.hash = `${ctx.base}/r/${id}`;
    } catch (err) {
      showError(err);
      btn.disabled = false;
      btn.innerHTML = label;
    }
  });
}
