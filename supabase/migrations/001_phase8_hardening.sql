-- Phase 8 Hardening Migration

-- 1. Create Storage Bucket for Screenshots
-- Note: You may need to enable Storage in your Supabase Dashboard if not already enabled.
INSERT INTO storage.buckets (id, name, public) VALUES ('screenshots', 'screenshots', true) ON CONFLICT DO NOTHING;

-- Storage Policies
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING ( bucket_id = 'screenshots' );
CREATE POLICY "Auth Insert" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'screenshots' AND auth.role() = 'authenticated' );

-- 2. Update Profiles Table
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS minimum_risk_reward NUMERIC DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS max_daily_loss NUMERIC DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS max_open_positions INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS trading_mode TEXT DEFAULT 'MANUAL'; -- MANUAL, PAPER, LIVE

-- 3. Update Analyses Table
ALTER TABLE public.analyses 
  ADD COLUMN IF NOT EXISTS exchange TEXT,
  ADD COLUMN IF NOT EXISTS market_provider TEXT,
  ADD COLUMN IF NOT EXISTS data_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_age INTEGER, -- in seconds
  ADD COLUMN IF NOT EXISTS primary_timeframe TEXT,
  ADD COLUMN IF NOT EXISTS confirmation_timeframe TEXT,
  ADD COLUMN IF NOT EXISTS trend_timeframe TEXT,
  ADD COLUMN IF NOT EXISTS risk_decision TEXT;

-- 4. Update Trades Table
-- trades.status is TEXT, so we just add the new numeric/text columns
ALTER TABLE public.trades 
  ADD COLUMN IF NOT EXISTS slippage NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fees NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration INTEGER; -- in seconds

-- 5. Update AI Reviews Table
ALTER TABLE public.ai_reviews 
  ADD COLUMN IF NOT EXISTS prediction_quality TEXT,
  ADD COLUMN IF NOT EXISTS what_was_correct TEXT,
  ADD COLUMN IF NOT EXISTS what_was_wrong TEXT,
  ADD COLUMN IF NOT EXISTS missed_signals TEXT,
  ADD COLUMN IF NOT EXISTS improvement_suggestions TEXT,
  ADD COLUMN IF NOT EXISTS review_confidence INTEGER;
