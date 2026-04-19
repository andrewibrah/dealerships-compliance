-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Role enum
CREATE TYPE role AS ENUM ('user', 'admin');

-- Users (id = auth.users.id UUID)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email VARCHAR(320) NOT NULL UNIQUE,
  role role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_signed_in TIMESTAMPTZ
);

-- Dealerships
CREATE TABLE IF NOT EXISTS public.dealerships (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state VARCHAR(2) NOT NULL DEFAULT '',
  dms_vendor VARCHAR(64) NOT NULL DEFAULT '',
  rooftop_count INTEGER NOT NULL DEFAULT 1,
  qualified_individual TEXT NOT NULL DEFAULT '',
  qi_email VARCHAR(320) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compliance answers
CREATE TABLE IF NOT EXISTS public.compliance_answers (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  dealership_id INTEGER NOT NULL REFERENCES public.dealerships(id) ON DELETE CASCADE,
  section INTEGER NOT NULL,
  section_name TEXT NOT NULL DEFAULT '',
  answers JSONB NOT NULL DEFAULT '{}',
  score INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dealership_id, section)
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  dealership_id INTEGER NOT NULL REFERENCES public.dealerships(id) ON DELETE CASCADE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan VARCHAR(64) NOT NULL DEFAULT 'free',
  status VARCHAR(64) NOT NULL DEFAULT 'active',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Generated documents
CREATE TABLE IF NOT EXISTS public.generated_documents (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  dealership_id INTEGER NOT NULL REFERENCES public.dealerships(id) ON DELETE CASCADE,
  doc_type VARCHAR(64) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  storage_path TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: Enable for all tables (Edge Functions use service role key, bypasses RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dealerships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;
