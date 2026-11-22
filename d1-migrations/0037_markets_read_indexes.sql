-- Exact-symbol lookups use upper(symbol); index that expression so the
-- verified-market filter does not scan the full public market catalogue.
CREATE INDEX IF NOT EXISTS idx_markets_upper_symbol
  ON markets(upper(symbol));

-- Featured results are ordered by these fields. This lets SQLite stop after
-- finding the requested page instead of sorting every verified market row.
CREATE INDEX IF NOT EXISTS idx_markets_featured_volume_symbol
  ON markets(volume DESC, symbol ASC);
