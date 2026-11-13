-- Restore missing real instruments. Prices come from the live quote service;
-- do not seed made-up prices. Existing rows and all trading history are preserved.
INSERT INTO markets (symbol, name, asset_class)
SELECT 'AAPL', 'Apple Inc.', 'stock'
WHERE NOT EXISTS (SELECT 1 FROM markets WHERE upper(symbol) = 'AAPL');
INSERT INTO markets (symbol, name, asset_class)
SELECT 'MSFT', 'Microsoft Corporation', 'stock'
WHERE NOT EXISTS (SELECT 1 FROM markets WHERE upper(symbol) = 'MSFT');
INSERT INTO markets (symbol, name, asset_class)
SELECT 'NVDA', 'NVIDIA Corporation', 'stock'
WHERE NOT EXISTS (SELECT 1 FROM markets WHERE upper(symbol) = 'NVDA');
INSERT INTO markets (symbol, name, asset_class)
SELECT 'AMZN', 'Amazon.com, Inc.', 'stock'
WHERE NOT EXISTS (SELECT 1 FROM markets WHERE upper(symbol) = 'AMZN');
INSERT INTO markets (symbol, name, asset_class)
SELECT 'TSLA', 'Tesla, Inc.', 'stock'
WHERE NOT EXISTS (SELECT 1 FROM markets WHERE upper(symbol) = 'TSLA');
