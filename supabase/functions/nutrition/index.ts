// פונקציית שרת: הערכת ערכים תזונתיים ומחיר למתכון בעזרת Gemini.
// מפתח ה-API נשמר כסוד ב-Supabase (GEMINI_API_KEY) ולא מגיע לדפדפן.
// אפשר לבחור מודל אחר עם הסוד GEMINI_MODEL.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// gemini-3.5-flash ענה תוך ~11 שניות בבדיקה; 3.7 ו-3.8 לא ענו תוך 40 שניות (26.10.2026), ולכן הם גיבוי בלבד
const MODELS = ["gemini-3.5-flash", "gemini-3.7-flash", "gemini-3.8-flash"];
const API = "https://generativelanguage.googleapis.com/v1beta/models";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const NUM = { type: "NUMBER" };
const SCHEMA = {
  type: "OBJECT",
  properties: {
    servings: { type: "NUMBER", description: "כמה מנות המתכון מניב" },
    servings_assumed: { type: "BOOLEAN", description: "true אם מספר המנות הוא הערכה שלך" },
    ingredients: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          amount: { type: "STRING", description: "הכמות כפי שהבנת אותה, למשל '2 כוסות (280 ג׳)'" },
          grams: NUM, kcal: NUM, protein_g: NUM, carbs_g: NUM, fiber_g: NUM, fat_g: NUM, sat_fat_g: NUM,
          price_ils: { type: "NUMBER", description: "עלות הכמות שבשימוש בשקלים" },
        },
        required: ["name", "amount", "grams", "kcal", "protein_g", "carbs_g", "fiber_g", "fat_g", "sat_fat_g", "price_ils"],
      },
    },
    highlights: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { emoji: { type: "STRING" }, label: { type: "STRING" }, detail: { type: "STRING" } },
        required: ["emoji", "label", "detail"],
      },
    },
    assumptions: { type: "ARRAY", items: { type: "STRING" } },
    confidence: { type: "STRING", enum: ["low", "medium", "high"] },
  },
  required: ["servings", "servings_assumed", "ingredients", "highlights", "assumptions", "confidence"],
};

const SYSTEM = `אתה דיאטן ומבשל ביתי ישראלי. תפקידך להעריך ערכים תזונתיים ומחיר של מתכון ביתי.
כללים:
- לכל מצרך: הערך משקל בגרמים לפי מידות ישראליות מקובלות (כוס = 240 מ"ל; כוס קמח ≈ 140 ג׳; כוס סוכר ≈ 200 ג׳; כף ≈ 15 מ"ל; כפית ≈ 5 מ"ל; ביצה L ≈ 60 ג׳ בלי קליפה). כמות לא ברורה ("קצת", "לפי הטעם") – הערכה סבירה וקטנה.
- ערכים תזונתיים לכמות שבשימוש (לא ל-100 ג׳), לפי טבלאות תזונה מקובלות. מים ומלח ללא קלוריות.
- מחיר: הערכה גסה בשקלים, לפי מחירים טיפוסיים בסופרמרקט בישראל, יחסית לכמות שבשימוש (לא לאריזה שלמה). לא צריך דיוק.
- מספר מנות: אם נמסר מספר, השתמש בו (servings_assumed=false). אחרת הערך לפי הכמויות (servings_assumed=true).
- highlights: עד 5 תכונות תזונתיות בולטות באמת למנה אחת, יחסית לצריכה היומית המומלצת. דוגמאות: "עשיר באומגה 3", "מקור מצוין לוויטמין A", "עשיר בברזל", "עשיר בסיבים", "עתיר חלבון", "עשיר בוויטמין C", וגם אזהרות כמו "עשיר בשומן רווי" או "עתיר נתרן". detail = משפט קצר שמסביר ממה זה נובע. אם אין משהו בולט, החזר רשימה ריקה.
- assumptions: ההנחות העיקריות שעשית (עד 6), במשפטים קצרים.
- כל הטקסטים בעברית.`;

function clean(n: unknown) {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}
const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const KEYS = ["kcal", "protein_g", "carbs_g", "fiber_g", "fat_g", "sat_fat_g", "price_ils"] as const;

const PER_TRY_MS = 35000; // Supabase עוצר פונקציה אחרי 150 שניות, אז לא מחכים לנצח לניסיון אחד

async function askGemini(apiKey: string, prompt: string) {
  const preferred = Deno.env.get("GEMINI_MODEL");
  const base = preferred ? [preferred, ...MODELS.filter((m) => m !== preferred)] : MODELS;
  // המודל הראשון מקבל ניסיון שני אם Gemini עמוס, ואז עוברים למודלים הבאים
  const models = [base[0], base[0], ...base.slice(1)];
  let lastError = "";
  let busy = false;
  for (const [i, model] of models.entries()) {
    if (i === 1) {
      if (!busy) continue; // הניסיון הראשון לא נכשל בגלל עומס
      await new Promise((r) => setTimeout(r, 2500));
    }
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`${API}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(PER_TRY_MS),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.2, maxOutputTokens: 8192 },
        }),
      });
    } catch (e) {
      busy = true;
      lastError = `${model}: ${(e as Error).name} after ${Date.now() - started}ms`;
      console.error("gemini fetch failed", lastError);
      continue;
    }
    const text = await res.text();
    console.log("gemini", model, res.status, `${Date.now() - started}ms`, res.ok ? "" : text.slice(0, 1500).replace(/\s+/g, " "));
    // מודל שלא קיים (הוצא משימוש) → מנסים את הבא ברשימה
    if (res.status === 404 || (res.status === 400 && /not found|not supported/i.test(text))) {
      lastError = `${model}: ${res.status}`;
      continue;
    }
    // עומס זמני אצל Google → ממתינים רגע או עוברים למודל אחר
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
    return { model, result: JSON.parse(out.slice(start, end + 1)) };
  }
  const err = new Error(`no Gemini model available (${lastError})`);
  (err as Error & { busy?: boolean }).busy = busy;
  throw err;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "bad_request" }, 405);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "ai_not_configured" }, 503);

  let body: { key?: string; recipe_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // בודק שהשולח בן בית, שהמתכון שלו, ושלא עברו את המגבלה היומית
  const { data: input, error } = await db.rpc("nutrition_input", { p_token: body.key ?? "", p_recipe_id: body.recipe_id });
  console.log("nutrition_input", error ? `error: ${error.message}` : "ok");
  if (error) {
    const code = ["ai_limit", "members_only", "not_found", "invalid_link"].find((c) => error.message.includes(c)) ?? "default";
    return json({ error: code }, 400);
  }

  const lines = (input.ingredients as { text: string; header?: boolean }[])
    .filter((i) => i.text)
    .map((i) => (i.header ? `\n[${i.text}]` : `- ${i.text}`))
    .join("\n");
  if (!lines.trim()) return json({ error: "no_ingredients" }, 400);

  const prompt = `מתכון: ${input.title}
${input.servings_count ? `מספר מנות: ${input.servings_count}` : input.servings_text ? `כמות (כפי שנכתב): ${input.servings_text}` : "מספר מנות: לא צוין"}
מצרכים:
${lines}`;

  let model: string, result: Record<string, unknown>;
  try {
    ({ model, result } = await askGemini(apiKey, prompt));
  } catch (e) {
    console.error(e);
    return json({ error: (e as { busy?: boolean }).busy ? "ai_busy" : "ai_error" }, 502);
  }

  // לא סומכים על החשבון של המודל: מסכמים בעצמנו
  const ingredients = (Array.isArray(result.ingredients) ? result.ingredients : []).slice(0, 60).map((i: Record<string, unknown>) => ({
    name: String(i.name ?? "").slice(0, 80),
    amount: String(i.amount ?? "").slice(0, 80),
    grams: round(clean(i.grams), 0),
    ...Object.fromEntries(KEYS.map((k) => [k, round(clean(i[k]))])),
  }));
  const total = Object.fromEntries(KEYS.map((k) => [k, round(ingredients.reduce((s, i) => s + (i as Record<string, number>)[k], 0))]));
  const servings = Math.max(1, Math.round(input.servings_count || clean(result.servings) || 1));
  const per_serving = Object.fromEntries(KEYS.map((k) => [k, round((total as Record<string, number>)[k] / servings)]));

  const data = {
    servings,
    servings_assumed: !input.servings_count && Boolean(result.servings_assumed ?? true),
    total,
    per_serving,
    ingredients,
    highlights: (Array.isArray(result.highlights) ? result.highlights : []).slice(0, 5).map((h: Record<string, unknown>) => ({
      emoji: String(h.emoji ?? "✨").slice(0, 8),
      label: String(h.label ?? "").slice(0, 60),
      detail: String(h.detail ?? "").slice(0, 200),
    })),
    assumptions: (Array.isArray(result.assumptions) ? result.assumptions : []).slice(0, 6).map((a: unknown) => String(a).slice(0, 200)),
    confidence: ["low", "medium", "high"].includes(String(result.confidence)) ? result.confidence : "medium",
  };

  const save = await db.rpc("save_nutrition", { p_token: body.key, p_recipe_id: body.recipe_id, p_hash: input.hash, p_data: data, p_model: model });
  if (save.error) return json({ error: "default" }, 500);
  return json({ nutrition: { data, model, created_at: new Date().toISOString(), stale: false } });
});
