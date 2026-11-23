# ספר המתכונים המשפחתי (family-recipes)

Hebrew-only, RTL family recipe book. Owner: Itamar (non-developer). **Talk to him in Hebrew**, short and simple, no jargon.
Live site: https://platitamar-creator.github.io/family-recipes/ (GitHub Pages from `main`, repo root). Pushing to `main` deploys.

## Stack
- Static site: `index.html` + vanilla JS ES modules (`js/`) + Tailwind 3.4.16 built locally.
  After changing Tailwind classes or `css/input.css`, run `npm run build:css` and **commit `css/app.css`** (Pages serves files as-is).
- Backend: Supabase project **`family-recipes`**, ref/id `hbapsveehonfhijnnmsj` (eu-central-1). Fully separate from the owner's `home-budget` app — never link them.
- `js/config.js` holds the Supabase URL + legacy anon JWT (public by design).
- PWA: `manifest.webmanifest` (incl. `share_target` for Android "share → המתכונים") and `sw.js`.
  **When adding a JS file, add it to `SHELL_FILES` in `sw.js`. Bump `VERSION` in `sw.js` on every release.**

## Security model (do not weaken)
- All tables live in private schema `app` (RLS on, no policies, not exposed to the API).
- The browser only calls `SECURITY DEFINER` functions in `public` with `search_path = ''`. Each takes `p_token`, resolved by `app.resolve()` to a role:
  member device key (sha256 in `app.member_devices`) → full access; house `view_token` → read + comments/variations; recipe `share_token` → one recipe.
- Images: bucket `recipe-images` (public read). Uploads only via signed URLs from the `images` edge function. Thumbnails are `<id>_t.<ext>`.

## Database migrations (`supabase/migrations/`, all applied)
001 schema · 002 functions · 003 source_url · 004 cook log ("הכנתי!") · 005 member archive, 30-day trash, "someone is editing", nutrition, keepalive ·
006 pg_net · 007 import (`import_begin`, `ai_usage.kind`) · 008 `price_per_serving` in `get_house` · 009 `untried` ("עוד לא הכנו") ·
010 background nutrition batch (pg_cron; finished and unscheduled — kept for re-use).
Big functions (`get_house`, `get_recipe`, `save_recipe`, `log_cook`) are redefined in later migrations: **the latest migration that contains a function is the source of truth**. Copy it from there when changing it.

## Edge functions (`supabase/functions/`, deployed with verify_jwt = false; each checks the token itself)
- `images`: sign uploads / delete.
- `nutrition`: Gemini estimate of nutrition + price per recipe and per serving; the server sums the totals. Limit 40/day per house.
- `import`: recipe from URL or free text. It first reads schema.org JSON-LD from the page **without AI**; only otherwise does it call Gemini (url_context / YouTube fileData). `polish()` cleans steps, ingredients and titles.
- AI provider today is **Gemini** (chosen to save Claude usage). This is a preference, **not a hard rule**: the owner is open to Claude (Anthropic API) if Gemini becomes a blocker (quota, quality). Propose it with the cost before switching. Secret `GEMINI_API_KEY` is set in Supabase; optional `GEMINI_MODEL`.
  The key is on the **free tier: 20 requests/day per model**, reset ≈10:00 Israel time. The import function also tries fallback models.

## Frontend map
`js/app.js` hash router: `#/`, `#/join/<t>`, `#/h/<house>[/r/<id>|/edit/<id|new>|/tags|/settings|/timeline|/shop/<id,id>]`, `#/v/<viewToken>/...`, `#/r/<shareToken>`.
Views in `js/views/`: house (sort list `SORTS` — add a sort by adding one line; untried section; multi-select for shopping; import modal; emoji picker),
recipe, editor (drafts in sessionStorage, conflict handling, import box, untried checkbox), shop (combined shopping list), timeline, tags, settings, home, join.
`js/shopping.js` merges ingredients across recipes. `js/api.js` holds `rpc`, `rpcCached` (stale-while-revalidate in localStorage) and the Hebrew error messages.

## Working here — gotchas
- **This sandbox cannot reach `*.supabase.co` or recipe sites directly.** Use the Supabase MCP tools. To call an edge function from here,
  use `net.http_post(...)` in SQL, then `select net.wake();` in a separate statement, then read `net._http_response`.
- Deploying an edge function via MCP needs the **full file content** inline; syntax-check first (`npx esbuild <file> --loader:.ts=ts`).
- Supabase MCP calls that contain `delete`/`drop`/`revoke` (or an UPDATE without WHERE) can trigger an approval prompt that may not reach the owner and times out.
  **Give destructive SQL to the owner to run in Supabase → SQL Editor** instead.
- Tests: `tests/` has a mock Supabase (`mock.js`, routed via Playwright) and end-to-end scripts. Run:
  `python3 -m http.server 8765 &` from the repo root, then `cd tests && node e2e-<name>.js` (Chromium/Playwright preinstalled; contexts use `serviceWorkers: 'block'`).
  Add new mock functions to `mock.js` whenever you add an RPC. Screenshots go to `tests/shots/` (gitignored).
- The keepalive GitHub workflow (`.github/workflows/keepalive.yml`) pings Supabase every 3 days so the free project never pauses (owner may not open the app for a month).

## Owner's preferences
- Never delete history (archived members keep everything they wrote). Recipe deletion is a 30-day soft delete.
- No backups needed. Prefer zero cost (free tiers); small costs are open to discussion.
- Warm, homey, funny design. All UI text in Hebrew.
- Before bulk changes to his data (e.g. text replacement across recipes), check what would change first.

## Shared Supabase project — do not touch
The same Supabase project also hosts the owner's **other app, "סדנת מיפוי אתגרם"** (a different Claude session): tables `public.workshop_*` and the cron job `workshop-hourly-snapshot`.
It is in active use. Leave it alone unless the owner asks.
