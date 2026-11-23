// בדיקה: מיונים, בחירת כמה מתכונים, רשימת קניות משותפת, ייבוא מהמסך הראשי, ציטוט ישר, שיתוף מאפליקציה
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { handle, db, fns } = require('./mock.js');

const OUT = path.join(__dirname, 'shots', path.basename(__filename, '.js'));
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8765/';
const errors = [];
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
const shot = (page, name, full = true) => page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full });

(async () => {
  const browser = await chromium.launch();
  const h = fns.create_house({ p_name: 'המטבח שלנו', p_emoji: '🍲', p_member_name: 'איתמר' });
  const K = h.key;
  const mk = (title, ingredients, extra = {}) => fns.save_recipe({ p_token: K, p_data: { title, difficulty: extra.d || 2, prep_minutes: extra.prep, cook_minutes: extra.cook, ingredients: ingredients.map((text) => ({ text })), steps: [{ text: 'מבשלים' }] } });
  const a = mk('קציצות', ['2 בצלים קצוצים', '1 כוס קמח', '3 שיני שום', '1/2 כוס מים'], { prep: 20, cook: 40, d: 3 });
  const b = mk('אורז', ['1 בצל גדול, קצוץ', 'חצי כוס קמח', '1 שן שום', '1 1/2 כוסות אורז'], { prep: 5, cook: 20, d: 1 });
  const c = mk('אבוקדו על טוסט', ['1 אבוקדו', 'לחם'], { prep: 5, d: 1 });
  db.nutrition[a] = { data: { per_serving: { kcal: 500, price_ils: 12 } } };
  db.nutrition[b] = { data: { per_serving: { kcal: 300, price_ils: 3 } } };
  fns.rate_recipe?.({ p_token: K, p_recipe_id: c, p_score: 10, p_note: null });
  const base = `${BASE}#/h/${h.house_id}`;

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.route(/supabase\.co/, handle);
  await ctx.addInitScript(([id, k, m]) => {
    if (!localStorage.getItem('frb.houses')) localStorage.setItem('frb.houses', JSON.stringify({ [id]: { key: k, member: m, name: 'בית', emoji: '🍲', joinedAt: 1 } }));
  }, [h.house_id, K, h.member]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`[console] ${m.text()}`));

  await p.goto(base);
  await p.waitForSelector('#grid a');
  // ציטוט ישר
  const rot = await p.evaluate(() => getComputedStyle(document.querySelector('.sticky-note')).transform);
  check('quote not rotated', rot === 'none', rot);

  const titles = () => p.$$eval('#grid h3', (els) => els.map((e) => e.textContent.trim().replace(/\s*🌐$/, '')));
  await p.selectOption('#sort', 'cheap');
  let t = await titles();
  check('sort cheap', t[0] === 'אורז' && t[1] === 'קציצות' && t[2] === 'אבוקדו על טוסט', t.join(','));
  check('cheap note about missing price', await p.isVisible('#sort-note'));
  check('price badge', (await p.locator('#grid a:has-text("₪3")').count()) === 1);
  await p.click('#reverse');
  t = await titles();
  check('reverse keeps unknown last', t[0] === 'קציצות' && t[2] === 'אבוקדו על טוסט', t.join(','));
  await p.click('#reverse');
  await p.selectOption('#sort', 'fast');
  t = await titles();
  check('sort fast', t.join(',') === 'אבוקדו על טוסט,אורז,קציצות', t.join(','));
  await p.selectOption('#sort', 'easy');
  t = await titles();
  check('sort easy', t[2] === 'קציצות', t.join(','));
  await shot(p, '01-sorted');

  // בחירת מתכונים
  await p.click('#pick-toggle');
  await p.click(`#grid a[data-recipe="${a}"]`);
  await p.click(`#grid a[data-recipe="${b}"]`);
  check('still on house page while picking', /#\/h\/[^/]+$/.test(p.url()));
  check('picked 2', (await p.textContent('#pick-bar')).includes('2'));
  await shot(p, '02-picking', false);
  await p.click('#pick-bar a');
  await p.waitForSelector('text=רשימת קניות משותפת');
  const items = await p.$$eval('section.card li label', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  check('merged onions', items.some((x) => x.includes('בצל ×3')), items.join(' | '));
  check('merged flour', items.some((x) => x.includes('1½ כוסות קמח')), '');
  check('merged garlic', items.some((x) => x.includes('4 שיני שום')), '');
  check('water skipped', !items.some((x) => /^מים/.test(x)), '');
  await shot(p, '03-shop');
  // ×2 לאורז
  await p.click(`[data-action="factor"][data-id="${b}"][data-f="2"]`);
  const items2 = await p.$$eval('section.card li label', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  check('factor doubles rice', items2.some((x) => x.includes('3 כוסות אורז')), items2.join(' | '));
  // יש לי
  await p.check('input[data-have^="m:בצל"]');
  check('have reduces missing', (await p.textContent('[data-action="whatsapp"]')).includes('(3)'), await p.textContent('[data-action="whatsapp"]'));
  // וואטסאפ
  await p.evaluate(() => { window.open = (u) => { window.__wa = u; }; });
  await p.click('[data-action="whatsapp"]');
  const wa = decodeURIComponent(await p.evaluate(() => window.__wa));
  check('whatsapp text', wa.includes('בשביל: קציצות, אורז (×2)') && !wa.includes('בצל') && wa.includes('שום'), wa.slice(0, 200));
  console.log(wa);
  await p.click('[data-action="mode"][data-mode="recipe"]');
  check('by recipe mode', (await p.locator('h3:has-text("קציצות")').count()) === 1);
  await shot(p, '04-shop-by-recipe');
  // שמירה בזיכרון
  await p.reload();
  await p.waitForSelector('text=רשימת קניות משותפת');
  check('state persisted', (await p.locator('h3:has-text("אורז")').count()) === 1);
  // הסרה
  await p.click(`[data-action="remove"][data-id="${a}"]`);
  await p.waitForTimeout(300);
  check('remove recipe', !(await p.textContent('#app')).includes('קציצות') || (await p.locator(`[data-action="remove"]`).count()) === 1);

  // ייבוא מהמסך הראשי
  await p.goto(base);
  await p.waitForSelector('[data-import]');
  await p.click('[data-import]');
  await p.fill('[name=src]', 'https://example.com/recipe');
  await shot(p, '05-import-modal', false);
  await p.click('[data-go]');
  await p.waitForSelector('#f-title');
  check('import opens editor filled', (await p.inputValue('#f-title')) === 'עוף בדבש מהאינטרנט');
  check('import link filled', (await p.inputValue('#f-link')) === 'https://example.com/recipe');
  await p.click('#save');
  await p.waitForSelector('[data-recipe-page]');
  check('imported saved', db.recipes.some((r) => r.title === 'עוף בדבש מהאינטרנט'));

  // שיתוף מאפליקציה אחרת
  await p.goto(`${BASE}?share_title=${encodeURIComponent('מתכון שווה')}&share_text=${encodeURIComponent('תראו https://x.co/r')}#/`);
  await p.waitForSelector('[name=src]', { timeout: 5000 }).catch(() => {});
  const v = await p.inputValue('[name=src]').catch(() => '');
  check('share target opens import', v.includes('https://x.co/r') && v.includes('מתכון שווה'), JSON.stringify(v));
  check('share params cleaned', !p.url().includes('share_'), p.url());

  // מחשב
  const d = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await d.route(/supabase\.co/, handle);
  await d.addInitScript(([id, k, m]) => localStorage.setItem('frb.houses', JSON.stringify({ [id]: { key: k, member: m, name: 'בית', emoji: '🍲', joinedAt: 1 } })), [h.house_id, K, h.member]);
  const dp = await d.newPage();
  await dp.goto(base);
  await dp.waitForSelector('#grid a');
  await shot(dp, '06-desktop', false);

  check('no horizontal overflow', !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  console.log(results.join('\n'));
  console.log('ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
  await browser.close();
})().catch((e) => { console.log(results.join('\n')); console.error('TEST FAILED:', e.message.split('\n')[0]); console.log('ERRORS:', errors.join('\n')); process.exit(1); });
