-- Read-only reporting functions. SECURITY INVOKER: they run as the caller, so RLS still applies.
-- All sums happen in NUMERIC; "today" defaults to the Malaysian calendar date.

create or replace function public.kl_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Asia/Kuala_Lumpur')::date $$;

-- Today, this month, and this month's budget (null when none is set).
create or replace function public.dashboard_summary(p_today date default null)
returns table (
  today_total numeric,
  today_count integer,
  month_total numeric,
  month_count integer,
  month_budget numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with d as (select coalesce(p_today, public.kl_today()) as today),
  m as (select today, date_trunc('month', today)::date as month_start from d)
  select
    coalesce(sum(t.amount) filter (where t.transaction_date = m.today), 0),
    (count(*) filter (where t.transaction_date = m.today))::int,
    coalesce(sum(t.amount), 0),
    count(t.id)::int,
    (select sum(b.amount) from public.budgets b
      where b.user_id = (select auth.uid()) and b.month = m.month_start)
  from m
  left join public.transactions t
    on t.user_id = (select auth.uid())
   and t.transaction_type = 'expense'
   and t.transaction_date between m.month_start and m.today
  group by m.today, m.month_start;
$$;

-- Totals bucketed by day, week (ISO, Monday start) or month, with empty buckets filled as 0.
create or replace function public.spending_by_period(p_from date, p_to date, p_bucket text default 'day')
returns table (bucket date, total numeric, tx_count integer)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_step interval;
begin
  if p_bucket not in ('day', 'week', 'month') then
    raise exception 'invalid bucket %', p_bucket using errcode = '22023';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 3700 then
    raise exception 'invalid date range' using errcode = '22023';
  end if;
  v_step := ('1 ' || p_bucket)::interval;

  return query
  with buckets as (
    select generate_series(
      date_trunc(p_bucket, p_from::timestamp),
      date_trunc(p_bucket, p_to::timestamp),
      v_step
    )::date as bucket
  ),
  sums as (
    select date_trunc(p_bucket, t.transaction_date::timestamp)::date as bucket,
           sum(t.amount) as total,
           count(*)::int as tx_count
    from public.transactions t
    where t.user_id = (select auth.uid())
      and t.transaction_type = 'expense'
      and t.transaction_date between p_from and p_to
    group by 1
  )
  select b.bucket, coalesce(s.total, 0), coalesce(s.tx_count, 0)
  from buckets b left join sums s using (bucket)
  order by b.bucket;
end;
$$;

create or replace function public.spending_by_category(p_from date, p_to date)
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
    and t.transaction_type = 'expense'
    and t.transaction_date between p_from and p_to
  group by t.category_id, c.name
  order by sum(t.amount) desc, 2;
$$;

-- Merchants grouped case-insensitively; the most recent spelling is shown.
create or replace function public.top_merchants(p_from date, p_to date, p_limit integer default 5)
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
    and t.transaction_type = 'expense'
    and t.transaction_date between p_from and p_to
    and nullif(btrim(t.merchant), '') is not null
  group by lower(btrim(t.merchant))
  order by sum(t.amount) desc, 1
  limit least(greatest(coalesce(p_limit, 5), 1), 20);
$$;

revoke execute on function public.dashboard_summary(date) from public, anon;
revoke execute on function public.spending_by_period(date, date, text) from public, anon;
revoke execute on function public.spending_by_category(date, date) from public, anon;
revoke execute on function public.top_merchants(date, date, integer) from public, anon;
grant execute on function public.dashboard_summary(date) to authenticated;
grant execute on function public.spending_by_period(date, date, text) to authenticated;
grant execute on function public.spending_by_category(date, date) to authenticated;
grant execute on function public.top_merchants(date, date, integer) to authenticated;
