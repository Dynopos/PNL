-- Expense category for paying staff (the income category "Gaji" is the owner's own salary received).
insert into public.categories (user_id, name, type) values
  (null, 'Gaji Staff', 'expense')
on conflict do nothing;

-- Bank lines already put into the records as "Lain-lain" that are clearly staff pay.
update public.transactions t
set category_id = gs.id
from public.categories gs, public.categories lain
where gs.user_id is null and gs.name = 'Gaji Staff' and gs.type = 'expense'
  and lain.user_id is null and lain.name = 'Lain-lain' and lain.type = 'expense'
  and t.category_id = lain.id
  and t.source = 'bank'
  and t.transaction_type = 'expense'
  and t.description ~* '(gaji|salary|staff|pekerja|upah|elaun|wages)';
