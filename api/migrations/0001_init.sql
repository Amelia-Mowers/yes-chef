-- Accounts are created on first activation. A Play subscription (and every
-- purchase token linked to it by upgrades or resubscribing) maps to one account.
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE subscriptions (
  purchase_token TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  platform TEXT NOT NULL,            -- 'play' (or 'test' in dev)
  product_id TEXT,
  state TEXT NOT NULL,               -- active | grace | on_hold | paused | canceled | expired | pending
  expires_at INTEGER,                -- ms since epoch
  acknowledged INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX subscriptions_account ON subscriptions(account_id);

-- One head device per account: this is what "one subscription per head" means.
CREATE TABLE heads (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id),
  device_id TEXT NOT NULL,
  device_name TEXT,
  bound_at INTEGER NOT NULL
);

CREATE TABLE backups (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL,
  reason TEXT,
  device_name TEXT,
  size INTEGER NOT NULL,
  r2_key TEXT NOT NULL
);
CREATE INDEX backups_account ON backups(account_id, created_at DESC);
