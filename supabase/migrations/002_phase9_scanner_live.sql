-- Phase 9: Scanner & Live Execution Schema

CREATE TABLE IF NOT EXISTS scanner_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  strategy TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_scanned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, symbol, timeframe)
);

ALTER TABLE scanner_watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own watchlist"
ON scanner_watchlist
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS exchange_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange TEXT NOT NULL, -- 'binance' or 'coinbase'
  api_key TEXT NOT NULL,
  api_secret TEXT NOT NULL, -- (Note: should be encrypted in a production environment)
  api_passphrase TEXT, -- Required by some exchanges like Coinbase Pro / Kucoin
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, exchange)
);

ALTER TABLE exchange_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own exchange keys"
ON exchange_keys
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
