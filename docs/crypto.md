Crypto deposit address system

Environment variable

- ENCRYPTION_MASTER_KEY (required): a secret used to encrypt private keys and mnemonics using AES-256-GCM. The server derives a 32-byte AES key using SHA-256(master_value).

Notes on usage and rotation

- The master key must be set in the server environment where API handlers run. Keep it secret and restrict access.
- Rotation: to rotate the master key without invalidating existing data, follow this pattern:
  1. Provision a new master key (NEW_MASTER).
  2. On a trusted admin host (not client-side), set ENCRYPTION_MASTER_KEY to the OLD_MASTER and read/decrypt each stored encrypted blob.
  3. Replace ENCRYPTION_MASTER_KEY with NEW_MASTER and re-encrypt each plaintext with the new master, updating the database records.
  4. Verify decryption with NEW_MASTER and then remove OLD_MASTER from environment/config.

Security considerations

- Private keys and mnemonics are never returned to end users. Only an admin-only endpoint may decrypt and reveal them.
- Use a strong, high-entropy ENCRYPTION_MASTER_KEY stored in a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.).
- Limit access to the admin API and audit all access. Keep rotated backups before rotation as an extra safety step.
