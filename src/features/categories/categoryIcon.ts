import {
  Clapperboard,
  Fuel,
  GraduationCap,
  HeartPulse,
  HandCoins,
  Home,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Store,
  Tag,
  UserRound,
  Users,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  'Makanan & Minuman': UtensilsCrossed,
  'Barang Dapur': ShoppingCart,
  'Petrol & Pengangkutan': Fuel,
  'Bil & Utiliti': Receipt,
  'Rumah & Sewa': Home,
  Kesihatan: HeartPulse,
  Pendidikan: GraduationCap,
  Hiburan: Clapperboard,
  Shopping: ShoppingBag,
  Jualan: Store,
  'Bayaran Pelanggan': HandCoins,
  Gaji: Wallet,
  'Kegunaan Peribadi Pemilik': UserRound,
  'Gaji Staff': Users,
};

export function categoryIcon(name: string | null | undefined): LucideIcon {
  return (name && ICONS[name]) || Tag;
}
