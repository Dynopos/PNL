-- Bank statement lines and their reconciliation against recorded transactions.
-- A line is matched when transaction_id is set; each transaction matches at most one line.

alter type public.transaction_source add value if not exists 'bank';

-- Lets bank lines reference a transaction only within the same account.
alter table public.transactions add constraint transactions_id_account_uq unique (id, account_id);

create table public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null,
  bank text not null check (bank in ('cimb', 'maybank')),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  period_from date not null,
  period_to date not null check (period_to >= period_from),
  opening_balance numeric(14, 2),
  closing_balance numeric(14, 2),
  created_at timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade
);

create index bank_statements_account_idx on public.bank_statements (account_id, period_to desc);

create table public.bank_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null,
  statement_id uuid not null references public.bank_statements (id) on delete cascade,
  line_date date not null,
  description text not null check (char_length(description) between 1 and 500),
  amount numeric(12, 2) not null check (amount > 0),
  direction text not null check (direction in ('in', 'out')),
  balance numeric(14, 2),
  -- Same date, amount, direction, running balance and text = the same bank line re-uploaded.
  fingerprint text not null,
  transaction_id uuid,
  match_type text check (match_type in ('auto', 'manual')),
  needs_review boolean not null default false,
  ignored boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts (id, user_id) on delete cascade,
  foreign key (transaction_id, account_id) references public.transactions (id, account_id) on delete set null (transaction_id),
  unique (account_id, fingerprint),
  unique (transaction_id),
  check (not (ignored and transaction_id is not null))
);

create index bank_lines_account_date_idx on public.bank_lines (account_id, line_date);
create index bank_lines_statement_idx on public.bank_lines (statement_id);

alter table public.bank_statements enable row level security;
alter table public.bank_lines enable row level security;

create policy "bank_statements: read own" on public.bank_statements
  for select to authenticated using (user_id = (select auth.uid()));
create policy "bank_statements: delete own" on public.bank_statements
  for delete to authenticated using (user_id = (select auth.uid()));
create policy "bank_lines: read own" on public.bank_lines
  for select to authenticated using (user_id = (select auth.uid()));

-- Writes go through the functions below, which run as the caller (RLS applies).
create policy "bank_statements: insert own" on public.bank_statements
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "bank_lines: insert own" on public.bank_lines
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "bank_lines: update own" on public.bank_lines
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.bank_statements, public.bank_lines from anon;
grant select, insert, delete on public.bank_statements to authenticated;
grant select, insert, update on public.bank_lines to authenticated;

-- Pairs unmatched bank lines with unmatched transactions: same account, same direction
-- (in = income, out = expense), same amount, dates within the window. Closest date wins.
-- A pair is flagged for review when either side had another candidate or the dates are > 3 days apart.
create or replace function public.reconcile_account(p_account_id uuid, p_window_days integer default 7)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_window integer := least(greatest(coalesce(p_window_days, 7), 0), 31);
  v_pair record;
  v_matched integer := 0;
  v_used_lines uuid[] := '{}';
  v_used_tx uuid[] := '{}';
begin
  for v_pair in
    with lines as (
      select l.* from public.bank_lines l
      where l.account_id = p_account_id and l.user_id = (select auth.uid())
        and l.transaction_id is null and not l.ignored
    ),
    txs as (
      select t.* from public.transactions t
      where t.account_id = p_account_id and t.user_id = (select auth.uid())
        and not exists (select 1 from public.bank_lines bl where bl.transaction_id = t.id)
    ),
    pairs as (
      select l.id as line_id, t.id as tx_id,
             abs(l.line_date - t.transaction_date) as gap,
             l.line_date, t.created_at
      from lines l
      join txs t
        on t.amount = l.amount
       and t.transaction_type = case l.direction when 'in' then 'income'::public.entry_type else 'expense'::public.entry_type end
       and abs(l.line_date - t.transaction_date) <= v_window
    )
    select p.*,
           count(*) over (partition by p.line_id) as line_candidates,
           count(*) over (partition by p.tx_id) as tx_candidates
    from pairs p
    order by p.gap, p.line_date, p.created_at, p.line_id
  loop
    if v_pair.line_id = any (v_used_lines) or v_pair.tx_id = any (v_used_tx) then
      continue;
    end if;
    update public.bank_lines
    set transaction_id = v_pair.tx_id,
        match_type = 'auto',
        needs_review = (v_pair.line_candidates > 1 or v_pair.tx_candidates > 1 or v_pair.gap > 3)
    where id = v_pair.line_id;
    v_used_lines := v_used_lines || v_pair.line_id;
    v_used_tx := v_used_tx || v_pair.tx_id;
    v_matched := v_matched + 1;
  end loop;
  return v_matched;
end;
$$;

create or replace function public.import_bank_statement(
  p_account_id uuid,
  p_bank text,
  p_file_name text,
  p_opening numeric,
  p_closing numeric,
  p_lines jsonb,
  p_window_days integer default 7
)
returns table (statement_id uuid, inserted integer, duplicates integer, matched integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_statement uuid;
  v_inserted integer;
  v_total integer;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 2000 then
    raise exception 'between 1 and 2000 lines required' using errcode = '22023';
  end if;
  v_total := jsonb_array_length(p_lines);

  insert into public.bank_statements (user_id, account_id, bank, file_name, period_from, period_to, opening_balance, closing_balance)
  select (select auth.uid()), p_account_id, p_bank, left(p_file_name, 200),
         min((l ->> 'date')::date), max((l ->> 'date')::date), p_opening, p_closing
  from jsonb_array_elements(p_lines) l
  returning id into v_statement;

  with src as (
    select (l ->> 'date')::date as line_date,
           left(btrim(l ->> 'description'), 500) as description,
           (l ->> 'amount')::numeric(12, 2) as amount,
           l ->> 'direction' as direction,
           (l ->> 'balance')::numeric(14, 2) as balance
    from jsonb_array_elements(p_lines) l
  ),
  ins as (
    insert into public.bank_lines (user_id, account_id, statement_id, line_date, description, amount, direction, balance, fingerprint)
    select (select auth.uid()), p_account_id, v_statement, s.line_date, s.description, s.amount, s.direction, s.balance,
           md5(concat_ws('|', s.line_date, s.direction, s.amount, s.balance, lower(s.description)))
    from src s
    on conflict (account_id, fingerprint) do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  -- A re-upload that adds nothing new leaves no empty statement behind.
  if v_inserted = 0 then
    delete from public.bank_statements where id = v_statement;
    v_statement := null;
  end if;

  return query select v_statement, v_inserted, v_total - v_inserted, public.reconcile_account(p_account_id, p_window_days);
end;
$$;

create or replace function public.match_bank_line(p_line_id uuid, p_transaction_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_line public.bank_lines;
  v_tx public.transactions;
begin
  select * into v_line from public.bank_lines where id = p_line_id and user_id = (select auth.uid()) for update;
  select * into v_tx from public.transactions where id = p_transaction_id and user_id = (select auth.uid());
  if v_line.id is null or v_tx.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v_tx.account_id <> v_line.account_id
     or v_tx.amount <> v_line.amount
     or v_tx.transaction_type <> (case v_line.direction when 'in' then 'income'::public.entry_type else 'expense'::public.entry_type end) then
    raise exception 'transaction does not correspond to this bank line' using errcode = '22023';
  end if;
  update public.bank_lines set transaction_id = null, match_type = null, needs_review = false
  where transaction_id = p_transaction_id and id <> p_line_id;
  update public.bank_lines
  set transaction_id = p_transaction_id, match_type = 'manual', needs_review = false, ignored = false
  where id = p_line_id;
end;
$$;

create or replace function public.update_bank_line(p_line_id uuid, p_action text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_action not in ('unmatch', 'confirm', 'ignore', 'unignore') then
    raise exception 'invalid action' using errcode = '22023';
  end if;
  update public.bank_lines
  set transaction_id = case when p_action in ('unmatch', 'ignore') then null else transaction_id end,
      match_type = case when p_action in ('unmatch', 'ignore') then null else match_type end,
      needs_review = case when p_action = 'confirm' then false when p_action in ('unmatch', 'ignore') then false else needs_review end,
      ignored = case p_action when 'ignore' then true when 'unignore' then false else ignored end
  where id = p_line_id and user_id = (select auth.uid());
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Records a bank line that has no matching entry as a new transaction and links them, atomically.
create or replace function public.create_transaction_from_bank_line(p_line_id uuid, p_category_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_line public.bank_lines;
  v_tx uuid;
begin
  select * into v_line from public.bank_lines
  where id = p_line_id and user_id = (select auth.uid()) for update;
  if v_line.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v_line.transaction_id is not null then
    return v_line.transaction_id;
  end if;
  insert into public.transactions (
    user_id, account_id, category_id, description, amount, currency, transaction_type, transaction_date, source, idempotency_key
  ) values (
    v_line.user_id, v_line.account_id, p_category_id, v_line.description, v_line.amount, 'MYR',
    case v_line.direction when 'in' then 'income'::public.entry_type else 'expense'::public.entry_type end,
    v_line.line_date, 'bank', 'bank:' || v_line.id
  )
  on conflict (user_id, idempotency_key) do nothing
  returning id into v_tx;
  if v_tx is null then
    select id into v_tx from public.transactions where user_id = v_line.user_id and idempotency_key = 'bank:' || v_line.id;
  end if;
  update public.bank_lines
  set transaction_id = v_tx, match_type = 'manual', needs_review = false, ignored = false
  where id = p_line_id;
  return v_tx;
end;
$$;

revoke execute on function public.reconcile_account(uuid, integer) from public, anon;
revoke execute on function public.import_bank_statement(uuid, text, text, numeric, numeric, jsonb, integer) from public, anon;
revoke execute on function public.match_bank_line(uuid, uuid) from public, anon;
revoke execute on function public.update_bank_line(uuid, text) from public, anon;
revoke execute on function public.create_transaction_from_bank_line(uuid, uuid) from public, anon;
grant execute on function public.reconcile_account(uuid, integer) to authenticated;
grant execute on function public.import_bank_statement(uuid, text, text, numeric, numeric, jsonb, integer) to authenticated;
grant execute on function public.match_bank_line(uuid, uuid) to authenticated;
grant execute on function public.update_bank_line(uuid, text) to authenticated;
grant execute on function public.create_transaction_from_bank_line(uuid, uuid) to authenticated;
