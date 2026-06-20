-- GMF Productions website — Supabase schema
-- Run in Supabase SQL Editor: https://supabase.com/dashboard

create extension if not exists "uuid-ossp";

create table if not exists public.newsletter_subscribers (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  source text default 'website',
  created_at timestamptz not null default now()
);

create table if not exists public.contact_messages (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text not null,
  subject text,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.booking_inquiries (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text not null,
  event_date date,
  message text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default uuid_generate_v4(),
  stripe_session_id text unique,
  stripe_payment_intent text,
  customer_email text,
  amount_total integer,
  currency text default 'usd',
  line_items jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.newsletter_subscribers enable row level security;
alter table public.contact_messages enable row level security;
alter table public.booking_inquiries enable row level security;
alter table public.orders enable row level security;

-- Service role (Netlify functions) bypasses RLS. No public insert policies needed.
