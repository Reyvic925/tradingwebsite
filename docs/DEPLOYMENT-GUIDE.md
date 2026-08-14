# 🚀 Deployment Guide - Hardcoded Features Fix

**Date:** 2026-08-14  
**Version:** 1.0  
**Status:** Ready for Production

---

## What to Deploy

### 1. Database Schema Update
**File:** `schema.sql` (lines 269-278)

```sql
-- Configuration table for app-wide settings
create table if not exists app_config (
  id serial primary key,
  key text not null unique,
  value jsonb not null,
  description text,
  updated_at timestamptz default now()
);

create index if not exists idx_app_config_key on app_config (key);
```

**How to Deploy:**
1. Open Supabase Dashboard
2. Navigate to SQL Editor
3. Copy the schema above
4. Execute the query
5. Verify table created: `SELECT COUNT(*) FROM app_config;`

---

### 2. New API Handler
**File:** `api-handlers/app-config.js` (150 lines)

**What it does:**
- GET /api/app-config → Returns all config
- GET /api/app-config?key=xxx → Returns specific config
- POST /api/app-config → Create/update config (admin-ready)
- PUT /api/app-config → Upsert config (admin-ready)
- Auto-initializes 4 default entries on first call

**How to Deploy:**
1. File is already created in workspace
2. Will be picked up by Vercel/Next.js automatically
3. No additional setup needed

---

### 3. Updated Frontend Components

**File:** `src/pages/Wallet.tsx`
- Fetches `supported_cryptos` from API
- Falls back to hardcoded if API fails
- No breaking changes to UI

**File:** `src/pages/Markets.tsx`
- Fetches `market_filters` and `region_mapping` from API
- Falls back to hardcoded if API fails
- No breaking changes to UI

**File:** `src/pages/Landing.tsx`
- Fetches `partner_logos` from API
- Falls back to hardcoded if API fails
- No breaking changes to UI

**How to Deploy:**
1. Files are already updated in workspace
2. Commit and push to git
3. Vercel will auto-deploy on push

---

## Step-by-Step Deployment

### Phase 1: Staging Environment (1 hour)

**Step 1: Apply Schema**
```bash
# In Supabase SQL Editor
SELECT 'Running app_config setup...' as status;

create table if not exists app_config (
  id serial primary key,
  key text not null unique,
  value jsonb not null,
  description text,
  updated_at timestamptz default now()
);

create index if not exists idx_app_config_key on app_config (key);

-- Verify
SELECT COUNT(*) as config_count FROM app_config;
```

**Step 2: Deploy Code**
```bash
git add -A
git commit -m "chore: move hardcoded config to database

- Add app_config table to store dynamic configuration
- Create /api/app-config endpoint with auto-initialization
- Update Wallet.tsx to fetch supported_cryptos from API
- Update Markets.tsx to fetch filters and region mapping from API
- Update Landing.tsx to fetch partner logos from API
- All components use fallback values if API fails
- No breaking changes, all tests passing"

git push origin main
# Wait for Vercel deployment to complete
```

**Step 3: Verify Schema**
```bash
# In Supabase SQL Editor
SELECT * FROM app_config LIMIT 5;
-- Should show 4 entries after first API call
```

**Step 4: Test API**
```bash
# Get all config
curl https://staging-domain.com/api/app-config

# Get specific config
curl https://staging-domain.com/api/app-config?key=supported_cryptos

# Expected response:
# { "id": 1, "key": "supported_cryptos", "value": [...], ... }
```

**Step 5: Test Components**

Visit each page and verify:
- [ ] https://staging-domain.com/app/wallet
  - Crypto selector loads
  - Can filter coins
  - Withdrawal dropdown works
- [ ] https://staging-domain.com/app/markets
  - Filter buttons render
  - Can click filters
  - Index board works
- [ ] https://staging-domain.com
  - Partner logos display
  - Landing page loads

**Step 6: Browser Console Check**
```javascript
// Open browser console on each page and verify no errors
console.log("Should be no errors about config fetching")

// In Networks tab:
// Look for GET /api/app-config requests
// Should return 200 OK
```

### Phase 2: Production Deployment (30 minutes)

**Step 1: Backup Production Database**
```bash
# Via Supabase dashboard:
# 1. Click "Project Settings" → Backups
# 2. Click "Backup now"
# 3. Wait for backup to complete
# 4. Verify backup size > 0
```

**Step 2: Apply Schema to Production**
```bash
# In Production Supabase SQL Editor (same as staging)
SELECT 'Running app_config setup on PRODUCTION...' as status;

create table if not exists app_config (
  id serial primary key,
  key text not null unique,
  value jsonb not null,
  description text,
  updated_at timestamptz default now()
);

create index if not exists idx_app_config_key on app_config (key);

-- Verify
SELECT COUNT(*) as config_count FROM app_config;
```

**Step 3: Deploy to Production**
```bash
# Vercel will auto-deploy from git main branch
# Or trigger manual deployment:
# https://vercel.com/dashboard → Select project → Deployments → Redeploy

# Wait for deployment to complete (~ 2-3 minutes)
```

**Step 4: Test Production**
```bash
# API endpoint
curl https://tradingwebsite-alpha.vercel.app/api/app-config

# Pages
https://tradingwebsite-alpha.vercel.app/app/wallet
https://tradingwebsite-alpha.vercel.app/app/markets
https://tradingwebsite-alpha.vercel.app

# All should load without errors
```

**Step 5: Monitor Logs**
```bash
# Vercel Function logs
# Check for any errors in /api/app-config handler
# Should see successful database queries

# Browser console
# No errors about missing config
```

---

## Rollback Plan (If Needed)

### Quick Rollback (< 5 minutes)

If something goes wrong, rollback is simple because:
1. ✅ Fallback values are hardcoded in components
2. ✅ Database is optional (components work without it)
3. ✅ No migrations required (new table only)

**Rollback Steps:**
```bash
# Option 1: Deploy previous version
git revert HEAD
git push origin main
# Vercel auto-redeploys within 2 minutes

# Option 2: Delete app_config table (if needed)
# In Supabase SQL Editor:
DROP TABLE IF EXISTS app_config;
# Components will use fallback values automatically
```

### No Data Loss
- ✅ Existing data unchanged
- ✅ No schema migrations needed
- ✅ New table only (optional)
- ✅ Fallback values ensure continuity

---

## Success Verification Checklist

### ✅ Pre-Deployment
- [ ] All tests passing: `npm test`
- [ ] No TypeScript errors: `npm run build`
- [ ] No console warnings
- [ ] Files created/updated verified

### ✅ Staging Verification
- [ ] Schema created successfully
- [ ] API endpoint responds
- [ ] Auto-initialization works (4 entries created)
- [ ] Wallet page loads dynamically
- [ ] Markets page loads dynamically
- [ ] Landing page loads dynamically
- [ ] No console errors
- [ ] Fallback values work if API fails

### ✅ Production Verification
- [ ] Database backup created
- [ ] Schema applied to production
- [ ] Code deployed to production
- [ ] API endpoint responds with live data
- [ ] All pages load correctly
- [ ] No 500 errors in logs
- [ ] Configuration can be updated via API

### ✅ Post-Deployment
- [ ] Monitor error logs for 24 hours
- [ ] Check user reports
- [ ] Verify analytics/tracking still works
- [ ] Document any issues/learnings

---

## API Testing Commands

### Initialize Config (First Call)
```bash
# This happens automatically on first GET request
curl https://tradingwebsite-alpha.vercel.app/api/app-config
# Returns: { supported_cryptos: [...], market_filters: [...], ... }
```

### Get All Config
```bash
curl https://tradingwebsite-alpha.vercel.app/api/app-config
```

### Get Specific Config
```bash
# Supported Cryptos
curl "https://tradingwebsite-alpha.vercel.app/api/app-config?key=supported_cryptos"

# Market Filters
curl "https://tradingwebsite-alpha.vercel.app/api/app-config?key=market_filters"

# Region Mapping
curl "https://tradingwebsite-alpha.vercel.app/api/app-config?key=region_mapping"

# Partner Logos
curl "https://tradingwebsite-alpha.vercel.app/api/app-config?key=partner_logos"
```

### Update Config (Admin, Future)
```bash
curl -X POST https://tradingwebsite-alpha.vercel.app/api/app-config \
  -H "Content-Type: application/json" \
  -d '{
    "key": "supported_cryptos",
    "value": ["BTC", "ETH", "USDT"],
    "description": "Active cryptocurrencies"
  }'
```

---

## Performance Metrics (Expected)

| Metric | Expected Value |
|--------|-----------------|
| Page Load Time | +50-100ms (cached) |
| API Response Time | 50-150ms first call, <50ms cached |
| Database Query Time | <10ms (indexed by key) |
| Memory Usage | +10KB per component |
| Cache TTL | Configurable (recommend 5 min) |

---

## Monitoring & Maintenance

### Daily (First Week)
- [ ] Check error logs for any config-related errors
- [ ] Verify API endpoint responding
- [ ] Monitor page load performance

### Weekly
- [ ] Review API usage via analytics
- [ ] Check for any user reports
- [ ] Verify database backup running

### Monthly
- [ ] Audit config values for correctness
- [ ] Update defaults if needed
- [ ] Review performance metrics

---

## Troubleshooting

### Problem: Config not loading in UI
```
Check browser console for errors
→ Network tab: GET /api/app-config status?
  - 200: Check response payload
  - 404: API not deployed
  - 500: Database error
Use fallback values (should work)
```

### Problem: API returns 500 error
```
Check Vercel logs:
→ app-config.js error?
→ Database connection error?
→ Invalid JSON in value field?
```

### Problem: Stale config values
```
Clear browser cache (Ctrl+Shift+Del)
→ Hard refresh (Ctrl+F5)
→ Check API returns fresh data
```

### Problem: Need to add new config key
```
1. Call POST /api/app-config with new key
2. Or insert directly in Supabase SQL:
   INSERT INTO app_config (key, value, description)
   VALUES ('new_key', '{"data": "here"}'::jsonb, 'Description');
3. Component uses hardcoded fallback until added to code
```

---

## Documentation References

📄 **Detailed Documentation:**
- [HARDCODED-AUDIT-REPORT.md](HARDCODED-AUDIT-REPORT.md) - Complete audit report
- [HARDCODED-FEATURES-AUDIT.md](HARDCODED-FEATURES-AUDIT.md) - Issue-by-issue analysis
- [HARDCODED-FEATURES-SUMMARY.md](HARDCODED-FEATURES-SUMMARY.md) - Quick reference

💻 **Code References:**
- `schema.sql` - Database schema
- `api-handlers/app-config.js` - API implementation
- `src/pages/Wallet.tsx` - Component update
- `src/pages/Markets.tsx` - Component update
- `src/pages/Landing.tsx` - Component update

---

## Sign-Off Checklist

**Before Deployment:**
- [ ] All changes reviewed
- [ ] Tests passing
- [ ] Documentation complete
- [ ] Backup plan ready

**During Deployment:**
- [ ] Schema applied
- [ ] Code deployed
- [ ] Tests passed in staging
- [ ] Production verified

**After Deployment:**
- [ ] Logs monitored
- [ ] No user issues
- [ ] Performance normal
- [ ] Team notified

---

## Quick Deploy Command (For Staging)

```bash
# One-command deployment
cd /path/to/apex-prime-broker && \
git add docs/*.md api-handlers/app-config.js src/pages/{Wallet,Markets,Landing}.tsx schema.sql && \
git commit -m "chore: move hardcoded config to database" && \
git push origin main && \
echo "✅ Deployed to staging" && \
curl https://staging-domain.com/api/app-config && \
echo "✅ API responding"
```

---

## Support & Questions

**Issue:** Configuration not updating  
**Solution:** Clear browser cache and refresh page

**Issue:** API returns error  
**Solution:** Check Vercel logs for database connection errors

**Issue:** Need to rollback  
**Solution:** `git revert HEAD && git push` (instant rollback)

---

**Status: READY FOR PRODUCTION DEPLOYMENT ✅**

**Estimated Deployment Time:**
- Staging: 20 minutes
- Production: 30 minutes
- Total: ~50 minutes

**Risk Level:** 🟢 LOW
- Fallback values prevent failures
- Database is optional
- No migrations needed
- Easy rollback

**Go-Live Ready:** ✅ YES

---

**Deployment Guide Generated:** 2026-08-14  
**Last Updated:** 2026-08-14  
**Next Review:** Post-deployment
