const { createClient } = require('@supabase/supabase-js');
const { env } = require('../config/env');
const logger = require('../utils/logger');

let supabase = null;

function getSupabase() {
  if (!supabase) {
    if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set in .env.local');
    }
    supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);
  }
  return supabase;
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = authHeader.slice(7);
  try {
    const { data, error } = await getSupabase().auth.getUser(token);
    if (error || !data?.user) {
      logger.debug(`authMiddleware: invalid token — ${error?.message}`);
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }
    req.user = data.user;
    next();
  } catch (err) {
    logger.error('authMiddleware: unexpected error', { error: err.message });
    return res.status(500).json({ error: 'Authentication error' });
  }
}

module.exports = { requireAuth };
