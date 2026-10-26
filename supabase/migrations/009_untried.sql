-- "עוד לא הכנו": מתכון ששמרנו לניסיון. מוצג אפור, ולא מופיע בסינונים עד שמבשלים אותו.
alter table app.recipes add column if not exists untried boolean not null default false;

create or replace function public.set_untried(p_token text, p_recipe_id uuid, p_value boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  select * into a from app.require_member(p_token);
  update app.recipes set untried = coalesce(p_value, false)
   where id = p_recipe_id and house_id = a.house_id and deleted_at is null;
  if not found then raise exception 'not_found'; end if;
end $$;
grant execute on function public.set_untried(text,uuid,boolean) to anon, authenticated;

create or replace function public.log_cook(p_token text, p_recipe_id uuid, p_cooked_on date, p_member_id uuid, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a record; who uuid; d date := coalesce(p_cooked_on, current_date); kid uuid;
begin
  select * into a from app.require_member(p_token);
  perform 1 from app.recipes where id = p_recipe_id and house_id = a.house_id;
  if not found then raise exception 'not_found'; end if;
  who := coalesce(p_member_id, a.member_id);
  perform 1 from app.members where id = who and house_id = a.house_id;
  if not found then raise exception 'not_found'; end if;
  if d > current_date + 1 or d < date '2000-01-01' then raise exception 'bad_date'; end if;
  insert into app.cook_log (recipe_id, member_id, cooked_on, note, created_by)
  values (p_recipe_id, who, d, coalesce(app.clean(p_note, 300), ''), a.member_id)
  returning id into kid;
  -- בישלו את זה: כבר לא "עוד לא הכנו"
  update app.recipes set untried = false where id = p_recipe_id and untried;
  return kid;
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
      'source_url', r.source_url, 'untried', r.untried,
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
               'has_link', r.source_url is not null, 'untried', r.untried,
               'kcal_per_serving', (select (n.data->'per_serving'->>'kcal')::numeric from app.recipe_nutrition n where n.recipe_id = r.id),
               'price_per_serving', (select (n.data->'per_serving'->>'price_ils')::numeric from app.recipe_nutrition n where n.recipe_id = r.id),
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

