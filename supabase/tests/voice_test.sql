-- save_transactions: atomic, idempotent, scoped to the caller. Run via supabase/tests/run.sh.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ali@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bee@example.test');

reset role;
select id as b_account from public.accounts where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' \gset
set vapro.b_account = :'b_account';

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

create or replace function pg_temp.items(p_suffix text, p_second_amount text default '60.00')
returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('idempotency_key', 'voice:test-' || p_suffix || ':0', 'merchant', 'Mydin', 'amount', '55.00',
      'transaction_type', 'expense', 'transaction_date', public.kl_today()::text,
      'category_id', (select id from public.categories where name = 'Barang Dapur')),
    jsonb_build_object('idempotency_key', 'voice:test-' || p_suffix || ':1', 'description', 'Jualan hari ini', 'amount', p_second_amount,
      'transaction_type', 'income', 'transaction_date', public.kl_today()::text,
      'category_id', (select id from public.categories where name = 'Jualan'))
  )
$$;

do $$
declare
  v_acc uuid := (select id from public.accounts);
  r record;
begin
  select count(*) filter (where inserted), count(*) into r
  from public.save_transactions(v_acc, pg_temp.items('a'));
  assert r.count = 2 and (select count(*) from public.transactions) = 2, 'first submission saves both';
  assert (select count(*) from public.transactions where source = 'voice') = 2, 'source is voice';

  select count(*) filter (where inserted) as ins, count(*) as tot into r
  from public.save_transactions(v_acc, pg_temp.items('a'));
  assert r.ins = 0 and r.tot = 2, 'repeat returns existing rows';
  assert (select count(*) from public.transactions) = 2, 'test case 10: repeated submission saves nothing new';
  raise notice 'ok  batch saved once; repeated submission is a no-op';

  begin
    perform public.save_transactions(v_acc, pg_temp.items('b', '0'));
    raise exception 'FAIL second item invalid but batch accepted';
  exception when check_violation then
    null;
  end;
  assert (select count(*) from public.transactions where idempotency_key like 'voice:test-b:%') = 0,
    'a failing item rolls back the whole batch';
  raise notice 'ok  one bad item rolls back the whole batch';
end $$;

select pg_temp.expect_error(
  $q$select * from public.save_transactions((select id from public.accounts), jsonb_build_array(jsonb_build_object(
      'idempotency_key', 'voice:x:0', 'amount', '1.005', 'transaction_type', 'expense', 'transaction_date', public.kl_today()::text)))$q$,
  array['22023'], 'three-decimal amount');
select pg_temp.expect_error(
  $q$select * from public.save_transactions((select id from public.accounts), jsonb_build_array(jsonb_build_object(
      'idempotency_key', 'voice:x:0', 'amount', '1', 'transaction_type', 'expense', 'transaction_date', (public.kl_today() + 1)::text)))$q$,
  array['22023'], 'future date');
select pg_temp.expect_error(
  $q$select * from public.save_transactions((select id from public.accounts), jsonb_build_array(jsonb_build_object(
      'amount', '1', 'transaction_type', 'expense', 'transaction_date', public.kl_today()::text)))$q$,
  array['22023'], 'missing idempotency key');
select pg_temp.expect_error(
  $q$select * from public.save_transactions((select id from public.accounts), '[]'::jsonb)$q$,
  array['22023'], 'empty batch');
select pg_temp.expect_error(
  $q$select * from public.save_transactions(current_setting('vapro.b_account')::uuid, jsonb_build_array(jsonb_build_object(
      'idempotency_key', 'voice:x:0', 'amount', '1', 'transaction_type', 'expense', 'transaction_date', public.kl_today()::text)))$q$,
  array['23503'], 'save into another user''s account');

reset role;
set role anon;
select pg_temp.expect_error($q$select * from public.save_transactions(gen_random_uuid(), '[]'::jsonb)$q$, array['42501'], 'anon');

\echo 'ALL VOICE SAVE TESTS PASSED'
