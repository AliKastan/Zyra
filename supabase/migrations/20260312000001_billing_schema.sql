-- ─────────────────────────────────────────────────────────────────────────────
-- Zyra Billing Schema — v1
-- Run this migration in the Supabase SQL editor or via supabase db push.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. profiles ──────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz default now() not null,
  updated_at  timestamptz default now() not null
);

-- ── 2. plan_entitlements ─────────────────────────────────────────────────────
create table if not exists public.plan_entitlements (
  id                uuid primary key default gen_random_uuid(),
  plan              text unique not null check (plan in ('free','pro','max')),
  monthly_credits   integer not null,
  max_projects      integer,
  max_team_members  integer,
  max_output_tokens integer not null default 4096,
  priority_support  boolean default false not null,
  premium_models    boolean default false not null,
  deploy_enabled    boolean default true  not null,
  advanced_debug    boolean default false not null,
  created_at        timestamptz default now() not null,
  updated_at        timestamptz default now() not null
);

-- Seed entitlements
insert into public.plan_entitlements
  (plan, monthly_credits, max_projects, max_output_tokens, priority_support, premium_models, deploy_enabled, advanced_debug)
values
  ('free', 1000,  3,    4096,  false, false, false, false),
  ('pro',  20000, null, 8192,  true,  true,  true,  true),
  ('max',  60000, null, 16384, true,  true,  true,  true)
on conflict (plan) do update set
  monthly_credits   = excluded.monthly_credits,
  max_projects      = excluded.max_projects,
  max_output_tokens = excluded.max_output_tokens,
  priority_support  = excluded.priority_support,
  premium_models    = excluded.premium_models,
  deploy_enabled    = excluded.deploy_enabled,
  advanced_debug    = excluded.advanced_debug,
  updated_at        = now();

-- ── 3. subscription_accounts ─────────────────────────────────────────────────
create table if not exists public.subscription_accounts (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid unique not null references public.profiles(id) on delete cascade,
  plan                   text not null default 'free' check (plan in ('free','pro','max')),
  status                 text not null default 'free'
                           check (status in ('active','trialing','past_due','canceled','incomplete','free')),
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  stripe_price_id        text,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean default false not null,
  created_at             timestamptz default now() not null,
  updated_at             timestamptz default now() not null
);

-- ── 4. usage_ledger (append-only audit log) ──────────────────────────────────
create table if not exists public.usage_ledger (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.profiles(id) on delete cascade,
  request_id           text not null,
  event_type           text not null
                         check (event_type in ('generation','edit','deploy','debug','api_call','adjustment')),
  model                text,
  input_tokens         integer not null default 0,
  output_tokens        integer not null default 0,
  tool_calls           integer not null default 0,
  credits_delta        integer not null,
  credit_rate_snapshot jsonb  not null default '{}'::jsonb,
  metadata             jsonb  not null default '{}'::jsonb,
  created_at           timestamptz default now() not null
);

-- Idempotency: prevent double-charging the same request+event
create unique index if not exists usage_ledger_idempotent_idx
  on public.usage_ledger (request_id, event_type);

create index if not exists usage_ledger_user_created_idx
  on public.usage_ledger (user_id, created_at desc);

-- ── 5. billing_period_usage (fast summary lookup) ────────────────────────────
create table if not exists public.billing_period_usage (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  period_start     timestamptz not null,
  period_end       timestamptz not null,
  credits_used     integer not null default 0,
  credits_included integer not null default 0,
  plan             text not null,
  updated_at       timestamptz default now() not null,
  constraint billing_period_usage_unique unique (user_id, period_start, period_end)
);

create index if not exists billing_period_usage_user_idx
  on public.billing_period_usage (user_id, period_start desc);

-- ── 6. stripe_event_log (webhook idempotency) ────────────────────────────────
create table if not exists public.stripe_event_log (
  id              uuid primary key default gen_random_uuid(),
  stripe_event_id text unique not null,
  event_type      text not null,
  processed_at    timestamptz default now() not null,
  payload         jsonb not null
);

-- ── 7. abuse_flags ───────────────────────────────────────────────────────────
create table if not exists public.abuse_flags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  flag_type  text not null,
  reason     text not null,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz default now() not null
);

create index if not exists abuse_flags_user_idx
  on public.abuse_flags (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles              enable row level security;
alter table public.plan_entitlements     enable row level security;
alter table public.subscription_accounts enable row level security;
alter table public.usage_ledger          enable row level security;
alter table public.billing_period_usage  enable row level security;
alter table public.stripe_event_log      enable row level security;
alter table public.abuse_flags           enable row level security;

-- Profiles
create policy "profiles: own read"
  on public.profiles for select using (auth.uid() = id);
create policy "profiles: own update"
  on public.profiles for update using (auth.uid() = id);

-- Plan entitlements: all authenticated users can read
create policy "plan_entitlements: authenticated read"
  on public.plan_entitlements for select using (auth.role() = 'authenticated');

-- Subscription accounts: user can read their own
create policy "subscriptions: own read"
  on public.subscription_accounts for select using (auth.uid() = user_id);

-- Usage ledger: user can read their own; NO client writes (service role only)
create policy "usage_ledger: own read"
  on public.usage_ledger for select using (auth.uid() = user_id);

-- Billing period usage: user can read their own; NO client writes
create policy "billing_period: own read"
  on public.billing_period_usage for select using (auth.uid() = user_id);

-- stripe_event_log: no client access (service role only)
-- abuse_flags: no client access

-- ─────────────────────────────────────────────────────────────────────────────
-- Functions & Triggers
-- ─────────────────────────────────────────────────────────────────────────────

-- Auto-create profile + free subscription on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.subscription_accounts (user_id, plan, status)
  values (new.id, 'free', 'free')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ begin
  create trigger profiles_updated_at
    before update on public.profiles
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger subscription_accounts_updated_at
    before update on public.subscription_accounts
    for each row execute function public.set_updated_at();
exception when duplicate_object then null; end $$;

-- Atomic credit increment — called from server to prevent race conditions
create or replace function public.increment_credits_used(
  p_user_id      uuid,
  p_period_start timestamptz,
  p_period_end   timestamptz,
  p_delta        integer
)
returns void language plpgsql security definer as $$
begin
  update public.billing_period_usage
  set    credits_used = credits_used + p_delta,
         updated_at   = now()
  where  user_id      = p_user_id
    and  period_start = p_period_start
    and  period_end   = p_period_end;
end;
$$;
