-- Trader 4 led the production total-return ranking when this update was prepared.
UPDATE traders
SET name = 'Mark Hergott',
    asset_focus = '["BTC-USD","ETH-USD","SOL-USD","XAU-USD","EUR-USD","GBP-USD","SPX500","NVDA"]',
    specialty = 'Crypto, gold & multi-asset',
    bio = 'Fictional multi-asset strategy covering Bitcoin, Ethereum, Solana, gold, major FX, US indices and equities. Entries require fresh same-date market quotes.',
    session_type = 'crypto',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 4 AND name IN ('Anika Deshmukh', 'Mark Hergott');

UPDATE copy_simulation_state
SET config = json_set(
  config,
  '$.assets', json('["BTC-USD","ETH-USD","SOL-USD","XAU-USD","EUR-USD","GBP-USD","SPX500","NVDA"]'),
  '$.session', 'crypto',
  '$.assetClass', 'multi_asset'
)
WHERE trader_id = 4
  AND EXISTS (SELECT 1 FROM traders WHERE id = 4 AND name = 'Mark Hergott');
