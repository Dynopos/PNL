-- Reporting function checks. Run via supabase/tests/run.sh.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ali@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bee@example.test');

-- User B spends a lot; none of it may leak into A's reports.
insert into public.transactions (user_id, account_id, merchant, amount, transaction_date)
select user_id, id, 'Mydin', 9999.99, date '2026-11-04'
from public.accounts where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

do $$
declare
  v_acc uuid := (select id from public.accounts);
  v_dapur uuid := (select id from public.categories where name = 'Barang Dapur');
  v_petrol uuid := (select id from public.categories where name = 'Petrol & Pengangkutan');
  v_makan uuid := (select id from public.categories where name = 'Makanan & Minuman');
begin
  insert into public.transactions (user_id, account_id, category_id, merchant, amount, transaction_date, transaction_type) values
    (auth.uid(), v_acc, v_dapur,  'Mydin',    55.00, date '2026-11-04', 'expense'),
    (auth.uid(), v_acc, v_petrol, 'Petronas', 60.00, date '2026-11-04', 'expense'),
    (auth.uid(), v_acc, v_makan,  'KFC',      25.10, date '2026-11-02', 'expense'),
    (auth.uid(), v_acc, v_dapur,  'mydin ',   20.20, date '2026-11-01', 'expense'),
    (auth.uid(), v_acc, v_makan,  'KFC',      12.00, date '2026-10-31', 'expense'),
    (auth.uid(), v_acc, null,     null,        5.00, date '2026-11-03', 'expense'),
    (auth.uid(), v_acc, null,     'Majikan', 3000.00, date '2026-11-01', 'income');

  insert into public.budgets (user_id, account_id, month, amount) values (auth.uid(), v_acc, date '2026-11-01', 1500);
end $$;

do $$
declare
  r record;
begin
  select * into r from public.dashboard_summary(date '2026-11-04');
  assert r.today_total = 115.00, format('today_total %s', r.today_total);
  assert r.today_count = 2;
  assert r.month_total = 165.30, format('month_total %s (must exclude income, October and other users)', r.month_total);
  assert r.month_count = 5;
  assert r.month_budget = 1500;

  select * into r from public.dashboard_summary(date '2026-12-01');
  assert r.today_total = 0 and r.month_total = 0 and r.month_count = 0, 'empty month is zero, not null';
  assert r.month_budget is null, 'no budget set for December';
  raise notice 'ok  dashboard_summary: today, month, budget, empty month';
end $$;

do $$
declare
  v_days int;
  v_total numeric;
begin
  select count(*), sum(total) into v_days, v_total
  from public.spending_by_period(date '2026-10-29', date '2026-11-04', 'day');
  assert v_days = 7, 'one row per day including empty days';
  assert v_total = 177.30, format('daily sum %s', v_total);
  assert (select total from public.spending_by_period(date '2026-10-29', date '2026-11-04', 'day')
          where bucket = date '2026-10-30') = 0, 'empty day reports 0';

  -- 2026-11-02 is a Monday: week buckets split Oct 31/Nov 1 from Nov 2-4.
  assert (select array_agg(total order by bucket) from public.spending_by_period(date '2026-10-29', date '2026-11-04', 'week'))
         = array[32.20, 145.10]::numeric[], 'ISO week buckets start Monday';

  assert (select array_agg(total order by bucket) from public.spending_by_period(date '2026-09-01', date '2026-11-30', 'month'))
         = array[0, 12.00, 165.30]::numeric[], 'monthly comparison with empty month';
  raise notice 'ok  spending_by_period: day/week/month buckets with zero fill';
end $$;

do $$
declare
  v_names text[];
  v_totals numeric[];
begin
  select array_agg(category_name order by total desc, category_name), array_agg(total order by total desc, category_name)
    into v_names, v_totals
  from public.spending_by_category(date '2026-11-01', date '2026-11-30');
  assert v_names = array['Barang Dapur', 'Petrol & Pengangkutan', 'Makanan & Minuman', 'Tiada kategori'],
    format('categories %s', v_names);
  assert v_totals = array[75.20, 60.00, 25.10, 5.00]::numeric[], format('category totals %s', v_totals);
  raise notice 'ok  spending_by_category incl. uncategorised';
end $$;

do $$
declare
  r record;
begin
  select * into r from public.top_merchants(date '2026-10-01', date '2026-11-30', 5) limit 1;
  assert r.merchant = 'Mydin' and r.total = 75.20 and r.tx_count = 2,
    format('top merchant %s %s %s (should merge "Mydin" and "mydin ")', r.merchant, r.total, r.tx_count);
  assert (select count(*) from public.top_merchants(date '2026-10-01', date '2026-11-30', 2)) = 2, 'limit respected';
  raise notice 'ok  top_merchants merges spelling variants, respects limit';
end $$;

create or replace function pg_temp.expect_error(p_sql text, p_states text[], p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = any (p_states) then
      raise notice 'ok  rejected: %', p_label;
      return;
    end if;
    raise exception 'FAIL %: wrong error % (%)', p_label, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL %: statement was accepted', p_label;
end $$;

select pg_temp.expect_error($q$select * from public.spending_by_period(date '2026-11-01', date '2026-11-30', 'hour')$q$,
  array['22023'], 'unknown bucket');
select pg_temp.expect_error($q$select * from public.spending_by_period(date '2026-11-30', date '2026-11-01')$q$,
  array['22023'], 'reversed date range');
select pg_temp.expect_error($q$select * from public.spending_by_period(date '2000-01-01', date '2026-11-01')$q$,
  array['22023'], 'unbounded date range');

reset role;
set role anon;
select pg_temp.expect_error($q$select * from public.dashboard_summary()$q$, array['42501'], 'anon calls dashboard_summary');

\echo 'ALL REPORT TESTS PASSED'
