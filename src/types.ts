export type Market = {
  id: number;
  symbol: string;
  name: string;
  asset_class: 'stock' | 'etf' | 'forex' | 'crypto' | string;
  price: number;
  change_24h: number;
  volume: number;
  high_24h: number;
  low_24h: number;
};

export type Wallet = {
  id: number;
  user_id: string;
  currency: string;
  available: number;
  reserved: number;
  unrealized?: number;
  equity?: number;
  open_positions?: number;
};

export type Profile = {
  id: number;
  user_id: string;
  email: string;
  full_name: string;
  country: string;
  phone: string;
  kyc_status: string;
  avatar_url: string;
  referral_code: string;
  referred_by: string | null;
  role?: string;
};

export type Position = {
  id: number;
  user_id: string;
  market_id: number;
  symbol: string;
  side: string;
  quantity: number;
  entry_price: number;
  current_price: number;
  stop_loss: number | null;
  take_profit: number | null;
  pnl: number;
  margin: number;
  status: string;
  opened_at?: string;
  closed_at?: string;
  created_at?: string;
};

export type Order = {
  id: number;
  user_id: string;
  market_id: number;
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  price: number;
  stop_loss: number | null;
  take_profit: number | null;
  status: string;
  filled_price: number | null;
  created_at?: string;
};

export type Plan = {
  id: number;
  name: string;
  tagline: string;
  min_amount: number;
  max_amount: number | null;
  daily_rate: number;
  duration_days: number;
  total_return: number;
  featured: boolean;
};

export type Investment = {
  id: number;
  plan_id: number;
  plan_name: string;
  amount: number;
  daily_rate: number;
  duration_days: number;
  start_date: string;
  end_date: string;
  status: string;
  earned: number;
  days_elapsed?: number;
  plan?: Plan;
};

export type Txn = {
  id: number;
  type: string;
  amount: number;
  currency: string;
  method: string;
  status: string;
  reference: string;
  created_at: string;
};

export type Trader = {
  id: number;
  name: string;
  country: string;
  avatar_url: string;
  win_rate: number;
  followers: number;
  monthly_return: number;
  bio: string;
  risk_level: string;
  specialty: string;
};

export type CopyTrade = {
  id: number;
  trader_id: number;
  trader_name: string;
  allocated: number;
  pnl: number;
  status: string;
};

export type Notice = {
  id: number;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
};

export type Feature = { id: number; title: string; description: string; icon: string };
export type Partner = { id: number; name: string; mark: string };
export type Stat = { id: number; label: string; value: number; suffix: string; prefix: string };
export type Testimonial = {
  id: number;
  name: string;
  country: string;
  amount: number;
  quote: string;
  video_url: string;
  avatar_url: string;
  role: string;
};
export type TickerTrade = {
  id: number;
  trader_name: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  asset_class: string;
  created_at: string;
};
