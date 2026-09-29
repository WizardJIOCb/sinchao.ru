CREATE TABLE IF NOT EXISTS catalog_imports (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
