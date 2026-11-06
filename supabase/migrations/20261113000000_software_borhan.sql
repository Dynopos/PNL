-- Owner's rule: everything paid to Borhan is software and subscriptions, an operating expense (6000).
insert into public.categories (user_id, name, type) values
  (null, 'Software & Langganan', 'expense')
on conflict do nothing;

update public.transactions t
set category_id = sw.id
from public.categories sw
where sw.user_id is null and sw.type = 'expense' and sw.name = 'Software & Langganan'
  and t.transaction_type = 'expense'
  and t.category_id is distinct from sw.id
  and concat_ws(' ', t.merchant, t.description) ~* '\mborhan\M';
