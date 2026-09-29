import assert from 'node:assert/strict';
import { decryptWalletSecret, ensureUserCryptoWallets } from '../../worker/crypto-wallets.js';

class FakeD1 {
  constructor() {
    this.mnemonics = new Map();
    this.addresses = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql.replace(/\s+/g, ' ').trim());
  }
}

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    if (this.sql.startsWith('SELECT encrypted_mnemonic FROM user_mnemonics')) {
      const encryptedMnemonic = this.db.mnemonics.get(this.values[0]);
      return encryptedMnemonic ? { encrypted_mnemonic: encryptedMnemonic } : null;
    }
    throw new Error(`Unhandled first(): ${this.sql}`);
  }

  async all() {
    if (this.sql.startsWith('SELECT id, currency, network, address, metadata_json FROM crypto_addresses')) {
      return { results: this.db.addresses.filter((row) => row.user_id === this.values[0]).map(({ id, currency, network, address, metadata_json }) => ({ id, currency, network, address, metadata_json })) };
    }
    throw new Error(`Unhandled all(): ${this.sql}`);
  }

  async run() {
    if (this.sql.startsWith('INSERT OR IGNORE INTO user_mnemonics')) {
      const [userId, encryptedMnemonic] = this.values;
      if (!this.db.mnemonics.has(userId)) this.db.mnemonics.set(userId, encryptedMnemonic);
      return { success: true };
    }
    if (this.sql.startsWith('INSERT OR IGNORE INTO crypto_addresses')) {
      const [userId, currency, network, address, encryptedPrivateKey, encryptedMnemonic, metadataJson] = this.values;
      if (!this.db.addresses.some((row) => row.user_id === userId && row.currency === currency && row.address === address)) {
        this.db.addresses.push({
          id: this.db.addresses.length + 1,
          user_id: userId,
          currency,
          network,
          address,
          encrypted_private_key: encryptedPrivateKey,
          encrypted_mnemonic: encryptedMnemonic,
          metadata_json: metadataJson,
        });
      }
      return { success: true };
    }
    throw new Error(`Unhandled run(): ${this.sql}`);
  }
}

const db = new FakeD1();
const env = { ENCRYPTION_MASTER_KEY: 'test-only-master-key-at-least-32-characters' };
const firstRun = await ensureUserCryptoWallets(db, 'user-1', env);
const secondRun = await ensureUserCryptoWallets(db, 'user-1', env);
assert.equal(firstRun.length, 8);
assert.equal(secondRun.length, 8);
assert.equal(db.addresses.length, 8);
assert.equal(db.mnemonics.size, 1);
assert.ok(firstRun.every((row) => !('encrypted_private_key' in row) && !('encrypted_mnemonic' in row)));
assert.equal(
  await decryptWalletSecret(db.addresses[0].encrypted_mnemonic, env),
  await decryptWalletSecret(db.mnemonics.get('user-1'), env),
);

await assert.rejects(
  () => ensureUserCryptoWallets(new FakeD1(), 'user-2', {}),
  /ENCRYPTION_MASTER_KEY/,
);

console.log('D1_WALLET_PROVISIONING_TESTS_PASSED');