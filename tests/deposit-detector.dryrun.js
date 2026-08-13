/*
Simple dry-run invoker to test checkAddresses locally without performing DB writes.
Run: node tests/deposit-detector.dryrun.js
Make sure DRY_RUN=true in env or it will attempt to write to SUPABASE if SUPABASE_* envs are set.
*/

const { checkAddresses } = require('../api-handlers/deposit-detector');

async function main() {
  // Example fake addresses list
  const addresses = [
    { id: 1, address: '0x0000000000000000000000000000000000000000', user_id: 42, created_at: new Date().toISOString(), currency: 'ETH' }
  ];
  try {
    const results = await checkAddresses(addresses, { dryRun: true });
    console.log('Dry-run results:', JSON.stringify(results, null, 2));
  } catch (err) {
    console.error('Dry-run failed', err);
    process.exit(1);
  }
}

main();
