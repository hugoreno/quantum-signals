-- SQLite schema for quantum-signals.
-- Mirrors the Postgres schema in quantum-brain (scripts/setup-news-db.ts).
-- Differences from Postgres:
--   * vector(768) → TEXT (JSON-encoded number array)
--   * TIMESTAMPTZ → TEXT (ISO 8601 string)
--   * SERIAL PRIMARY KEY → INTEGER PRIMARY KEY AUTOINCREMENT
--   * DEFAULT NOW() → DEFAULT CURRENT_TIMESTAMP
--   * DATE → TEXT

CREATE TABLE IF NOT EXISTS news_items (
  id                  TEXT PRIMARY KEY,
  source              TEXT NOT NULL,
  source_url          TEXT,
  title               TEXT NOT NULL,
  content             TEXT,
  summary             TEXT,
  authors             TEXT,
  published_at        TEXT NOT NULL,
  ingested_at         TEXT DEFAULT CURRENT_TIMESTAMP,
  category            TEXT,
  subcategory         TEXT,
  importance_score    REAL,
  importance_reason   TEXT,
  embedding           TEXT,
  dedup_cluster_id    TEXT,
  companies_mentioned TEXT,
  briefing_date       TEXT,
  briefing_included   INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_news_published  ON news_items (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_source     ON news_items (source);
CREATE INDEX IF NOT EXISTS idx_news_importance ON news_items (importance_score DESC);
CREATE INDEX IF NOT EXISTS idx_news_briefing   ON news_items (briefing_date, briefing_included);

CREATE TABLE IF NOT EXISTS briefings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  briefing_date   TEXT UNIQUE NOT NULL,
  content         TEXT NOT NULL,
  html_content    TEXT,
  news_item_ids   TEXT NOT NULL,
  generated_at    TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS news_sources (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  name                    TEXT NOT NULL UNIQUE,
  source_type             TEXT NOT NULL,
  config                  TEXT NOT NULL,
  enabled                 INTEGER DEFAULT 1,
  last_fetched_at         TEXT,
  fetch_interval_minutes  INTEGER DEFAULT 360
);
