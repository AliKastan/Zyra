const { createClient } = require('@supabase/supabase-js');

let adminClient = null;

/**
 * Returns a Supabase client initialized with the service role key.
 * This client bypasses Row Level Security — use ONLY in server-side code.
 * Never expose this client or its key to the frontend.
 */
function getSupabaseAdmin() {
  if (!adminClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for server-side billing operations.'
      );
    }

    adminClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession:   false,
      },
    });
  }
  return adminClient;
}

/**
 * Returns true if the Supabase admin client can be initialised.
 * Use this as a guard before calling getSupabaseAdmin() in optional paths.
 */
function isBillingConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

module.exports = { getSupabaseAdmin, isBillingConfigured };
