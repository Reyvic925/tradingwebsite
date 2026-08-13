Admin crypto keys decryption policy

Required environment variables

- ENCRYPTION_MASTER_KEY (required): The master secret used to derive the AES-256-GCM key for encrypting and decrypting private keys and mnemonics. Set this only on backend servers that are trusted and have strict access controls (use a secrets manager).
- ADMIN_SECRET (optional): a string that can be used by trusted admin hosts to authenticate admin API calls via the x-admin-secret header. If present, requests providing this exact header value are treated as admin requests.

Server-side restriction policy for decryption

- Decryption of encrypted_private_key and encrypted_mnemonic is performed exclusively on the server-side.
- Only authenticated admins may request decryption. Admin auth rules in order are:
  1. If the authenticated user's user_metadata.is_admin or user_metadata.admin is truthy, allow.
  2. If the user's profile row has role === 'admin', allow.
  3. If the request supplies x-admin-secret (or admin_secret query param) matching the server's ADMIN_SECRET env var, allow.
  4. Otherwise deny (403 Forbidden).

- The API endpoint for decryption is:
  GET /api/admin/crypto-addresses/:id/decrypt
  - Returns: { id, privateKey, mnemonic }
  - Only the decrypted fields are returned; the listing endpoint does not expose any plaintext or encrypted blobs.
  - All decryption actions are logged to admin_audit_log via admin-helpers.logAdminAction with action 'crypto.decrypt'.

Operational security recommendations

- Run the decryption operation only from trusted admin hosts (jumpboxes, secure admin panels) — do not expose the ADMIN_SECRET or ENCRYPTION_MASTER_KEY to client-side code or untrusted hosts.
- Keep ENCRYPTION_MASTER_KEY in a secrets manager (Vault, AWS Secrets Manager, Parameter Store) and limit access to as few service identities as possible.
- Require multi-person or audited access controls for anyone who can read decrypted keys.
- Rotate ENCRYPTION_MASTER_KEY using the documented rotate procedure in docs/crypto.md: decrypt with old key in a trusted environment, re-encrypt with new key, update DB, verify, then retire old key.
- Keep an active audit process and monitor admin_audit_log for suspicious activity.
