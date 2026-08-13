# Contributing to Apex Prime

## Branch naming

- `feat/` new product work
- `fix/` bugs
- `chore/` tooling and docs

## Local loop

```bash
npm install
cp .env.example .env
npm run dev
npm run lint
npm run build
```

## API routes

- One resource per file in `api/`
- Import the shared client from `api/db-client.js`
- Use `getUsdWallet` / `getProfileRow` from `api/helpers.js` — never `.maybeSingle()` on wallets or profiles
- Always send CORS headers

## Frontend

- Fetch from `/api/*` on mount
- Re-fetch after every mutation
- Show loading and error states
- Keep pages under `src/pages/` and shared chrome under `src/components/`

Pull requests should include a short description and screenshots for UI changes.
