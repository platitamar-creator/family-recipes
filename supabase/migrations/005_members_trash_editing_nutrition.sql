-- עדכון 5: ניהול בני בית (בלי למחוק כלום), סל מיחזור למתכונים, "מישהו עורך עכשיו",
-- מספר מנות, ערכים תזונתיים ומחיר (Gemini), ופונקציית "דופק" שמונעת השהיה של הפרויקט.

------------------------------------------------------------
-- עמודות וטבלאות חדשות
------------------------------------------------------------
alter table app.members add column if not exists archived_at timestamptz;
alter table app.recipes add column if not exists deleted_at timestamptz;
alter table app.recipes add column if not exists deleted_by uuid references app.members on delete set null;
alter table app.recipes add column if not exists servings_count smallint check (servings_count between 1 and 200);
create index if not exists recipes_deleted_by_idx on app.recipes (deleted_by);

-- מי פתח את המתכון לעריכה (מתעדכן כל דקה בזמן שהעורך פתוח)
create table if not exists app.recipe_editing (
  recipe_id  uuid not null references app.recipes on delete cascade,
  member_id  uuid not null references app.members on delete cascade,
  since      timestamptz not null default now(),
  heartbeat  timestamptz not null default now(),
  primary key (recipe_id, member_id)
);
create index if not exists recipe_editing_member_idx on app.recipe_editing (member_id);
alter table app.recipe_editing enable row level security;

-- ערכים תזונתיים ומחיר שחושבו ע"י AI
create table if not exists app.recipe_nutrition (
  recipe_id   uuid primary key references app.recipes on delete cascade,
  input_hash  text not null,
  data        jsonb not null,
  model       text not null default '',
  created_at  timestamptz not null default now()
);
alter table app.recipe_nutrition enable row level security;

-- מגבלה יומית על חישובי AI לכל בית
create table if not exists app.ai_usage (
  id          bigserial primary key,
  house_id    uuid not null references app.houses on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists ai_usage_house_idx on app.ai_usage (house_id, created_at);
alter table app.ai_usage enable row level security;

------------------------------------------------------------
-- עזרים
------------------------------------------------------------
create or replace function app.members_json(p_house uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.display_name, 'color', m.color,
                                               'archived', m.archived_at is not null)
                            order by m.created_at), '[]')
  from app.members m where m.house_id = p_house;
$$;

create or replace function app.active_members_json(p_house uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.display_name, 'color', m.color)
                            order by m.created_at), '[]')
  from app.members m where m.house_id = p_house and m.archived_at is null;
$$;

-- מתכון שנמחק (בסל המיחזור) לא נפתח מקישור
create or replace function app.resolve(
  p_token text,
  out house_id uuid, out role text, out member_id uuid, out recipe_id uuid)
language plpgsql stable set search_path = '' as $$
begin
  if p_token is null or char_length(p_token) < 20 or char_length(p_token) > 100 then
    raise exception 'invalid_link';
  end if;

  select m.house_id, m.id into house_id, member_id
  from app.member_devices d join app.members m on m.id = d.member_id
  where d.key_hash = app.hash_key(p_token);
  if found then role := 'member'; return; end if;

  select h.id into house_id from app.houses h where h.view_token = p_token;
  if found then role := 'viewer'; return; end if;

  select r.house_id, r.id into house_id, recipe_id from app.recipes r
  where r.share_token = p_token and r.deleted_at is null;
  if found then role := 'recipe_viewer'; return; end if;

  raise exception 'invalid_link';
end $$;

create or replace function app.recipe_access(p_token text, p_recipe_id uuid,
  out house_id uuid, out role text, out member_id uuid, out recipe_id uuid)
language plpgsql stable set search_path = '' as $$
declare a record;
begin
  select * into a from app.resolve(p_token);
  if a.role = 'recipe_viewer' then
    if p_recipe_id is not null and p_recipe_id <> a.recipe_id then raise exception 'not_found'; end if;
    recipe_id := a.recipe_id;
  else
    perform 1 from app.recipes r where r.id = p_recipe_id and r.house_id = a.house_id and r.deleted_at is null;
    if not found then raise exception 'not_found'; end if;
    recipe_id := p_recipe_id;
  end if;
  house_id := a.house_id; role := a.role; member_id := a.member_id;
end $$;

-- "טביעת אצבע" של מה שהחישוב התזונתי תלוי בו: אם משתנה, החישוב לא עדכני
create or replace function app.nutrition_hash(p_recipe uuid) returns text
language sql stable set search_path = '' as $$
  select md5(r.title || '|' || r.ingredients::text || '|' || coalesce(r.servings_count::text, '') || '|' || coalesce(r.servings, ''))
  from app.recipes r where r.id = p_recipe;
$$;

------------------------------------------------------------
-- בני בית: העברה לארכיון (שומר את כל מה שהם כתבו), החזרה, ניתוק מכשירים
------------------------------------------------------------
create or replace function public.house_preview(p_member_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare h app.houses;
begin
  select * into h from app.houses where member_token = p_member_token;
  if not found then raise exception 'invalid_link'; end if;
  return jsonb_build_object('house_id', h.id, 'name', h.name, 'emoji', h.emoji,
                            'members', app.active_members_json(h.id));
end $$;

create or replace function public.join_house(p_member_token text, p_name text, p_member_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare h app.houses; m_id uuid;
begin
  select * into h from app.houses where member_token = p_member_token;
  if not found then raise exception 'invalid_link'; end if;

  if p_member_id is not null then
    select id into m_id from app.members where id = p_member_id and house_id = h.id and archived_at is null;
    if not found then raise exception 'not_found'; end if;
  else
    if app.clean(p_name, 40) is null then raise exception 'name_required'; end if;
    insert into app.members (house_id, display_name, color)
    values (h.id, app.clean(p_name, 40), app.pick_color(h.id))
    returning id into m_id;
  end if;

  return jsonb_build_object('house_id', h.id, 'house_name', h.name, 'emoji', h.emoji,
                            'member', app.member_json(m_id), 'key', app.new_device(m_id));
end $$;

create or replace function public.archive_member(p_token text, p_member_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from app.require_member(p_token);
  if p_member_id = a.member_id then raise exception 'cannot_self'; end if;
  update app.members set archived_at = now() where id = p_member_id and house_id = a.house_id;
  if not found then raise exception 'not_found'; end if;
  -- המכשירים שלו מתנתקים, אבל הדירוגים, ההערות וההכנות נשארים
  delete from app.member_devices where member_id = p_member_id;
end $$;

create or replace function public.restore_member(p_token text, p_member_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from app.require_member(p_token);
  update app.members set archived_at = null where id = p_member_id and house_id = a.house_id;
  if not found then raise exception 'not_found'; end if;
end $$;

-- למשל טלפון שאבד: כל המכשירים של בן הבית מתנתקים, והוא יכול להתחבר שוב מקישור ההצטרפות
create or replace function public.revoke_member_devices(p_token text, p_member_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare a record; n int;
begin
  select * into a from app.require_member(p_token);
  perform 1 from app.members where id = p_member_id and house_id = a.house_id;
  if not found then raise exception 'not_found'; end if;
  delete from app.member_devices where member_id = p_member_id;
  get diagnostics n = row_count;
  return n;
end $$;

------------------------------------------------------------
-- סל מיחזור: מחיקה רכה, שחזור, וניקוי אחרי 30 יום
------------------------------------------------------------
create or replace function public.delete_recipe(p_token text, p_recipe_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from app.require_member(p_token);
  update app.recipes set deleted_at = now(), deleted_by = a.member_id
   where id = p_recipe_id and house_id = a.house_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  return '[]'::jsonb; -- התמונות נשארות עד הניקוי הסופי
end $$;

create or replace function public.restore_recipe(p_token text, p_recipe_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from app.require_member(p_token);
  update app.recipes set deleted_at = null, deleted_by = null
   where id = p_recipe_id and house_id = a.house_id and deleted_at is not null;
  if not found then raise exception 'not_found'; end if;
end $$;

-- מחזיר את סל המיחזור. מתכונים שנמחקו לפני יותר מ-30 יום נמחקים סופית,
-- ונתיבי התמונות שלהם חוזרים כדי שהאתר ימחק אותן מהאחסון.
create or replace function public.get_trash(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; purged jsonb;
begin
  select * into a from app.require_member(p_token);
  select coalesce(jsonb_agg(i.path), '[]') into purged
    from app.recipe_images i join app.recipes r on r.id = i.recipe_id
   where r.house_id = a.house_id and r.deleted_at < now() - interval '30 days';
  delete from app.recipes where house_id = a.house_id and deleted_at < now() - interval '30 days';

  return jsonb_build_object(
    'purged_paths', purged,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title, 'deleted_at', r.deleted_at, 'deleted_by', app.member_json(r.deleted_by),
        'cover', (select ri.path from app.recipe_images ri where ri.recipe_id = r.id order by ri.sort_order limit 1))
        order by r.deleted_at desc)
      from app.recipes r where r.house_id = a.house_id and r.deleted_at is not null), '[]'));
end $$;

------------------------------------------------------------
-- "מישהו עורך עכשיו"
------------------------------------------------------------
create or replace function public.start_editing(p_token text, p_recipe_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from app.require_member(p_token);
  perform 1 from app.recipes where id = p_recipe_id and house_id = a.house_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  insert into app.recipe_editing (recipe_id, member_id) values (p_recipe_id, a.member_id)
  on conflict (recipe_id, member_id) do update
    set heartbeat = now(),
        since = case when app.recipe_editing.heartbeat < now() - interval '3 minutes' then now() else app.recipe_editing.since end;
  -- מי עוד עורך (פעיל ב-3 הדקות האחרונות)
  return coalesce((select jsonb_agg(jsonb_build_object('member', app.member_json(e.member_id), 'since', e.since))
                   from app.recipe_editing e
                   where e.recipe_id = p_recipe_id and e.member_id <> a.member_id
                     and e.heartbeat > now() - interval '3 minutes'), '[]');
end $$;

create or replace function public.stop_editing(p_token text, p_recipe_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from app.require_member(p_token);
  delete from app.recipe_editing where recipe_id = p_recipe_id and member_id = a.member_id;
end $$;

------------------------------------------------------------
-- מתכונים: שמירה עם מספר מנות ובדיקת התנגשות, קריאה עם ערכים תזונתיים
------------------------------------------------------------
create or replace function public.save_recipe(p_token text, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a record; rid uuid := nullif(p_data->>'id', '')::uuid; link text := app.clean(p_data->>'source_url', 1000);
        cur timestamptz; cnt smallint := nullif(p_data->>'servings_count', '')::smallint;
begin
  if link is not null and link !~* '^https?://' then link := 'https://' || link; end if;
  select * into a from app.require_member(p_token);
  if app.clean(p_data->>'title', 120) is null then raise exception 'name_required'; end if;

  if rid is null then
    insert into app.recipes (house_id, title, description, difficulty, prep_minutes, cook_minutes, servings, servings_count,
                             ingredients, steps, share_token, created_by, updated_by, source_url)
    values (a.house_id, app.clean(p_data->>'title', 120), coalesce(app.clean(p_data->>'description', 2000), ''),
            coalesce((p_data->>'difficulty')::smallint, 2),
            nullif(p_data->>'prep_minutes', '')::int, nullif(p_data->>'cook_minutes', '')::int,
            app.clean(p_data->>'servings', 40), cnt,
            coalesce(p_data->'ingredients', '[]'), coalesce(p_data->'steps', '[]'),
            app.new_token(), a.member_id, a.member_id, link)
    returning id into rid;
  else
    select updated_at into cur from app.recipes where id = rid and house_id = a.house_id and deleted_at is null;
    if not found then raise exception 'not_found'; end if;
    -- מישהו אחר שמר בזמן שערכת
    if p_data ? 'expected_updated_at' and not coalesce((p_data->>'force')::boolean, false)
       and cur > (p_data->>'expected_updated_at')::timestamptz then
      raise exception 'edit_conflict';
    end if;
    update app.recipes set
      title = app.clean(p_data->>'title', 120),
      description = coalesce(app.clean(p_data->>'description', 2000), ''),
      difficulty = coalesce((p_data->>'difficulty')::smallint, difficulty),
      prep_minutes = nullif(p_data->>'prep_minutes', '')::int,
      cook_minutes = nullif(p_data->>'cook_minutes', '')::int,
      servings = app.clean(p_data->>'servings', 40),
      servings_count = cnt,
      ingredients = coalesce(p_data->'ingredients', '[]'),
      steps = coalesce(p_data->'steps', '[]'),
      source_url = link,
      updated_by = a.member_id,
      updated_at = now()
    where id = rid and house_id = a.house_id;
  end if;

  if p_data ? 'tag_ids' then
    delete from app.recipe_tags where recipe_id = rid;
    insert into app.recipe_tags (recipe_id, tag_id)
    select rid, t.id from app.tags t
    where t.house_id = a.house_id
      and t.id::text in (select jsonb_array_elements_text(p_data->'tag_ids'));
  end if;

  if p_data ? 'images' then
    delete from app.recipe_images where recipe_id = rid;
    insert into app.recipe_images (recipe_id, path, width, height, sort_order)
    select rid, img->>'path', nullif(img->>'width', '')::int, nullif(img->>'height', '')::int, ord
    from jsonb_array_elements(p_data->'images') with ordinality as x(img, ord)
    where (img->>'path') like a.house_id::text || '/%'
      and ord <= 12;
  end if;

  delete from app.recipe_editing where recipe_id = rid and member_id = a.member_id;
  return rid;
end $$;

create or replace function public.get_recipe(p_token text, p_recipe_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; r app.recipes; h app.houses;
begin
  select * into a from app.recipe_access(p_token, p_recipe_id);
  select * into r from app.recipes where id = a.recipe_id;
  select * into h from app.houses where id = r.house_id;

  return jsonb_build_object(
    'role', a.role,
    'me', app.member_json(a.member_id),
    'house', jsonb_build_object('id', h.id, 'name', h.name, 'emoji', h.emoji),
    'members', app.members_json(h.id),
    'recipe', jsonb_build_object(
      'id', r.id, 'title', r.title, 'description', r.description, 'difficulty', r.difficulty,
      'prep_minutes', r.prep_minutes, 'cook_minutes', r.cook_minutes, 'servings', r.servings,
      'servings_count', r.servings_count,
      'ingredients', r.ingredients, 'steps', r.steps, 'share_token', r.share_token,
      'source_url', r.source_url,
      'created_by', app.member_json(r.created_by), 'updated_by', app.member_json(r.updated_by),
      'created_at', r.created_at, 'updated_at', r.updated_at,
      'images', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'path', i.path, 'width', i.width, 'height', i.height)
                                           order by i.sort_order)
                          from app.recipe_images i where i.recipe_id = r.id), '[]'),
      'tags', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'group_id', t.group_id)
                                         order by g.sort_order, t.sort_order)
                        from app.recipe_tags rt join app.tags t on t.id = rt.tag_id
                        join app.tag_groups g on g.id = t.group_id
                        where rt.recipe_id = r.id), '[]')
    ),
    'editing', coalesce((select jsonb_agg(jsonb_build_object('member', app.member_json(e.member_id), 'since', e.since))
                         from app.recipe_editing e
                         where e.recipe_id = r.id and e.member_id is distinct from a.member_id
                           and e.heartbeat > now() - interval '3 minutes'), '[]'),
    'nutrition', (select jsonb_build_object('data', n.data, 'model', n.model, 'created_at', n.created_at,
                                            'stale', n.input_hash <> app.nutrition_hash(r.id))
                  from app.recipe_nutrition n where n.recipe_id = r.id),
    'variations', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'title', v.title, 'body', v.body,
                                   'author_name', v.author_name, 'member_id', v.member_id, 'created_at', v.created_at)
                                   order by v.created_at)
                            from app.variations v where v.recipe_id = r.id), '[]'),
    'ratings', coalesce((select jsonb_agg(jsonb_build_object('member_id', mr.member_id, 'score', mr.score,
                                'note', mr.note, 'updated_at', mr.updated_at)
                                order by mr.score desc)
                         from app.member_ratings mr where mr.recipe_id = r.id), '[]'),
    'cooks', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'member_id', k.member_id, 'cooked_on', k.cooked_on,
                              'note', k.note) order by k.cooked_on desc, k.created_at desc)
                       from app.cook_log k where k.recipe_id = r.id), '[]'),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'author_name', c.author_name,
                                 'member_id', c.member_id, 'is_pinned', c.is_pinned, 'created_at', c.created_at)
                                 order by c.created_at)
                          from app.log_comments c where c.recipe_id = r.id), '[]')
  );
end $$;

create or replace function public.get_house(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; h app.houses;
begin
  select * into a from app.resolve(p_token);
  if a.role = 'recipe_viewer' then raise exception 'recipe_only'; end if;
  select * into h from app.houses where id = a.house_id;

  return jsonb_build_object(
    'role', a.role,
    'me', app.member_json(a.member_id),
    'house', jsonb_build_object('id', h.id, 'name', h.name, 'emoji', h.emoji)
             || case when a.role = 'member'
                     then jsonb_build_object('view_token', h.view_token, 'member_token', h.member_token)
                     else '{}'::jsonb end,
    'members', app.members_json(h.id),
    'trash_count', case when a.role = 'member'
                        then (select count(*) from app.recipes r where r.house_id = h.id and r.deleted_at is not null)
                        else 0 end,
    'tag_groups', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'name', g.name, 'icon', g.icon, 'sort', g.sort_order,
               'tags', coalesce((
                  select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color, 'sort', t.sort_order)
                                   order by t.sort_order, t.name)
                  from app.tags t where t.group_id = g.id), '[]'))
             order by g.sort_order, g.name)
      from app.tag_groups g where g.house_id = h.id), '[]'),
    'recipes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'title', r.title, 'description', left(r.description, 240),
               'difficulty', r.difficulty, 'prep_minutes', r.prep_minutes,
               'cook_minutes', r.cook_minutes, 'servings', r.servings, 'servings_count', r.servings_count,
               'has_link', r.source_url is not null,
               'kcal_per_serving', (select (n.data->'per_serving'->>'kcal')::numeric from app.recipe_nutrition n where n.recipe_id = r.id),
               'cook_count', (select count(*) from app.cook_log k where k.recipe_id = r.id),
               'last_cooked', (select max(k.cooked_on) from app.cook_log k where k.recipe_id = r.id),
               'ingredients', (select coalesce(jsonb_agg(i->>'text'), '[]')
                               from jsonb_array_elements(r.ingredients) i
                               where coalesce((i->>'header')::boolean, false) = false),
               'cover', (select ri.path from app.recipe_images ri where ri.recipe_id = r.id
                         order by ri.sort_order limit 1),
               'tag_ids', coalesce((select jsonb_agg(rt.tag_id) from app.recipe_tags rt where rt.recipe_id = r.id), '[]'),
               'ratings', coalesce((select jsonb_agg(jsonb_build_object('member_id', mr.member_id, 'score', mr.score))
                                    from app.member_ratings mr where mr.recipe_id = r.id), '[]'),
               'created_at', r.created_at, 'updated_at', r.updated_at)
             order by r.updated_at desc)
      from app.recipes r where r.house_id = h.id and r.deleted_at is null), '[]')
  );
end $$;

create or replace function public.get_timeline(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; h app.houses;
begin
  select * into a from app.resolve(p_token);
  if a.role = 'recipe_viewer' then raise exception 'recipe_only'; end if;
  select * into h from app.houses where id = a.house_id;
  return jsonb_build_object(
    'role', a.role,
    'me', app.member_json(a.member_id),
    'house', jsonb_build_object('id', h.id, 'name', h.name, 'emoji', h.emoji),
    'members', app.members_json(h.id),
    'recipes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', r.title,
        'cover', (select ri.path from app.recipe_images ri where ri.recipe_id = r.id order by ri.sort_order limit 1),
        'avg_rating', (select round(avg(mr.score)::numeric, 1) from app.member_ratings mr where mr.recipe_id = r.id))
        order by r.title)
      from app.recipes r where r.house_id = h.id and r.deleted_at is null), '[]'),
    'cooks', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'recipe_id', k.recipe_id, 'member_id', k.member_id,
        'cooked_on', k.cooked_on, 'note', k.note) order by k.cooked_on desc, k.created_at desc)
      from app.cook_log k join app.recipes r on r.id = k.recipe_id
      where r.house_id = h.id and r.deleted_at is null), '[]')
  );
end $$;

------------------------------------------------------------
-- ערכים תזונתיים ומחיר (פונקציית השרת "nutrition" קוראת לאלה)
------------------------------------------------------------
create or replace function public.nutrition_input(p_token text, p_recipe_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; r app.recipes; used int;
begin
  select * into a from app.require_member(p_token);
  select * into r from app.recipes where id = p_recipe_id and house_id = a.house_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  select count(*) into used from app.ai_usage where house_id = a.house_id and created_at > now() - interval '1 day';
  if used >= 40 then raise exception 'ai_limit'; end if;
  return jsonb_build_object('title', r.title, 'ingredients', r.ingredients, 'servings_count', r.servings_count,
                            'servings_text', r.servings, 'hash', app.nutrition_hash(r.id));
end $$;

create or replace function public.save_nutrition(p_token text, p_recipe_id uuid, p_hash text, p_data jsonb, p_model text)
returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from app.require_member(p_token);
  perform 1 from app.recipes where id = p_recipe_id and house_id = a.house_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
  if jsonb_typeof(p_data) <> 'object' or pg_column_size(p_data) > 100000 then raise exception 'bad_request'; end if;
  insert into app.recipe_nutrition (recipe_id, input_hash, data, model)
  values (p_recipe_id, coalesce(p_hash, ''), p_data, coalesce(left(p_model, 80), ''))
  on conflict (recipe_id) do update
    set input_hash = excluded.input_hash, data = excluded.data, model = excluded.model, created_at = now();
  insert into app.ai_usage (house_id) values (a.house_id);
end $$;

------------------------------------------------------------
-- "דופק": שאילתה קטנה שבדיקה אוטומטית מריצה כל כמה ימים, כדי שהפרויקט החינמי לא יושהה
------------------------------------------------------------
create or replace function public.keepalive()
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('ok', true, 'at', now(), 'recipes', (select count(*) from app.recipes));
$$;

------------------------------------------------------------
-- הרשאות לפונקציות החדשות
------------------------------------------------------------
grant execute on function public.archive_member(text,uuid) to anon, authenticated;
grant execute on function public.restore_member(text,uuid) to anon, authenticated;
grant execute on function public.revoke_member_devices(text,uuid) to anon, authenticated;
grant execute on function public.restore_recipe(text,uuid) to anon, authenticated;
grant execute on function public.get_trash(text) to anon, authenticated;
grant execute on function public.start_editing(text,uuid) to anon, authenticated;
grant execute on function public.stop_editing(text,uuid) to anon, authenticated;
grant execute on function public.nutrition_input(text,uuid) to anon, authenticated;
grant execute on function public.save_nutrition(text,uuid,text,jsonb,text) to anon, authenticated;
grant execute on function public.keepalive() to anon, authenticated;
