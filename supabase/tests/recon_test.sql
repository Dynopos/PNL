-- Bank statement import and reconciliation. Run via supabase/tests/run.sh.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ali@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bee@example.test');

reset role;
select id as a_account from public.accounts where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' \gset
set vapro.a_account = :'a_account';

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

create or replace function pg_temp.line(p_date text, p_desc text, p_amount text, p_dir text, p_bal text)
returns jsonb language sql as $$
  select jsonb_build_object('date', p_date, 'description', p_desc, 'amount', p_amount, 'direction', p_dir, 'balance', p_bal)
$$;

do $$
declare
  v_acc uuid := current_setting('vapro.a_account')::uuid;
begin
  insert into public.transactions (user_id, account_id, merchant, amount, transaction_type, transaction_date) values
    (auth.uid(), v_acc, 'Jualan',  500.00, 'income',  date '2026-11-01'),  -- same day
    (auth.uid(), v_acc, 'Mydin',    55.00, 'expense', date '2026-11-02'),  -- repeated amount #1
    (auth.uid(), v_acc, 'Mydin',    55.00, 'expense', date '2026-11-09'),  -- repeated amount #2
    (auth.uid(), v_acc, 'Sewa',   1200.00, 'expense', date '2026-11-01'),  -- 5 days before bank
    (auth.uid(), v_acc, 'Tunai',    80.00, 'expense', date '2026-11-04'),  -- cash, never in bank
    (auth.uid(), v_acc, 'Refund',   20.00, 'income',  date '2026-11-05'),  -- bank has 20 OUT: direction differs
    (auth.uid(), v_acc, 'Lama',    999.00, 'expense', date '2026-10-01');  -- outside window
end $$;

do $$
declare
  r record;
begin
  select * into r from public.import_bank_statement(
    current_setting('vapro.a_account')::uuid, 'cimb', 'nov.pdf', 2000, 0,
    jsonb_build_array(
      pg_temp.line('2026-11-01', 'IBG CREDIT ABC', '500.00', 'in', '2500.00'),
      pg_temp.line('2026-11-03', 'DEBIT CARD MYDIN', '55.00', 'out', '2445.00'),
      pg_temp.line('2026-11-06', 'INSTANT TRANSFER SEWA', '1200.00', 'out', '1245.00'),
      pg_temp.line('2026-11-06', 'SERVICE CHARGE', '20.00', 'out', '1225.00'),
      pg_temp.line('2026-11-10', 'DEBIT CARD MYDIN', '55.00', 'out', '1170.00'),
      pg_temp.line('2026-11-12', 'DUITNOW QR', '999.00', 'out', '171.00')
    ));
  assert r.statement_id is not null and r.inserted = 6 and r.duplicates = 0, format('import %s', r);
  assert r.matched = 4, format('matched %s', r.matched);
  raise notice 'ok  import stores lines and auto-matches';
end $$;

do $$
declare
  v text;
begin
  select string_agg(l.line_date || ' ' || l.amount || '->' || coalesce(t.transaction_date::text, '-') || ':' || l.needs_review, ', ' order by l.line_date, l.amount)
    into v
  from public.bank_lines l left join public.transactions t on t.id = l.transaction_id;
  assert v = '2026-11-01 500.00->2026-11-01:false, 2026-11-03 55.00->2026-11-02:true, '
             '2026-11-06 20.00->-:false, 2026-11-06 1200.00->2026-11-01:true, '
             '2026-11-10 55.00->2026-11-09:true, 2026-11-12 999.00->-:false', v;
  raise notice 'ok  closest date wins; repeats and 5-day gaps flagged; direction and window respected';
end $$;

do $$
declare
  r record;
begin
  select * into r from public.import_bank_statement(
    current_setting('vapro.a_account')::uuid, 'cimb', 'nov-again.pdf', 2000, 0,
    jsonb_build_array(
      pg_temp.line('2026-11-01', 'IBG CREDIT ABC', '500.00', 'in', '2500.00'),
      pg_temp.line('2026-11-03', 'Debit Card Mydin', '55.00', 'out', '2445.00')));
  assert r.statement_id is null and r.inserted = 0 and r.duplicates = 2, format('reimport %s', r);
  assert (select count(*) from public.bank_statements) = 1, 'no empty statement left behind';
  raise notice 'ok  re-uploading the same statement adds nothing';
end $$;

do $$
declare
  v_line uuid := (select id from public.bank_lines where description = 'SERVICE CHARGE');
  v_cat uuid := (select id from public.categories where name = 'Bil & Utiliti');
  v_tx uuid;
  v_again uuid;
begin
  v_tx := public.create_transaction_from_bank_line(v_line, v_cat);
  v_again := public.create_transaction_from_bank_line(v_line, v_cat);
  assert v_tx = v_again, 'idempotent';
  assert (select source::text || ':' || transaction_type || ':' || amount from public.transactions where id = v_tx) = 'bank:expense:20.00';
  assert (select transaction_id from public.bank_lines where id = v_line) = v_tx;
  raise notice 'ok  unmatched bank line becomes a linked transaction, once';
end $$;

select pg_temp.expect_error(
  $q$select public.match_bank_line((select id from public.bank_lines where description = 'DUITNOW QR'),
                                   (select id from public.transactions where merchant = 'Tunai'))$q$,
  array['22023'], 'manual match with a different amount');

do $$
declare
  v_line uuid := (select id from public.bank_lines where description = 'DUITNOW QR');
  v_old uuid := (select id from public.transactions where merchant = 'Lama');
begin
  perform public.match_bank_line(v_line, v_old);
  assert (select match_type || ':' || needs_review from public.bank_lines where id = v_line) = 'manual:false';

  perform public.update_bank_line(v_line, 'ignore');
  assert (select ignored and transaction_id is null from public.bank_lines where id = v_line), 'ignored lines are unlinked';
  assert public.reconcile_account(current_setting('vapro.a_account')::uuid) = 0, 'ignored lines are not re-matched';

  perform public.update_bank_line((select id from public.bank_lines where line_date = '2026-11-03'), 'confirm');
  assert not (select needs_review from public.bank_lines where line_date = '2026-11-03');

  delete from public.transactions where merchant = 'Sewa';
  assert (select transaction_id is null from public.bank_lines where description = 'INSTANT TRANSFER SEWA'),
    'deleting a transaction frees its bank line';
  raise notice 'ok  manual match, ignore, confirm, and transaction deletion behave';
end $$;

-- Another user ----------------------------------------------------------------
set request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
do $$
begin
  assert (select count(*) from public.bank_lines) = 0 and (select count(*) from public.bank_statements) = 0,
    'B sees none of A''s bank data';
  raise notice 'ok  bank data is private';
end $$;
select pg_temp.expect_error(
  $q$select * from public.import_bank_statement(current_setting('vapro.a_account')::uuid, 'cimb', 'x', 0, 0,
     jsonb_build_array(pg_temp.line('2026-11-01', 'X', '1.00', 'in', '1.00')))$q$,
  array['23503', '42501'], 'import into another user''s account');
select pg_temp.expect_error(
  $q$select public.update_bank_line((select id from public.bank_lines limit 1), 'ignore')$q$,
  array['P0002', '22004', '39004'], 'touch another user''s bank line');

reset role;
set role anon;
select pg_temp.expect_error($q$select * from public.bank_lines$q$, array['42501'], 'anon reads bank lines');

\echo 'ALL RECONCILIATION TESTS PASSED'
