import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function productionD1() {
  const config = readFileSync('wrangler.toml', 'utf8');
  const databaseId = config.match(/database_name\s*=\s*"apex-prime-db"\s+database_id\s*=\s*"([^"]+)"/)?.[1];
  if (!databaseId) throw new Error('Production D1 database is not configured.');
  let token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    const credentials = readFileSync(join(process.env.APPDATA, 'xdg.config', '.wrangler', 'config', 'default.toml'), 'utf8');
    token = credentials.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  }
  if (!token) throw new Error('Run wrangler login to authenticate to the configured D1 account.');
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '8bb4206868105e2dd82c18af7816be8d';
  return async function query(sql, params = []) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(30000),
    });
    const data = await response.json();
    if (!response.ok || !data.success || data.result.some(result => result.success === false)) {
      throw new Error(`D1 query failed (${response.status}): ${JSON.stringify(data.errors || []).slice(0, 500)}`);
    }
    return data.result;
  };
}
