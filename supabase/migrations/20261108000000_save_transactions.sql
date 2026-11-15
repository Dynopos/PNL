-- Saves a reviewed batch (e.g. one voice command) in a single database transaction.
-- Each item carries a client idempotency key: a retried or repeated submission returns the
-- rows already saved instead of inserting duplicates. Runs as the caller, so RLS, the
-- account ownership FK and the category/type check all apply.
create or replace function public.save_transactions(p_account_id uuid, p_items jsonb, p_source text default 'voice')
returns table (item_key text, transaction_id uuid, inserted boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item jsonb;
  v_key text;
  v_amount numeric;
  v_date date;
  v_id uuid;
begin
  if p_source not in ('voice', 'manual') then
    raise exception 'invalid source' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'between 1 and 20 items required' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_key := v_item ->> 'idempotency_key';
    v_amount := (v_item ->> 'amount')::numeric;
    v_date := (v_item ->> 'transaction_date')::date;
    if v_key is null then
      raise exception 'idempotency_key required' using errcode = '22023';
    end if;
    if v_amount is null or v_amount <> round(v_amount, 2) then
      raise exception 'amount must have at most two decimals' using errcode = '22023';
    end if;
    if v_date is null or v_date > public.kl_today() then
      raise exception 'transaction_date missing or in the future' using errcode = '22023';
    end if;

    v_id := null;
    insert into public.transactions (
      user_id, account_id, category_id, merchant, description, amount, currency,
      transaction_type, transaction_date, source, idempotency_key
    ) values (
      (select auth.uid()),
      p_account_id,
      nullif(v_item ->> 'category_id', '')::uuid,
      nullif(btrim(v_item ->> 'merchant'), ''),
      nullif(btrim(v_item ->> 'description'), ''),
      v_amount,
      'MYR',
      (v_item ->> 'transaction_type')::public.entry_type,
      v_date,
      p_source::public.transaction_source,
      v_key
    )
    on conflict (user_id, idempotency_key) do nothing
    returning id into v_id;

    if v_id is null then
      select t.id into v_id from public.transactions t
      where t.user_id = (select auth.uid()) and t.idempotency_key = v_key;
      return query select v_key, v_id, false;
    else
      return query select v_key, v_id, true;
    end if;
  end loop;
end;
$$;

revoke execute on function public.save_transactions(uuid, jsonb, text) from public, anon;
grant execute on function public.save_transactions(uuid, jsonb, text) to authenticated;
