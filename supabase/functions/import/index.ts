// פונקציית שרת: ייבוא מתכון מקישור (אתר, אינסטגרם, יוטיוב) או מטקסט חופשי (למשל הודעת וואטסאפ).
// השרת מביא את הדף, Gemini מסדר אותו למתכון (שם, מצרכים, שלבים, מנות, תגיות),
// ואם יש תמונה בדף היא נשמרת בתיקיית התמונות של הבית. שום דבר לא נשמר כמתכון: הדפדפן מציג טיוטה לאישור.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const MODELS = ["gemini-3.5-flash", "gemini-3.7-flash", "gemini-3.8-flash"];
// כש-Gemini עמוס, מודלים יציבים יותר
const FALLBACKS = ["gemini-flash-latest", "gemini-2.5-flash"];
const API = "https://generativelanguage.googleapis.com/v1beta/models";
const BUCKET = "recipe-images";
const PER_TRY_MS = 45000;
const BROWSER_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36";
// אינסטגרם ופייסבוק מחזירים את הכיתוב של הפוסט רק ל"בוטים של תצוגה מקדימה"
const PREVIEW_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SCHEMA = {
  type: "OBJECT",
  properties: {
    is_recipe: { type: "BOOLEAN", description: "false אם אין כאן מתכון אחד ברור (רשימת מתכונים, כתבה, דף שלא נטען)" },
    title: { type: "STRING" },
    description: { type: "STRING", description: "משפט-שניים על המתכון. ריק אם אין" },
    servings_count: { type: "NUMBER", description: "מספר מנות אם נכתב במקור, אחרת 0" },
    servings_text: { type: "STRING", description: "גודל/הערה, למשל 'תבנית 24×34'. ריק אם אין" },
    prep_minutes: { type: "NUMBER", description: "0 אם לא ידוע" },
    cook_minutes: { type: "NUMBER", description: "0 אם לא ידוע" },
    difficulty: { type: "NUMBER", description: "1 (קל מאוד) עד 5 (מאתגר)" },
    ingredients: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { text: { type: "STRING" }, header: { type: "BOOLEAN" } },
        required: ["text", "header"],
      },
    },
    steps: { type: "ARRAY", items: { type: "STRING" } },
    tags: { type: "ARRAY", items: { type: "STRING" }, description: "רק שמות מתוך רשימת התגיות שנמסרה" },
    notes: { type: "STRING", description: "מה חסר או לא ברור במקור (למשל 'אין כמויות'). ריק אם הכל ברור" },
  },
  required: ["is_recipe", "title", "description", "servings_count", "servings_text", "prep_minutes", "cook_minutes",
    "difficulty", "ingredients", "steps", "tags", "notes"],
};

const system = (tags: string) => `אתה עוזר שמכניס מתכונים לספר מתכונים משפחתי בעברית.
תקבל תוכן של דף אינטרנט, כיתוב של סרטון, או הודעה שמישהו כתב. חלץ ממנו מתכון אחד.
כללים:
- היצמד למקור. אל תמציא מצרכים, כמויות או שלבים שלא כתובים. אם חסרות כמויות, כתוב את המצרך בלי כמות וציין ב-notes.
- אם המקור בשפה אחרת, תרגם לעברית טבעית.
- ingredients: מצרך בכל פריט, עם הכמות בתחילת השורה ("2 כוסות קמח"). אם יש חלוקה (לבצק, לרוטב), הוסף פריט כותרת עם header=true.
  אם בהודעה אין רשימת מצרכים נפרדת, חלץ את המצרכים מתוך ההוראות.
- steps: שלבים קצרים וברורים, כל פעולה עיקרית בשלב נפרד. בלי מספור בתחילת השלב. שמור טיפים חשובים מהמקור.
- title: שם קצר וטבעי למתכון (בלי שם האתר ובלי "מתכון ל...").
- description: אם במקור יש הקדמה אישית או סיפור, סכם במשפט. אחרת ריק.
- difficulty: הערכה לפי מספר השלבים והטכניקה (1 קל מאוד, 3 בינוני, 5 מאתגר).
- tags: בחר רק מהרשימה הזו, את מה שמתאים בבירור: ${tags || "(אין תגיות)"}
  כשרות: בשרי אם יש בשר/עוף, חלבי אם יש חלב/גבינה/חמאה/שמנת, אחרת פרווה (דגים וביצים הם פרווה).
- אם התוכן הוא אוסף של מתכונים רבים, כתבה בלי מתכון, או דף שלא נטען (התחברות, שגיאה) – is_recipe=false.
- כל הטקסטים בעברית.`;

// ---------- הבאת הדף ----------

function decodeEntities(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

function meta(html: string, name: string) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content) : "";
}

// מתכון מובנה (schema.org) שרוב אתרי המתכונים מוסיפים לדף
function findJsonLdRecipe(html: string): Record<string, unknown> | null {
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const visit = (node: unknown): Record<string, unknown> | null => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const n of node) {
        const r = visit(n);
        if (r) return r;
      }
      return null;
    }
    const o = node as Record<string, unknown>;
    const type = o["@type"];
    if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) return o;
    return visit(o["@graph"]) ?? null;
  };
  for (const b of blocks) {
    try {
      const r = visit(JSON.parse(b.trim()));
      if (r) return r;
    } catch {
      /* JSON שבור */
    }
  }
  return null;
}

function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|iframe|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/li|\/h\d|\/div|\/tr)[^>]*>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function imageFrom(recipe: Record<string, unknown> | null, html: string, base: string) {
  let img: unknown = recipe?.image;
  if (Array.isArray(img)) img = img[0];
  if (img && typeof img === "object") img = (img as Record<string, unknown>).url;
  const url = (typeof img === "string" && img) || meta(html, "og:image") || meta(html, "twitter:image");
  try {
    return url ? new URL(url, base).href : "";
  } catch {
    return "";
  }
}

const isYouTube = (u: string) => /(^|\.)(youtube\.com|youtu\.be)$/i.test(new URL(u).hostname);
const isSocial = (u: string) => /(^|\.)(instagram\.com|facebook\.com|fb\.watch|tiktok\.com)$/i.test(new URL(u).hostname);

async function fetchPage(url: string) {
  const social = isSocial(url) || isYouTube(url);
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
    headers: {
      "User-Agent": social ? PREVIEW_UA : BROWSER_UA,
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
    },
  });
  // יש אתרים ישנים בקידוד windows-1255 ולא UTF-8
  const buf = new Uint8Array(await res.arrayBuffer()).slice(0, 3_000_000);
  let charset = res.headers.get("content-type")?.match(/charset=["']?([\w-]+)/i)?.[1];
  if (!charset) charset = new TextDecoder("latin1").decode(buf.slice(0, 5000)).match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  let html: string;
  try {
    html = new TextDecoder(charset || "utf-8").decode(buf);
  } catch {
    html = new TextDecoder().decode(buf);
  }
  return { ok: res.ok, status: res.status, finalUrl: res.url || url, html };
}

// ---------- Gemini ----------

type Part = { text?: string; fileData?: { fileUri: string; mimeType?: string } };

async function askGemini(apiKey: string, sys: string, parts: Part[], opts: { schema?: boolean; urlContext?: boolean } = {}) {
  const preferred = Deno.env.get("GEMINI_MODEL");
  const base = preferred ? [preferred, ...MODELS.filter((m) => m !== preferred)] : MODELS;
  // המודל הראשון מקבל ניסיון שני אם Gemini עמוס; אחר כך מודלים חלופיים (מודל שלא קיים מדולג מיד)
  const models = [base[0], base[0], ...FALLBACKS.filter((m) => !base.includes(m)), ...base.slice(1)];
  const began = Date.now();
  let busy = false;
  let lastError = "";
  for (const [i, model] of models.entries()) {
    if (Date.now() - began > 110000) break; // Supabase עוצר פונקציה אחרי 150 שניות
    if (i === 1) {
      if (!busy) continue;
      await new Promise((r) => setTimeout(r, 3000));
    }
    const started = Date.now();
    const generationConfig: Record<string, unknown> = { temperature: 0.2, maxOutputTokens: 8192 };
    if (opts.schema !== false) Object.assign(generationConfig, { responseMimeType: "application/json", responseSchema: SCHEMA });
    let res: Response;
    try {
      res = await fetch(`${API}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(PER_TRY_MS),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sys }] },
          contents: [{ role: "user", parts }],
          generationConfig,
          ...(opts.urlContext ? { tools: [{ url_context: {} }] } : {}),
        }),
      });
    } catch (e) {
      busy = true;
      lastError = `${model}: ${(e as Error).name}`;
      console.error("gemini fetch failed", lastError, `${Date.now() - started}ms`);
      continue;
    }
    const text = await res.text();
    console.log("gemini", model, res.status, `${Date.now() - started}ms`, res.ok ? "" : text.slice(0, 300));
    if (res.status === 404 || (res.status === 400 && /not found|not supported/i.test(text))) {
      lastError = `${model}: ${res.status}`;
      continue;
    }
    if ([429, 500, 503].includes(res.status)) {
      busy = true;
      lastError = `${model}: ${res.status}`;
      continue;
    }
    if (!res.ok) throw new Error(`gemini ${res.status}: ${text.slice(0, 300)}`);
    const data = JSON.parse(text);
    const out = (data.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
    const start = out.indexOf("{");
    const end = out.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error("gemini returned no JSON");
    return { model, result: JSON.parse(out.slice(start, end + 1)) as Record<string, unknown> };
  }
  const err = new Error(`no Gemini model available (${lastError})`);
  (err as Error & { busy?: boolean }).busy = busy;
  throw err;
}

// ---------- שמירת תמונה ----------

async function saveImage(db: ReturnType<typeof createClient>, houseId: string, url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": BROWSER_UA } });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[type];
    if (!ext) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 3000 || buf.length > 3 * 1024 * 1024) return null;
    const path = `${houseId}/${crypto.randomUUID()}.${ext}`;
    const up = await db.storage.from(BUCKET).upload(path, buf, { contentType: type, upsert: false });
    return up.error ? null : path;
  } catch {
    return null;
  }
}

// ---------- ניקוי התוצאה ----------

const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown, max: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n <= max ? n : null;
};

function tidy(result: Record<string, unknown>, tags: { id: string; name: string }[]) {
  const ingredients = (Array.isArray(result.ingredients) ? result.ingredients : [])
    .map((i: Record<string, unknown>) => ({ text: str(i?.text, 300).replace(/:$/, ""), header: Boolean(i?.header) }))
    .filter((i) => i.text)
    .slice(0, 80);
  const steps = (Array.isArray(result.steps) ? result.steps : [])
    .map((s: unknown) => str(s, 3000).replace(/^\d+[.)]\s*/, ""))
    .filter(Boolean)
    .slice(0, 40);
  const names = new Set((Array.isArray(result.tags) ? result.tags : []).map((t: unknown) => String(t).trim()));
  return {
    is_recipe: Boolean(result.is_recipe) && (ingredients.length > 0 || steps.length > 0),
    title: str(result.title, 120),
    description: str(result.description, 2000),
    servings_count: num(result.servings_count, 200),
    servings: str(result.servings_text, 40),
    prep_minutes: num(result.prep_minutes, 10000),
    cook_minutes: num(result.cook_minutes, 10000),
    difficulty: Math.min(5, Math.max(1, num(result.difficulty, 5) ?? 2)),
    ingredients: ingredients.map((i) => (i.header ? { text: i.text, header: true } : { text: i.text })),
    steps,
    tag_ids: tags.filter((t) => names.has(t.name)).map((t) => t.id),
    notes: str(result.notes, 500),
  };
}

// ---------- מתכון מובנה בלי AI ----------
// רוב אתרי המתכונים כותבים את המתכון גם בפורמט מובנה (schema.org). אם יש בו מצרכים והוראות,
// בונים ממנו את הטיוטה ישירות: מהיר, חינמי, ונאמן למקור.

const clean = (v: unknown) =>
  decodeEntities(String(v ?? "").replace(/<br\s*\/?>|<\/br>|<\/p>|<\/li>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t ]+/g, " ")
    .trim();

function isoMinutes(v: unknown) {
  const m = String(v ?? "").match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return null;
  const total = (Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0);
  return total > 0 && total < 10000 ? total : null;
}

function cookFromTotal(ld: Record<string, unknown>) {
  const total = isoMinutes(ld.totalTime);
  const prep = isoMinutes(ld.prepTime) ?? 0;
  return total && total > prep ? total - prep : null;
}

function ldSteps(v: unknown): string[] {
  if (!v) return [];
  if (typeof v === "string") {
    const text = clean(v);
    // "1. ... 2. ..." או שורות
    const lines = text.split(/\n+|(?:^|\s)(?=\d{1,2}[.)]\s)/).map((l) => l.trim()).filter(Boolean);
    return lines.map((l) => l.replace(/^\d{1,2}[.)]\s*/, "")).filter(Boolean);
  }
  if (Array.isArray(v)) return v.flatMap((x) => ldSteps(x));
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.itemListElement) return ldSteps(o.itemListElement);
    return ldSteps(o.text ?? o.name ?? "");
  }
  return [];
}

const MEAT = /בשר|עוף|חזה|שוק(?:יים|יות)|כרעיים|פרגי|בקר|כבש|הודו|נקניק|פסטרמה|אסאדו|שריר|כנפיים|כבד|צלעות|אנטריקוט|סינטה|קבב|המבורגר|שניצל|מרק עוף|ציר עוף/;
const DAIRY = /חלב(?!ון|וני| קוקוס| שקדים| סויה| שיבולת| אורז)|גבינ|חמאה|שמנת|יוגורט|פרמזן|מוצרלה|בולגרית|ריקוטה|לבנה|קשקבל|צהובה|מסקרפונה|פטה|גאודה|צ'דר/;

function kashrut(ingredients: string[], tags: { id: string; name: string }[]) {
  const text = ingredients.join("\n").replace(/פרווה|צמחי|טבעוני/g, "");
  const meat = MEAT.test(text);
  const dairy = DAIRY.test(text);
  const name = meat && !dairy ? "בשרי" : dairy && !meat ? "חלבי" : !meat && !dairy ? "פרווה" : "";
  return tags.filter((t) => t.name === name).map((t) => t.id);
}

function fromJsonLd(ld: Record<string, unknown>, tags: { id: string; name: string }[]) {
  const ingredients = (Array.isArray(ld.recipeIngredient) ? ld.recipeIngredient : ld.recipeIngredient ? [ld.recipeIngredient] : [])
    .flatMap((i) => clean(i).split("\n"))
    .map((i) => i.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 80);
  const steps = ldSteps(ld.recipeInstructions).map((s) => s.slice(0, 3000)).slice(0, 40);
  if (ingredients.length < 2 || steps.length < 1) return null;
  const yieldText = clean(Array.isArray(ld.recipeYield) ? ld.recipeYield.find((y) => /\D/.test(String(y))) ?? ld.recipeYield[0] : ld.recipeYield);
  const count = num(yieldText.match(/\d+/)?.[0], 200);
  return {
    is_recipe: true,
    title: clean(ld.name).slice(0, 120),
    description: clean(ld.description).slice(0, 600),
    servings_count: count,
    servings: /^\d+\s*(מנות|סועדים|servings?|portions?)?$/i.test(yieldText) ? "" : yieldText.slice(0, 40),
    prep_minutes: isoMinutes(ld.prepTime),
    cook_minutes: isoMinutes(ld.cookTime) ?? cookFromTotal(ld),
    difficulty: steps.length <= 4 ? 1 : steps.length <= 8 ? 2 : 3,
    ingredients: ingredients.map((text) => ({ text: text.slice(0, 300) })),
    steps,
    tag_ids: kashrut(ingredients, tags),
    notes: "",
  };
}

// ---------- הבקשה ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "bad_request" }, 405);

  const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";

  let body: { key?: string; url?: string; text?: string; with_image?: boolean; debug?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: begin, error } = await db.rpc("import_begin", { p_token: body.key ?? "" });
  if (error) {
    const code = ["ai_limit", "members_only", "invalid_link"].find((c) => error.message.includes(c)) ?? "default";
    return json({ error: code }, 400);
  }
  const tags = begin.tags as { id: string; name: string; group: string }[];
  const sys = system(tags.map((t) => `${t.name} (${t.group})`).join(", "));

  const pasted = str(body.text, 30000);
  let url = str(body.url, 2000);
  // הדביקו טקסט שהוא בעצם קישור (או קישור עם שם לפניו, כמו בשיתוף מגוגל)
  if (!url && pasted && /^\S*https?:\/\/\S+$/.test(pasted.split("\n").filter(Boolean).at(-1) ?? "") && pasted.length < 400) {
    url = pasted.match(/https?:\/\/\S+/)![0];
  }
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
  if (url) {
    try {
      new URL(url);
    } catch {
      return json({ error: "bad_url" }, 400);
    }
  }
  if (!url && !pasted) return json({ error: "nothing_to_import" }, 400);

  let parts: Part[];
  let urlContext = false;
  let imageUrl = "";
  let finalUrl = url;
  let fetched = "none";
  let direct: ReturnType<typeof fromJsonLd> = null;

  if (url) {
    let page: Awaited<ReturnType<typeof fetchPage>> | null = null;
    try {
      page = await fetchPage(url);
      finalUrl = page.finalUrl;
    } catch (e) {
      console.error("fetch failed", url, (e as Error).message);
    }
    const html = page?.html ?? "";
    const ld = html ? findJsonLdRecipe(html) : null;
    const caption = [meta(html, "og:title"), meta(html, "og:description") || meta(html, "description")].filter(Boolean).join("\n");
    imageUrl = html ? imageFrom(ld, html, finalUrl) : "";

    if (ld) direct = fromJsonLd(ld, tags);
    if (ld) {
      fetched = "jsonld";
      const { image: _i, review: _r, aggregateRating: _a, video: _v, ...clean } = ld;
      parts = [{ text: `מקור: ${finalUrl}\nמתכון מובנה מהדף:\n${JSON.stringify(clean).slice(0, 20000)}\n\nטקסט הדף (לעזר):\n${htmlToText(html).slice(0, 8000)}` }];
    } else if (isYouTube(finalUrl)) {
      // Gemini יודע לצפות בסרטוני יוטיוב ציבוריים
      fetched = "youtube";
      parts = [{ fileData: { fileUri: url } }, { text: `תיאור הסרטון:\n${caption}\n\nחלץ את המתכון מהסרטון.` }];
    } else if (html && page?.ok && (htmlToText(html).length > 400 || caption.length > 80)) {
      fetched = isSocial(finalUrl) ? "caption" : "html";
      parts = [{ text: `מקור: ${finalUrl}\n${caption}\n\nתוכן הדף:\n${htmlToText(html).slice(0, 25000)}` }];
    } else {
      // השרת שלנו לא הצליח להביא את הדף: מבקשים מ-Google להביא אותו
      fetched = "url_context";
      urlContext = true;
      parts = [{ text: `קרא את הדף ${url} וחלץ ממנו את המתכון. החזר JSON בלבד (בלי טקסט נוסף) עם השדות: ${Object.keys(SCHEMA.properties).join(", ")}.` }];
    }
    if (pasted && pasted !== url) parts.push({ text: `הערות שנכתבו יחד עם הקישור:\n${pasted}` });
  } else {
    fetched = "text";
    parts = [{ text: `ההודעה:\n${pasted}` }];
  }

  let model = "structured";
  let result: Record<string, unknown> = {};
  let recipe = direct;
  if (!recipe) {
    if (!apiKey) return json({ error: "ai_not_configured" }, 503);
    try {
      ({ model, result } = await askGemini(apiKey, sys, parts, { schema: !urlContext, urlContext }));
    } catch (e) {
      console.error(e);
      return json({ error: (e as { busy?: boolean }).busy ? "ai_busy" : "ai_error", fetched }, 502);
    }
    recipe = tidy(result, tags);
  }
  const debug = body.debug ? { input: parts.map((p) => p.text ?? p.fileData?.fileUri).join("\n").slice(0, 3000), raw: result } : undefined;
  if (!recipe.is_recipe) return json({ error: "not_a_recipe", fetched, title: recipe.title, notes: recipe.notes, debug }, 422);

  let image: string | null = null;
  if (body.with_image !== false && imageUrl) image = await saveImage(db, begin.house_id, imageUrl);

  // קישורים ארוכים עם פרמטרי מעקב (utm, fbclid) מקוצרים
  let source_url = "";
  if (url) {
    try {
      const u = new URL(finalUrl || url);
      [...u.searchParams.keys()].filter((k) => /^(utm_|fbclid|igsh|mibextid|referer|si$|s$|fs$)/i.test(k)).forEach((k) => u.searchParams.delete(k));
      source_url = u.href.slice(0, 1000);
    } catch {
      source_url = url.slice(0, 1000);
    }
  }

  return json({ recipe: { ...recipe, source_url, images: image ? [{ path: image }] : [] }, model, fetched, debug });
});
