// פונקציית שרת להעלאה ולמחיקה של תמונות מתכונים.
// רק בן בית (עם מפתח מכשיר תקף) מקבל כתובת העלאה חתומה, ורק לתיקייה של הבית שלו.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const BUCKET = "recipe-images";
const MAX_FILES = 12;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "bad_request" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  let body: { action?: string; key?: string; count?: number; ext?: string; paths?: string[]; thumbs?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  // מי שולח? רק בני בית מורשים
  const { data: who, error: whoErr } = await admin.rpc("whoami", { p_token: body.key ?? "" });
  if (whoErr || !who) return json({ error: "invalid_link" }, 401);
  if (who.role !== "member") return json({ error: "members_only" }, 403);
  const prefix = `${who.house_id}/`;

  if (body.action === "sign") {
    const count = Math.min(Math.max(Number(body.count) || 1, 1), MAX_FILES);
    const ext = ["webp", "jpg", "png"].includes(body.ext ?? "") ? body.ext : "webp";
    const uploads = [];
    for (let i = 0; i < count; i++) {
      const id = `${prefix}${crypto.randomUUID()}`;
      const path = `${id}.${ext}`;
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error) return json({ error: "storage_error" }, 500);
      const upload: Record<string, string> = { path, token: data.token };
      // תמונה מוקטנת לכרטיסים: אותו שם עם _t
      if (body.thumbs) {
        const thumbPath = `${id}_t.${ext}`;
        const t = await admin.storage.from(BUCKET).createSignedUploadUrl(thumbPath);
        if (t.error) return json({ error: "storage_error" }, 500);
        upload.thumbPath = thumbPath;
        upload.thumbToken = t.data.token;
      }
      uploads.push(upload);
    }
    return json({ uploads });
  }

  if (body.action === "delete") {
    const paths = (body.paths ?? []).filter((p) => typeof p === "string" && p.startsWith(prefix)).slice(0, 100);
    if (paths.length) await admin.storage.from(BUCKET).remove(paths);
    return json({ deleted: paths.length });
  }

  return json({ error: "bad_request" }, 400);
});
