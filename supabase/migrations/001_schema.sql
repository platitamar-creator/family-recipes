-- ספר מתכונים משפחתי: טבלאות
-- הטבלאות יושבות ב-schema פרטי "app" שלא חשוף ל-API.
-- הדפדפן ניגש לנתונים רק דרך פונקציות ב-public שבודקות את הקוד שבקישור.

create schema if not exists app;
revoke all on schema app from public, anon, authenticated;

create table app.houses (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 60),
  emoji         text not null default '🏠' check (char_length(emoji) <= 16),
  view_token    text not null unique,
  member_token  text not null unique,
  created_at    timestamptz not null default now()
);

create table app.members (
  id            uuid primary key default gen_random_uuid(),
  house_id      uuid not null references app.houses on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 40),
  color         text not null default '#E07A3F' check (char_length(color) <= 20),
  created_at    timestamptz not null default now()
);
create index on app.members (house_id);

-- כל מכשיר מקבל מפתח משלו. שומרים רק את ה-hash שלו.
create table app.member_devices (
  key_hash      text primary key,
  member_id     uuid not null references app.members on delete cascade,
  created_at    timestamptz not null default now()
);
create index on app.member_devices (member_id);

create table app.tag_groups (
  id            uuid primary key default gen_random_uuid(),
  house_id      uuid not null references app.houses on delete cascade,
  name          text not null check (char_length(name) between 1 and 40),
  icon          text not null default '🏷️' check (char_length(icon) <= 16),
  sort_order    int  not null default 0
);
create index on app.tag_groups (house_id);

create table app.tags (
  id            uuid primary key default gen_random_uuid(),
  house_id      uuid not null references app.houses on delete cascade,
  group_id      uuid not null references app.tag_groups on delete cascade,
  name          text not null check (char_length(name) between 1 and 40),
  color         text not null default '#F3D9B1' check (char_length(color) <= 20),
  sort_order    int  not null default 0
);
create index on app.tags (group_id);
create index on app.tags (house_id);

create table app.recipes (
  id            uuid primary key default gen_random_uuid(),
  house_id      uuid not null references app.houses on delete cascade,
  title         text not null check (char_length(title) between 1 and 120),
  description   text not null default '' check (char_length(description) <= 2000),
  difficulty    smallint not null default 2 check (difficulty between 1 and 5),
  prep_minutes  int check (prep_minutes between 0 and 10000),
  cook_minutes  int check (cook_minutes between 0 and 10000),
  servings      text check (char_length(servings) <= 40),
  -- [{ "text": "2 כוסות קמח" }, { "text": "לרוטב", "header": true }]
  ingredients   jsonb not null default '[]' check (jsonb_typeof(ingredients) = 'array'),
  -- [{ "text": "מערבבים הכול..." }]
  steps         jsonb not null default '[]' check (jsonb_typeof(steps) = 'array'),
  share_token   text not null unique,
  created_by    uuid references app.members on delete set null,
  updated_by    uuid references app.members on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (pg_column_size(ingredients) + pg_column_size(steps) < 200000)
);
create index on app.recipes (house_id);

create table app.recipe_tags (
  recipe_id     uuid not null references app.recipes on delete cascade,
  tag_id        uuid not null references app.tags on delete cascade,
  primary key (recipe_id, tag_id)
);
create index on app.recipe_tags (tag_id);

create table app.recipe_images (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references app.recipes on delete cascade,
  path          text not null check (char_length(path) <= 300),
  width         int,
  height        int,
  sort_order    int not null default 0
);
create index on app.recipe_images (recipe_id);

create table app.variations (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references app.recipes on delete cascade,
  title         text not null check (char_length(title) between 1 and 80),
  body          text not null check (char_length(body) between 1 and 3000),
  author_name   text not null check (char_length(author_name) between 1 and 40),
  member_id     uuid references app.members on delete set null,
  created_at    timestamptz not null default now()
);
create index on app.variations (recipe_id);
create index on app.variations (member_id);

create table app.member_ratings (
  recipe_id     uuid not null references app.recipes on delete cascade,
  member_id     uuid not null references app.members on delete cascade,
  score         smallint not null check (score between 1 and 10),
  note          text not null default '' check (char_length(note) <= 300),
  updated_at    timestamptz not null default now(),
  primary key (recipe_id, member_id)
);
create index on app.member_ratings (member_id);

create table app.log_comments (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references app.recipes on delete cascade,
  body          text not null check (char_length(body) between 1 and 2000),
  author_name   text not null check (char_length(author_name) between 1 and 40),
  member_id     uuid references app.members on delete set null,
  is_pinned     boolean not null default false,
  created_at    timestamptz not null default now()
);
create index on app.log_comments (recipe_id);
create index on app.log_comments (member_id);
create index on app.recipes (created_by);
create index on app.recipes (updated_by);

-- שכבת הגנה נוספת: RLS פעיל בלי מדיניות, כלומר אין גישה ישירה בכלל.
alter table app.houses          enable row level security;
alter table app.members         enable row level security;
alter table app.member_devices  enable row level security;
alter table app.tag_groups      enable row level security;
alter table app.tags            enable row level security;
alter table app.recipes         enable row level security;
alter table app.recipe_tags     enable row level security;
alter table app.recipe_images   enable row level security;
alter table app.variations      enable row level security;
alter table app.member_ratings  enable row level security;
alter table app.log_comments    enable row level security;

-- אחסון תמונות: קריאה ציבורית. העלאה רק דרך כתובת חתומה שפונקציית השרת "images" מנפיקה.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', true, 3145728, array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;
