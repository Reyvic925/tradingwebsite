# Investment ROI Cron with cron-job.org

The investment ROI processor is exposed at:

```text
POST https://YOUR_DOMAIN/api/cron/roi
```

It is protected by `CRON_SECRET`. The endpoint advances active investments, records gain/loss transactions in `investment_transactions`, stores profit/loss in `earned`, marks matured investments as `completed`, and moves their computed value (`amount + earned`) into the user's profile `locked_balance`. ROI is released only through the existing admin approval flow.

## cron-job.org setup

Create a new cron job with these settings:

- **URL:** `https://YOUR_DOMAIN/api/cron/roi?cron_secret=YOUR_CRON_SECRET`
- **Method:** `POST`
- **Schedule:** every 5 minutes (`*/5 * * * *`)
- **Timeout:** 30 seconds or more
- **Request body:** empty
- **Enabled:** yes

The query parameter is supported because cron-job.org can call a URL directly without custom headers. Keep the URL private because it contains the cron secret.

## Environment variable

Set this on the deployment that serves the website:

```text
CRON_SECRET=<long-random-secret>
```

The value in cron-job.org must match the deployment value exactly.

## Verify manually

```bash
curl -X POST "https://YOUR_DOMAIN/api/cron/roi?cron_secret=YOUR_CRON_SECRET"
```

A successful response looks like:

```json
{
  "ok": true,
  "updated": 3,
  "timestamp": "2026-08-21T12:00:00.000Z"
}
```

An invalid or missing secret returns HTTP `401`. The endpoint returns HTTP `200` with `updated: 0` when there are no active investments.

## Important

The existing `/api/cron` route is the market and legacy-plan tick. It is not the current ROI simulator route. Schedule `/api/cron/roi` for investments. `/api/cron/tick` is also a separate market-price tick endpoint and should not be used as the investment scheduler.

If your cron-job.org job currently points to `https://www.theprimemarkets.com/api/cron`, change it to:

```text
https://www.theprimemarkets.com/api/cron/roi?cron_secret=YOUR_CRON_SECRET
```

## Copy-trading scheduler

Create a second cron-job.org job for the social/copy-trading simulator:

- **URL:** `https://YOUR_DOMAIN/api/cron/copy-trading?cron_secret=YOUR_CRON_SECRET`
- **Method:** `POST`
- **Schedule:** every minute (`* * * * *`)
- **Request body:** empty

This advances active traders, writes trade logs and history, updates active follower PnL, and applies stop-loss/take-profit triggers. Copying is continuous: traders remain available until an administrator disables them or a user's risk limit stops that user's copy. It uses the same `CRON_SECRET` environment variable.

A successful response includes counters such as `activeTraders`, `simulatedTraders`, `updatedFollowers`, `closedForRisk`, and `followerErrors` so cron-job.org execution history is useful for monitoring.
