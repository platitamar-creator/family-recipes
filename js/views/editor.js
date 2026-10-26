// הוספה ועריכה של מתכון (בני בית בלבד)
import { rpc, deleteImages, thumbImg, importRecipe } from '../api.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';
import { uploadImages } from '../images.js';
import { esc, loading, toast, showError, onAction, modal, busy, confirmDialog, avatar, $, $$, DIFFICULTY, TAG_COLORS } from '../ui.js';
import { topBar } from './common.js';

const MAX_IMAGES = 12;

// טיוטות: כל שינוי נשמר, כדי שמעבר לניהול תגיות (או רענון של הדף) לא ימחק את מה שהקלדתם.
// תמונות חדשות נשמרות רק בזיכרון של הלשונית (אי אפשר לשמור קבצים ב-sessionStorage).
const drafts = new Map();
const draftKey = (ctx, recipeId) => `frb.draft.${ctx.houseId}.${recipeId || 'new'}`;

function loadDraft(key) {
  if (drafts.has(key)) return drafts.get(key);
  try {
    const d = JSON.parse(sessionStorage.getItem(key));
    if (d) d.images = d.images.filter((i) => i.path);
    return d;
  } catch {
    return null;
  }
}

function storeDraft(key, d) {
  drafts.set(key, d);
  try {
    sessionStorage.setItem(key, JSON.stringify({ ...d, images: d.images.filter((i) => i.path) }));
  } catch {
    /* אין מקום או גלישה פרטית: נשאר רק בזיכרון */
  }
}

export function clearDraft(key) {
  drafts.delete(key);
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* כלום */
  }
}

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

  const r = existing?.recipe || { title: '', description: '', difficulty: 2, ingredients: [], steps: [{ text: '' }], images: [], tags: [], source_url: '' };
  const key = draftKey(ctx, recipeId);
  const allTagIds = new Set(house.tag_groups.flatMap((g) => g.tags.map((t) => t.id)));
  const draft = loadDraft(key);

  // מצב הטופס: מהטיוטה אם יש, אחרת מהמתכון
  const d = draft || {
    title: r.title,
    description: r.description,
    difficulty: r.difficulty,
    prep: r.prep_minutes ?? '',
    cook: r.cook_minutes ?? '',
    servings: r.servings ?? '',
    servings_count: r.servings_count ?? '',
    // מתי המתכון נשמר לאחרונה כשהתחלנו לערוך (לזיהוי שמירה של מישהו אחר בינתיים)
    baseUpdatedAt: r.updated_at ?? null,
    source_url: r.source_url ?? '',
    ingredients: ingredientsToText(r.ingredients),
    steps: r.steps.length ? r.steps.map((s) => s.text) : [''],
    tags: r.tags.map((t) => t.id),
    // תמונות: קיימות (path) או חדשות (file)
    images: r.images.map((img) => ({ path: img.path, width: img.width, height: img.height })),
    originalPaths: r.images.map((img) => img.path),
  };
  const selectedTags = new Set(d.tags.filter((id) => allTagIds.has(id)));
  let images = d.images;
  const originalPaths = d.originalPaths;
  let steps = d.steps.length ? d.steps : [''];
  let difficulty = d.difficulty;

  const backHref = recipeId ? `${ctx.base}/r/${recipeId}` : ctx.base;

  view.mount(`
    ${topBar({ back: backHref, backLabel: recipeId ? 'חזרה למתכון' : house.house.name })}
    <h1 class="mb-6 text-3xl">${recipeId ? '✏️ עריכת מתכון' : '✨ מתכון חדש'}</h1>
    <div id="editing-banner"></div>
    ${draft ? `<div class="mb-5 flex items-center justify-between gap-3 rounded-2xl bg-honey-100 px-4 py-3 text-sm">
      <span>📝 המשכנו מאיפה שעצרת. כל מה שהקלדת נשמר.</span>
      <button type="button" data-action="discard-draft" class="btn-ghost btn-sm shrink-0">להתחיל מחדש</button>
    </div>` : ''}

    ${recipeId ? '' : `
    <section class="card mb-5 border-2 border-dashed border-honey-300 p-5">
      <h2 class="section-title mb-1">✨ יש לכם מתכון בקישור או בהודעה?</h2>
      <p class="mb-3 text-sm text-cocoa-500">הדביקו קישור (אתר, אינסטגרם, יוטיוב) או את הטקסט של המתכון, למשל הודעה מוואטסאפ. ה-AI ימלא את הטופס, ואתם רק בודקים ושומרים.</p>
      <textarea id="import-input" class="input min-h-[72px]" dir="auto" placeholder="https://... או הדביקו כאן טקסט של מתכון"></textarea>
      <div class="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" data-action="import" class="btn-primary">✨ למלא לי את הטופס</button>
        <span class="text-xs text-cocoa-500">לוקח בדרך כלל 10–30 שניות</span>
      </div>
    </section>`}
    ${d.importNotes ? `<div class="mb-5 rounded-2xl bg-sage-100 px-4 py-3 text-sm text-sage-700">
      ✨ מילאנו את הטופס מהמקור. כדאי לעבור ולבדוק לפני השמירה.<br><b>שימו לב:</b> ${esc(d.importNotes)}</div>` : ''}

    <form id="recipe-form" class="space-y-5">
      <section class="card space-y-4 p-5">
        <div>
          <label class="label" for="f-title">שם המתכון *</label>
          <input id="f-title" class="input text-lg" maxlength="120" required value="${esc(d.title)}" placeholder="למשל: העוגה של סבתא רחל">
        </div>
        <div>
          <label class="label" for="f-desc">כמה מילים על המתכון</label>
          <textarea id="f-desc" class="input min-h-[80px]" maxlength="2000" placeholder="מאיפה הוא הגיע? למה כולם מבקשים אותו?">${esc(d.description)}</textarea>
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
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><label class="label" for="f-prep">הכנה (דקות)</label><input id="f-prep" type="number" min="0" max="10000" inputmode="numeric" class="input" value="${esc(d.prep)}"></div>
          <div><label class="label" for="f-cook">בישול (דקות)</label><input id="f-cook" type="number" min="0" max="10000" inputmode="numeric" class="input" value="${esc(d.cook)}"></div>
          <div><label class="label" for="f-count">מספר מנות</label><input id="f-count" type="number" min="1" max="200" inputmode="numeric" class="input" value="${esc(d.servings_count ?? '')}" placeholder="4"></div>
          <div><label class="label" for="f-serv">גודל / הערה</label><input id="f-serv" class="input" maxlength="40" value="${esc(d.servings)}" placeholder="תבנית 24×34"></div>
        </div>
        <p class="-mt-2 text-xs text-cocoa-500">"מספר מנות" משמש לחישוב ערכים ומחיר למנה.</p>
        <div>
          <label class="label" for="f-link">🔗 קישור למתכון באינטרנט (לא חובה)</label>
          <input id="f-link" type="text" inputmode="url" autocomplete="off" spellcheck="false" dir="ltr" class="input text-left" maxlength="1000" value="${esc(d.source_url)}" placeholder="https://...">
          <p class="mt-1 text-xs text-cocoa-500">מצאתם מתכון באתר? אפשר לשמור רק את השם והקישור, ולהשלים את השאר מתי שבא לכם.</p>
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
        <textarea id="f-ingr" class="input min-h-[180px] leading-relaxed" placeholder="2 כוסות קמח&#10;1 כוס סוכר&#10;3 ביצים&#10;&#10;לציפוי:&#10;100 גרם שוקולד מריר">${esc(d.ingredients)}</textarea>
      </section>

      <section class="card p-5">
        <h2 class="section-title mb-3">👩‍🍳 שלבי הכנה</h2>
        <div id="steps" class="space-y-2"></div>
        <button type="button" data-action="add-step" class="btn-soft btn-sm mt-3">➕ עוד שלב</button>
      </section>

      <section class="card p-5">
        <h2 class="section-title mb-1">🏷️ תגיות</h2>
        <p class="mb-3 text-sm text-cocoa-500">עוזרות למצוא את המתכון בחיפוש.</p>
        <div class="space-y-3">
          ${house.tag_groups.filter((g) => g.tags.length).map((g) => `
            <div class="flex flex-wrap items-center gap-2">
              <span class="ml-1 w-full text-sm font-medium text-cocoa-500 sm:w-28">${esc(g.icon)} ${esc(g.name)}</span>
              ${g.tags.map((t) => `<button type="button" class="chip-toggle ${selectedTags.has(t.id) ? 'is-on' : ''}" data-tag="${esc(t.id)}">${esc(t.name)}</button>`).join('')}
            </div>`).join('') || '<p class="text-cocoa-500">אין עדיין תגיות.</p>'}
        </div>
        <div class="mt-4 flex flex-wrap gap-2 border-t border-cream-200 pt-3">
          <button type="button" data-action="new-tag" class="btn-soft btn-sm">➕ תגית חדשה</button>
          <a href="${ctx.base}/tags" data-action="manage-tags" class="btn-ghost btn-sm">🏷️ ניהול תגיות <span class="text-xs text-cocoa-500">(המתכון יישמר כטיוטה)</span></a>
        </div>
      </section>

      <div class="sticky bottom-3 z-10 flex gap-2 rounded-3xl bg-cream-100/90 p-2 backdrop-blur">
        <button type="submit" id="save" class="btn-primary flex-1 py-3 text-lg">${recipeId ? 'שמירת השינויים 💾' : 'הוספה לספר המתכונים 📖'}</button>
        <a href="${backHref}" data-action="cancel" class="btn-soft py-3">ביטול</a>
      </div>
    </form>`);

  const app = view.app;

  // ---------- "מישהו עורך עכשיו" ----------
  // כל דקה מודיעים לשרת שאנחנו עורכים, ומקבלים מי עוד עורך את אותו מתכון
  if (recipeId) {
    const ping = async () => {
      if (!app.isConnected) return stopPresence();
      try {
        const others = await rpc('start_editing', { p_token: ctx.token, p_recipe_id: recipeId });
        const banner = $('#editing-banner', app);
        if (banner) banner.innerHTML = others.length ? `
          <div class="mb-5 flex items-start gap-3 rounded-2xl border-2 border-honey-300 bg-honey-100 px-4 py-3 text-sm">
            <span class="text-xl">✋</span>
            <span><b>${others.map((o) => `${avatar(o.member, 6)} ${esc(o.member.name)}`).join(', ')}</b>
              ${others.length === 1 ? 'עורך/ת' : 'עורכים'} את המתכון הזה כרגע.<br>
              <span class="text-cocoa-700">כדאי לתאם ביניכם. אם שניכם תשמרו, נשאל לפני שנדרוס שינויים.</span></span>
          </div>` : '';
      } catch {
        /* לא קריטי */
      }
    };
    const timer = setInterval(ping, 60000);
    const stopPresence = () => {
      clearInterval(timer);
      window.removeEventListener('hashchange', onLeave);
      window.removeEventListener('pagehide', onLeave);
      // keepalive: הבקשה נשלחת גם אם הדף נסגר
      fetch(`${SUPABASE_URL}/rest/v1/rpc/stop_editing`, {
        method: 'POST',
        keepalive: true,
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_token: ctx.token, p_recipe_id: recipeId }),
      }).catch(() => {});
    };
    const onLeave = () => stopPresence();
    window.addEventListener('hashchange', onLeave);
    window.addEventListener('pagehide', onLeave);
    ping();
  }

  function drawDifficulty() {
    $$('[data-diff]', app).forEach((b) => {
      const on = Number(b.dataset.diff) === difficulty;
      b.className = `rounded-2xl border-2 p-2 text-center transition ${on ? 'border-spice-500 bg-spice-100 text-spice-700' : 'border-cream-200 bg-white hover:border-spice-200'}`;
    });
    $('#diff-label', app).textContent = DIFFICULTY[difficulty].label;
  }

  let drawImages = function () {
    const box = $('#images', app);
    box.innerHTML = images.map((img, i) => `
      <div class="group relative aspect-square overflow-hidden rounded-2xl bg-cream-200 shadow-soft">
        ${img.file ? `<img src="${esc(img.preview)}" class="h-full w-full object-cover" alt="">` : thumbImg(img.path, 'h-full w-full object-cover')}
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
  };

  function drawSteps() {
    $('#steps', app).innerHTML = steps.map((s, i) => `
      <div class="flex items-start gap-2">
        <span class="mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-spice-100 font-display text-spice-700">${i + 1}</span>
        <textarea data-step="${i}" class="input min-h-[64px]" maxlength="3000" placeholder="${i === 0 ? 'מחממים תנור ל-180 מעלות...' : 'ואז...'}">${esc(s)}</textarea>
        <button type="button" data-action="del-step" data-i="${i}" class="mt-2 p-2 text-cocoa-300 hover:text-berry-500" title="מחיקת שלב">✕</button>
      </div>`).join('');
  }

  // שמירת טיוטה אחרי כל שינוי (עד שיוצאים מהעריכה בשמירה, ביטול או התחלה מחדש)
  let finished = false;
  function saveDraft() {
    if (finished || !app.isConnected) return;
    storeDraft(key, {
      title: $('#f-title', app).value,
      description: $('#f-desc', app).value,
      difficulty,
      prep: $('#f-prep', app).value,
      cook: $('#f-cook', app).value,
      servings: $('#f-serv', app).value,
      servings_count: $('#f-count', app).value,
      baseUpdatedAt: d.baseUpdatedAt,
      source_url: $('#f-link', app).value,
      ingredients: $('#f-ingr', app).value,
      steps,
      tags: [...selectedTags],
      images,
      originalPaths,
      importNotes: d.importNotes,
    });
  }

  // ייבוא: ה-AI מחזיר טיוטה, שומרים אותה כטיוטה ופותחים את הטופס מחדש
  async function runImport(button) {
    const input = $('#import-input', app).value;
    if (!input.trim()) return toast('הדביקו קודם קישור או טקסט 📋', 'error');
    const filled = $('#f-title', app).value.trim() || $('#f-ingr', app).value.trim();
    if (filled && !(await confirmDialog('למלא את הטופס מחדש? מה שכתבתם בשם ובמצרכים יוחלף.', { ok: 'כן, למלא', danger: false }))) return;
    await busy(button, async () => {
      const r = await importRecipe(ctx.token, input);
      finished = true;
      storeDraft(key, {
        title: r.title,
        description: r.description,
        difficulty: r.difficulty || 2,
        prep: r.prep_minutes ?? '',
        cook: r.cook_minutes ?? '',
        servings: r.servings ?? '',
        servings_count: r.servings_count ?? '',
        baseUpdatedAt: d.baseUpdatedAt,
        source_url: r.source_url || $('#f-link', app).value,
        ingredients: ingredientsToText(r.ingredients),
        steps: r.steps.length ? r.steps : [''],
        tags: [...new Set([...selectedTags, ...r.tag_ids])],
        images: [...images, ...r.images].slice(0, MAX_IMAGES),
        originalPaths,
        importNotes: r.notes || '',
      });
      toast('הטופס מולא ✨ עברו ובדקו');
      await renderEditor(view, ctx, recipeId);
      window.scrollTo({ top: 0 });
    });
  }
  const _drawImages = drawImages;
  drawImages = () => {
    _drawImages();
    saveDraft();
  };

  drawDifficulty();
  _drawImages();
  drawSteps();
  // הטופס השתנה (הקלדה, בחירה) → טיוטה
  $('#recipe-form', app).addEventListener('input', saveDraft);
  $('#recipe-form', app).addEventListener('click', () => setTimeout(saveDraft, 0));

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
    'new-tag': () => openNewTag(),
    import: (el) => runImport(el),
    'manage-tags': () => {
      saveDraft();
      try {
        sessionStorage.setItem('frb.returnTo', location.hash);
      } catch {
        /* כלום */
      }
      location.hash = `${ctx.base}/tags`;
    },
    'discard-draft': () => {
      finished = true;
      clearDraft(key);
      renderEditor(view, ctx, recipeId);
    },
    cancel: () => {
      finished = true;
      clearDraft(key);
      location.hash = backHref;
    },
  });

  // תגית חדשה בלי לצאת מהמתכון
  function openNewTag() {
    const groups = house.tag_groups;
    let color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
    const { el, close } = modal(`
      <h2 class="mb-4 text-2xl">תגית חדשה 🏷️</h2>
      <form class="space-y-4">
        <div><label class="label">שם</label><input name="name" class="input" maxlength="40" required placeholder="למשל: ללא גלוטן"></div>
        <div><label class="label">קבוצה</label>
          <select name="group" class="input">
            ${groups.map((g) => `<option value="${esc(g.id)}">${esc(g.icon)} ${esc(g.name)}</option>`).join('')}
            <option value="__new">➕ קבוצה חדשה...</option>
          </select></div>
        <div data-new-group class="${groups.length ? 'hidden' : ''}"><label class="label">שם הקבוצה החדשה</label>
          <input name="groupName" class="input" maxlength="40" placeholder="למשל: מטבח, חגים"></div>
        <div><span class="label">צבע</span>
          <div class="flex flex-wrap gap-2" data-colors>
            ${TAG_COLORS.map((c) => `<button type="button" data-color="${c}" class="h-9 w-9 rounded-full border-2 ${c === color ? 'border-cocoa-700' : 'border-white'}" style="background:${c}"></button>`).join('')}
          </div></div>
        <div class="flex gap-2 pt-2">
          <button class="btn-primary flex-1" type="submit">הוספה וסימון במתכון</button>
          <button type="button" class="btn-soft" data-close>ביטול</button>
        </div>
      </form>`);
    const select = el.querySelector('[name=group]');
    if (!groups.length) select.value = '__new';
    select.addEventListener('change', () => el.querySelector('[data-new-group]').classList.toggle('hidden', select.value !== '__new'));
    el.querySelector('[data-colors]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-color]');
      if (!b) return;
      color = b.dataset.color;
      el.querySelectorAll('[data-color]').forEach((x) => {
        x.classList.toggle('border-cocoa-700', x === b);
        x.classList.toggle('border-white', x !== b);
      });
    });
    el.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      busy(e.target.querySelector('[type=submit]'), async () => {
        let groupId = fd.get('group');
        if (groupId === '__new') {
          groupId = await rpc('save_tag_group', { p_token: ctx.token, p_id: null, p_name: fd.get('groupName'), p_icon: '🏷️', p_sort: null });
        }
        const tagId = await rpc('save_tag', { p_token: ctx.token, p_id: null, p_group_id: groupId, p_name: fd.get('name'), p_color: color, p_sort: null });
        selectedTags.add(tagId);
        saveDraft();
        close();
        toast('התגית נוספה ✓');
        // טוענים מחדש עם הטיוטה, כדי שהתגית החדשה תופיע
        const y = window.scrollY;
        await renderEditor(view, ctx, recipeId);
        window.scrollTo({ top: y });
      });
    });
  }

  $('#recipe-form', app).addEventListener('submit', (e) => {
    e.preventDefault();
    save(false);
  });

  async function save(force) {
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
          servings_count: $('#f-count', app).value,
          ...(recipeId && d.baseUpdatedAt ? { expected_updated_at: d.baseUpdatedAt, force } : {}),
          source_url: $('#f-link', app).value,
          ingredients: textToIngredients($('#f-ingr', app).value),
          steps: steps.map((s) => s.trim()).filter(Boolean).map((text) => ({ text })),
          tag_ids: [...selectedTags],
          images: images.map(({ path, width, height }) => ({ path, width, height })),
        },
      });
      const kept = new Set(images.map((i) => i.path));
      await deleteImages(ctx.token, originalPaths.filter((p) => !kept.has(p)));
      finished = true;
      clearDraft(key);
      toast(recipeId ? 'נשמר! 💾' : 'המתכון נכנס לספר! 🎉');
      location.hash = `${ctx.base}/r/${id}`;
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = label;
      if (err.code === 'edit_conflict') {
        saveDraft();
        const mine = await confirmDialog(
          'מישהו אחר שמר שינויים במתכון בזמן שערכת ✋<br><span class="text-sm text-cocoa-500">אפשר לשמור את הגרסה שלך (היא תחליף את השינויים שלהם), או לוותר ולראות מה הם שמרו. הטיוטה שלך נשמרת בכל מקרה.</span>',
          { ok: 'לשמור את שלי', cancel: 'לראות את שלהם', danger: false },
        );
        if (mine) return save(true);
        location.hash = backHref;
        return;
      }
      showError(err);
    }
  }
}
