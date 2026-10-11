// Append-only. Never edit a migration that has shipped; add a new one.
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    chat_id INTEGER NOT NULL,
    username TEXT,
    plan TEXT NOT NULL DEFAULT 'free',
    blocked INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE watches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    query_json TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    interval_sec INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    seeded INTEGER NOT NULL DEFAULT 0,
    failures INTEGER NOT NULL DEFAULT 0,
    next_run_at INTEGER NOT NULL,
    last_run_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_watches_due ON watches(active, next_run_at);
  CREATE INDEX idx_watches_user ON watches(user_id);

  CREATE TABLE seen (
    watch_id INTEGER NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
    listing_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    price REAL,
    first_seen INTEGER NOT NULL,
    PRIMARY KEY (watch_id, listing_id)
  );

  -- AI verdicts depend on the listing and on what the watch looks for
  CREATE TABLE ai_cache (
    key TEXT PRIMARY KEY,
    verdict_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE ai_usage (
    user_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    calls INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  );

  -- "Not relevant" taps under notifications: few-shot negatives for the AI
  CREATE TABLE feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    watch_id INTEGER NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
    listing_id TEXT NOT NULL,
    title TEXT NOT NULL,
    price REAL,
    good INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (watch_id, listing_id)
  );

  -- Product analytics, cheap and local
  CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    type TEXT NOT NULL,
    data TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_events_type_time ON events(type, created_at);
  `,
  // v2: market analysis
  `
  ALTER TABLE watches ADD COLUMN market_json TEXT;

  CREATE TABLE scan_usage (
    user_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    scans INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  );
  `,
  // v3: interface language. lang_set = the user picked it in /lang, so Telegram's locale no longer overrides it
  `
  ALTER TABLE users ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';
  ALTER TABLE users ADD COLUMN lang_set INTEGER NOT NULL DEFAULT 0;
  `,
  // v4: referrals. pro_until = time-limited Pro (invite bonus); referred_by = who invited this user
  `
  ALTER TABLE users ADD COLUMN pro_until INTEGER;
  ALTER TABLE users ADD COLUMN referred_by INTEGER;
  `,
];
