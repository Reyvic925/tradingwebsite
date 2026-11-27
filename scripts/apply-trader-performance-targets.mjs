import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Applies an opt-in win-rate policy to a selected list of modelled trader
// profiles in Cloudflare D1. It only updates copy_simulation_state.config:
// state, trade logs, equity history, and execution quotes are untouched.
//
// Examples:
//   node scripts/apply-trader-performance-targets.mjs --ids 14,19,11 --win-rate 0.9 --dry-run
//   node scripts/apply-trader-performance-targets.mjs --names "Mark Hergott,Emiliano Arriaga" --win-rate 0.9
//   npm run traders:set-performance-targets -- --top 9 --dry-run

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key.slice(2)] = true;
    } else {
      args[key.slice(2)] = next;
      index += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const dryRun = args['dry-run'] === true;
const database = String(args.db || 'apex-prime-db');
const environment = args.env ? ['--env', String(args.env)] : [];
const winRate = Math.min(0.95, Math.max(0.5, Number(args['win-rate'] ?? 0.9)));
if (!Number.isFinite(winRate)) throw new Error('Invalid --win-rate');

const names = String(args.names || '')
  .split(',').map((name) => name.trim()).filter(Boolean);
const ids = String(args.ids || '')
  .split(',').map((id) => Number(id.trim())).filter((id) => Number.isInteger(id) && id > 0);
const top = Math.max(1, Math.trunc(Number(args.top) || 0));

function query(sql) {
  const command = `npx wrangler d1 execute ${database} --remote --json --command "${sql.replaceAll('"', '\\"')}" ${environment.join(' ')}`;
  return JSON.parse(execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))[0]?.results || [];
}

async function main() {
  const traders = query('SELECT id, name, round(total_return, 2) AS total_return FROM traders WHERE is_active = 1 ORDER BY total_return DESC');
  let selected = traders.filter((trader) => ids.includes(trader.id) || names.some((name) => name.toLowerCase() === trader.name.toLowerCase()));
  if (top) selected = traders.slice(0, top);
  if (!selected.length) throw new Error('No active traders matched. Pass --ids, --names, or --top.');

  const selectedIds = selected.map((trader) => trader.id);
  const existing = query(`SELECT trader_id FROM copy_simulation_state WHERE trader_id IN (${selectedIds.join(',')})`);
  const configured = new Set(existing.map((row) => row.trader_id));
  const missing = selected.filter((trader) => !configured.has(trader.id));

  const sql = `-- Opt-in modelled win-rate policy for selected traders.\n`
    + `UPDATE copy_simulation_state\nSET config = json_set(config,\n`
    + `  '$.enforceTargetWinRate', json('true'),\n`
    + `  '$.targetWinRate', ${winRate},\n`
    + `  '$.directionBias', ${Math.min(0.99, winRate + 0.09)},\n`
    + `  '$.takeProfitVolatilityRatio', 0.3,\n`
    + `  '$.stopLossVolatilityRatio', 2.7,\n`
    + `  '$.maxHoldingTicks', 96\n)\nWHERE trader_id IN (${selectedIds.join(', ')});\n`;

  if (dryRun) {
    console.log(sql);
  } else {
    const directory = mkdtempSync(join(tmpdir(), 'apex-traders-'));
    const file = join(directory, 'targets.sql');
    try {
      writeFileSync(file, sql);
      execSync(`npx wrangler d1 execute ${database} --remote --file "${file}" ${environment.join(' ')}`, { stdio: 'inherit' });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  console.log(`${selected.length} trader profile(s) ${dryRun ? 'matched' : 'updated'}: ${selected.map((trader) => `${trader.name} (#${trader.id}, ${trader.total_return}%)`).join(', ')}`);
  if (missing.length) console.warn(`No simulation state row for: ${missing.map((trader) => trader.name).join(', ')} (run the copy-trading cron first).`);
  if (!dryRun) console.log('Metrics refresh on the next copy-trading tick.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
