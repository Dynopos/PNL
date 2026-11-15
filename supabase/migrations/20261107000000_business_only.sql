-- DuitVoice keeps a single Business book per user. Owners who pay personal costs from the
-- business tag them "Kegunaan Peribadi Pemilik" instead of using a separate Personal book.
-- Existing Personal records are folded into the Business book; nothing is deleted.

insert into public.categories (user_id, name, type) values
  (null, 'Kegunaan Peribadi Pemilik', 'expense')
on conflict do nothing;

-- A user with only a Personal account: that account becomes their Business book.
update public.accounts a
set account_type = 'business', account_name = 'Bisnes'
where a.account_type = 'personal'
  and not exists (
    select 1 from public.accounts b where b.user_id = a.user_id and b.account_type = 'business'
  );

-- A user with both: move Personal transactions into the Business book.
update public.transactions t
set account_id = b.id
from public.accounts p
join public.accounts b on b.user_id = p.user_id and b.account_type = 'business'
where t.account_id = p.id
  and p.account_type = 'personal';

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
  values (new.id, 'Bisnes', 'business');

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
