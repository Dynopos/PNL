export type EntryType = 'expense' | 'income';

export interface Category {
  id: string;
  user_id: string | null;
  name: string;
  type: EntryType;
}

export interface Transaction {
  id: string;
  account_id: string;
  category_id: string | null;
  merchant: string | null;
  description: string | null;
  amount: number;
  currency: string;
  transaction_type: EntryType;
  transaction_date: string;
  source: 'voice' | 'manual';
  created_at: string;
}

export interface DashboardSummary {
  today_total: number;
  today_count: number;
  month_total: number;
  month_count: number;
  month_budget: number | null;
}

export interface PeriodBucket {
  bucket: string;
  total: number;
  tx_count: number;
}

export interface CategoryTotal {
  category_id: string | null;
  category_name: string;
  total: number;
  tx_count: number;
}

export interface MerchantTotal {
  merchant: string;
  total: number;
  tx_count: number;
}
