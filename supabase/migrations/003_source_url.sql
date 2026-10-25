-- קישור למתכון המקורי באינטרנט (לא חובה)
alter table app.recipes add column if not exists source_url text
  check (source_url is null or (char_length(source_url) <= 1000 and source_url ~* '^https?://'));

create or replace function public.save_recipe(p_token text, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a record; rid uuid := nullif(p_data->>'id', '')::uuid; link text := app.clean(p_data->>'source_url', 1000);
begin
  if link is not null and link !~* '^https?://' then link := 'https://' || link; end if;
  select * into a from app.require_member(p_token);
  if app.clean(p_data->>'title', 120) is null then raise exception 'name_required'; end if;

  if rid is null then
    insert into app.recipes (house_id, title, description, difficulty, prep_minutes, cook_minutes, servings,
                             ingredients, steps, share_token, created_by, updated_by, source_url)
    values (a.house_id, app.clean(p_data->>'title', 120), coalesce(app.clean(p_data->>'description', 2000), ''),
            coalesce((p_data->>'difficulty')::smallint, 2),
            nullif(p_data->>'prep_minutes', '')::int, nullif(p_data->>'cook_minutes', '')::int,
            app.clean(p_data->>'servings', 40),
            coalesce(p_data->'ingredients', '[]'), coalesce(p_data->'steps', '[]'),
            app.new_token(), a.member_id, a.member_id, link)
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
      source_url = link,
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
               'has_link', r.source_url is not null,
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
