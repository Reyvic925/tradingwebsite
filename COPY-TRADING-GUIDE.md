# Copy Trading System - Complete Implementation Guide

This guide covers the full implementation of a hyper-realistic social copy trading module with session-based simulation, real-time PnL tracking, risk management, and gamification.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
├──────────────────────────────────────────────────────────────────┤
│ Social.tsx (Leaderboard, Trader Cards, Portfolio Summary)       │
│ TraderProfile.tsx (Equity Curve, Trade Feed, Follower List)     │
│ Custom Hooks (useCopyTrading, useLeaderboard, useTraderTrades)  │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTP/API
┌──────────────────────▼──────────────────────────────────────────┐
│                    Backend API Layer                             │
├──────────────────────────────────────────────────────────────────┤
│ /api/traders (CRUD, filter by session/asset)                   │
│ /api/leaderboard (Rankings with medals)                         │
│ /api/copy-trades (Follow, Update Risk, Stop Copying)           │
│ /api/trader-trades (Live trade feed)                            │
│ /api/copy-summary (Aggregated portfolio stats)                 │
│ /api/notifications (In-app alerts)                              │
│ /api/simulate (Cron - runs every 1 minute)                      │
└──────────────────────┬──────────────────────────────────────────┘
                       │ SQL
┌──────────────────────▼──────────────────────────────────────────┐
│                  Supabase PostgreSQL                              │
├──────────────────────────────────────────────────────────────────┤
│ traders (with session_type, asset_focus, volatility, etc.)     │
│ user_follows (stops/takes/leverage per user)                   │
│ trade_logs (realistic simulated trades)                        │
│ trader_history (7-day equity snapshots)                        │
│ notifications (alerts for SL/TP/achievements)                  │
│ leaderboard_view (materialized rankings)                       │
│ user_gamification (levels & badges)                            │
└──────────────────────────────────────────────────────────────────┘
```

---

## Database Setup

### 1. Run the Schema Migration

Execute the SQL migration file in your Supabase SQL editor:

```bash
# File: 20260816-copy-trading-schema.sql
```

This creates:
- Extended `traders` table with simulation fields
- `user_follows` table (replaces/extends old copy_trades)
- `trade_logs` table for realistic trade simulation
- `trader_history` table for 7-day equity curves
- Enhanced `notifications` with type field
- `leaderboard_view` for quick ranking queries
- `user_gamification` for levels & badges
- Necessary indexes for performance

### 2. Verify Tables

```sql
-- Check all new tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- Verify leaderboard_view
SELECT * FROM leaderboard_view LIMIT 5;
```

---

## Backend Implementation

### 1. Update API Handlers

All handlers are located in `/api-handlers/`:

**traders.js** - CRUD for traders (Admin only for POST/PUT/DELETE)
- GET /api/traders?session=nyc&asset=BTC-USD
- POST /api/traders (Admin)
- PUT /api/traders?id=123 (Admin)
- DELETE /api/traders?id=123 (Admin - soft delete)

**copy-trades.js** - User's follow management
- GET /api/copy-trades (User's active copies)
- POST /api/copy-trades (Create follow with risk settings)
- PUT /api/copy-trades?id=uuid (Update risk settings)
- DELETE /api/copy-trades?id=uuid (Stop copying)

**leaderboard.js** - Ranked traders
- GET /api/leaderboard (Top 100 traders with medals)

**trader-trades.js** - Live trade feed
- GET /api/trader-trades?traderId=123 (Last 50 trades)

**copy-summary.js** - User portfolio aggregation
- GET /api/copy-summary (Total invested, current value, PnL)

**simulate.js** - **CRITICAL: Simulation Engine Cron**
- Runs every 1 minute via Vercel Cron or scheduled job
- Generates realistic trade logs that mathematically justify PnL changes
- Updates follower positions with leverage applied
- Enforces stop-loss and take-profit
- Creates notifications for limit triggers

### 2. Configure Cron Job

#### For Vercel (add to vercel.json):
```json
{
  "crons": [
    {
      "path": "/api/handlers/simulate",
      "schedule": "* * * * *"
    }
  ]
}
```

#### For Traditional Node.js Server:
```javascript
// Use node-cron or node-schedule
const cron = require('node-cron');
cron.schedule('* * * * *', async () => {
  await fetch('http://localhost:3000/api/simulate', {
    headers: { 'x-cron-secret': process.env.CRON_SECRET }
  });
});
```

---

## Frontend Implementation

### 1. Update src/types.ts

Already updated with new types:
- `Trader` - Extended with simulation fields
- `UserFollow` - Risk management per copy
- `TradeLog` - Individual trade records
- `TraderHistory` - Daily snapshots
- `UserGameification` - Levels & badges
- `CopySummary` - Portfolio aggregation
- `LeaderboardEntry` - Ranked trader

### 2. Add Utility Library

**src/lib/session-utils.ts** - Session and simulation helpers
- `isTraderEligible()` - Check session trading window
- `getMarketStatus()` - Live/Closed status
- `calculateMarketChange()` - Drift + volatility
- `generateRealisticEntryPrice()` - Price for realistic trades
- `checkNotificationTrigger()` - SL/TP detection
- `calculateUserLevel()` - Gamification level

### 3. Create Custom Hooks

**src/lib/copy-trading-hooks.ts** - React hooks for copy trading
- `usePnlAnimation()` - Smooth number animations
- `useCopyTrading()` - Follow/unfollow, risk management
- `useLeaderboard()` - Fetch rankings
- `useTraderTrades()` - Live trade feed
- `useTraders()` - Filter by session/asset
- `useNotifications()` - Fetch & mark notifications

### 4. Refactor Social Page

**src/pages/Social.tsx** - Complete redesign with:
- **LeaderboardSection**: Top 3 traders with medals (🥇🥈🥉)
- **PortfolioSummary**: Total invested, current value, PnL % with progress bar
- **TraderCard**: Asset focus pills, session badge, metrics, "Copy" button
- **FollowModal**: Allocation slider, risk settings (SL%, TP%, Leverage)
- **MyPositions**: Active copies with live PnL, risk badges, edit/stop buttons
- **EditFollowForm**: Inline risk parameter adjustment

### 5. Create Trader Profile Page

**src/pages/TraderProfile.tsx** - Detailed trader view with:
- Trader header with bio and key metrics
- Equity curve placeholder (ready for Recharts integration)
- Asset focus pills
- Live trade feed (scrollable, showing BUY/SELL with PnL)
- Secondary metrics: volatility, risk score, followers
- "Follow Trader" button

### 6. Add Notifications (Optional - react-hot-toast)

```bash
npm install react-hot-toast
```

In root layout:
```jsx
import { Toaster } from 'react-hot-toast';

export default function Layout() {
  return (
    <>
      <YourApp />
      <Toaster position="top-right" />
    </>
  );
}
```

Notifications automatically trigger when:
- Stop-Loss is hit: `⚠️ Stop-Loss triggered at -20.5%`
- Take-Profit is hit: `🎉 Take-Profit reached at +150%!`
- Session expires

---

## How the Simulation Engine Works

### The "Bot Brain" Logic

Every 1 minute, the cron handler:

1. **Fetches Active Traders**
   ```sql
   SELECT * FROM traders WHERE is_active = true AND session_end > NOW()
   ```

2. **Checks Session Eligibility**
   - Asia: 22:00 - 07:00 UTC
   - London: 08:00 - 17:00 UTC
   - NYC: 13:00 - 22:00 UTC
   - Crypto: 24/7
   - Weekends: Crypto only

3. **Calculates Market Change**
   ```javascript
   random = Math.random() * 2 - 1
   spike = Math.random() > 0.98 ? ±5% : 0
   changePercent = trader.drift + (trader.volatility * random) + spike
   newEquity = oldEquity * (1 + changePercent)
   pnlDelta = newEquity - oldEquity
   ```

4. **Generates Realistic Trade (THE KEY INSIGHT)**
   
   The trick: Create a trade that mathematically explains the PnL change.

   ```javascript
   // If profit: BUY at low, sell at high
   if (pnlDelta > 0) {
     symbol = randomAsset()
     entryPrice = currentPrice * (1 - |changePercent| * 0.8)
     side = 'BUY'
   } else {
     // If loss: SHORT at high, close at low
     entryPrice = currentPrice * (1 + |changePercent| * 0.8)
     side = 'SELL'
   }

   // Calculate quantity to match PnL
   quantity = |pnlDelta| / |currentPrice - entryPrice|

   // Insert trade log with OPEN status
   INSERT INTO trade_logs VALUES (...)
   ```

5. **Auto-Close Old Trades**
   - Trades open > 2 minutes auto-close
   - Calculate exit PnL
   - Update trader win_rate

6. **Update Followers**
   - For each user copying this trader:
   ```javascript
   baseMultiplier = 1 + changePercent
   userChange = (baseMultiplier - 1) * leverage
   newFollowValue = currentValue * (1 + userChange)
   followPnL = newFollowValue - allocated
   followPnLPercent = (followPnL / allocated) * 100
   ```

7. **Check Risk Limits**
   - If `pnlPercent ≤ -stopLoss%`: Auto-stop, notify user
   - If `pnlPercent ≥ takeProfitPercent%`: Auto-stop, celebrate!
   - If `pnlPercent ≤ -stopLoss * 0.8`: Warning notification

8. **Save Daily Snapshot**
   ```sql
   UPSERT INTO trader_history (trader_id, snapshot_date, equity)
   VALUES (123, TODAY, 10500.00)
   ```

---

## Admin Panel (To Create Traders)

Create `/src/pages/admin/CreateTrader.tsx`:

```jsx
function CreateTrader() {
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    avatar_url: '',
    asset_focus: ['BTC-USD', 'ETH-USD'],
    session_type: 'nyc',
    drift: 0.001,
    volatility: 0.005,
    risk_score: 5
  });

  const handleCreate = async () => {
    const res = await fetch('/api/traders', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(formData)
    });
    // Handle response
  };

  return (
    // Form with all fields...
  );
}
```

---

## Gamification Features (Optional)

Add to user profile:

```jsx
function UserLevel() {
  const level = calculateUserLevel(userStats.totalPnL);
  const badges = getAchievedBadges(userStats);

  return (
    <div>
      <div className="text-2xl font-bold">Level {level}</div>
      <div className="flex gap-2 mt-2">
        {badges.map(badge => (
          <Badge key={badge} name={badge} />
        ))}
      </div>
    </div>
  );
}
```

Achievements:
- 🎯 **First Copy**: Follow your first trader
- 💰 **$1K Club**: Earn $1,000 PnL
- 💎 **Diamond Hands**: $10K+ PnL
- 🎯 **Accuracy Master**: 70%+ win rate
- 🔥 **Streak Master**: 5+ consecutive wins
- 🏆 **Century Trader**: 100+ total trades
- 🦋 **Social Butterfly**: Follow 10+ traders

---

## Testing Checklist

### Backend
- [ ] Database schema created without errors
- [ ] All API endpoints return proper status codes
- [ ] Cron job runs successfully every minute
- [ ] Trade logs are generated with correct math
- [ ] Follower PnL updates with leverage applied
- [ ] Stop-loss/take-profit triggers correctly
- [ ] Notifications created on limit triggers
- [ ] Daily snapshots save correctly

### Frontend
- [ ] Social page loads traders from API
- [ ] Leaderboard shows top 3 with medals
- [ ] Portfolio summary updates in real-time
- [ ] Follow modal accepts allocation & risk settings
- [ ] My positions shows active copies
- [ ] Edit risk settings updates API
- [ ] Stop copying refunds to wallet
- [ ] Trader profile page displays correctly
- [ ] Trade feed auto-refreshes every 10s
- [ ] Notifications appear in top-right

### User Flow
- [ ] User views social page → sees traders
- [ ] Clicks "Copy" → modal opens
- [ ] Sets allocation ($1000) & risk (20% SL, 200% TP, 2x leverage)
- [ ] Confirms → funds reserved in wallet
- [ ] Position appears in "My Copies"
- [ ] Every minute: PnL updates with new trades
- [ ] If TP hit (e.g., +150%): Position auto-closes, notification sent
- [ ] User can manually "Stop" to withdraw remaining funds

---

## Performance Tips

1. **Database Indexes** - Already created on all critical columns
2. **Cron Optimization** - Batch updates using `MULTI ROW INSERT` or transactions
3. **Real Price Feed** - Replace simulated prices with yahoo-finance2 or CoinGecko API
4. **Chart Rendering** - Use Recharts with memoization to prevent re-renders
5. **Notifications** - Use WebSockets (Socket.io) instead of polling for live updates

---

## Security Considerations

1. **Admin-Only** - Verify `user.role === 'admin'` before create/update traders
2. **Auth Required** - Check Bearer token on all user-specific endpoints
3. **Rate Limiting** - Limit copy-trade creation to prevent spam (e.g., 1 per minute)
4. **Validation** - Validate allocation, SL%, TP%, leverage on server-side
5. **Audit Log** - Log all follow/unfollow actions for compliance

---

## Future Enhancements

1. **Real Trade Integration** - Connect to live broker APIs (Interactive Brokers, etc.)
2. **Social Features** - Comments, ratings, follower messaging
3. **Advanced Charts** - Candlestick charts, technical indicators, overlays
4. **Mobile App** - React Native version for iOS/Android
5. **Algo Trading** - Let users create their own trading strategies
6. **Affiliate Rewards** - Commission on new followers
7. **AI Recommendations** - ML model to suggest best traders to copy
8. **Risk Dashboard** - Correlation analysis, portfolio diversification scores

---

## Deployment Checklist

- [ ] Set environment variables (Supabase URL, Key, etc.)
- [ ] Run database migration in production
- [ ] Deploy API handlers to Vercel/hosting
- [ ] Enable cron job in vercel.json
- [ ] Build and deploy frontend
- [ ] Test copy trading end-to-end
- [ ] Monitor cron logs for errors
- [ ] Set up error tracking (Sentry, etc.)
- [ ] Performance testing (load test simulations)
- [ ] Security audit (penetration test)

---

## Support & Troubleshooting

### Cron not running?
- Check Vercel dashboard for cron logs
- Verify x-cron-secret header if using authentication
- Ensure endpoint returns 200 status

### Traders not trading?
- Verify current UTC time matches session_type
- Check is_active = true and session_end > NOW()
- Review trade_logs table for recent entries

### PnL not updating?
- Check user_follows.is_copying = true
- Verify leverage_multiplier > 0
- Ensure traders have trades generated

### Notifications not appearing?
- Check notifications table for recent records
- Verify user_id matches logged-in user
- Ensure is_read = false for unread notifications

---

## Questions?

This system is production-ready but requires:
1. Real price data integration
2. Your branding and customization
3. Compliance review (varies by jurisdiction)
4. User KYC/AML procedures
5. Terms of Service for copy trading risks

Enjoy! 🚀
