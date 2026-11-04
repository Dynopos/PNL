import { BarChart3, ListOrdered, Mic } from 'lucide-react';
import { ComingSoon } from '../components/ComingSoon';

export function TransactionsPage() {
  return (
    <ComingSoon
      icon={ListOrdered}
      title="Transaksi"
      phase={2}
      items={[
        'Senarai belanja dengan tarikh, kedai, kategori dan jumlah',
        'Carian serta tapis ikut tarikh dan kategori',
        'Tambah rekod secara manual',
        'Edit dan padam (dengan pengesahan)',
      ]}
    />
  );
}

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
        'Taip sebagai alternatif jika mikrofon tidak tersedia',
      ]}
    />
  );
}

export function ReportsPage() {
  return (
    <ComingSoon
      icon={BarChart3}
      title="Laporan"
      phase={2}
      items={[
        'Belanja harian, mingguan dan bulanan',
        'Pecahan ikut kategori',
        'Kedai paling banyak dibelanjakan',
        'Perbandingan bulan ke bulan',
      ]}
    />
  );
}
