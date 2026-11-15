-- Chart of accounts (Dynopos GL format). Every category posts to one GL account:
--   4000 Jualan | 5000 Kos Jualan | 5010 Kos Jualan - Pendahuluan Pembekal | 6000 Perbelanjaan Operasi
--   6050 Gaji Staff | 6100 Ambilan Pemilik | 6200 Pinjaman & Pembiayaan     (1000 Tunai di Bank is the cash book)
alter table public.categories
  add column if not exists gl_account text not null default '6000'
  check (gl_account in ('4000', '5000', '5010', '6000', '6050', '6100', '6200'));

insert into public.categories (user_id, name, type) values
  (null, 'Kos Barang & Stok', 'expense'),
  (null, 'Pendahuluan Pembekal', 'expense'),
  (null, 'Pinjaman & Pembiayaan', 'expense')
on conflict do nothing;

update public.categories set gl_account = case
    when type = 'income' then '4000'
    when name = 'Kos Barang & Stok' or name ~* '(cogs|stok|stock|bahan|inventori)' then '5000'
    when name = 'Pendahuluan Pembekal' then '5010'
    when name = 'Gaji Staff' then '6050'
    when name = 'Kegunaan Peribadi Pemilik' then '6100'
    when name = 'Pinjaman & Pembiayaan' then '6200'
    else '6000'
  end;

-- New categories: income posts to Jualan, expenses to Perbelanjaan Operasi unless chosen otherwise.
create or replace function public.category_default_gl()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type = 'income' then
    new.gl_account := '4000';
  elsif new.gl_account = '4000' then
    new.gl_account := '6000';
  end if;
  return new;
end;
$$;

drop trigger if exists categories_default_gl on public.categories;
create trigger categories_default_gl
  before insert or update of type, gl_account on public.categories
  for each row execute function public.category_default_gl();

-- Bank lines already in the records under Lain-lain or Shopping, moved per the same rules the app now uses.
update public.transactions t
set category_id = target.id
from public.categories target, public.categories cur
where cur.id = t.category_id
  and cur.user_id is null and cur.type = 'expense' and cur.name in ('Lain-lain', 'Shopping')
  and t.source = 'bank' and t.transaction_type = 'expense'
  and target.user_id is null and target.type = 'expense'
  and target.name = case
    when t.description ~* '(atm withdrawal|withdrawal fee|kenduri|aqiqah|welfare|duit rumah|loan rumah)' then 'Kegunaan Peribadi Pemilik'
    when t.description ~* '(spaylater|pay ?later|atome|financing|pembiayaan|instalment|ansuran|loan)' then 'Pinjaman & Pembiayaan'
    when t.description ~* '(shopee|lazada|tiktok|ezc tech|mdotpos|highstead|redsoft|teqcom|on 9 trading|autocount|ti computer|jos tech|winning media|rcs communication|aje solution|supplier|pembekal|hardware|printer|laptop)' then 'Kos Barang & Stok'
  end;
