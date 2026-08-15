-- Fix duplicate symbols in markets table
-- This migration deduplicates by symbol, keeping the row with highest volume
-- Then adds a UNIQUE constraint to prevent future duplicates

-- Step 1: Create temporary table with one entry per symbol (highest volume)
CREATE TEMP TABLE markets_deduped AS
SELECT DISTINCT ON (symbol) id, symbol, name, asset_class, price, change_24h, volume, high_24h, low_24h
FROM markets
ORDER BY symbol, volume DESC, id DESC;

-- Step 2: Delete all from original table
DELETE FROM markets;

-- Step 3: Re-insert deduplicated data
INSERT INTO markets (id, symbol, name, asset_class, price, change_24h, volume, high_24h, low_24h)
SELECT id, symbol, name, asset_class, price, change_24h, volume, high_24h, low_24h
FROM markets_deduped;

-- Step 4: Add UNIQUE constraint on symbol column
ALTER TABLE markets
ADD CONSTRAINT markets_symbol_unique UNIQUE (symbol);

-- Step 5: Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_markets_symbol ON markets (symbol);
