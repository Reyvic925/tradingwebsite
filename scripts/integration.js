/* Integration runner script

Usage (local):
  Set env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_SECRET, CRON_SECRET, ENCRYPTION_MASTER_KEY
  Then run: node scripts/integration.js

This script will:
 - Optionally run the SQL migration if DATABASE_URL is provided (uses psql)
 - Call the admin seed handler (programmatically) to seed markets
 - Call the cron tick handler (programmatically) to run a tick and write price_history

Note: This executes server-side handlers directly (no HTTP). Ensure env vars are set and point to a staging DB.
*/
import { spawnSync } from 'child_process';
import fs from 'fs';

const REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_SECRET', 'CRON_SECRET', 'ENCRYPTION_MASTER_KEY'];
for (const k of REQUIRED) {
  if (!process.env[k]) {
    console.warn(`Warning: env ${k} is not set. Integration may fail.`);
  }
}

async function runMigrationIfRequested() {
  const sqlPath = './20260813-add-admin-tables.sql';
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL not provided — skipping psql migration step. If you want the script to run migrations, set DATABASE_URL env var.');
    return;
  }
  if (!fs.existsSync(sqlPath)) {
    console.warn('Migration file not found at', sqlPath);
    return;
  }
  console.log('Running migration via psql...');
  const res = spawnSync('psql', [process.env.DATABASE_URL, '-f', sqlPath], { stdio: 'inherit', shell: true });
  if (res.status !== 0) throw new Error('psql migration failed with code ' + res.status);
  console.log('Migration completed');
}

function makeMockRes() {
  let statusCode = 200;
  return {
    status(code) { statusCode = code; return this; },
    json(obj) { console.log('[mockRes] status', statusCode, 'body:', JSON.stringify(obj)); return obj; },
    end(txt) { console.log('[mockRes] end', txt); return txt; },
    setHeader() {},
  };
}

async function callAdminSeed() {
  console.log('Calling admin seed (ensureUniverse) via api-handlers/admin.js');
  const adminModule = await import('../api-handlers/admin.js');
  const handler = adminModule.default || adminModule.handler || adminModule;
  const req = { method: 'POST', headers: { 'x-admin-secret': process.env.ADMIN_SECRET } };
  const res = makeMockRes();
  await handler(req, res);
}

async function callCronTick() {
  console.log('Calling cron tick via api-handlers/cron.js');
  const cronModule = await import('../api-handlers/cron.js');
  const handler = cronModule.default || cronModule.handler || cronModule;
  const req = { method: 'POST', headers: { 'x-cron-secret': process.env.CRON_SECRET } };
  const res = makeMockRes();
  await handler(req, res);
}

(async () => {
  try {
    await runMigrationIfRequested();
    await callAdminSeed();
    await callCronTick();
    console.log('Integration runner completed. Review the outputs above for success.');
  } catch (err) {
    console.error('Integration runner failed:', err.message || err);
    process.exit(1);
  }
})();
