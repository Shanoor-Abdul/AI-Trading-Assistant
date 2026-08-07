-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles & Settings Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  theme TEXT DEFAULT 'dark',
  market_provider TEXT DEFAULT 'ccxt_binance',
  execution_provider TEXT DEFAULT 'manual',
  ai_provider TEXT DEFAULT 'gemini',
  ai_model TEXT DEFAULT 'models/gemini-2.5-flash',
  default_timeframes TEXT[] DEFAULT '{"5m", "15m", "1h"}',
  capital NUMERIC DEFAULT 10000.00,
  risk_percent NUMERIC DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Analysis Session Table
CREATE TABLE IF NOT EXISTS public.analyses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  prompt_version TEXT NOT NULL,
  strategy_version TEXT NOT NULL,
  indicator_version TEXT NOT NULL,
  ai_model_version TEXT NOT NULL,
  provider_version TEXT NOT NULL,
  
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  screenshot_url TEXT,
  
  market_data JSONB, -- Stores exact OHLCV used for reproducibility
  indicators JSONB,
  market_regime TEXT,
  
  signal TEXT NOT NULL, -- STRONG_BUY, BUY, WAIT, UNSURE, NO_TRADE, SELL, STRONG_SELL
  confidence INTEGER,
  reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Trades Table (Linked to Analysis)
CREATE TABLE IF NOT EXISTS public.trades (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES public.analyses(id) ON DELETE CASCADE UNIQUE,
  
  entry_price NUMERIC,
  stop_loss NUMERIC,
  take_profit NUMERIC,
  risk_reward_ratio NUMERIC,
  position_size NUMERIC,
  
  execution_mode TEXT DEFAULT 'manual',
  status TEXT DEFAULT 'OPEN', -- OPEN, WON, LOST, CLOSED
  
  max_favorable_move NUMERIC DEFAULT 0,
  max_adverse_move NUMERIC DEFAULT 0,
  pnl NUMERIC,
  
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- 4. AI Self Review Table
CREATE TABLE IF NOT EXISTS public.ai_reviews (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  trade_id UUID REFERENCES public.trades(id) ON DELETE CASCADE UNIQUE,
  
  prediction_summary TEXT,
  actual_result TEXT,
  success_reason TEXT,
  failure_reason TEXT,
  improvement_suggestion TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_reviews ENABLE ROW LEVEL SECURITY;

-- Policies (Users can only see and edit their own data)
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view own analyses" ON public.analyses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own analyses" ON public.analyses FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own trades" ON public.trades FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trades" ON public.trades FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trades" ON public.trades FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own reviews" ON public.ai_reviews FOR SELECT USING (
  trade_id IN (SELECT id FROM public.trades WHERE user_id = auth.uid())
);
CREATE POLICY "Users can insert own reviews" ON public.ai_reviews FOR INSERT WITH CHECK (
  trade_id IN (SELECT id FROM public.trades WHERE user_id = auth.uid())
);

-- Function to handle new user signups and create a profile automatically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
