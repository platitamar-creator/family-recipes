// בדיקה: תמונות מוקטנות, זיכרון מקומי, ארכיון בני בית, סל מיחזור, "עורך עכשיו", התנגשות, ערכים תזונתיים
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { handle, db, fns, uploaded } = require('./mock.js');

const OUT = path.join(__dirname, 'shots', path.basename(__filename, '.js'));
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8765/';
const errors = [];
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
const shot = (page, name, full = true) => page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full });

async function ctxFor(browser, key, member, houseId, opts = {}) {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', ...opts });
  let offline = false;
  await c.route(/supabase\.co/, (route) => (offline ? route.abort('internetdisconnected') : handle(route)));
  c.setMockOffline = (v) => { offline = v; };
  if (key) await c.addInitScript(([id, k, m]) => {
    if (!localStorage.getItem('frb.houses')) localStorage.setItem('frb.houses', JSON.stringify({ [id]: { key: k, member: m, name: 'בית', emoji: '🍲', joinedAt: 1 } }));
  }, [houseId, key, member]);
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`[console] ${m.text()}`));
  return { c, p };
}

(async () => {
  const browser = await chromium.launch();
  const h = fns.create_house({ p_name: 'המטבח של משפחת פלט', p_emoji: '🍲', p_member_name: 'איתמר' });
  const house = db.houses.find((x) => x.id === h.house_id);
  const noa = fns.join_house({ p_member_token: house.member_token, p_name: 'נועה', p_member_id: null });
  const rid = fns.save_recipe({ p_token: h.key, p_data: { title: 'שקשוקה של אבא', difficulty: 2, servings_count: 4, ingredients: [{ text: '6 ביצים' }, { text: '4 עגבניות' }], steps: [{ text: 'מטגנים' }], tag_ids: [] } });
  fns.add_comment({ p_token: h.key, p_recipe_id: rid, p_body: 'הודעה למחיקה', p_author_name: null });
  const base = `${BASE}#/h/${h.house_id}`;

  // --- איתמר ---
  const A = await ctxFor(browser, h.key, h.member, h.house_id);
  const a = A.p;

  // תמונות מוקטנות בהעלאה
  const imgFile = path.join(__dirname, 'test.png');
  await a.goto(`${base}/edit/${rid}`);
  await a.waitForSelector('#f-title');
  check('servings count field prefilled', (await a.inputValue('#f-count')) === '4');
  await a.setInputFiles('#f-files', [imgFile]);
  await a.waitForTimeout(200);
  await a.click('#save');
  await a.waitForSelector('[data-recipe-page]');
  const up = Object.keys(uploaded);
  check('full + thumb uploaded', up.some((p) => p.includes('_t.')) && up.some((p) => !p.includes('_t.')), up.join(','));
  const thumbBlob = uploaded[up.find((p) => p.includes('_t.'))].body.length;
  const fullBlob = uploaded[up.find((p) => !p.includes('_t.'))].body.length;
  check('thumb smaller than full', thumbBlob < fullBlob, `${thumbBlob} < ${fullBlob}`);

  // מסך הבית משתמש בתמונה המוקטנת
  globalThis.imageRequests = [];
  await a.goto(base);
  await a.waitForSelector('#grid a img');
  await a.waitForTimeout(400);
  check('house card loads thumbnail', globalThis.imageRequests.some((p) => p.includes('_t.')));

  // תמונה ישנה בלי מוקטנת → נופלת לתמונה המלאה
  const oldPath = `${h.house_id}/old-image.webp`;
  db.images.push({ id: 'x', recipe_id: rid, path: oldPath, sort: -1 });
  await a.reload();
  await a.waitForSelector('#grid a img');
  await a.waitForTimeout(600);
  const src = await a.getAttribute('#grid a img', 'src');
  check('old image falls back to full size', src.endsWith('old-image.webp'), src.split('/').pop());
  db.images = db.images.filter((i) => i.id !== 'x');

  // --- זיכרון מקומי: עובד בלי רשת ---
  await a.goto(base);
  await a.waitForSelector('#grid a');
  A.c.setMockOffline(true);
  await a.goto(`${BASE}#/`);
  await a.goto(base);
  await a.waitForSelector('#grid a', { timeout: 4000 }).catch(() => {});
  check('house opens offline from local copy', (await a.locator('#grid a').count()) === 1);
  A.c.setMockOffline(false);
  // עדכון ברקע: מתכון חדש מופיע בלי רענון ידני
  fns.save_recipe({ p_token: h.key, p_data: { title: 'מתכון שנוסף ברקע', ingredients: [] } });
  await a.goto(`${BASE}#/`);
  await a.goto(base);
  await a.waitForTimeout(800);
  check('background refresh shows new recipe', (await a.locator('#grid a:has-text("מתכון שנוסף ברקע")').count()) === 1);

  // --- ערכים תזונתיים ---
  await a.goto(`${base}/r/${rid}`);
  await a.waitForSelector('[data-recipe-page]');
  await a.click('[data-action="nutrition"]');
  await a.waitForSelector('text=ערכים תזונתיים ומחיר');
  check('nutrition per serving kcal', (await a.locator('text=400').count()) >= 1);
  check('highlights shown', (await a.locator('text=עתיר חלבון').count()) >= 1);
  await shot(a, '01-nutrition-serving');
  await a.click('[data-action="nut-scope"][data-scope="total"]');
  check('total scope', (await a.locator('text=1600').count()) >= 1);
  await a.click('[data-action="nut-scope"][data-scope="serving"]');
  // שינוי מספר מנות → לא עדכני
  await a.goto(`${base}/edit/${rid}`);
  await a.waitForSelector('#f-count');
  await a.fill('#f-count', '2');
  await a.click('#save');
  await a.waitForSelector('[data-recipe-page]');
  check('stale notice after servings change', (await a.locator('text=השתנו מאז החישוב').count()) === 1);
  await a.goto(base);
  await a.waitForSelector('#grid a');
  check('kcal badge on card', (await a.locator('#grid a:has-text("🔥 400")').count()) === 1);

  // --- מחיקת הודעה ---
  await a.goto(`${base}/r/${rid}`);
  await a.waitForSelector('[data-action="del-comment"]');
  check('delete-message button visible', await a.locator('[data-action="del-comment"]').isVisible());
  await a.click('[data-action="del-comment"]');
  await a.click('[data-ok]');
  await a.waitForTimeout(400);
  check('message deleted', db.comments.length === 0);

  // --- "עורך עכשיו" + התנגשות ---
  const N = await ctxFor(browser, noa.key, noa.member, h.house_id);
  const n = N.p;
  await a.goto(`${base}/edit/${rid}`);
  await a.waitForSelector('#f-title');
  await n.goto(`${base}/edit/${rid}`);
  await n.waitForSelector('#f-title');
  await n.waitForSelector('#editing-banner >> text=איתמר');
  check('noa sees itamar editing', true);
  await shot(n, '02-editing-banner', false);
  // נועה שומרת קודם
  await n.fill('#f-title', 'שקשוקה של נועה');
  await n.click('#save');
  await n.waitForSelector('[data-recipe-page]');
  // איתמר שומר אחריה → שאלה
  await a.fill('#f-title', 'שקשוקה של איתמר');
  await a.click('#save');
  await a.waitForSelector('text=מישהו אחר שמר שינויים');
  check('conflict dialog shown', true);
  await shot(a, '03-conflict', false);
  await a.click('[data-ok]');
  await a.waitForSelector('[data-recipe-page]');
  check('force save after conflict', db.recipes.find((r) => r.id === rid).title === 'שקשוקה של איתמר');
  // ביציאה מהעריכה מפסיק להופיע כעורך
  check('editing cleared on leave', db.editing.filter((e) => e.member_id === h.member.id).length === 0);

  await n.goto(base);
  await n.waitForSelector('#grid a');
  // --- סל מיחזור עם ביטול ---
  await a.click('[data-action="delete"]');
  await a.click('[data-ok]');
  await a.waitForSelector('#grid');
  check('soft deleted (in trash)', !!db.recipes.find((r) => r.id === rid).deleted_at);
  await a.click('#toasts button:has-text("ביטול")');
  await a.waitForSelector('[data-recipe-page]');
  check('undo restores', !db.recipes.find((r) => r.id === rid).deleted_at);
  await a.click('[data-action="delete"]');
  await a.click('[data-ok]');
  await a.waitForSelector('#grid');
  await a.goto(`${base}/settings`);
  await a.waitForSelector('#trash li');
  await shot(a, '04-settings');
  await a.click('[data-action="restore-recipe"]');
  await a.waitForSelector('[data-recipe-page]');
  check('restore from trash', !db.recipes.find((r) => r.id === rid).deleted_at);

  // --- ארכיון בן בית ---
  await a.goto(`${base}/settings`);
  await a.waitForSelector('[data-action="archive"]');
  check('cannot archive self (no button)', (await a.locator(`[data-action="archive"][data-id="${h.member.id}"]`).count()) === 0);
  await a.click(`[data-action="archive"][data-id="${noa.member.id}"]`);
  await a.click('[data-ok]');
  await a.waitForSelector('text=בארכיון (1)');
  check('archived', db.members.find((m) => m.id === noa.member.id).archived);
  // נועה פותחת שוב: יש לה עותק שמור, אבל הוא נמחק והיא רואה שהמכשיר נותק
  await n.goto(`${BASE}#/`);
  await n.goto(base);
  await n.waitForSelector('text=משהו לא הסתדר', { timeout: 5000 }).catch(() => {});
  check('archived member device disconnected', (await n.locator('text=משהו לא הסתדר').count()) === 1);
  await a.goto(base);
  await a.waitForSelector('#grid a');
  await a.click('#toggle-filters');
  check('archived not in "loved by" filter', (await a.locator('[data-kind="loved"]:has-text("נועה")').count()) === 0);
  await a.goto(`${base}/settings`);
  await a.waitForSelector('summary:has-text("בארכיון")');
  await a.click('summary:has-text("בארכיון")');
  await a.click('[data-action="restore-member"]');
  await a.waitForTimeout(400);
  check('restored member', !db.members.find((m) => m.id === noa.member.id).archived);

  // --- מחשב: תצוגת ערכים ---
  const D = await ctxFor(browser, h.key, h.member, h.house_id, { viewport: { width: 1280, height: 900 } });
  await D.p.goto(`${base}/r/${rid}`);
  await D.p.waitForSelector('text=ערכים תזונתיים ומחיר');
  await D.p.click('[data-action="nutrition"] >> nth=0');
  await D.p.waitForTimeout(800);
  await D.p.locator('text=ערכים תזונתיים ומחיר').scrollIntoViewIfNeeded();
  await shot(D.p, '05-desktop-nutrition', false);

  check('no horizontal overflow', !(await a.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  console.log(results.join('\n'));
  console.log('ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
  await browser.close();
})().catch((e) => { console.log(results.join('\n')); console.error('TEST FAILED:', e.message.split('\n')[0]); console.log('ERRORS:', errors.join('\n')); process.exit(1); });
