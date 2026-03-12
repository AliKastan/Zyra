// dotenv is loaded in src/server/index.js before this module is required.
// This fallback ensures env vars are available if env.js is imported standalone.
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

const env = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  DEFAULT_PLANNER_MODEL: process.env.DEFAULT_PLANNER_MODEL || 'claude',
  DEFAULT_CODER_MODEL: process.env.DEFAULT_CODER_MODEL || 'claude',
  DEFAULT_REVIEW_MODEL: process.env.DEFAULT_REVIEW_MODEL || 'claude',
  PORT: parseInt(process.env.PORT || '3001', 10),
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  VERCEL_TOKEN: process.env.VERCEL_TOKEN || '',
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
  STRIPE_PRICE_ID_PRO: process.env.STRIPE_PRICE_ID_PRO || '',
  STRIPE_PRICE_ID_MAX: process.env.STRIPE_PRICE_ID_MAX || '',
  APP_URL: process.env.APP_URL || 'http://localhost:3001',
};

function validateEnv() {
  const warnings = [];

  if (!env.ANTHROPIC_API_KEY) {
    warnings.push('ANTHROPIC_API_KEY is not set — Claude provider will be unavailable');
  }
  const openaiModels = [env.DEFAULT_PLANNER_MODEL, env.DEFAULT_CODER_MODEL, env.DEFAULT_REVIEW_MODEL];
  if (!env.OPENAI_API_KEY && openaiModels.includes('openai')) {
    warnings.push('OPENAI_API_KEY is not set — but one or more stages are routed to OpenAI');
  }

  const validModels = ['claude', 'openai'];
  if (!validModels.includes(env.DEFAULT_PLANNER_MODEL)) {
    warnings.push(`DEFAULT_PLANNER_MODEL "${env.DEFAULT_PLANNER_MODEL}" is not recognized. Use "claude" or "openai".`);
  }
  if (!validModels.includes(env.DEFAULT_CODER_MODEL)) {
    warnings.push(`DEFAULT_CODER_MODEL "${env.DEFAULT_CODER_MODEL}" is not recognized. Use "claude" or "openai".`);
  }
  if (!validModels.includes(env.DEFAULT_REVIEW_MODEL)) {
    warnings.push(`DEFAULT_REVIEW_MODEL "${env.DEFAULT_REVIEW_MODEL}" is not recognized. Use "claude" or "openai".`);
  }

  return warnings;
}

module.exports = { env, validateEnv };
