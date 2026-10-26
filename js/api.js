// כל התקשורת עם Supabase: קריאות לפונקציות במסד הנתונים והעלאת תמונות.
import { SUPABASE_URL, SUPABASE_KEY, IMAGE_BUCKET } from './config.js';

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

const MESSAGES = {
  invalid_link: 'הקישור הזה לא עובד. אולי מישהו החליף אותו? כדאי לבקש קישור חדש 🔗',
  members_only: 'רק בני הבית יכולים לעשות את זה 🔒',
  not_found: 'לא מצאנו את זה... אולי מישהו כבר אכל? 🍽️',
  name_required: 'נראה ששכחת למלא משהו חשוב 🙃',
  recipe_only: 'הקישור הזה פותח רק מתכון אחד 📄',
  network: 'אין חיבור לאינטרנט. המטבח מחכה לך 📡',
  needs_update: 'התכונה הזו עוד לא הופעלה במסד הנתונים. צריך להריץ את העדכון האחרון ב-Supabase 🛠️',
  edit_conflict: 'מישהו אחר שמר שינויים במתכון בזמן שערכת ✋',
  cannot_self: 'אי אפשר להעביר את עצמך לארכיון. בן בית אחר יכול לעשות את זה 🙂',
  ai_limit: 'הגעתם למגבלה היומית של חישובי AI בבית. נסו שוב מחר 🌙',
  ai_not_configured: 'חישוב הערכים עוד לא הופעל: צריך להוסיף מפתח Gemini ב-Supabase 🔑',
  ai_busy: 'Gemini עמוס כרגע. נסו שוב בעוד דקה-שתיים ⏳',
  ai_error: 'ה-AI לא הצליח לחשב הפעם. נסו שוב בעוד רגע 🤖',
  no_ingredients: 'כדי לחשב צריך קודם לכתוב מצרכים 🧺',
  bad_date: 'התאריך לא נראה הגיוני. אי אפשר לבשל בעתיד (עדיין) 🔮',
  not_a_recipe: 'לא מצאנו שם מתכון 🤔 אם זה סרטון או פוסט, נסו להדביק את הטקסט שלו',
  bad_url: 'הקישור לא נראה תקין 🔗',
  nothing_to_import: 'צריך להדביק קישור או טקסט של מתכון 📋',
  default: 'אופס, משהו נשרף במטבח. נסו שוב בעוד רגע 🔥',
};

export class ApiError extends Error {
  constructor(code) {
    super(MESSAGES[code] || MESSAGES.default);
    this.code = code;
  }
}

function codeFrom(text) {
  // פונקציה שעוד לא קיימת במסד הנתונים (עדכון שלא הורץ)
  if (text.includes('PGRST202') || text.includes('Could not find the function')) return 'needs_update';
  return Object.keys(MESSAGES).find((c) => text.includes(c)) || 'default';
}

export async function rpc(fn, args = {}) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(args),
    });
  } catch {
    throw new ApiError('network');
  }
  const text = await res.text();
  if (!res.ok) throw new ApiError(codeFrom(text));
  return text ? JSON.parse(text) : null;
}

// ---------- זיכרון מקומי: מסכים נפתחים מיד, ומתעדכנים ברקע ----------
// הנתונים האחרונים של כל מסך נשמרים במכשיר. בפתיחה מציגים אותם מיד (גם בלי רשת),
// ובמקביל מביאים גרסה טרייה; אם משהו השתנה, המסך מתרענן.
const CACHE_PREFIX = 'frb.cache.';
const cacheKey = (fn, args) => CACHE_PREFIX + fn + ':' + JSON.stringify(args);

function cacheRead(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function cacheWrite(key, text) {
  try {
    localStorage.setItem(key, text);
  } catch {
    // אין מקום: מנקים את הזיכרון המקומי של המסכים ומנסים שוב פעם אחת
    try {
      Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX)).forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(key, text);
    } catch {
      /* מוותרים */
    }
  }
}

export function forgetCache(fn, args) {
  try {
    localStorage.removeItem(cacheKey(fn, args));
  } catch {
    /* כלום */
  }
}

// מחזיר נתונים מהר ככל האפשר. onFresh נקרא אם הגיעה גרסה חדשה ושונה אחרי שהוחזרה גרסה שמורה.
export async function rpcCached(fn, args, onFresh) {
  const key = cacheKey(fn, args);
  const cached = cacheRead(key);
  const fresh = rpc(fn, args).then((data) => {
    const text = JSON.stringify(data);
    cacheWrite(key, text);
    return { data, text };
  });
  if (!cached) return (await fresh).data;
  fresh
    .then(({ data, text }) => {
      if (text !== cached) onFresh?.(data);
    })
    .catch((err) => {
      // הקישור כבר לא תקף (למשל מכשיר שנותק): מוחקים את הגרסה השמורה וטוענים את המסך מחדש
      if (err.code === 'invalid_link' || err.code === 'not_found') {
        forgetCache(fn, args);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
    });
  return JSON.parse(cached);
}

export async function analyzeNutrition(key, recipeId) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/nutrition`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ key, recipe_id: recipeId }),
    });
  } catch {
    throw new ApiError('network');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'default');
  return data.nutrition;
}

// ייבוא מתכון מקישור או מטקסט: מחזיר טיוטה (לא שומר כלום)
export async function importRecipe(key, input) {
  const text = input.trim();
  const isUrl = /^\S+$/.test(text) && /^(https?:\/\/|www\.)/i.test(text);
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/import`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(isUrl ? { key, url: text } : { key, text }),
    });
  } catch {
    throw new ApiError('network');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'default');
  return data.recipe;
}

async function imagesFn(body) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/images`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError('network');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'default');
  return data;
}

export const signUploads = (key, count, ext) => imagesFn({ action: 'sign', key, count, ext, thumbs: true });
// מוחק גם את התמונות המוקטנות
export const deleteImages = (key, paths) => {
  const all = paths.flatMap((p) => [p, thumbPath(p)]);
  return all.length ? imagesFn({ action: 'delete', key, paths: all }).catch(() => null) : Promise.resolve();
};

export async function uploadToSigned(path, token, blob) {
  const url = `${SUPABASE_URL}/storage/v1/object/upload/sign/${IMAGE_BUCKET}/${path}?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': blob.type, 'x-upsert': 'false' },
    body: blob,
  });
  if (!res.ok) throw new ApiError('default');
}

export const imageUrl = (path) => `${SUPABASE_URL}/storage/v1/object/public/${IMAGE_BUCKET}/${path}`;

// תמונה מוקטנת (לכרטיסים): אותו שם עם _t. לתמונות ישנות בלי גרסה מוקטנת יש נפילה אוטומטית לתמונה המלאה.
export const thumbPath = (path) => path.replace(/(\.\w+)$/, '_t$1');
export const thumbImg = (path, cls = '', alt = '') =>
  `<img src="${imageUrl(thumbPath(path))}" data-full="${imageUrl(path)}" onerror="if(this.dataset.full&&this.src!==this.dataset.full){this.src=this.dataset.full}" alt="${alt}" loading="lazy" class="${cls}">`;
