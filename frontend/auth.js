/* Zyra — auth.js
 * Initialises Supabase and exposes window._zyraAuth.
 * Does NOT block or redirect the page — auth is only required at action time.
 */

(function () {
  const SUPABASE_URL = 'https://ymjeysnubuehjoghkkmv.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_qvy0Ppcn7_JRFMUXaS343w_1IDZjDf2';

  const { createClient } = supabase;
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Stub so app.js can safely call these before session resolves
  window._zyraAuth = {
    ready:    false,
    user:     null,
    getToken: () => null,
    getUser:  () => null,
    signOut:  () => sb.auth.signOut().then(() => { window._zyraAuth.user = null; document.dispatchEvent(new CustomEvent('zyra:auth-changed')); }),
    _sb:      sb,
  };

  // Resolve current session (async, non-blocking)
  sb.auth.getSession().then(({ data }) => {
    const session = data.session;
    window._zyraAuth.ready    = true;
    window._zyraAuth.user     = session?.user || null;
    window._zyraAuth.getToken = () => session?.access_token || null;
    window._zyraAuth.getUser  = () => session?.user || null;
    document.dispatchEvent(new CustomEvent('zyra:auth-ready', { detail: { user: session?.user || null } }));
  });

  // Keep session current on token refresh / sign-in / sign-out
  sb.auth.onAuthStateChange((event, session) => {
    window._zyraAuth.user     = session?.user || null;
    window._zyraAuth.getToken = () => session?.access_token || null;
    window._zyraAuth.getUser  = () => session?.user || null;
    document.dispatchEvent(new CustomEvent('zyra:auth-changed', { detail: { event, user: session?.user || null } }));
  });
})();
