-- Schema + Row Level Security checks. Run via supabase/tests/run.sh.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

-- Two users sign up --------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ali@example.test', '{"display_name":"  Ali  "}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bee@example.test', '{}');

do $$
begin
  assert (select count(*) from public.profiles) = 2, 'signup trigger should create a profile per user';
  assert (select display_name from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'Ali',
    'display_name should be trimmed from signup metadata';
  assert (select display_name from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002') is null,
    'missing display_name should be null, not empty';
  assert (select count(*) from public.accounts where account_type = 'business' and account_name = 'Bisnes') = 2,
    'signup trigger should create a Business account per user';
  assert (select count(*) from public.categories where user_id is null and type = 'expense') = 12, 'twelve system expense categories expected';
  assert (select count(*) from public.categories where user_id is null and type = 'income') = 4, 'four system income categories expected';
  raise notice 'ok  signup bootstrap + default categories';
end $$;

-- User B creates a private category -----------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
insert into public.categories (user_id, name) values ('bbbbbbbb-0000-0000-0000-000000000002', 'Kucing B');
insert into public.transactions (user_id, account_id, amount, transaction_date)
select 'bbbbbbbb-0000-0000-0000-000000000002', id, 9.90, date '2026-11-04' from public.accounts;

-- Act as user A --------------------------------------------------------------
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

do $$
declare
  v_acc uuid := (select id from public.accounts);
  v_cat uuid := (select id from public.categories where name = 'Barang Dapur');
begin
  assert (select count(*) from public.accounts) = 1, 'A should see only own account';
  assert (select count(*) from public.categories) = 16, 'A should see system categories only, not B''s';
  assert (select count(*) from public.transactions) = 0, 'A should not see B''s transactions';
  assert (select count(*) from public.profiles) = 1, 'A should see only own profile';

  insert into public.transactions
    (user_id, account_id, category_id, merchant, amount, transaction_date, source, idempotency_key)
  values
    (auth.uid(), v_acc, v_cat, 'Mydin', 55.00, date '2026-11-04', 'voice', 'sub-0001:0'),
    (auth.uid(), v_acc, v_cat, 'Kedai', 0.10, date '2026-11-04', 'manual', null),
    (auth.uid(), v_acc, v_cat, 'Kedai', 0.20, date '2026-11-04', 'manual', null);

  assert (select sum(amount) from public.transactions where merchant = 'Kedai') = 0.30,
    'NUMERIC money must sum exactly';
  assert (select currency from public.transactions where merchant = 'Mydin') = 'MYR', 'currency defaults to MYR';
  raise notice 'ok  isolation on read + valid insert + exact money';
end $$;

-- Expected rejections --------------------------------------------------------
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

select pg_temp.expect_error(
  $q$insert into public.transactions (user_id, account_id, amount, transaction_date, idempotency_key)
     select auth.uid(), id, 55.00, date '2026-11-04', 'sub-0001:0' from public.accounts$q$,
  array['23505'], 'duplicate idempotency key (retried voice submit)');

select pg_temp.expect_error(
  $q$insert into public.transactions (user_id, account_id, amount, transaction_date)
     values ('bbbbbbbb-0000-0000-0000-000000000002',
             (select id from public.accounts), 1, date '2026-11-04')$q$,
  array['42501'], 'insert a transaction as another user');

select pg_temp.expect_error(
  $q$insert into public.transactions (user_id, account_id, amount, transaction_date)
     values (auth.uid(), (select id from public.accounts where false) , 1, date '2026-11-04')$q$,
  array['23502'], 'transaction without account');

reset role;
select id as b_account from public.accounts where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' \gset
select id as b_category from public.categories where name = 'Kucing B' \gset
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

select pg_temp.expect_error(
  format($q$insert into public.transactions (user_id, account_id, amount, transaction_date)
            values (auth.uid(), %L, 1, date '2026-11-04')$q$, :'b_account'),
  array['23503'], 'insert into another user''s account');

select pg_temp.expect_error(
  format($q$insert into public.transactions (user_id, account_id, category_id, amount, transaction_date)
            select auth.uid(), id, %L, 1, date '2026-11-04' from public.accounts$q$, :'b_category'),
  array['42501'], 'use another user''s private category');

select pg_temp.expect_error(
  $q$insert into public.transactions (user_id, account_id, amount, transaction_date)
     select auth.uid(), id, 0, date '2026-11-04' from public.accounts$q$,
  array['23514'], 'zero amount');

select pg_temp.expect_error(
  $q$insert into public.transactions (user_id, account_id, amount, transaction_date)
     select auth.uid(), id, 99999999999, date '2026-11-04' from public.accounts$q$,
  array['22003'], 'amount beyond NUMERIC(12,2)');

select pg_temp.expect_error(
  $q$insert into public.budgets (user_id, account_id, month, amount)
     select auth.uid(), id, date '2026-11-15', 1000 from public.accounts$q$,
  array['23514'], 'budget month not on the 1st');

select pg_temp.expect_error(
  $q$insert into public.merchant_rules (user_id, merchant_keyword, category_id)
     select auth.uid(), 'Mydin', id from public.categories where name = 'Barang Dapur'$q$,
  array['23514'], 'merchant keyword not normalised');

select pg_temp.expect_error(
  $q$insert into public.profiles (id) values (gen_random_uuid())$q$,
  array['42501'], 'insert a profile directly');

do $$
declare
  n int;
begin
  insert into public.budgets (user_id, account_id, month, amount)
  select auth.uid(), id, date '2026-11-01', 1500 from public.accounts;
  insert into public.merchant_rules (user_id, merchant_keyword, category_id)
  select auth.uid(), 'mydin', id from public.categories where name = 'Barang Dapur';

  update public.transactions set amount = 1 where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, 'A must not update B''s transactions';

  delete from public.transactions where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, 'A must not delete B''s transactions';

  update public.categories set name = 'Hacked' where user_id is null;
  get diagnostics n = row_count;
  assert n = 0, 'system categories must be read-only';

  update public.profiles set display_name = 'Hacked' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, 'A must not update B''s profile';

  update public.profiles set display_name = 'Ali bin Abu' where id = auth.uid();
  get diagnostics n = row_count;
  assert n = 1, 'A can update own profile';
  raise notice 'ok  cross-user update/delete blocked, own profile editable';
end $$;

-- Signed-out (anon) ---------------------------------------------------------
reset role;
set role anon;
select pg_temp.expect_error('select * from public.transactions', array['42501'], 'anon reads transactions');
select pg_temp.expect_error('select * from public.categories', array['42501'], 'anon reads categories');

-- Account deletion cascades ---------------------------------------------------
reset role;
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$
begin
  assert (select count(*) from public.transactions where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0;
  assert (select count(*) from public.budgets) = 0;
  assert (select count(*) from public.merchant_rules) = 0;
  assert (select count(*) from public.profiles) = 1;
  assert (select count(*) from public.transactions) = 1, 'B''s data must survive A''s deletion';
  raise notice 'ok  deleting a user removes all of their data and nothing else';
end $$;

\echo 'ALL DATABASE TESTS PASSED'
