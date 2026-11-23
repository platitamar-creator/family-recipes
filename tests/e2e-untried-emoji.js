// בדיקה: "עוד לא הכנו" והחלפת האמוג'י של הבית
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { handle, db, fns } = require('./mock.js');
const OUT = path.join(__dirname, 'shots', path.basename(__filename, '.js'));
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8765/';
const errors = []; const results = [];
const check = (n, ok, x = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${n} ${x}`);
(async () => {
  const browser = await chromium.launch();
  const h = fns.create_house({ p_name: 'המטבח שלנו', p_emoji: '🍲', p_member_name: 'איתמר' });
  const K = h.key;
  const tag = fns.get_house({ p_token: K }).tag_groups[0].tags[0];
  const mk = (title, tags = []) => fns.save_recipe({ p_token: K, p_data: { title, difficulty: 2, ingredients: [{ text: '1 בצל' }], steps: [{ text: 'מבשלים' }], tag_ids: tags } });
  const a = mk('שקשוקה', [tag.id]);
  const b = mk('פשטידה חדשה לנסות', [tag.id]);
  const base = `${BASE}#/h/${h.house_id}`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.route(/supabase\.co/, handle);
  await ctx.addInitScript(([id, k, m]) => { if (!localStorage.getItem('frb.houses')) localStorage.setItem('frb.houses', JSON.stringify({ [id]: { key: k, member: m, name: 'בית', emoji: '🍲', joinedAt: 1 } })); }, [h.house_id, K, h.member]);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`[console] ${m.text()}`));

  // סימון מדף המתכון
  await p.goto(`${base}/r/${b}`);
  await p.click('[data-action="untried"][data-value="true"]');
  await p.waitForSelector('text=עוד לא הכנו את זה');
  check('marked untried', db.recipes.find((r) => r.id === b).untried === true);
  await p.screenshot({ path: path.join(OUT, '01-recipe.png') });

  await p.goto(base);
  await p.waitForSelector('#grid a');
  check('untried in separate section', (await p.locator('#grid h2:has-text("עוד לא הכנו (1)")').count()) === 1);
  const filter = await p.evaluate((id) => getComputedStyle(document.querySelector(`[data-recipe="${id}"] .cover`)).filter, b);
  check('untried grey blurred', filter.includes('grayscale') && filter.includes('blur'), filter);
  await p.screenshot({ path: path.join(OUT, '02-house.png'), fullPage: true });
  // סינון לפי תגית: לא מופיע
  if (!(await p.isVisible('#filters'))) await p.click('#toggle-filters');
  await p.click(`[data-kind="tags"][data-id="${tag.id}"]`);
  check('hidden when filtering', (await p.locator(`[data-recipe="${b}"]`).count()) === 0 && (await p.locator(`[data-recipe="${a}"]`).count()) === 1);
  await p.click(`[data-kind="tags"][data-id="${tag.id}"]`);
  await p.fill('#q', 'פשטידה');
  check('hidden in search', (await p.locator(`[data-recipe="${b}"]`).count()) === 0);
  await p.fill('#q', '');
  await p.click('[data-kind="untried"]');
  check('only-untried filter', (await p.locator(`[data-recipe="${b}"]`).count()) === 1 && (await p.locator(`[data-recipe="${a}"]`).count()) === 0);
  await p.click('[data-kind="untried"]');

  // "הכנתי!" מוריד את הסימון
  await p.goto(`${base}/r/${b}`);
  await p.click('[data-action="cooked"]');
  await p.click('.fixed [type=submit], .fixed [data-ok]').catch(() => {});
  await p.waitForTimeout(600);
  check('cooking clears untried', db.recipes.find((r) => r.id === b).untried === false);

  // בעורך
  await p.goto(`${base}/edit/${a}`);
  await p.waitForSelector('#f-untried');
  await p.check('#f-untried');
  await p.click('#save');
  await p.waitForSelector('[data-recipe-page]');
  check('editor sets untried', db.recipes.find((r) => r.id === a).untried === true);

  // אמוג'י
  await p.goto(base);
  await p.waitForSelector('[data-house-emoji]');
  await p.click('[data-house-emoji]');
  await p.click('[data-emoji="🐻"]');
  await p.screenshot({ path: path.join(OUT, '03-emoji.png') });
  await p.click('[data-save]');
  await p.waitForTimeout(500);
  check('emoji changed', db.houses.find((x) => x.id === h.house_id).emoji === '🐻');
  check('hero shows new emoji', (await p.textContent('[data-house-emoji]')).includes('🐻'));
  await p.click('[data-house-emoji]');
  await p.fill('[data-emoji-custom]', '🦄');
  await p.click('[data-save]');
  await p.waitForTimeout(500);
  check('custom emoji', db.houses.find((x) => x.id === h.house_id).emoji === '🦄');
  await p.goto(`${base}/settings`);
  await p.waitForSelector('[data-emoji-custom]');
  check('settings shows custom', (await p.inputValue('[data-emoji-custom]')) === '🦄');
  console.log(results.join('\n'));
  console.log('ERRORS:', errors.length ? '\n' + errors.join('\n') : 'none');
  await browser.close();
})().catch((e) => { console.log(results.join('\n')); console.error('TEST FAILED:', e.message.split('\n')[0]); console.log('ERRORS:', errors.join('\n')); process.exit(1); });
