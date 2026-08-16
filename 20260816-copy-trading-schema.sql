-- Copy Trading System - Enhanced Schema Migration
-- Run this migration to extend the existing tables with copy trading features

-- Step 1: Enhance the traders table with comprehensive fields
ALTER TABLE traders
ADD COLUMN IF NOT EXISTS asset_focus TEXT[] DEFAULT '{"BTC-USD", "ETH-USD"}',
ADD COLUMN IF NOT EXISTS current_equity DECIMAL DEFAULT 10000.00,
ADD COLUMN IF NOT EXISTS total_return DECIMAL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS daily_return DECIMAL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS total_trades INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS win_rate_trades DECIMAL DEFAULT 50.00,
ADD COLUMN IF NOT EXISTS max_drawdown DECIMAL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS volatility DECIMAL DEFAULT 0.005,
ADD COLUMN IF NOT EXISTS drift DECIMAL DEFAULT 0.001,
ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS session_type VARCHAR DEFAULT 'nyc',
ADD COLUMN IF NOT EXISTS session_start DATE DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS session_end DATE DEFAULT CURRENT_DATE + INTERVAL '7 days',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Step 2: Rename and enhance copy_trades to user_follows (or create new table)
-- First, check if we need to create user_follows table
CREATE TABLE IF NOT EXISTS user_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES auth.users(id) ON DELETE CASCADE,
  trader_id INTEGER REFERENCES traders(id) ON DELETE CASCADE,
  
  allocated_amount DECIMAL DEFAULT 0.00,
  current_value DECIMAL DEFAULT 0.00,
  pnl DECIMAL DEFAULT 0.00,
  pnl_percent DECIMAL DEFAULT 0.00,
  
  -- Risk Management per user
  stop_loss_percent DECIMAL DEFAULT 20.00,
  take_profit_percent DECIMAL DEFAULT 200.00,
  leverage_multiplier DECIMAL DEFAULT 1.0,
  
  is_copying BOOLEAN DEFAULT true,
  followed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, trader_id)
);

-- Step 3: Create trade_logs table for realistic trade simulation
CREATE TABLE IF NOT EXISTS trade_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id INTEGER REFERENCES traders(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  side VARCHAR(4) NOT NULL CHECK (side IN ('BUY', 'SELL')),
  quantity DECIMAL(20, 4) NOT NULL,
  entry_price DECIMAL(20, 4) NOT NULL,
  exit_price DECIMAL(20, 4),
  pnl DECIMAL(20, 2),
  pnl_percent DECIMAL(10, 2),
  status VARCHAR(10) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  traded_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Step 4: Create trader_history table for equity curve (7-day charts)
CREATE TABLE IF NOT EXISTS trader_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id INTEGER REFERENCES traders(id) ON DELETE CASCADE,
  snapshot_date DATE DEFAULT CURRENT_DATE,
  equity DECIMAL(20, 2),
  daily_return DECIMAL(10, 2),
  UNIQUE(trader_id, snapshot_date)
);

-- Step 5: Enhance notifications table
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS type VARCHAR DEFAULT 'info',
ADD COLUMN IF NOT EXISTS trader_id INTEGER REFERENCES traders(id) ON DELETE CASCADE;

-- Step 6: Create leaderboard_cache table for performance
CREATE TABLE IF NOT EXISTS leaderboard_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id INTEGER REFERENCES traders(id) ON DELETE CASCADE,
  rank INTEGER,
  medal VARCHAR(10), -- 'gold', 'silver', 'bronze', null
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trader_id)
);

-- Step 7: Create gamification tables for levels and badges
CREATE TABLE IF NOT EXISTS user_gamification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  level INTEGER DEFAULT 1,
  experience_points INTEGER DEFAULT 0,
  badges TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 8: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_traders_active ON traders(is_active);
CREATE INDEX IF NOT EXISTS idx_traders_session ON traders(session_type);
CREATE INDEX IF NOT EXISTS idx_traders_return ON traders(total_return DESC);
CREATE INDEX IF NOT EXISTS idx_follows_user ON user_follows(user_id);
CREATE INDEX IF NOT EXISTS idx_follows_trader ON user_follows(trader_id);
CREATE INDEX IF NOT EXISTS idx_trades_trader ON trade_logs(trader_id);
CREATE INDEX IF NOT EXISTS idx_trades_time ON trade_logs(traded_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trade_logs(status);
CREATE INDEX IF NOT EXISTS idx_history_trader ON trader_history(trader_id);
CREATE INDEX IF NOT EXISTS idx_history_date ON trader_history(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_gamification_user ON user_gamification(user_id);

-- Step 9: Update existing copy_trades table to support new fields (if you want to keep both)
-- This keeps backward compatibility
ALTER TABLE copy_trades
ADD COLUMN IF NOT EXISTS stop_loss_percent DECIMAL DEFAULT 20.00,
ADD COLUMN IF NOT EXISTS take_profit_percent DECIMAL DEFAULT 200.00,
ADD COLUMN IF NOT EXISTS leverage_multiplier DECIMAL DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS is_copying BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS pnl_percent DECIMAL DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS current_value DECIMAL,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Step 10: Add constraints to ensure data integrity
ALTER TABLE traders
ADD CONSTRAINT risk_score_range CHECK (risk_score BETWEEN 1 AND 10);

-- Create view for easy leaderboard queries
CREATE OR REPLACE VIEW leaderboard_view AS
SELECT 
  t.id,
  t.name,
  t.avatar_url,
  t.bio,
  t.asset_focus,
  t.total_return,
  t.daily_return,
  t.win_rate_trades,
  t.max_drawdown,
  t.followers,
  t.session_type,
  ROW_NUMBER() OVER (ORDER BY t.total_return DESC) as rank,
  CASE 
    WHEN ROW_NUMBER() OVER (ORDER BY t.total_return DESC) = 1 THEN 'gold'
    WHEN ROW_NUMBER() OVER (ORDER BY t.total_return DESC) = 2 THEN 'silver'
    WHEN ROW_NUMBER() OVER (ORDER BY t.total_return DESC) = 3 THEN 'bronze'
    ELSE NULL
  END as medal
FROM traders
WHERE is_active = true
ORDER BY t.total_return DESC;
