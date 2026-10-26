-- ייבוא מתכון מקישור או מטקסט (פונקציית השרת "import" קוראת לזה)
-- מגבלה נפרדת מחישובי הערכים: 200 ייבואים ביום לבית.

alter table app.ai_usage add column if not exists kind text not null default 'nutrition';

-- חישובי ערכים סופרים רק את עצמם
create or replace function public.nutrition_input(p_token text, p_recipe_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; r app.recipes; used int;
begin
  select * into a from app.require_member(p_token);
  select * into r from app.recipes where id = p_recipe_id and house_id = a.house_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  select count(*) into used from app.ai_usage
   where house_id = a.house_id and kind = 'nutrition' and created_at > now() - interval '1 day';
  if used >= 40 then raise exception 'ai_limit'; end if;
  return jsonb_build_object('title', r.title, 'ingredients', r.ingredients, 'servings_count', r.servings_count,
                            'servings_text', r.servings, 'hash', app.nutrition_hash(r.id));
end $$;

-- בודק שהשולח בן בית ושלא עברו את המגבלה, רושם שימוש, ומחזיר את התגיות של הבית (כדי שה-AI יציע מהן)
create or replace function public.import_begin(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; used int;
begin
  select * into a from app.require_member(p_token);
  select count(*) into used from app.ai_usage
   where house_id = a.house_id and kind = 'import' and created_at > now() - interval '1 day';
  if used >= 200 then raise exception 'ai_limit'; end if;
  insert into app.ai_usage (house_id, kind) values (a.house_id, 'import');
  return jsonb_build_object(
    'house_id', a.house_id,
    'tags', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'group', g.name))
                      from app.tags t join app.tag_groups g on g.id = t.group_id
                      where g.house_id = a.house_id), '[]'));
end $$;

grant execute on function public.import_begin(text) to anon, authenticated;
