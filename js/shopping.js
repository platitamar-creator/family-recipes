// איחוד מצרכים מכמה מתכונים לרשימת קניות אחת.
// "2 בצלים קצוצים" + "1 בצל גדול" → "בצל ×3"; "1 כוס קמח" + "חצי כוס קמח" → "קמח: 1½ כוסות".
// כשאי אפשר לחבר (יחידות שונות, "לפי הטעם"), מציגים את החלקים זה לצד זה.

const FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
const WORD_NUM = {
  חצי: 0.5, רבע: 0.25, שליש: 1 / 3, אחד: 1, אחת: 1, שני: 2, שתי: 2, שניים: 2, שתיים: 2,
  שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4, חמש: 5, חמישה: 5,
};

// [צורות, יחיד, רבים]
const UNITS = [
  [['כוס', 'כוסות'], 'כוס', 'כוסות'],
  [['כף', 'כפות'], 'כף', 'כפות'],
  [['כפית', 'כפיות'], 'כפית', 'כפיות'],
  [['גרם', "גר'", 'גר׳', "ג'", 'ג׳', 'גר', 'ג'], 'גרם', 'גרם'],
  [['ק"ג', 'ק״ג', 'קילו', 'קג'], 'ק"ג', 'ק"ג'],
  [['מ"ל', 'מ״ל', 'מל'], 'מ"ל', 'מ"ל'],
  [['ליטר', 'ליטרים'], 'ליטר', 'ליטר'],
  [['חבילה', 'חבילות', 'חבילת'], 'חבילה', 'חבילות'],
  [['קופסה', 'קופסאות', 'קופסת', 'קופסות'], 'קופסה', 'קופסאות'],
  [['צרור', 'צרורות'], 'צרור', 'צרורות'],
  [['שן', 'שיני', 'שיניים'], 'שן', 'שיני'],
  [['פחית', 'פחיות'], 'פחית', 'פחיות'],
  [['מיכל', 'מיכלי', 'מיכלים'], 'מיכל', 'מיכלים'],
  [['שקית', 'שקיות'], 'שקית', 'שקיות'],
  [['יחידה', 'יחידות'], 'יחידה', 'יחידות'],
  [['חופן', 'חופנים'], 'חופן', 'חופנים'],
  [['פרוסה', 'פרוסות'], 'פרוסה', 'פרוסות'],
  [['ענף', 'ענפי', 'ענפים'], 'ענף', 'ענפים'],
  [['גבעול', 'גבעולי', 'גבעולים'], 'גבעול', 'גבעולים'],
];
const UNIT_OF = new Map(UNITS.flatMap(([forms, one]) => forms.map((f) => [f, one])));
const PLURAL = Object.fromEntries(UNITS.map(([, one, many]) => [one, many]));

// מילים שמתארות את ההכנה ולא את המצרך עצמו
const DESCRIPTORS = /^(קצוץ|קצוצה|קצוצים|קצוצות|מגורד|מגורדת|מגורדים|מגורדות|מגורר|מגוררת|פרוס|פרוסים|פרוסה|פרוסות|טרי|טרייה|טריים|טריות|גדול|גדולה|גדולים|גדולות|בינוני|בינונית|בינוניים|בינוניות|קטן|קטנה|קטנים|קטנות|דק|דקה|גס|גסה|מרוסק|מרוסקות|כתוש|כתושה|כתושות|חתוך|חתוכה|חתוכים|חתוכות|קלוף|קלופים|מקולף|מקולפים|שלם|שלמה|שלמים|בערך|כ|של|עם|לפי|הטעם|דק|מאוד)$/;

const round = (n) => Math.round(n * 100) / 100;

export function formatQty(n) {
  const whole = Math.floor(n + 1e-9);
  const rest = round(n - whole);
  const frac = { 0.5: '½', 0.25: '¼', 0.75: '¾', 0.33: '⅓', 0.67: '⅔' }[rest];
  if (frac) return whole ? `${whole}${frac}` : frac;
  return String(round(n));
}

function parseQty(s) {
  let m = s.match(/^(\d+)\s+(\d)\/(\d)\s*/); // 1 1/2
  if (m) return [Number(m[1]) + Number(m[2]) / Number(m[3]), s.slice(m[0].length)];
  m = s.match(/^(\d+)\/(\d+)\s*/); // 1/2
  if (m) return [Number(m[1]) / Number(m[2]), s.slice(m[0].length)];
  m = s.match(/^(\d+)?([½¼¾⅓⅔])\s*/); // 1½
  if (m) return [Number(m[1] || 0) + FRAC[m[2]], s.slice(m[0].length)];
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*-\s*\d+(?:[.,]\d+)?\s*/); // 2-3 → טווח: לא מחברים
  if (m) return [null, s.slice(m[0].length), true];
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*/);
  if (m) return [Number(m[1].replace(',', '.')), s.slice(m[0].length)];
  m = s.match(/^(\S+)\s+/);
  if (m && WORD_NUM[m[1]] !== undefined) {
    // "חצי כוס", "שתי כפות", "2 וחצי כוסות" לא כאן
    return [WORD_NUM[m[1]], s.slice(m[0].length)];
  }
  return [null, s];
}

const stem = (w) => w.replace(/(יות|ים|ות|ה)$/, '').replace(/י+$/, '') || w;

export function parseIngredient(text) {
  let s = text.trim().replace(/^[-•*▫️]\s*/u, '').replace(/^כ-?\s*(?=\d)/, '');
  let qty;
  let range = false;
  [qty, s, range] = parseQty(s);
  // "2 וחצי כוסות"
  const half = s.match(/^ו(חצי|רבע)\s+/);
  if (qty != null && half) {
    qty += WORD_NUM[half[1]];
    s = s.slice(half[0].length);
  }
  let unit = '';
  const first = s.split(/\s+/)[0];
  if (UNIT_OF.has(first)) {
    unit = UNIT_OF.get(first);
    s = s.slice(first.length).trim().replace(/^של\s+/, '');
    // "צרור כוסברה" = צרור אחד
    if (qty == null && !range) qty = 1;
  }
  const name = s.split(/[,(]/)[0].trim() || s.trim();
  const words = name.split(/\s+/).filter((w) => w && !DESCRIPTORS.test(w));
  const base = words.length ? words : name.split(/\s+/);
  return { text: text.trim(), qty: range ? null : qty, unit, name: base.join(' '), key: base.map(stem).join(' ') };
}

// מים לא קונים 🙂
const SKIP = /^מים( רותחים| חמים| קרים| פושרים)?$/;

// recipes: [{ id, title, ingredients: [טקסט], factor }]
// מחזיר [{ key, name, label, parts: [{text, recipe}], ...}]
export function mergeIngredients(recipes) {
  const groups = new Map();
  for (const r of recipes) {
    for (const text of r.ingredients || []) {
      if (!text || !text.trim()) continue;
      const p = parseIngredient(text);
      if (SKIP.test(p.name)) continue;
      if (!groups.has(p.key)) groups.set(p.key, { key: p.key, name: p.name, items: [] });
      const g = groups.get(p.key);
      if (p.name.length < g.name.length) g.name = p.name;
      g.items.push({ ...p, qty: p.qty != null ? p.qty * (r.factor || 1) : null, recipe: r.title, recipeId: r.id });
    }
  }
  return [...groups.values()].map((g) => ({ ...g, label: labelOf(g) }));
}

function labelOf(g) {
  const factorChanged = g.items.some((i) => i.qty != null && i.qty !== parseIngredient(i.text).qty);
  if (g.items.length === 1 && !factorChanged) return g.items[0].text;
  // סכום לפי יחידה
  const sums = new Map();
  const loose = [];
  for (const i of g.items) {
    if (i.qty == null) loose.push(i.text);
    else sums.set(i.unit, (sums.get(i.unit) || 0) + i.qty);
  }
  const parts = [...sums.entries()].map(([unit, n]) =>
    unit ? `${formatQty(n)} ${n > 1 ? PLURAL[unit] || unit : unit}` : `×${formatQty(n)}`,
  );
  if (!parts.length) return g.name;
  let head;
  if (sums.size === 1 && sums.has('')) head = `${g.name} ${parts[0]}`; // בצל ×3
  else if (sums.size === 1) head = `${parts[0]} ${g.name}`; // 5 שיני שום
  else head = `${g.name}: ${parts.join(' + ')}`; // קמח: 2 כוסות + 100 גרם
  return loose.length ? `${head} + עוד קצת` : head;
}
