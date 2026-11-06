-- Chart of accounts: every category posts to a GL account. Run via supabase/tests/run.sh.
\set ON_ERROR_STOP 1
\set QUIET 1

insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000001', 'ali@example.test');

do $$
declare
  r record;
begin
  for r in select * from (values
    ('Jualan', 'income', '4000'), ('Bayaran Pelanggan', 'income', '4000'), ('Gaji', 'income', '4000'),
    ('Kos Barang & Stok', 'expense', '5000'), ('Pendahuluan Pembekal', 'expense', '5010'),
    ('Petrol & Pengangkutan', 'expense', '6000'), ('Lain-lain', 'expense', '6000'),
    ('Gaji Staff', 'expense', '6050'), ('Kegunaan Peribadi Pemilik', 'expense', '6100'),
    ('Pinjaman & Pembiayaan', 'expense', '6200')) v(name, type, gl)
  loop
    assert (select gl_account from public.categories
            where user_id is null and name = r.name and type::text = r.type) = r.gl,
      format('%s should post to %s', r.name, r.gl);
  end loop;
end $$;

set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

insert into public.categories (user_id, name, type) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Komisen Ejen', 'income'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Iklan Facebook', 'expense');
insert into public.categories (user_id, name, type, gl_account) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Hardware POS', 'expense', '5000'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Pelik', 'expense', '4000');

do $$
begin
  assert (select gl_account from public.categories where name = 'Komisen Ejen') = '4000', 'own income -> 4000';
  assert (select gl_account from public.categories where name = 'Iklan Facebook') = '6000', 'own expense -> 6000';
  assert (select gl_account from public.categories where name = 'Hardware POS') = '5000', 'chosen account kept';
  assert (select gl_account from public.categories where name = 'Pelik') = '6000', 'expense cannot post to sales';
  update public.categories set gl_account = '6050' where name = 'Iklan Facebook';
  assert (select gl_account from public.categories where name = 'Iklan Facebook') = '6050', 'own category can move';
  begin
    update public.categories set gl_account = '9999' where name = 'Iklan Facebook';
    raise exception 'unknown account accepted';
  exception when check_violation then null;
  end;
end $$;

\echo ok  chart of accounts mapping
\echo ALL GL TESTS PASSED
