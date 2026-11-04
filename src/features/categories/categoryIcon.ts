import {
  Clapperboard,
  Fuel,
  GraduationCap,
  HeartPulse,
  Home,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Tag,
  UtensilsCrossed,
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
};

export function categoryIcon(name: string | null | undefined): LucideIcon {
  return (name && ICONS[name]) || Tag;
}
