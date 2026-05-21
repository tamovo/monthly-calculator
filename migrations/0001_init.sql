CREATE TABLE IF NOT EXISTS settings (
  id                INTEGER PRIMARY KEY,
  currency          TEXT    NOT NULL DEFAULT '£',
  mortgage          REAL    NOT NULL DEFAULT 0,
  recurring_costs   TEXT    NOT NULL DEFAULT '[]',
  account_templates TEXT    NOT NULL DEFAULT '[]'
);

INSERT OR IGNORE INTO settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS months (
  month_key  TEXT NOT NULL PRIMARY KEY,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
