-- Owner's rule: every car cost (Saga, Bezza, Myvi: rental, fuel, upkeep, instalment, road tax) is a business
-- expense. Records already filed as personal use, financing or Lain-lain move to Petrol & Pengangkutan (6000).
update public.transactions t
set category_id = car.id
from public.categories car, public.categories cur
where car.user_id is null and car.type = 'expense' and car.name = 'Petrol & Pengangkutan'
  and cur.id = t.category_id
  and cur.user_id is null and cur.type = 'expense'
  and cur.name in ('Kegunaan Peribadi Pemilik', 'Pinjaman & Pembiayaan', 'Lain-lain', 'Rumah & Sewa')
  and t.transaction_type = 'expense'
  and concat_ws(' ', t.merchant, t.description)
      ~* '\m(kereta|saga|bezza|bezaa|myvi|axia|proton|perodua|naza|kenderaan|roadtax|road tax|minyak|myk|servis|tayar)\M';
