-- Supabase Schema for BetGuard
-- Run this in your Supabase SQL Editor to set up the database

-- 1. Users table (profiles linked to auth.users)
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  weekly_budget NUMERIC NOT NULL DEFAULT 5000,
  cooldown_minutes INTEGER NOT NULL DEFAULT 0,
  streak_weeks INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Wallets table (one per user)
CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  nomba_account_ref TEXT DEFAULT '',
  nomba_bank_account_number TEXT DEFAULT '',
  weekly_spent NUMERIC NOT NULL DEFAULT 0,
  cycle_start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_bets INTEGER NOT NULL DEFAULT 0,
  last_bet_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Mandates table (one per user)
CREATE TABLE public.mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE UNIQUE,
  mandate_id TEXT DEFAULT '',
  merchant_reference TEXT DEFAULT '',
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING',
  advice_status TEXT NOT NULL DEFAULT 'ADVICE_NOT_SENT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  provider TEXT DEFAULT '',
  customer_id TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'SUCCESS',
  nomba_ref TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_transactions_created_at ON public.transactions(created_at DESC);
CREATE INDEX idx_wallets_user_id ON public.wallets(user_id);
CREATE INDEX idx_mandates_user_id ON public.mandates(user_id);

-- 5. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, '')
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 6. Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mandates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "users_read_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "wallets_read_own" ON public.wallets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "mandates_read_own" ON public.mandates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "transactions_read_own" ON public.transactions
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert/update their own data (for client-side operations)
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "wallets_insert_own" ON public.wallets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "wallets_update_own" ON public.wallets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "mandates_insert_own" ON public.mandates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "mandates_update_own" ON public.mandates
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "transactions_insert_own" ON public.transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
