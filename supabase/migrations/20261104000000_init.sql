-- VAPRO / DuitVoice — initial schema
-- Money is NUMERIC(12,2). Every user-owned row is isolated by Row Level Security.

create type public.account_type as enum ('personal', 'business');
create type public.entry_type as enum ('expense', 'income');
create type public.transaction_source as enum ('voice', 'manual');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles ------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  preferred_language text not null default 'ms' check (preferred_language in ('ms', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- accounts ------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_name text not null check (char_length(account_name) between 1 and 60),
  account_type public.account_type not null default 'personal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets child tables use a composite FK so a row can only point at its owner's account.
  unique (id, user_id)
);

create index accounts_user_id_idx on public.accounts (user_id);

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- categories ----------------------------------------------------------------
-- user_id null = system default visible to everyone.
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  type public.entry_type not null default 'expense',
  created_at timestamptz not null default now()
);

create unique index categories_system_name_uq
  on public.categories (lower(name), type) where user_id is null;
create unique index categories_user_name_uq
  on public.categories (user_id, lower(name), type) where user_id is not null;

-- transactions --------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null,
  category_id uuid references public.categories (id) on delete set null,
  merchant text check (merchant is null or char_length(merchant) <= 120),
  description text check (description is null or char_length(description) <= 500),
  amount numeric(12, 2) not null check (amount > 0),
  currency char(3) not null default 'MYR' check (currency ~ '^[A-Z]{3}$'),
  transaction_type public.entry_type not null default 'expense',
  transaction_date date not null,
  source public.transaction_source not null default 'manual',
  -- Client-generated per item; a retried voice submission cannot insert twice.
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) between 8 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  unique (user_id, idempotency_key)
);

create index transactions_user_date_idx on public.transactions (user_id, transaction_date desc);
create index transactions_account_date_idx on public.transactions (account_id, transaction_date desc);
create index transactions_category_idx on public.transactions (category_id);

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- budgets -------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null,
  month date not null check (month = date_trunc('month', month)::date),
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  unique (account_id, month)
);

create index budgets_user_month_idx on public.budgets (user_id, month);

create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

-- merchant_rules ------------------------------------------------------------
create table public.merchant_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  merchant_keyword text not null
    check (char_length(merchant_keyword) between 1 and 80 and merchant_keyword = lower(btrim(merchant_keyword))),
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, merchant_keyword)
);

create index merchant_rules_category_idx on public.merchant_rules (category_id);

-- Category visibility helper: system default or owned by the caller.
create or replace function public.category_is_usable(p_category_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.categories c
    where c.id = p_category_id
      and (c.user_id is null or c.user_id = (select auth.uid()))
  );
$$;

-- New user bootstrap: profile + default Personal account --------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 80), '')
  );

  insert into public.accounts (user_id, account_name, account_type)
  values (new.id, 'Peribadi', 'personal');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security --------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.merchant_rules enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "accounts: read own" on public.accounts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "accounts: insert own" on public.accounts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "accounts: update own" on public.accounts
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "accounts: delete own" on public.accounts
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "categories: read system and own" on public.categories
  for select to authenticated using (user_id is null or user_id = (select auth.uid()));
create policy "categories: insert own" on public.categories
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "categories: update own" on public.categories
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "categories: delete own" on public.categories
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "transactions: read own" on public.transactions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "transactions: insert own" on public.transactions
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and (category_id is null or public.category_is_usable(category_id))
  );
create policy "transactions: update own" on public.transactions
  for update to authenticated using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid())
    and (category_id is null or public.category_is_usable(category_id))
  );
create policy "transactions: delete own" on public.transactions
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "budgets: read own" on public.budgets
  for select to authenticated using (user_id = (select auth.uid()));
create policy "budgets: insert own" on public.budgets
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "budgets: update own" on public.budgets
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "budgets: delete own" on public.budgets
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "merchant_rules: read own" on public.merchant_rules
  for select to authenticated using (user_id = (select auth.uid()));
create policy "merchant_rules: insert own" on public.merchant_rules
  for insert to authenticated with check (
    user_id = (select auth.uid()) and public.category_is_usable(category_id)
  );
create policy "merchant_rules: update own" on public.merchant_rules
  for update to authenticated using (user_id = (select auth.uid())) with check (
    user_id = (select auth.uid()) and public.category_is_usable(category_id)
  );
create policy "merchant_rules: delete own" on public.merchant_rules
  for delete to authenticated using (user_id = (select auth.uid()));

-- Signed-out visitors get nothing; signed-in users are still bounded by RLS.
revoke all on all tables in schema public from anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, delete on public.profiles from authenticated;

-- System default categories -------------------------------------------------
insert into public.categories (user_id, name, type) values
  (null, 'Makanan & Minuman', 'expense'),
  (null, 'Barang Dapur', 'expense'),
  (null, 'Petrol & Pengangkutan', 'expense'),
  (null, 'Bil & Utiliti', 'expense'),
  (null, 'Rumah & Sewa', 'expense'),
  (null, 'Kesihatan', 'expense'),
  (null, 'Pendidikan', 'expense'),
  (null, 'Hiburan', 'expense'),
  (null, 'Shopping', 'expense'),
  (null, 'Lain-lain', 'expense');
