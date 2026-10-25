// ניהול תגיות: הוספה, שינוי ומחיקה של תגיות וקבוצות תגיות
import { rpc } from '../api.js';
import { esc, loading, modal, confirmDialog, onAction, busy, toast, $, TAG_COLORS } from '../ui.js';
import { topBar } from './common.js';

const GROUP_ICONS = ['🏷️', '🥛', '🌤️', '⏱️', '🍲', '🍽️', '🌍', '🎉', '👶', '🌱', '💪', '❤️', '🕯️', '🔥'];

export async function renderTags(view, ctx) {
  if (!view.app.querySelector('[data-tags-page]')) view.app.innerHTML = loading('מסדרים את המגירות...');
  const data = await rpc('get_house', { p_token: ctx.token });
  if (!view.isCurrent()) return;
  const groups = data.tag_groups;
  const reload = () => renderTags(view, ctx);

  const usage = {};
  data.recipes.forEach((r) => r.tag_ids.forEach((id) => (usage[id] = (usage[id] || 0) + 1)));

  view.mount(`
    <div data-tags-page>
    ${topBar({ back: ctx.base, backLabel: data.house.name })}
    <h1 class="mb-1 text-3xl">🏷️ ניהול תגיות</h1>
    <p class="mb-6 text-cocoa-500">התגיות מופיעות בחיפוש ובעריכת מתכון. אפשר להוסיף, לשנות שם וצבע, ולמחוק.</p>

    <div class="space-y-4">
      ${groups.map((g, gi) => `
        <section class="card p-5">
          <div class="mb-3 flex items-center justify-between gap-2">
            <h2 class="section-title"><span class="text-2xl">${esc(g.icon)}</span> ${esc(g.name)}</h2>
            <div class="flex gap-1">
              ${gi > 0 ? `<button data-action="group-up" data-i="${gi}" class="btn-ghost btn-sm" title="למעלה">⬆</button>` : ''}
              ${gi < groups.length - 1 ? `<button data-action="group-down" data-i="${gi}" class="btn-ghost btn-sm" title="למטה">⬇</button>` : ''}
              <button data-action="edit-group" data-id="${esc(g.id)}" class="btn-ghost btn-sm" title="עריכה">✏️</button>
              <button data-action="del-group" data-id="${esc(g.id)}" class="btn-ghost btn-sm" title="מחיקה">🗑️</button>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            ${g.tags.map((t) => `
              <button data-action="edit-tag" data-id="${esc(t.id)}" data-group="${esc(g.id)}" class="chip border-cream-200 transition hover:shadow-soft" style="background:${esc(t.color)}">
                ${esc(t.name)} <span class="text-xs text-cocoa-500">${usage[t.id] ? `(${usage[t.id]})` : ''}</span> <span class="text-xs opacity-50">✏️</span>
              </button>`).join('')}
            <button data-action="add-tag" data-group="${esc(g.id)}" class="chip border-dashed border-spice-300 text-spice-700 hover:bg-spice-100">➕ תגית</button>
          </div>
        </section>`).join('')}
    </div>

    <button data-action="add-group" class="btn-primary mt-5">➕ קבוצת תגיות חדשה</button>
    </div>`);

  const findTag = (id) => groups.flatMap((g) => g.tags).find((t) => t.id === id);
  const findGroup = (id) => groups.find((g) => g.id === id);

  function tagForm(tag, groupId) {
    let color = tag?.color || TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
    const { el, close } = modal(`
      <h2 class="mb-4 text-2xl">${tag ? 'עריכת תגית' : 'תגית חדשה'} 🏷️</h2>
      <form class="space-y-4">
        <div><label class="label">שם</label><input name="name" class="input" maxlength="40" required value="${esc(tag?.name || '')}" placeholder="למשל: ללא גלוטן"></div>
        <div><label class="label">קבוצה</label>
          <select name="group" class="input">${groups.map((g) => `<option value="${esc(g.id)}" ${g.id === groupId ? 'selected' : ''}>${esc(g.icon)} ${esc(g.name)}</option>`).join('')}</select></div>
        <div><span class="label">צבע</span>
          <div class="flex flex-wrap gap-2" data-colors>
            ${TAG_COLORS.map((c) => `<button type="button" data-color="${c}" class="h-9 w-9 rounded-full border-2 transition ${c === color ? 'border-cocoa-700 scale-110' : 'border-white'}" style="background:${c}"></button>`).join('')}
          </div></div>
        <div class="flex gap-2 pt-2">
          <button class="btn-primary flex-1" type="submit">שמירה</button>
          ${tag ? '<button type="button" class="btn-ghost text-berry-600" data-del>מחיקה</button>' : ''}
          <button type="button" class="btn-soft" data-close>ביטול</button>
        </div>
      </form>`);
    el.querySelector('[data-colors]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-color]');
      if (!b) return;
      color = b.dataset.color;
      el.querySelectorAll('[data-color]').forEach((x) => {
        x.classList.toggle('border-cocoa-700', x === b);
        x.classList.toggle('scale-110', x === b);
        x.classList.toggle('border-white', x !== b);
      });
    });
    el.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      busy(e.target.querySelector('[type=submit]'), async () => {
        await rpc('save_tag', { p_token: ctx.token, p_id: tag?.id || null, p_group_id: fd.get('group'), p_name: fd.get('name'), p_color: color, p_sort: null });
        close();
        toast('נשמר ✓');
        reload();
      });
    });
    el.querySelector('[data-del]')?.addEventListener('click', async () => {
      close();
      const n = usage[tag.id] || 0;
      if (!(await confirmDialog(`למחוק את התגית "${esc(tag.name)}"?${n ? `<br><span class="text-sm text-cocoa-500">היא תוסר מ-${n} מתכונים (המתכונים עצמם לא יימחקו).</span>` : ''}`))) return;
      busy(null, async () => {
        await rpc('delete_tag', { p_token: ctx.token, p_id: tag.id });
        reload();
      });
    });
  }

  function groupForm(group) {
    let icon = group?.icon || '🏷️';
    const { el, close } = modal(`
      <h2 class="mb-4 text-2xl">${group ? 'עריכת קבוצה' : 'קבוצת תגיות חדשה'} 🗂️</h2>
      <form class="space-y-4">
        <div><label class="label">שם הקבוצה</label><input name="name" class="input" maxlength="40" required value="${esc(group?.name || '')}" placeholder="למשל: מטבח, חגים, תזונה"></div>
        <div><span class="label">אייקון</span>
          <div class="flex flex-wrap gap-1.5" data-icons>
            ${GROUP_ICONS.map((i) => `<button type="button" data-icon="${i}" class="h-10 w-10 rounded-xl text-xl ${i === icon ? 'bg-spice-100 ring-2 ring-spice-400' : 'hover:bg-cream-200'}">${i}</button>`).join('')}
          </div></div>
        <div class="flex gap-2 pt-2">
          <button class="btn-primary flex-1" type="submit">שמירה</button>
          <button type="button" class="btn-soft" data-close>ביטול</button>
        </div>
      </form>`);
    el.querySelector('[data-icons]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-icon]');
      if (!b) return;
      icon = b.dataset.icon;
      el.querySelectorAll('[data-icon]').forEach((x) => {
        const on = x === b;
        x.classList.toggle('bg-spice-100', on);
        x.classList.toggle('ring-2', on);
        x.classList.toggle('ring-spice-400', on);
      });
    });
    el.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      busy(e.target.querySelector('[type=submit]'), async () => {
        await rpc('save_tag_group', { p_token: ctx.token, p_id: group?.id || null, p_name: fd.get('name'), p_icon: icon, p_sort: group ? group.sort : null });
        close();
        reload();
      });
    });
  }

  // החלפת מקום בין שתי קבוצות
  async function swapGroups(i, j) {
    const a = groups[i];
    const b = groups[j];
    await rpc('save_tag_group', { p_token: ctx.token, p_id: a.id, p_name: a.name, p_icon: a.icon, p_sort: j + 1 });
    await rpc('save_tag_group', { p_token: ctx.token, p_id: b.id, p_name: b.name, p_icon: b.icon, p_sort: i + 1 });
    // מספור מחדש של השאר, למקרה שהיו מספרים כפולים
    await Promise.all(groups.map((g, k) => (k !== i && k !== j && g.sort !== k + 1
      ? rpc('save_tag_group', { p_token: ctx.token, p_id: g.id, p_name: g.name, p_icon: g.icon, p_sort: k + 1 })
      : null)));
    reload();
  }

  onAction(view.app, {
    'add-tag': (el) => tagForm(null, el.dataset.group),
    'edit-tag': (el) => tagForm(findTag(el.dataset.id), el.dataset.group),
    'add-group': () => groupForm(null),
    'edit-group': (el) => groupForm(findGroup(el.dataset.id)),
    'group-up': (el) => busy(el, () => swapGroups(Number(el.dataset.i), Number(el.dataset.i) - 1)),
    'group-down': (el) => busy(el, () => swapGroups(Number(el.dataset.i), Number(el.dataset.i) + 1)),
    'del-group': async (el) => {
      const g = findGroup(el.dataset.id);
      if (!(await confirmDialog(`למחוק את הקבוצה "${esc(g.name)}" וכל ${g.tags.length} התגיות שבה?<br><span class="text-sm text-cocoa-500">המתכונים עצמם לא יימחקו.</span>`))) return;
      busy(null, async () => {
        await rpc('delete_tag_group', { p_token: ctx.token, p_id: g.id });
        reload();
      });
    },
  });
}
