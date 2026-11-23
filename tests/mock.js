// שרת מדומה של Supabase לבדיקות בדפדפן (הסביבה כאן חוסמת את Supabase האמיתי)
const crypto = require('crypto');
const tok = () => crypto.randomBytes(18).toString('base64url');
const uuid = () => crypto.randomUUID();

const db = { editing: [], nutrition: {}, cooks: [], houses: [], members: [], devices: {}, groups: [], tags: [], recipes: [], images: [], recipeTags: [], variations: [], ratings: [], comments: [] };
const err = (code) => { const e = new Error(code); e.code = code; throw e; };
const COLORS = ['#E07A3F', '#7A9E7E', '#D4A24C', '#C4626B'];
const now = () => new Date().toISOString();

function resolve(t) {
  if (!t || t.length < 20) err('invalid_link');
  if (db.devices[t]) { const m = db.members.find((x) => x.id === db.devices[t]); return { house_id: m.house_id, role: 'member', member_id: m.id }; }
  const h = db.houses.find((x) => x.view_token === t); if (h) return { house_id: h.id, role: 'viewer' };
  const r = db.recipes.find((x) => x.share_token === t); if (r) return { house_id: r.house_id, role: 'recipe_viewer', recipe_id: r.id };
  err('invalid_link');
}
const reqMember = (t) => { const a = resolve(t); if (a.role !== 'member') err('members_only'); return a; };
const mj = (id) => { const m = db.members.find((x) => x.id === id); return m ? { id: m.id, name: m.name, color: m.color } : null; };
const mjx = (m) => ({ id: m.id, name: m.name, color: m.color, archived: !!m.archived });
const msj = (hid) => db.members.filter((m) => m.house_id === hid).map(mjx);
const activeMsj = (hid) => db.members.filter((m) => m.house_id === hid && !m.archived).map((m) => mj(m.id));
function newDevice(mid) { const k = tok() + tok(); db.devices[k] = mid; return k; }
function seed(hid) {
  const defs = [['כשרות', '🥛', ['חלבי', 'בשרי', 'פרווה']], ['עונה', '🌤️', ['קיץ', 'חורף']], ['מאמץ', '⏱️', ['מצרכים פשוטים', 'מהיר (עד 30 דק׳)']], ['ציוד', '🍲', ['בלי תנור', 'סיר אחד']], ['ארוחה', '🍽️', ['ארוחת בוקר', 'עיקרית', 'קינוח', 'תוספת']]];
  const tc = ['#DCE9F5', '#F6D5CF', '#E3EEDC', '#FBE7B5', '#DAD7EE'];
  defs.forEach(([n, i, tags], gi) => { const g = { id: uuid(), house_id: hid, name: n, icon: i, sort: gi + 1 }; db.groups.push(g); tags.forEach((t, ti) => db.tags.push({ id: uuid(), house_id: hid, group_id: g.id, name: t, color: tc[(gi + ti) % 5], sort: ti + 1 })); });
}
function recipeAccess(t, rid) {
  const a = resolve(t);
  if (a.role === 'recipe_viewer') { if (rid && rid !== a.recipe_id) err('not_found'); return a; }
  const r = db.recipes.find((x) => x.id === rid && x.house_id === a.house_id && !x.deleted_at); if (!r) err('not_found');
  return { ...a, recipe_id: rid };
}

const fns = {
  create_house({ p_name, p_emoji, p_member_name }) {
    if (!p_name?.trim() || !p_member_name?.trim()) err('name_required');
    const h = { id: uuid(), name: p_name.trim(), emoji: p_emoji || '🏠', view_token: tok(), member_token: tok() };
    db.houses.push(h);
    const m = { id: uuid(), house_id: h.id, name: p_member_name.trim(), color: COLORS[0], created: Date.now() };
    db.members.push(m); seed(h.id);
    return { house_id: h.id, house_name: h.name, emoji: h.emoji, member: mj(m.id), key: newDevice(m.id) };
  },
  house_preview({ p_member_token }) { const h = db.houses.find((x) => x.member_token === p_member_token); if (!h) err('invalid_link'); return { house_id: h.id, name: h.name, emoji: h.emoji, members: activeMsj(h.id) }; },
  join_house({ p_member_token, p_name, p_member_id }) {
    const h = db.houses.find((x) => x.member_token === p_member_token); if (!h) err('invalid_link');
    let mid = p_member_id;
    if (!mid) { if (!p_name?.trim()) err('name_required'); const m = { id: uuid(), house_id: h.id, name: p_name.trim(), color: COLORS[db.members.filter((x) => x.house_id === h.id).length % 4] }; db.members.push(m); mid = m.id; }
    return { house_id: h.id, house_name: h.name, emoji: h.emoji, member: mj(mid), key: newDevice(mid) };
  },
  whoami({ p_token }) { return resolve(p_token); },
  update_house({ p_token, p_name, p_emoji }) { const a = reqMember(p_token); const h = db.houses.find((x) => x.id === a.house_id); h.name = p_name || h.name; h.emoji = p_emoji || h.emoji; return null; },
  update_me({ p_token, p_name, p_color }) { const a = reqMember(p_token); const m = db.members.find((x) => x.id === a.member_id); m.name = p_name || m.name; m.color = p_color || m.color; return mj(m.id); },
  rotate_link({ p_token, p_kind }) { const a = reqMember(p_token); const h = db.houses.find((x) => x.id === a.house_id); const t = tok(); h[p_kind === 'view' ? 'view_token' : 'member_token'] = t; return t; },
  get_house({ p_token }) {
    const a = resolve(p_token); if (a.role === 'recipe_viewer') err('recipe_only');
    const h = db.houses.find((x) => x.id === a.house_id);
    return {
      role: a.role, me: mj(a.member_id),
      house: { id: h.id, name: h.name, emoji: h.emoji, ...(a.role === 'member' ? { view_token: h.view_token, member_token: h.member_token } : {}) },
      members: msj(h.id),
      tag_groups: db.groups.filter((g) => g.house_id === h.id).sort((x, y) => x.sort - y.sort).map((g) => ({ id: g.id, name: g.name, icon: g.icon, sort: g.sort, tags: db.tags.filter((t) => t.group_id === g.id).sort((x, y) => x.sort - y.sort).map((t) => ({ id: t.id, name: t.name, color: t.color, sort: t.sort })) })),
      trash_count: db.recipes.filter((r) => r.house_id === h.id && r.deleted_at).length,
      recipes: db.recipes.filter((r) => r.house_id === h.id && !r.deleted_at).map((r) => ({ id: r.id, title: r.title, description: r.description, difficulty: r.difficulty, prep_minutes: r.prep_minutes, cook_minutes: r.cook_minutes, servings: r.servings, has_link: !!r.source_url, untried: !!r.untried, kcal_per_serving: db.nutrition[r.id]?.data?.per_serving?.kcal ?? null, price_per_serving: db.nutrition[r.id]?.data?.per_serving?.price_ils ?? null, servings_count: r.servings_count ?? null, cook_count: db.cooks.filter((k) => k.recipe_id === r.id).length, last_cooked: db.cooks.filter((k) => k.recipe_id === r.id).map((k) => k.cooked_on).sort().at(-1) || null, ingredients: r.ingredients.filter((i) => !i.header).map((i) => i.text), cover: db.images.filter((i) => i.recipe_id === r.id).sort((x, y) => x.sort - y.sort)[0]?.path || null, tag_ids: db.recipeTags.filter((x) => x.recipe_id === r.id).map((x) => x.tag_id), ratings: db.ratings.filter((x) => x.recipe_id === r.id).map((x) => ({ member_id: x.member_id, score: x.score })), created_at: r.created_at, updated_at: r.updated_at })),
    };
  },
  get_recipe({ p_token, p_recipe_id }) {
    const a = recipeAccess(p_token, p_recipe_id); const r = db.recipes.find((x) => x.id === a.recipe_id); const h = db.houses.find((x) => x.id === r.house_id);
    return {
      role: a.role, me: mj(a.member_id), house: { id: h.id, name: h.name, emoji: h.emoji }, members: msj(h.id),
      recipe: { ...r, created_by: mj(r.created_by), updated_by: mj(r.updated_by), images: db.images.filter((i) => i.recipe_id === r.id).sort((x, y) => x.sort - y.sort), tags: db.recipeTags.filter((x) => x.recipe_id === r.id).map((x) => db.tags.find((t) => t.id === x.tag_id)).filter(Boolean) },
      editing: db.editing.filter((e) => e.recipe_id === r.id && e.member_id !== a.member_id && Date.now() - e.hb < 180000).map((e) => ({ member: mj(e.member_id), since: now() })),
      nutrition: db.nutrition[r.id] ? { ...db.nutrition[r.id], stale: db.nutrition[r.id].hash !== JSON.stringify([r.ingredients, r.servings_count]) } : null,
      cooks: db.cooks.filter((k) => k.recipe_id === r.id).sort((x, y) => y.cooked_on.localeCompare(x.cooked_on)),
      variations: db.variations.filter((v) => v.recipe_id === r.id), ratings: db.ratings.filter((x) => x.recipe_id === r.id).sort((x, y) => y.score - x.score), comments: db.comments.filter((c) => c.recipe_id === r.id),
    };
  },
  save_recipe({ p_token, p_data: d }) {
    const a = reqMember(p_token); if (!d.title?.trim()) err('name_required');
    let r = d.id && db.recipes.find((x) => x.id === d.id && x.house_id === a.house_id);
    if (d.id && !r) err('not_found');
    if (r && d.expected_updated_at && !d.force && r.updated_at > d.expected_updated_at) err('edit_conflict');
    const fields = { title: d.title.trim(), description: d.description || '', difficulty: d.difficulty || 2, prep_minutes: d.prep_minutes ? +d.prep_minutes : null, cook_minutes: d.cook_minutes ? +d.cook_minutes : null, servings: d.servings || null, servings_count: d.servings_count ? +d.servings_count : null, source_url: d.source_url ? (/^https?:\/\//i.test(d.source_url) ? d.source_url : 'https://' + d.source_url) : null, ingredients: d.ingredients || [], steps: d.steps || [], updated_by: a.member_id, updated_at: now() };
    if (!r) { r = { id: uuid(), house_id: a.house_id, share_token: tok(), created_by: a.member_id, created_at: now(), ...fields }; db.recipes.push(r); } else Object.assign(r, fields);
    if (d.tag_ids) { db.recipeTags = db.recipeTags.filter((x) => x.recipe_id !== r.id); d.tag_ids.forEach((t) => db.recipeTags.push({ recipe_id: r.id, tag_id: t })); }
    if (d.images) { db.images = db.images.filter((x) => x.recipe_id !== r.id); d.images.filter((i) => i.path.startsWith(a.house_id + '/')).forEach((i, k) => db.images.push({ id: uuid(), recipe_id: r.id, ...i, sort: k })); }
    return r.id;
  },
  delete_recipe({ p_token, p_recipe_id }) { const a = reqMember(p_token); const r = db.recipes.find((x) => x.id === p_recipe_id && x.house_id === a.house_id); if (!r) err('not_found'); r.deleted_at = now(); r.deleted_by = a.member_id; return []; },
  restore_recipe({ p_token, p_recipe_id }) { const a = reqMember(p_token); const r = db.recipes.find((x) => x.id === p_recipe_id && x.house_id === a.house_id); r.deleted_at = null; return null; },
  get_trash({ p_token }) { const a = reqMember(p_token); return { purged_paths: [], items: db.recipes.filter((r) => r.house_id === a.house_id && r.deleted_at).map((r) => ({ id: r.id, title: r.title, deleted_at: r.deleted_at, deleted_by: mj(r.deleted_by), cover: null })) }; },
  archive_member({ p_token, p_member_id }) { const a = reqMember(p_token); if (p_member_id === a.member_id) err('cannot_self'); const m = db.members.find((x) => x.id === p_member_id); m.archived = true; Object.keys(db.devices).forEach((k) => db.devices[k] === p_member_id && delete db.devices[k]); return null; },
  restore_member({ p_token, p_member_id }) { reqMember(p_token); db.members.find((x) => x.id === p_member_id).archived = false; return null; },
  revoke_member_devices({ p_token, p_member_id }) { reqMember(p_token); let n = 0; Object.keys(db.devices).forEach((k) => { if (db.devices[k] === p_member_id) { delete db.devices[k]; n++; } }); return n; },
  start_editing({ p_token, p_recipe_id }) { const a = reqMember(p_token); db.editing = db.editing.filter((e) => !(e.recipe_id === p_recipe_id && e.member_id === a.member_id)); db.editing.push({ recipe_id: p_recipe_id, member_id: a.member_id, hb: Date.now() }); return db.editing.filter((e) => e.recipe_id === p_recipe_id && e.member_id !== a.member_id).map((e) => ({ member: mj(e.member_id), since: now() })); },
  stop_editing({ p_token, p_recipe_id }) { const a = reqMember(p_token); db.editing = db.editing.filter((e) => !(e.recipe_id === p_recipe_id && e.member_id === a.member_id)); return null; },
  rate_recipe({ p_token, p_recipe_id, p_score, p_note }) { const a = recipeAccess(p_token, p_recipe_id); if (a.role !== 'member') err('members_only'); db.ratings = db.ratings.filter((x) => !(x.recipe_id === p_recipe_id && x.member_id === a.member_id)); if (p_score) db.ratings.push({ recipe_id: p_recipe_id, member_id: a.member_id, score: p_score, note: p_note || '', updated_at: now() }); return null; },
  add_variation({ p_token, p_recipe_id, p_title, p_body, p_author_name }) { const a = recipeAccess(p_token, p_recipe_id); const v = { id: uuid(), recipe_id: a.recipe_id, title: p_title, body: p_body, author_name: a.member_id ? mj(a.member_id).name : p_author_name || 'אורח/ת', member_id: a.member_id || null, created_at: now() }; db.variations.push(v); return v.id; },
  delete_variation({ p_id }) { db.variations = db.variations.filter((v) => v.id !== p_id); return null; },
  add_comment({ p_token, p_recipe_id, p_body, p_author_name }) { const a = recipeAccess(p_token, p_recipe_id); const c = { id: uuid(), recipe_id: a.recipe_id, body: p_body, author_name: a.member_id ? mj(a.member_id).name : p_author_name || 'אורח/ת', member_id: a.member_id || null, is_pinned: false, created_at: now() }; db.comments.push(c); return c.id; },
  delete_comment({ p_token, p_id }) { reqMember(p_token); db.comments = db.comments.filter((c) => c.id !== p_id); return null; },
  pin_comment({ p_token, p_id, p_pinned }) { reqMember(p_token); db.comments.find((c) => c.id === p_id).is_pinned = p_pinned; return null; },
  save_tag_group({ p_token, p_id, p_name, p_icon, p_sort }) { const a = reqMember(p_token); let g = p_id && db.groups.find((x) => x.id === p_id); if (!g) { g = { id: uuid(), house_id: a.house_id, sort: 99 }; db.groups.push(g); } Object.assign(g, { name: p_name, icon: p_icon, sort: p_sort ?? g.sort }); return g.id; },
  delete_tag_group({ p_id }) { db.groups = db.groups.filter((g) => g.id !== p_id); db.tags = db.tags.filter((t) => t.group_id !== p_id); return null; },
  save_tag({ p_token, p_id, p_group_id, p_name, p_color }) { const a = reqMember(p_token); let t = p_id && db.tags.find((x) => x.id === p_id); if (!t) { t = { id: uuid(), house_id: a.house_id, sort: 99 }; db.tags.push(t); } Object.assign(t, { group_id: p_group_id, name: p_name, color: p_color }); return t.id; },
  set_untried({ p_token, p_recipe_id, p_value }) { const a = reqMember(p_token); const r = db.recipes.find((x) => x.id === p_recipe_id && x.house_id === a.house_id); if (!r) err('not_found'); r.untried = !!p_value; return null; },
  log_cook({ p_token, p_recipe_id, p_cooked_on, p_member_id, p_note }) {
    const a = reqMember(p_token);
    if (!db.recipes.find((r) => r.id === p_recipe_id && r.house_id === a.house_id)) err('not_found');
    db.recipes.find((r) => r.id === p_recipe_id).untried = false;
    const k = { id: uuid(), recipe_id: p_recipe_id, member_id: p_member_id || a.member_id, cooked_on: p_cooked_on || new Date().toISOString().slice(0, 10), note: p_note || '', created_at: now() };
    db.cooks.push(k); return k.id;
  },
  delete_cook({ p_token, p_id }) { reqMember(p_token); db.cooks = db.cooks.filter((k) => k.id !== p_id); return null; },
  get_timeline({ p_token }) {
    const a = resolve(p_token); if (a.role === 'recipe_viewer') err('recipe_only');
    const h = db.houses.find((x) => x.id === a.house_id);
    const recs = db.recipes.filter((r) => r.house_id === h.id && !r.deleted_at);
    const ids = new Set(recs.map((r) => r.id));
    return {
      role: a.role, me: mj(a.member_id), house: { id: h.id, name: h.name, emoji: h.emoji }, members: msj(h.id),
      recipes: recs.map((r) => { const rs = db.ratings.filter((x) => x.recipe_id === r.id); return { id: r.id, title: r.title, cover: db.images.filter((i) => i.recipe_id === r.id)[0]?.path || null, avg_rating: rs.length ? Math.round(rs.reduce((s, x) => s + x.score, 0) / rs.length * 10) / 10 : null }; }),
      cooks: db.cooks.filter((k) => ids.has(k.recipe_id)).sort((x, y) => y.cooked_on.localeCompare(x.cooked_on)),
    };
  },
  delete_tag({ p_id }) { db.tags = db.tags.filter((t) => t.id !== p_id); return null; },
};

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const uploaded = {};

async function handle(route) {
  const req = route.request();
  const url = new URL(req.url());
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  try {
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = url.pathname.split('/').pop();
      return json(fns[fn](JSON.parse(req.postData() || '{}')));
    }
    if (url.pathname === '/functions/v1/nutrition') {
      const b = JSON.parse(req.postData());
      const a = resolve(b.key); if (a.role !== 'member') return json({ error: 'members_only' }, 400);
      const r = db.recipes.find((x) => x.id === b.recipe_id);
      if (!r.ingredients.filter((i) => !i.header).length) return json({ error: 'no_ingredients' }, 400);
      const servings = r.servings_count || 4;
      const data = { servings, servings_assumed: !r.servings_count, confidence: 'medium',
        total: { kcal: 1600, protein_g: 80, carbs_g: 120, fiber_g: 18, fat_g: 70, sat_fat_g: 22, price_ils: 38 },
        per_serving: { kcal: 1600 / servings, protein_g: 80 / servings, carbs_g: 120 / servings, fiber_g: 18 / servings, fat_g: 70 / servings, sat_fat_g: 22 / servings, price_ils: 38 / servings },
        ingredients: [{ name: 'ביצים', amount: '6 (360 ג׳)', grams: 360, kcal: 515, protein_g: 45, carbs_g: 2, fiber_g: 0, fat_g: 34, sat_fat_g: 11, price_ils: 7.2 }],
        highlights: [{ emoji: '💪', label: 'עתיר חלבון', detail: 'בזכות הביצים' }, { emoji: '🥕', label: 'מקור טוב לוויטמין A', detail: 'מהעגבניות והפפריקה' }],
        assumptions: ['ביצה L = 60 ג׳', 'כוס רסק = 250 ג׳'] };
      db.nutrition[r.id] = { data, model: 'gemini-3.8-flash', created_at: now(), hash: JSON.stringify([r.ingredients, r.servings_count]) };
      return json({ nutrition: { ...db.nutrition[r.id], stale: false } });
    }
    if (url.pathname === '/functions/v1/import') {
      const b = JSON.parse(req.postData());
      const a = resolve(b.key); if (a.role !== 'member') return json({ error: 'members_only' }, 400);
      return json({ recipe: { is_recipe: true, title: 'עוף בדבש מהאינטרנט', description: 'יובא', servings_count: 4, servings: '', prep_minutes: 10, cook_minutes: 50, difficulty: 2,
        ingredients: [{ text: '1 עוף' }, { text: '3 כפות דבש' }], steps: ['מורחים', 'אופים'], tag_ids: [], notes: '', source_url: b.url || '', images: [] }, model: 'structured', fetched: 'jsonld' });
    }
    if (url.pathname === '/functions/v1/images') {
      const b = JSON.parse(req.postData());
      const a = resolve(b.key); if (a.role !== 'member') return json({ error: 'members_only' }, 403);
      if (b.action === 'sign') return json({ uploads: Array.from({ length: b.count }, () => { const id = `${a.house_id}/${uuid()}`; return { path: `${id}.${b.ext}`, token: 'tkn', ...(b.thumbs ? { thumbPath: `${id}_t.${b.ext}`, thumbToken: 'tkn' } : {}) }; }) });
      return json({ deleted: (b.paths || []).length });
    }
    if (url.pathname.includes('/storage/v1/object/upload/sign/')) {
      const path = url.pathname.split('/recipe-images/')[1];
      uploaded[path] = { type: req.headers()['content-type'], body: req.postDataBuffer() };
      return json({ Key: path });
    }
    if (url.pathname.includes('/storage/v1/object/public/')) {
      const path = url.pathname.split('/recipe-images/')[1];
      const u = uploaded[path];
      globalThis.imageRequests = (globalThis.imageRequests || []).concat(path);
      if (!u && path.includes('_t.')) return route.fulfill({ status: 404, body: 'nope' });
      return route.fulfill({ status: 200, contentType: u?.type || 'image/png', body: u?.body || PNG });
    }
  } catch (e) {
    return json({ code: 'P0001', message: e.code || e.message }, 400);
  }
  return json({ error: 'nope' }, 404);
}

module.exports = { handle, db, fns, uploaded };
