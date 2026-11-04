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

export type AccountKind = 'personal' | 'business';

export interface Account {
  id: string;
  account_name: string;
  account_type: AccountKind;
}

export interface CashflowSummary {
  income_total: number;
  expense_total: number;
  net_cashflow: number;
  income_count: number;
  expense_count: number;
  tx_count: number;
}

export interface CashflowBucket {
  bucket: string;
  income: number;
  expense: number;
  net: number;
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
