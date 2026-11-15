-- Income & expense report checks, per account. Run via supabase/tests/run.sh.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ali@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bee@example.test');

-- User B's money must never appear in A's reports.
insert into public.transactions (user_id, account_id, merchant, amount, transaction_date, transaction_type)
select user_id, id, 'Mydin', 9999.99, date '2026-11-04', 'income'
from public.accounts where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

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

-- Signup gives A a Business book; a second account (legacy Personal kind) checks the functions keep books apart.
insert into public.accounts (user_id, account_name, account_type) values (auth.uid(), 'Peribadi', 'personal');
select pg_temp.expect_error(
  $q$insert into public.accounts (user_id, account_name, account_type) values (auth.uid(), 'Bisnes 2', 'business')$q$,
  array['23505'], 'second business account');

do $$
declare
  v_personal uuid := (select id from public.accounts where account_type = 'personal');
  v_business uuid := (select id from public.accounts where account_type = 'business');
  c_dapur uuid := (select id from public.categories where name = 'Barang Dapur');
  c_petrol uuid := (select id from public.categories where name = 'Petrol & Pengangkutan');
  c_makan uuid := (select id from public.categories where name = 'Makanan & Minuman');
  c_gaji uuid := (select id from public.categories where name = 'Gaji');
  c_jualan uuid := (select id from public.categories where name = 'Jualan');
  c_customer uuid := (select id from public.categories where name = 'Bayaran Pelanggan');
begin
  insert into public.transactions (user_id, account_id, category_id, merchant, amount, transaction_date, transaction_type) values
    (auth.uid(), v_personal, c_gaji,   'Majikan',  2500.00, date '2026-11-01', 'income'),
    (auth.uid(), v_personal, c_dapur,  'Mydin',      55.00, date '2026-11-04', 'expense'),
    (auth.uid(), v_personal, c_petrol, 'Petronas',   60.00, date '2026-11-04', 'expense'),
    (auth.uid(), v_personal, c_makan,  'KFC',        25.10, date '2026-11-02', 'expense'),
    (auth.uid(), v_personal, c_dapur,  'mydin ',     20.20, date '2026-11-01', 'expense'),
    (auth.uid(), v_personal, c_makan,  'KFC',        12.00, date '2026-10-31', 'expense'),
    (auth.uid(), v_personal, null,     null,          5.00, date '2026-11-03', 'expense'),
    (auth.uid(), v_business, c_jualan, null,       1500.00, date '2026-11-04', 'income'),
    (auth.uid(), v_business, c_customer, 'Syarikat ABC', 800.00, date '2026-11-03', 'income'),
    (auth.uid(), v_business, c_dapur,  'Mydin',     300.00, date '2026-11-04', 'expense');
end $$;

select pg_temp.expect_error(
  $q$insert into public.transactions (user_id, account_id, category_id, amount, transaction_date, transaction_type)
     select auth.uid(), a.id, c.id, 10, date '2026-11-04', 'income'
     from public.accounts a, public.categories c where a.account_type = 'personal' and c.name = 'Barang Dapur'$q$,
  array['23514'], 'income filed under an expense category');

do $$
declare
  v_personal uuid := (select id from public.accounts where account_type = 'personal');
  v_business uuid := (select id from public.accounts where account_type = 'business');
  r record;
begin
  select * into r from public.cashflow_summary(v_personal, date '2026-11-04', date '2026-11-04');
  assert r.income_total = 0 and r.expense_total = 115.00 and r.net_cashflow = -115.00 and r.tx_count = 2,
    format('personal today %s', r);

  select * into r from public.cashflow_summary(v_personal, date '2026-11-01', date '2026-11-30');
  assert r.income_total = 2500.00, format('personal month income %s', r.income_total);
  assert r.expense_total = 165.30, format('personal month expense %s (excludes October, Business, other users)', r.expense_total);
  assert r.net_cashflow = 2334.70 and r.income_count = 1 and r.expense_count = 5 and r.tx_count = 6,
    format('personal month %s', r);

  select * into r from public.cashflow_summary(v_business, date '2026-11-01', date '2026-11-30');
  assert r.income_total = 2300.00 and r.expense_total = 300.00 and r.net_cashflow = 2000.00 and r.tx_count = 3,
    format('business month %s', r);

  select * into r from public.cashflow_summary(v_personal, date '2026-12-01', date '2026-12-31');
  assert r.income_total = 0 and r.expense_total = 0 and r.net_cashflow = 0 and r.tx_count = 0, 'empty period is zero';
  raise notice 'ok  cashflow_summary: income, expenses, net, counts; Personal and Business kept apart';
end $$;

do $$
declare
  v_personal uuid := (select id from public.accounts where account_type = 'personal');
begin
  assert (select count(*) from public.cashflow_by_period(v_personal, date '2026-10-29', date '2026-11-04', 'day')) = 7,
    'one row per day including empty days';
  assert (select array_agg(net order by bucket) from public.cashflow_by_period(v_personal, date '2026-11-01', date '2026-11-04', 'day'))
         = array[2479.80, -25.10, -5.00, -115.00]::numeric[], 'daily net';
  -- 2026-11-02 is a Monday.
  assert (select array_agg(income order by bucket) || array_agg(expense order by bucket)
          from public.cashflow_by_period(v_personal, date '2026-10-29', date '2026-11-04', 'week'))
         = array[2500.00, 0, 32.20, 145.10]::numeric[], 'ISO weeks start Monday (Sunday 1 Nov is in the first week)';
  assert (select array_agg(net order by bucket) from public.cashflow_by_period(v_personal, date '2026-09-01', date '2026-11-30', 'month'))
         = array[0, -12.00, 2334.70]::numeric[], 'monthly net with empty month';
  raise notice 'ok  cashflow_by_period: day/week/month income, expense, net';
end $$;

do $$
declare
  v_personal uuid := (select id from public.accounts where account_type = 'personal');
  v_business uuid := (select id from public.accounts where account_type = 'business');
begin
  assert (select array_agg(category_name || '=' || total order by total desc, category_name)
          from public.totals_by_category(v_personal, date '2026-11-01', date '2026-11-30', 'expense'))
         = array['Barang Dapur=75.20', 'Petrol & Pengangkutan=60.00', 'Makanan & Minuman=25.10', 'Tiada kategori=5.00'],
    'expense categories';
  assert (select array_agg(category_name || '=' || total order by total desc)
          from public.totals_by_category(v_business, date '2026-11-01', date '2026-11-30', 'income'))
         = array['Jualan=1500.00', 'Bayaran Pelanggan=800.00'], 'income categories (business)';

  assert (select merchant || '=' || total from public.top_merchants(v_personal, date '2026-10-01', date '2026-11-30', 1))
         = 'Mydin=75.20', 'top merchant merges spelling, expenses only, personal only';
  raise notice 'ok  totals_by_category (income/expense) and top_merchants per account';
end $$;

select pg_temp.expect_error($q$select * from public.cashflow_by_period(gen_random_uuid(), date '2026-11-01', date '2026-11-30', 'hour')$q$,
  array['22023'], 'unknown bucket');
select pg_temp.expect_error($q$select * from public.cashflow_by_period(gen_random_uuid(), date '2026-11-30', date '2026-11-01')$q$,
  array['22023'], 'reversed date range');

-- Passing another user's account id returns nothing.
reset role;
select id as b_account from public.accounts where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' \gset
set vapro.b_account = :'b_account';
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$
begin
  assert (select tx_count from public.cashflow_summary(current_setting('vapro.b_account')::uuid, date '2026-01-01', date '2026-12-31')) = 0,
    'another user''s account id yields nothing';
  raise notice 'ok  another user''s account id yields nothing';
end $$;

reset role;
set role anon;
select pg_temp.expect_error($q$select * from public.cashflow_summary(gen_random_uuid(), date '2026-11-01', date '2026-11-30')$q$,
  array['42501'], 'anon calls cashflow_summary');

\echo 'ALL REPORT TESTS PASSED'
