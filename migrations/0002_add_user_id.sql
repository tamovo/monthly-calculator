-- Replace single-user tables with per-user schema
DROP TABLE IF EXISTS months;
DROP TABLE IF EXISTS settings;

CREATE TABLE settings (
  user_id           TEXT NOT NULL PRIMARY KEY,
  currency          TEXT NOT NULL DEFAULT '£',
  mortgage          REAL NOT NULL DEFAULT 0,
  recurring_costs   TEXT NOT NULL DEFAULT '[]',
  account_templates TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE months (
  user_id    TEXT NOT NULL,
  month_key  TEXT NOT NULL,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, month_key)
);
