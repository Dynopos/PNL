import { Mic } from 'lucide-react';
import { ComingSoon } from '../components/ComingSoon';

export function VoicePage() {
  return (
    <ComingSoon
      icon={Mic}
      title="Rekod dengan suara"
      phase={3}
      items={[
        'Tekan mikrofon dan sebut pendapatan atau belanja dalam Bahasa Melayu',
        'Kenal pasti sendiri: “Mydin 55 ringgit” → perbelanjaan, “Customer bayar 800 ringgit” → pendapatan',
        'Jika tidak pasti sama ada pendapatan atau perbelanjaan, anda diminta mengesahkan',
        'Beberapa transaksi dalam satu ayat',
        'Semak sebelum simpan jika ada yang kurang jelas',
        'Buat masa ini, gunakan “Tambah” di halaman Transaksi untuk rekod manual (pendapatan atau perbelanjaan)',
      ]}
    />
  );
}
