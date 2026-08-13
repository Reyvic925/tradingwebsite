# Download and push this project

The live site serves a full source archive (no `node_modules`, no `.env`):

**[Download apex-prime-broker.zip](/downloads/apex-prime-broker.zip)**

## After you download

```bash
unzip apex-prime-broker.zip -d tradingwebsite
cd tradingwebsite
npm install
cp .env.example .env
```

Fill `.env` with your Supabase keys. Apply `schema.sql` in the Supabase SQL editor.

```bash
npm run dev
```

## Push to GitHub

Create an empty repo (or use `Reyvic925/tradingwebsite`), then:

```bash
git init
git add .
git commit -m "Initial commit: Apex Prime Broker"
git branch -M main
git remote add origin https://github.com/Reyvic925/tradingwebsite.git
git push -u origin main
```

If Git asks for a password, use a [personal access token](https://github.com/settings/tokens) with the `repo` scope — not your GitHub password.

```bash
git push https://<YOUR_USERNAME>:<YOUR_PAT>@github.com/Reyvic925/tradingwebsite.git main
```

Do not commit `.env`. It is already listed in `.gitignore`.
