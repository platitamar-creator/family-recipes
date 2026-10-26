-- חישוב ערכים ומחיר לכל הספר, לאט ולבד (מתאים לחבילה החינמית של Gemini).
-- משימה מתוזמנת (pg_cron) שולחת כל 15 דקות מתכון אחד לפונקציית השרת "nutrition", לפי סדר חשיבות,
-- ומכבה את עצמה כשאין יותר מה לחשב (או אחרי 3 ימים).
--
-- סדר החשיבות (tier):
--   1  מתכונים שכבר בישלו או שדירגו 7 ומעלה: מה שהבית באמת אוכל
--   2  מתכונים משפחתיים (בלי קישור) עם כמויות ברורות
--   3  מתכונים מאתרים עם כמויות ברורות
--   4  מתכונים שרק חלק מהמצרכים בהם עם כמות (החישוב יהיה גס)
--   5  מתכונים שדורגו נמוך (מתחת ל-5)
-- לא מחשבים בכלל:
--   - "עוד לא הכנו"
--   - מתכונים שפחות מ-40% מהמצרכים שלהם עם כמות (זה יהיה ניחוש)
--   - מתכונים עם הסימון ⚠️ (הכמויות לא נקלטו מהאתר)
--   - מתכונים שכבר יש להם חישוב עדכני
-- כישלון (עומס, מכסה יומית): המתכון מחכה שעה × מספר הניסיונות (עד 6 שעות), ואחרי 12 ניסיונות מוותרים עליו.

create extension if not exists pg_cron;

create table if not exists app.batch_config (k text primary key, v text not null);
alter table app.batch_config enable row level security;

create table if not exists app.nutrition_batch (
  recipe_id   uuid primary key references app.recipes on delete cascade,
  tries       int not null default 0,
  last_try    timestamptz,
  last_status int,
  last_error  text,
  req         bigint
);
alter table app.nutrition_batch enable row level security;

create or replace function app.nutrition_candidates()
returns table (recipe_id uuid, tier int, rating numeric, title text)
language sql stable set search_path = '' as $$
  with q as (
    select r.id, r.title, r.source_url is null as family, r.description like '⚠️%' as warn,
      (select count(*) from app.cook_log k where k.recipe_id = r.id) as cooks,
      (select avg(m.score) from app.member_ratings m where m.recipe_id = r.id) as rating,
      (select count(*) from jsonb_array_elements(r.ingredients) i
        where not coalesce((i->>'header')::boolean, false)) as n,
      (select count(*) from jsonb_array_elements(r.ingredients) i
        where not coalesce((i->>'header')::boolean, false)
          and i->>'text' ~ '\d|½|¼|¾|חצי|רבע|שליש|כוס|כף|כפית|גרם|ק"ג|קילו|צרור|חבילה|חבילת|קופס|מיכל|שן |שיני|חופן|ליטר|מ"ל|פחית|שקית|יחידות|ענפי|גבעול') as withq,
      (select n.input_hash = app.nutrition_hash(r.id) from app.recipe_nutrition n where n.recipe_id = r.id) as fresh
    from app.recipes r
    where r.house_id = (select v::uuid from app.batch_config where k = 'house_id')
      and r.deleted_at is null and not r.untried
  )
  select id,
    case when rating < 5 then 5
         when cooks > 0 or rating >= 7 then 1
         when family and withq::numeric / n >= 0.5 then 2
         when withq::numeric / n >= 0.6 then 3
         else 4 end,
    rating, title
  from q
  where not coalesce(fresh, false) and not warn and n > 0 and withq::numeric / n >= 0.4;
$$;

create or replace function app.nutrition_tick()
returns text language plpgsql security definer set search_path = '' as $$
declare
  key text := (select v from app.batch_config where k = 'device_key');
  started timestamptz := (select v::timestamptz from app.batch_config where k = 'started');
  nxt record;
begin
  -- תוצאות של הסבב הקודם
  update app.nutrition_batch b set last_status = r.status_code, last_error = left(coalesce(r.content, r.error_msg), 300), req = null
    from net._http_response r where r.id = b.req;
  -- בקשה שנתקעה (אין תשובה אחרי 10 דקות)
  update app.nutrition_batch set req = null, last_error = 'no response' where req is not null and last_try < now() - interval '10 minutes';

  if key is null then return 'no key'; end if;
  if now() > started + interval '3 days' or not exists (select 1 from app.nutrition_candidates()) then
    perform cron.unschedule(jobname) from cron.job where jobname in ('nutrition-batch', 'nutrition-wake');
    return 'finished';
  end if;
  if exists (select 1 from app.nutrition_batch where req is not null) then return 'waiting'; end if;

  select c.* into nxt
  from app.nutrition_candidates() c
  left join app.nutrition_batch b on b.recipe_id = c.recipe_id
  where coalesce(b.tries, 0) < 12
    and (b.last_try is null or b.last_try < now() - interval '1 hour' * least(b.tries, 6))
  order by c.tier, coalesce(b.tries, 0), c.rating desc nulls last, c.title
  limit 1;
  if not found then return 'nothing ready'; end if;

  insert into app.nutrition_batch (recipe_id) values (nxt.recipe_id) on conflict do nothing;
  update app.nutrition_batch
     set tries = tries + 1, last_try = now(),
         req = net.http_post(
           url := 'https://hbapsveehonfhijnnmsj.supabase.co/functions/v1/nutrition',
           body := jsonb_build_object('key', key, 'recipe_id', nxt.recipe_id),
           headers := '{"Content-Type":"application/json"}'::jsonb,
           timeout_milliseconds := 150000)
   where recipe_id = nxt.recipe_id;
  return 'sent: ' || nxt.title;
end $$;

-- ההפעלה עצמה (המפתח נשמר בנפרד, לא בקובץ הזה):
--   insert into app.batch_config values ('house_id', '<בית>'), ('device_key', '<מפתח מכשיר>'), ('started', now()::text);
--   select cron.schedule('nutrition-batch', '*/15 * * * *', 'select app.nutrition_tick()');
--   select cron.schedule('nutrition-wake', '* * * * *', 'select net.wake()');
