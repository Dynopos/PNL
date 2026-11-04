import { Mic } from 'lucide-react';
import { ComingSoon } from '../components/ComingSoon';

export function VoicePage() {
  return (
    <ComingSoon
      icon={Mic}
      title="Rekod dengan suara"
      phase={3}
      items={[
        'Tekan mikrofon dan sebut belanja dalam Bahasa Melayu',
        'Beberapa transaksi dalam satu ayat',
        'Semak sebelum simpan jika ada yang kurang jelas',
        'Buat masa ini, gunakan “Tambah” di halaman Transaksi untuk rekod manual',
      ]}
    />
  );
}
