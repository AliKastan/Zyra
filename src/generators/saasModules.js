/**
 * SaaS Module Library
 *
 * Defines the reusable building blocks that Zyra assembles into SaaS MVPs.
 * Each module contributes: files, SQL schema fragments, env vars, and a description
 * that gets injected into the coder prompt so Claude knows exactly what to build.
 *
 * Billing note: every billing module uses USER-OWNED Stripe credentials.
 * Revenue flows directly to the SaaS owner — Zyra never handles payments.
 */

const MODULES = {

  // ── Foundation modules ──────────────────────────────────────────────────────

  landing: {
    id: 'landing',
    label: 'Landing Page',
    description: 'Marketing page: sticky nav, hero with CTAs, features grid, pricing section, testimonials, footer',
    files: ['index.html', 'css/landing.css'],
    sql: '',
    envVars: [],
  },

  auth: {
    id: 'auth',
    label: 'Authentication',
    description: 'Supabase Auth: signup, login, forgot-password, reset-password, session guard, profile creation trigger',
    files: [
      'pages/login.html',
      'pages/register.html',
      'pages/forgot-password.html',
      'js/auth.js',
      'js/session.js',
    ],
    sql: `
-- User profiles (extends auth.users)
CREATE TABLE public.profiles (
  id          UUID  REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email       TEXT  NOT NULL,
  full_name   TEXT,
  avatar_url  TEXT,
  role        TEXT  NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin','moderator')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own profile"     ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile"   ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins view all profiles"   ON public.profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();`,
    envVars: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
  },

  dashboard: {
    id: 'dashboard',
    label: 'Dashboard Shell',
    description: 'Authenticated dashboard: persistent sidebar with nav links, top bar, stats cards, responsive layout',
    files: [
      'pages/dashboard/index.html',
      'css/dashboard.css',
      'js/dashboard.js',
      'js/components/sidebar.js',
    ],
    sql: '',
    envVars: [],
  },

  settings: {
    id: 'settings',
    label: 'Settings',
    description: 'User profile settings, password change, notification preferences, account deletion',
    files: [
      'pages/dashboard/settings.html',
      'js/settings.js',
    ],
    sql: `
CREATE TABLE public.user_preferences (
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  notifications_email   BOOLEAN DEFAULT true,
  notifications_in_app  BOOLEAN DEFAULT true,
  theme                 TEXT    DEFAULT 'dark',
  timezone              TEXT    DEFAULT 'UTC',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own prefs" ON public.user_preferences FOR ALL USING (auth.uid() = user_id);`,
    envVars: [],
  },

  // ── Monetization modules ────────────────────────────────────────────────────

  pricing: {
    id: 'pricing',
    label: 'Pricing Page',
    description: 'Plan comparison page: 3 tiers (Free/Pro/Team), monthly/yearly toggle, feature matrix, CTA buttons',
    files: ['pages/pricing.html'],
    sql: '',
    envVars: [],
  },

  billing: {
    id: 'billing',
    label: 'Billing & Subscriptions',
    description: 'User-owned Stripe integration. Revenue goes directly to SaaS owner — NOT through Zyra. Includes subscription management, plan upgrade/downgrade, billing portal.',
    files: [
      'pages/dashboard/billing.html',
      'js/billing.js',
    ],
    sql: `
-- Plans
CREATE TABLE public.plans (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  price_monthly            DECIMAL(10,2),
  price_yearly             DECIMAL(10,2),
  stripe_price_id_monthly  TEXT,
  stripe_price_id_yearly   TEXT,
  features                 JSONB NOT NULL DEFAULT '[]',
  max_users                INT,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  sort_order               INT     NOT NULL DEFAULT 0
);

-- Subscriptions
CREATE TABLE public.subscriptions (
  id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id                TEXT REFERENCES public.plans(id),
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT UNIQUE,
  status                 TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','canceled','past_due','trialing','incomplete')),
  current_period_start   TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN DEFAULT false,
  trial_end              TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own subscription"   ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX idx_subscriptions_user           ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status         ON public.subscriptions(status);

-- Seed default plans (update Stripe price IDs after creating products in Stripe dashboard)
INSERT INTO public.plans (id, name, price_monthly, price_yearly, features, sort_order) VALUES
  ('free',       'Free',       0,   0,   '["Up to 3 projects","1 user","Community support"]',              1),
  ('pro',        'Pro',        29,  290, '["Unlimited projects","5 users","Priority support","Analytics"]', 2),
  ('team',       'Team',       99,  990, '["Unlimited everything","25 users","API access","SSO","SLA"]',    3);`,
    envVars: ['STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    setupNote: 'Connect YOUR OWN Stripe account. Revenue flows directly to you, not through Zyra.',
  },

  // ── Team & collaboration modules ────────────────────────────────────────────

  team: {
    id: 'team',
    label: 'Teams & Workspaces',
    description: 'Multi-tenant workspaces, team member invitations, role-based access per workspace',
    files: [
      'pages/dashboard/team.html',
      'js/team.js',
    ],
    sql: `
CREATE TABLE public.workspaces (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  owner_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  logo_url    TEXT,
  plan_id     TEXT REFERENCES public.plans(id) DEFAULT 'free',
  settings    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.workspace_members (
  workspace_id  UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner','admin','member','viewer')),
  invited_by    UUID REFERENCES auth.users(id),
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view their workspaces"
  ON public.workspaces FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = id AND user_id = auth.uid()));
CREATE POLICY "Members can view workspace member list"
  ON public.workspace_members FOR SELECT USING (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE TABLE public.invitations (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id  UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member',
  invited_by    UUID REFERENCES auth.users(id),
  token         TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`,
    envVars: [],
  },

  // ── Engagement modules ──────────────────────────────────────────────────────

  notifications: {
    id: 'notifications',
    label: 'Notifications',
    description: 'In-app notification bell with unread count, mark-as-read, notification feed',
    files: [
      'js/notifications.js',
      'js/components/notification-bell.js',
    ],
    sql: `
CREATE TABLE public.notifications (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info','success','warning','error')),
  action_url  TEXT,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own notifications" ON public.notifications FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_notifications_user    ON public.notifications(user_id);
CREATE INDEX idx_notifications_unread  ON public.notifications(user_id, read_at) WHERE read_at IS NULL;`,
    envVars: [],
  },

  analytics: {
    id: 'analytics',
    label: 'Analytics Dashboard',
    description: 'Usage metrics, KPI cards, Chart.js visualizations, date-range filters, exportable data',
    files: [
      'pages/dashboard/analytics.html',
      'js/analytics.js',
    ],
    sql: `
CREATE TABLE public.events (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL,
  properties  JSONB NOT NULL DEFAULT '{}',
  session_id  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view all events" ON public.events FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE INDEX idx_events_user    ON public.events(user_id);
CREATE INDEX idx_events_type    ON public.events(event_type);
CREATE INDEX idx_events_created ON public.events(created_at DESC);`,
    envVars: [],
  },

  onboarding: {
    id: 'onboarding',
    label: 'User Onboarding',
    description: 'Multi-step onboarding wizard for new users after signup',
    files: [
      'pages/onboarding.html',
      'js/onboarding.js',
    ],
    sql: `
CREATE TABLE public.onboarding_progress (
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  completed_steps  JSONB NOT NULL DEFAULT '[]',
  completed_at     TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own onboarding" ON public.onboarding_progress FOR ALL USING (auth.uid() = user_id);`,
    envVars: [],
  },

  // ── Admin modules ───────────────────────────────────────────────────────────

  admin: {
    id: 'admin',
    label: 'Admin Panel',
    description: 'Role-gated admin dashboard: user management table, MRR stats, subscription overview, account controls',
    files: [
      'pages/admin/index.html',
      'pages/admin/users.html',
      'js/admin.js',
    ],
    sql: `
-- Admin view (read-only, requires admin role policy)
CREATE VIEW public.admin_users_view AS
SELECT
  p.id, p.email, p.full_name, p.role, p.avatar_url, p.created_at,
  s.plan_id, s.status AS subscription_status, s.current_period_end
FROM public.profiles p
LEFT JOIN public.subscriptions s ON s.user_id = p.id;`,
    envVars: [],
  },

};

// ── Module selector ───────────────────────────────────────────────────────────

/**
 * Selects modules based on parsed SaaS intent.
 * Returns ordered array of module IDs — order matters for SQL generation.
 */
function selectModules(saasIntent) {
  if (!saasIntent?.isSaaS) return [];

  const { category, requiredModules = [], monetizationModel } = saasIntent;
  const selected = new Set(['landing', 'auth', 'dashboard', 'settings']);

  // Module signals → add corresponding modules
  if (requiredModules.includes('billing') ||
      (monetizationModel && monetizationModel !== 'free')) {
    selected.add('pricing');
    selected.add('billing');
  }
  if (requiredModules.includes('admin'))         selected.add('admin');
  if (requiredModules.includes('team'))          selected.add('team');
  if (requiredModules.includes('notifications')) selected.add('notifications');
  if (requiredModules.includes('analytics'))     selected.add('analytics');
  if (requiredModules.includes('onboarding'))    selected.add('onboarding');

  // Category-specific additions
  const categoryExtras = {
    'booking-saas':       ['notifications', 'analytics'],
    'crm-saas':           ['analytics', 'notifications'],
    'marketplace':        ['billing', 'pricing', 'admin', 'analytics'],
    'collaboration-saas': ['team', 'notifications', 'analytics'],
    'project-management': ['team', 'notifications'],
    'ai-saas':            ['billing', 'pricing', 'analytics'],
    'lms-saas':           ['billing', 'pricing', 'analytics', 'notifications'],
    'health-saas':        ['notifications', 'analytics'],
    'hr-saas':            ['team', 'notifications', 'analytics'],
    'finance-saas':       ['billing', 'analytics', 'admin'],
    'generic-saas':       ['billing', 'pricing'],
  };
  (categoryExtras[category] || []).forEach(m => selected.add(m));

  // billing always requires pricing
  if (selected.has('billing') && !selected.has('pricing')) selected.add('pricing');

  // Canonical order for SQL generation (dependencies first)
  const ORDER = [
    'landing', 'pricing', 'auth', 'onboarding',
    'dashboard', 'admin', 'team', 'billing',
    'notifications', 'analytics', 'settings',
  ];
  return ORDER.filter(m => selected.has(m));
}

/**
 * Returns combined SQL schema string for the given module IDs.
 * auth must come first (profiles table is referenced by everything).
 */
function getModulesSql(moduleIds) {
  // Ensure auth is first if present
  const ordered = ['auth', ...moduleIds.filter(id => id !== 'auth')];
  return ordered
    .filter(id => MODULES[id]?.sql)
    .map(id => `-- ────────────────────────────────\n-- ${MODULES[id].label}\n-- ────────────────────────────────${MODULES[id].sql}`)
    .join('\n\n');
}

/**
 * Returns all required env vars from selected modules (deduplicated).
 * Supabase vars are always included.
 */
function getModulesEnvVars(moduleIds) {
  const vars = new Set(['SUPABASE_URL', 'SUPABASE_ANON_KEY']);
  moduleIds.forEach(id => {
    (MODULES[id]?.envVars || []).forEach(v => vars.add(v));
  });
  return [...vars];
}

/**
 * Returns a short human-readable summary of selected modules.
 * Used in prompts to tell Claude what to build.
 */
function describeModules(moduleIds) {
  return moduleIds
    .filter(id => MODULES[id])
    .map(id => `• ${MODULES[id].label}: ${MODULES[id].description}`)
    .join('\n');
}

module.exports = { MODULES, selectModules, getModulesSql, getModulesEnvVars, describeModules };
