-- Income & expenses per account (Personal / Business). Replaces the budget-oriented report
-- functions; no tables or records are removed (the budgets table stays, unused by the app).

-- One Personal and one Business account per user, so the app can switch between them.
alter table public.accounts
  add constraint accounts_one_per_type unique (user_id, account_type);

-- Income categories next to the existing expense ones.
insert into public.categories (user_id, name, type) values
  (null, 'Jualan', 'income'),
  (null, 'Bayaran Pelanggan', 'income'),
  (null, 'Gaji', 'income'),
  (null, 'Lain-lain', 'income')
on conflict do nothing;

-- A transaction's category must be of the same kind (income vs expense).
create or replace function public.check_transaction_category_type()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category_id is not null and exists (
    select 1 from public.categories c where c.id = new.category_id and c.type <> new.transaction_type
  ) then
    raise exception 'category type does not match transaction type' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger transactions_category_type_check
  before insert or update of category_id, transaction_type on public.transactions
  for each row execute function public.check_transaction_category_type();

drop function if exists public.dashboard_summary(date);
drop function if exists public.spending_by_period(date, date, text);
drop function if exists public.spending_by_category(date, date);
drop function if exists public.top_merchants(date, date, integer);

create or replace function public.cashflow_summary(p_account_id uuid, p_from date, p_to date)
returns table (
  income_total numeric,
  expense_total numeric,
  net_cashflow numeric,
  income_count integer,
  expense_count integer,
  tx_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(t.amount) filter (where t.transaction_type = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.transaction_type = 'expense'), 0),
    coalesce(sum(case when t.transaction_type = 'income' then t.amount else -t.amount end), 0),
    (count(*) filter (where t.transaction_type = 'income'))::int,
    (count(*) filter (where t.transaction_type = 'expense'))::int,
    count(*)::int
  from public.transactions t
  where t.user_id = (select auth.uid())
    and t.account_id = p_account_id
    and t.transaction_date between p_from and p_to;
$$;

-- Income, expenses and net bucketed by day, week (ISO, Monday) or month; empty buckets are 0.
create or replace function public.cashflow_by_period(p_account_id uuid, p_from date, p_to date, p_bucket text default 'day')
returns table (bucket date, income numeric, expense numeric, net numeric, tx_count integer)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_bucket not in ('day', 'week', 'month') then
    raise exception 'invalid bucket %', p_bucket using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 3700 then
    raise exception 'invalid date range' using errcode = '22023';
  end if;

  return query
  with buckets as (
    select generate_series(
      date_trunc(p_bucket, p_from::timestamp),
      date_trunc(p_bucket, p_to::timestamp),
      ('1 ' || p_bucket)::interval
    )::date as bucket
  ),
  sums as (
    select date_trunc(p_bucket, t.transaction_date::timestamp)::date as bucket,
           coalesce(sum(t.amount) filter (where t.transaction_type = 'income'), 0) as income,
           coalesce(sum(t.amount) filter (where t.transaction_type = 'expense'), 0) as expense,
           count(*)::int as tx_count
    from public.transactions t
    where t.user_id = (select auth.uid())
      and t.account_id = p_account_id
      and t.transaction_date between p_from and p_to
    group by 1
  )
  select b.bucket,
         coalesce(s.income, 0),
         coalesce(s.expense, 0),
         coalesce(s.income, 0) - coalesce(s.expense, 0),
         coalesce(s.tx_count, 0)
  from buckets b left join sums s using (bucket)
  order by b.bucket;
end;
$$;

create or replace function public.totals_by_category(p_account_id uuid, p_from date, p_to date, p_type public.entry_type)
returns table (category_id uuid, category_name text, total numeric, tx_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.category_id,
         coalesce(c.name, 'Tiada kategori'),
         sum(t.amount),
         count(*)::int
  from public.transactions t
  left join public.categories c on c.id = t.category_id
  where t.user_id = (select auth.uid())
    and t.account_id = p_account_id
    and t.transaction_type = p_type
    and t.transaction_date between p_from and p_to
  group by t.category_id, c.name
  order by sum(t.amount) desc, 2;
$$;

create or replace function public.top_merchants(p_account_id uuid, p_from date, p_to date, p_limit integer default 5)
returns table (merchant text, total numeric, tx_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select (array_agg(btrim(t.merchant) order by t.transaction_date desc, t.created_at desc))[1],
         sum(t.amount),
         count(*)::int
  from public.transactions t
  where t.user_id = (select auth.uid())
    and t.account_id = p_account_id
    and t.transaction_type = 'expense'
    and t.transaction_date between p_from and p_to
    and nullif(btrim(t.merchant), '') is not null
  group by lower(btrim(t.merchant))
  order by sum(t.amount) desc, 1
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
$$;

revoke execute on function public.cashflow_summary(uuid, date, date) from public, anon;
revoke execute on function public.cashflow_by_period(uuid, date, date, text) from public, anon;
revoke execute on function public.totals_by_category(uuid, date, date, public.entry_type) from public, anon;
revoke execute on function public.top_merchants(uuid, date, date, integer) from public, anon;
grant execute on function public.cashflow_summary(uuid, date, date) to authenticated;
grant execute on function public.cashflow_by_period(uuid, date, date, text) to authenticated;
grant execute on function public.totals_by_category(uuid, date, date, public.entry_type) to authenticated;
grant execute on function public.top_merchants(uuid, date, date, integer) to authenticated;
