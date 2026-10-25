-- ספר מתכונים משפחתי: פונקציות
-- כל פונקציה ב-public מקבלת p_token: מפתח מכשיר של בן בית, קוד צפייה בבית או קוד צפייה במתכון.
-- שגיאות מוחזרות כקודים באנגלית (invalid_link, members_only, not_found...), והאתר מתרגם אותן לעברית.

------------------------------------------------------------
-- פונקציות עזר פנימיות (schema בשם app, לא חשוף)
------------------------------------------------------------

create or replace function app.new_token() returns text
language sql volatile set search_path = '' as $$
  select translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
$$;

create or replace function app.hash_key(k text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(k, 'sha256'), 'hex');
$$;

create or replace function app.clean(t text, max_len int) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(coalesce(t, '')), max_len), '');
$$;

-- מזהה מי מחזיק בקוד ומה מותר לו
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

  select r.house_id, r.id into house_id, recipe_id from app.recipes r where r.share_token = p_token;
  if found then role := 'recipe_viewer'; return; end if;

  raise exception 'invalid_link';
end $$;

create or replace function app.require_member(p_token text, out house_id uuid, out member_id uuid)
language plpgsql stable set search_path = '' as $$
declare a record;
begin
  select * into a from app.resolve(p_token);
  if a.role <> 'member' then raise exception 'members_only'; end if;
  house_id := a.house_id; member_id := a.member_id;
end $$;

-- בודק שלקוד יש גישה למתכון הזה (חבר בית, צופה בבית או צופה במתכון)
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
    perform 1 from app.recipes r where r.id = p_recipe_id and r.house_id = a.house_id;
    if not found then raise exception 'not_found'; end if;
    recipe_id := p_recipe_id;
  end if;
  house_id := a.house_id; role := a.role; member_id := a.member_id;
end $$;

create or replace function app.pick_color(p_house uuid) returns text
language sql stable set search_path = '' as $$
  select (array['#E07A3F','#7A9E7E','#D4A24C','#C4626B','#6C8EAD','#9C7BB0','#B5835A','#5E9C94'])
         [1 + (select count(*) from app.members where house_id = p_house) % 8];
$$;

create or replace function app.new_device(p_member uuid) returns text
language plpgsql volatile set search_path = '' as $$
declare k text := app.new_token() || app.new_token();
begin
  insert into app.member_devices (key_hash, member_id) values (app.hash_key(k), p_member);
  return k;
end $$;

create or replace function app.seed_tags(p_house uuid) returns void
language plpgsql volatile set search_path = '' as $$
declare g uuid;
begin
  insert into app.tag_groups (house_id, name, icon, sort_order) values (p_house, 'כשרות', '🥛', 1) returning id into g;
  insert into app.tags (house_id, group_id, name, color, sort_order) values
    (p_house, g, 'חלבי', '#DCE9F5', 1), (p_house, g, 'בשרי', '#F6D5CF', 2), (p_house, g, 'פרווה', '#E3EEDC', 3);

  insert into app.tag_groups (house_id, name, icon, sort_order) values (p_house, 'עונה', '🌤️', 2) returning id into g;
  insert into app.tags (house_id, group_id, name, color, sort_order) values
    (p_house, g, 'קיץ', '#FBE7B5', 1), (p_house, g, 'חורף', '#DAD7EE', 2);

  insert into app.tag_groups (house_id, name, icon, sort_order) values (p_house, 'מאמץ', '⏱️', 3) returning id into g;
  insert into app.tags (house_id, group_id, name, color, sort_order) values
    (p_house, g, 'מצרכים פשוטים', '#E3EEDC', 1), (p_house, g, 'מהיר (עד 30 דק׳)', '#FBE0C8', 2);

  insert into app.tag_groups (house_id, name, icon, sort_order) values (p_house, 'ציוד', '🍲', 4) returning id into g;
  insert into app.tags (house_id, group_id, name, color, sort_order) values
    (p_house, g, 'בלי תנור', '#F3E3D3', 1), (p_house, g, 'סיר אחד', '#EADFCF', 2);

  insert into app.tag_groups (house_id, name, icon, sort_order) values (p_house, 'ארוחה', '🍽️', 5) returning id into g;
  insert into app.tags (house_id, group_id, name, color, sort_order) values
    (p_house, g, 'ארוחת בוקר', '#FFF0C2', 1), (p_house, g, 'עיקרית', '#F6D5CF', 2),
    (p_house, g, 'קינוח', '#F8D9E6', 3), (p_house, g, 'תוספת', '#E3EEDC', 4);
end $$;

create or replace function app.member_json(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', m.id, 'name', m.display_name, 'color', m.color)
  from app.members m where m.id = p_id;
$$;

create or replace function app.members_json(p_house uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.display_name, 'color', m.color)
                            order by m.created_at), '[]')
  from app.members m where m.house_id = p_house;
$$;

------------------------------------------------------------
-- בתים וחברות
------------------------------------------------------------

create or replace function public.create_house(p_name text, p_emoji text, p_member_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare h app.houses; m_id uuid; k text;
begin
  if app.clean(p_name, 60) is null then raise exception 'name_required'; end if;
  if app.clean(p_member_name, 40) is null then raise exception 'name_required'; end if;

  insert into app.houses (name, emoji, view_token, member_token)
  values (app.clean(p_name, 60), coalesce(app.clean(p_emoji, 16), '🏠'), app.new_token(), app.new_token())
  returning * into h;

  insert into app.members (house_id, display_name, color)
  values (h.id, app.clean(p_member_name, 40), app.pick_color(h.id))
  returning id into m_id;

  perform app.seed_tags(h.id);
  k := app.new_device(m_id);

  return jsonb_build_object('house_id', h.id, 'house_name', h.name, 'emoji', h.emoji,
                            'member', app.member_json(m_id), 'key', k);
end $$;

-- למסך "מי את/ה?" בקישור ההצטרפות
create or replace function public.house_preview(p_member_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare h app.houses;
begin
  select * into h from app.houses where member_token = p_member_token;
  if not found then raise exception 'invalid_link'; end if;
  return jsonb_build_object('house_id', h.id, 'name', h.name, 'emoji', h.emoji,
                            'members', app.members_json(h.id));
end $$;

-- הצטרפות: בוחרים בן בית קיים (p_member_id) או יוצרים חדש (p_name)
create or replace function public.join_house(p_member_token text, p_name text, p_member_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare h app.houses; m_id uuid;
begin
  select * into h from app.houses where member_token = p_member_token;
  if not found then raise exception 'invalid_link'; end if;

  if p_member_id is not null then
    select id into m_id from app.members where id = p_member_id and house_id = h.id;
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

-- משמש את פונקציית השרת של התמונות
create or replace function public.whoami(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from app.resolve(p_token);
  return jsonb_build_object('house_id', a.house_id, 'role', a.role, 'member_id', a.member_id);
end $$;

create or replace function public.update_house(p_token text, p_name text, p_emoji text)
returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from app.require_member(p_token);
  update app.houses
     set name = coalesce(app.clean(p_name, 60), name),
         emoji = coalesce(app.clean(p_emoji, 16), emoji)
   where id = a.house_id;
end $$;

create or replace function public.update_me(p_token text, p_name text, p_color text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from app.require_member(p_token);
  update app.members
     set display_name = coalesce(app.clean(p_name, 40), display_name),
         color = coalesce(app.clean(p_color, 20), color)
   where id = a.member_id;
  return app.member_json(a.member_id);
end $$;

-- מחליף קישור שדלף ('view' או 'member'). הקישור הישן מפסיק לעבוד מיד.
create or replace function public.rotate_link(p_token text, p_kind text)
returns text language plpgsql security definer set search_path = '' as $$
declare a record; t text := app.new_token();
begin
  select * into a from app.require_member(p_token);
  if p_kind = 'view' then update app.houses set view_token = t where id = a.house_id;
  elsif p_kind = 'member' then update app.houses set member_token = t where id = a.house_id;
  else raise exception 'bad_request'; end if;
  return t;
end $$;

------------------------------------------------------------
-- קריאה
------------------------------------------------------------

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
               'cook_minutes', r.cook_minutes, 'servings', r.servings,
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
      from app.recipes r where r.house_id = h.id), '[]')
  );
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
      'ingredients', r.ingredients, 'steps', r.steps, 'share_token', r.share_token,
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
    'variations', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'title', v.title, 'body', v.body,
                                   'author_name', v.author_name, 'member_id', v.member_id, 'created_at', v.created_at)
                                   order by v.created_at)
                            from app.variations v where v.recipe_id = r.id), '[]'),
    'ratings', coalesce((select jsonb_agg(jsonb_build_object('member_id', mr.member_id, 'score', mr.score,
                                'note', mr.note, 'updated_at', mr.updated_at)
                                order by mr.score desc)
                         from app.member_ratings mr where mr.recipe_id = r.id), '[]'),
    'comments', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'body', c.body, 'author_name', c.author_name,
                                 'member_id', c.member_id, 'is_pinned', c.is_pinned, 'created_at', c.created_at)
                                 order by c.created_at)
                          from app.log_comments c where c.recipe_id = r.id), '[]')
  );
end $$;

------------------------------------------------------------
-- מתכונים (בני בית בלבד)
------------------------------------------------------------

-- יוצר מתכון חדש (בלי id) או מעדכן קיים. מחזיר את ה-id.
create or replace function public.save_recipe(p_token text, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a record; rid uuid := nullif(p_data->>'id', '')::uuid;
begin
  select * into a from app.require_member(p_token);
  if app.clean(p_data->>'title', 120) is null then raise exception 'name_required'; end if;

  if rid is null then
    insert into app.recipes (house_id, title, description, difficulty, prep_minutes, cook_minutes, servings,
                             ingredients, steps, share_token, created_by, updated_by)
    values (a.house_id, app.clean(p_data->>'title', 120), coalesce(app.clean(p_data->>'description', 2000), ''),
            coalesce((p_data->>'difficulty')::smallint, 2),
            nullif(p_data->>'prep_minutes', '')::int, nullif(p_data->>'cook_minutes', '')::int,
            app.clean(p_data->>'servings', 40),
            coalesce(p_data->'ingredients', '[]'), coalesce(p_data->'steps', '[]'),
            app.new_token(), a.member_id, a.member_id)
    returning id into rid;
  else
    update app.recipes set
      title = app.clean(p_data->>'title', 120),
      description = coalesce(app.clean(p_data->>'description', 2000), ''),
      difficulty = coalesce((p_data->>'difficulty')::smallint, difficulty),
      prep_minutes = nullif(p_data->>'prep_minutes', '')::int,
      cook_minutes = nullif(p_data->>'cook_minutes', '')::int,
      servings = app.clean(p_data->>'servings', 40),
      ingredients = coalesce(p_data->'ingredients', '[]'),
      steps = coalesce(p_data->'steps', '[]'),
      updated_by = a.member_id,
      updated_at = now()
    where id = rid and house_id = a.house_id;
    if not found then raise exception 'not_found'; end if;
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

  return rid;
end $$;

-- מוחק מתכון ומחזיר את נתיבי התמונות שלו, כדי שהאתר ימחק אותן מהאחסון
create or replace function public.delete_recipe(p_token text, p_recipe_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a record; paths jsonb;
begin
  select * into a from app.require_member(p_token);
  select coalesce(jsonb_agg(i.path), '[]') into paths
    from app.recipe_images i join app.recipes r on r.id = i.recipe_id
   where r.id = p_recipe_id and r.house_id = a.house_id;
  delete from app.recipes where id = p_recipe_id and house_id = a.house_id;
  if not found then raise exception 'not_found'; end if;
  return paths;
end $$;

create or replace function public.rate_recipe(p_token text, p_recipe_id uuid, p_score int, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from app.recipe_access(p_token, p_recipe_id);
  if a.role <> 'member' then raise exception 'members_only'; end if;
  if p_score is null then
    delete from app.member_ratings where recipe_id = a.recipe_id and member_id = a.member_id;
  else
    insert into app.member_ratings (recipe_id, member_id, score, note)
    values (a.recipe_id, a.member_id, p_score, coalesce(app.clean(p_note, 300), ''))
    on conflict (recipe_id, member_id)
    do update set score = excluded.score, note = excluded.note, updated_at = now();
  end if;
end $$;

------------------------------------------------------------
-- אפשרויות לשינוי ותגובות (גם אורחים)
------------------------------------------------------------

create or replace function public.add_variation(p_token text, p_recipe_id uuid, p_title text, p_body text, p_author_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a record; nm text; vid uuid;
begin
  select * into a from app.recipe_access(p_token, p_recipe_id);
  if app.clean(p_title, 80) is null or app.clean(p_body, 3000) is null then raise exception 'name_required'; end if;
  if a.role = 'member' then select display_name into nm from app.members where id = a.member_id;
  else nm := coalesce(app.clean(p_author_name, 40), 'אורח/ת'); end if;
  insert into app.variations (recipe_id, title, body, author_name, member_id)
  values (a.recipe_id, app.clean(p_title, 80), app.clean(p_body, 3000), nm, a.member_id)
  returning id into vid;
  return vid;
end $$;

create or replace function public.delete_variation(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from app.require_member(p_token);
  delete from app.variations v using app.recipes r
   where v.id = p_id and r.id = v.recipe_id and r.house_id = a.house_id;
end $$;

create or replace function public.add_comment(p_token text, p_recipe_id uuid, p_body text, p_author_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a record; nm text; cid uuid;
begin
  select * into a from app.recipe_access(p_token, p_recipe_id);
  if app.clean(p_body, 2000) is null then raise exception 'name_required'; end if;
  if a.role = 'member' then select display_name into nm from app.members where id = a.member_id;
  else nm := coalesce(app.clean(p_author_name, 40), 'אורח/ת'); end if;
  insert into app.log_comments (recipe_id, body, author_name, member_id)
  values (a.recipe_id, app.clean(p_body, 2000), nm, a.member_id)
  returning id into cid;
  return cid;
end $$;

create or replace function public.delete_comment(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from app.require_member(p_token);
  delete from app.log_comments c using app.recipes r
   where c.id = p_id and r.id = c.recipe_id and r.house_id = a.house_id;
end $$;

create or replace function public.pin_comment(p_token text, p_id uuid, p_pinned boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from app.require_member(p_token);
  update app.log_comments c set is_pinned = coalesce(p_pinned, false)
    from app.recipes r
   where c.id = p_id and r.id = c.recipe_id and r.house_id = a.house_id;
end $$;

------------------------------------------------------------
-- ניהול תגיות (בני בית בלבד)
------------------------------------------------------------

create or replace function public.save_tag_group(p_token text, p_id uuid, p_name text, p_icon text, p_sort int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a record; gid uuid;
begin
  select * into a from app.require_member(p_token);
  if app.clean(p_name, 40) is null then raise exception 'name_required'; end if;
  if p_id is null then
    insert into app.tag_groups (house_id, name, icon, sort_order)
    values (a.house_id, app.clean(p_name, 40), coalesce(app.clean(p_icon, 16), '🏷️'),
            coalesce(p_sort, (select coalesce(max(sort_order), 0) + 1 from app.tag_groups where house_id = a.house_id)))
    returning id into gid;
  else
    update app.tag_groups set name = app.clean(p_name, 40), icon = coalesce(app.clean(p_icon, 16), icon),
                              sort_order = coalesce(p_sort, sort_order)
     where id = p_id and house_id = a.house_id
    returning id into gid;
    if gid is null then raise exception 'not_found'; end if;
  end if;
  return gid;
end $$;

create or replace function public.delete_tag_group(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from app.require_member(p_token);
  delete from app.tag_groups where id = p_id and house_id = a.house_id;
end $$;

create or replace function public.save_tag(p_token text, p_id uuid, p_group_id uuid, p_name text, p_color text, p_sort int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a record; tid uuid;
begin
  select * into a from app.require_member(p_token);
  if app.clean(p_name, 40) is null then raise exception 'name_required'; end if;
  perform 1 from app.tag_groups where id = p_group_id and house_id = a.house_id;
  if not found then raise exception 'not_found'; end if;
  if p_id is null then
    insert into app.tags (house_id, group_id, name, color, sort_order)
    values (a.house_id, p_group_id, app.clean(p_name, 40), coalesce(app.clean(p_color, 20), '#F3D9B1'),
            coalesce(p_sort, (select coalesce(max(sort_order), 0) + 1 from app.tags where group_id = p_group_id)))
    returning id into tid;
  else
    update app.tags set name = app.clean(p_name, 40), color = coalesce(app.clean(p_color, 20), color),
                        group_id = p_group_id, sort_order = coalesce(p_sort, sort_order)
     where id = p_id and house_id = a.house_id
    returning id into tid;
    if tid is null then raise exception 'not_found'; end if;
  end if;
  return tid;
end $$;

create or replace function public.delete_tag(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from app.require_member(p_token);
  delete from app.tags where id = p_id and house_id = a.house_id;
end $$;

------------------------------------------------------------
-- הרשאות
------------------------------------------------------------

-- פונקציות העזר הפנימיות: אף אחד מבחוץ
revoke execute on all functions in schema app from public, anon, authenticated;

-- פונקציות ה-API: פתוחות לאתר (הן בודקות את הקוד בעצמן)
do $$
declare f text;
begin
  foreach f in array array[
    'create_house(text,text,text)', 'house_preview(text)', 'join_house(text,text,uuid)', 'whoami(text)',
    'update_house(text,text,text)', 'update_me(text,text,text)', 'rotate_link(text,text)',
    'get_house(text)', 'get_recipe(text,uuid)', 'save_recipe(text,jsonb)', 'delete_recipe(text,uuid)',
    'rate_recipe(text,uuid,int,text)', 'add_variation(text,uuid,text,text,text)', 'delete_variation(text,uuid)',
    'add_comment(text,uuid,text,text)', 'delete_comment(text,uuid)', 'pin_comment(text,uuid,boolean)',
    'save_tag_group(text,uuid,text,text,int)', 'delete_tag_group(text,uuid)',
    'save_tag(text,uuid,uuid,text,text,int)', 'delete_tag(text,uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
