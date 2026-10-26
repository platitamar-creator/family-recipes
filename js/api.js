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
  bad_date: 'התאריך לא נראה הגיוני. אי אפשר לבשל בעתיד (עדיין) 🔮',
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

export const signUploads = (key, count, ext) => imagesFn({ action: 'sign', key, count, ext });
export const deleteImages = (key, paths) =>
  paths.length ? imagesFn({ action: 'delete', key, paths }).catch(() => null) : Promise.resolve();

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
