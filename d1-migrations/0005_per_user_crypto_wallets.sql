CREATE TABLE IF NOT EXISTS user_mnemonics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE REFERENCES auth_users(id) ON DELETE CASCADE,
  encrypted_mnemonic TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crypto_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  network TEXT NOT NULL,
  address TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  encrypted_mnemonic TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  UNIQUE(user_id, currency, address)
);

CREATE INDEX IF NOT EXISTS idx_crypto_addresses_user_created
  ON crypto_addresses(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_crypto_addresses_network
  ON crypto_addresses(network);