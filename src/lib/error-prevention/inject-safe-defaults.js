'use strict';

/**
 * Safe Default Injection
 *
 * Takes detected prevention issues and injects protective defaults into
 * the blueprint before generation begins. Only injects low-risk, grounded
 * defaults that improve robustness without adding enterprise complexity.
 *
 * Modifications to blueprint:
 * - Appends generation hints to blueprint.designNotes
 * - Adds missing files to blueprint.fileList
 * - Records what was injected for the prevention report
 */

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Inject safe defaults into the blueprint based on detected prevention issues.
 * Returns a new blueprint object (does not mutate the input).
 *
 * @param {Object} blueprint - the enriched blueprint
 * @param {import('./types').PreventionIssue[]} issues - all detected issues
 * @param {import('./types').PreventionInput} input - full prevention input
 * @returns {{ blueprint: Object, injectedDefaults: import('./types').SafeDefaultInjection[], generationAdjustments: import('./types').GenerationAdjustment[] }}
 */
function injectSafeDefaults(blueprint, issues, input) {
  const bp = _cloneBlueprintShallow(blueprint);
  /** @type {import('./types').SafeDefaultInjection[]} */
  const injectedDefaults = [];
  /** @type {import('./types').GenerationAdjustment[]} */
  const generationAdjustments = [];

  const addedHints  = new Set();
  const addedFiles  = new Set(bp.fileList || []);

  /**
   * Helper: append a generation hint to designNotes (idempotent).
   */
  function addHint(hint, injectionId, description) {
    if (addedHints.has(injectionId)) return;
    addedHints.add(injectionId);

    bp.designNotes = (bp.designNotes || '') + `\n[ERROR_PREVENTION] ${hint}`;
    injectedDefaults.push({ id: injectionId, description, noteAdded: hint });
    generationAdjustments.push(description);
  }

  /**
   * Helper: add a file to the planned file list (idempotent).
   */
  function addFile(filePath, injectionId, description) {
    if (addedFiles.has(filePath)) return;
    addedFiles.add(filePath);
    bp.fileList = [...(bp.fileList || []), filePath];
    injectedDefaults.push({ id: injectionId, description, file: filePath });
    generationAdjustments.push(description);
  }

  // ── Process each issue that requests injection ─────────────────────────────

  for (const issue of issues) {
    if (issue.action !== 'safe_default_injected' && issue.action !== 'generation_hint_added') continue;

    switch (issue.id) {

      // ── Scripts ─────────────────────────────────────────────────────────
      case 'node-missing-start-script':
        addHint(
          'SCRIPTS: Ensure package.json includes "start": "node server.js" (or equivalent).',
          'hint-start-script',
          'Added start script requirement to generation hints',
        );
        break;

      case 'nextjs-missing-build-script':
        addHint(
          'SCRIPTS: Ensure package.json includes "build": "next build" and "start": "next start".',
          'hint-nextjs-scripts',
          'Added Next.js build/start script requirements to generation hints',
        );
        break;

      case 'react-missing-build-script':
        addHint(
          'SCRIPTS: Ensure package.json includes "build": "vite build" (or react-scripts build).',
          'hint-react-build-script',
          'Added React build script requirement to generation hints',
        );
        break;

      case 'missing-dev-script':
        addHint(
          'SCRIPTS: Ensure package.json includes a "dev" script (nodemon, next dev, or vite).',
          'hint-dev-script',
          'Added dev script requirement to generation hints',
        );
        break;

      // ── Deployment ───────────────────────────────────────────────────────
      case 'server-needs-dynamic-port':
        addHint(
          'PORT: Server MUST use: const PORT = process.env.PORT || 3000; — never hardcode the port.',
          'hint-dynamic-port',
          'Added process.env.PORT requirement to generation hints',
        );
        break;

      case 'server-missing-health-route':
        addHint(
          'HEALTH: Add GET /health route that returns { ok: true, uptime: process.uptime(), timestamp: Date.now() }.',
          'hint-health-route',
          'Added health route requirement to generation hints',
        );
        break;

      case 'api-server-missing-cors-plan':
        addHint(
          'CORS: Add cors middleware: app.use(cors({ origin: process.env.ALLOWED_ORIGINS || "*" })).',
          'hint-cors',
          'Added CORS middleware hint to generation hints',
        );
        break;

      case 'localhost-callback-risk':
        addHint(
          'URLS: Use process.env.BASE_URL for any absolute URLs — avoid hardcoded localhost.',
          'hint-base-url',
          'Added BASE_URL env var hint to generation hints',
        );
        break;

      // ── Env ──────────────────────────────────────────────────────────────
      case 'missing-env-example-plan':
        addFile(
          '.env.example',
          'inject-env-example',
          'Added .env.example to planned files',
        );
        addHint(
          'ENV: Generate .env.example listing ALL required environment variables with placeholder values.',
          'hint-env-example',
          'Added .env.example generation requirement',
        );
        break;

      case 'env-missing-billing-vars':
        addHint(
          'ENV: Include in .env.example: STRIPE_SECRET_KEY=sk_test_... and STRIPE_PUBLISHABLE_KEY=pk_test_...',
          'hint-stripe-env',
          'Added Stripe env vars to .env.example plan',
        );
        break;

      case 'env-missing-ai-vars':
        addHint(
          'ENV: Include in .env.example: OPENAI_API_KEY=sk-... or ANTHROPIC_API_KEY=sk-ant-...',
          'hint-ai-env',
          'Added AI provider env vars to .env.example plan',
        );
        break;

      case 'env-missing-database-vars':
        addHint(
          'ENV: Include in .env.example: DATABASE_URL=your_connection_string',
          'hint-db-env',
          'Added DATABASE_URL to .env.example plan',
        );
        break;

      case 'env-missing-auth-vars':
      case 'auth-missing-secret-env-var':
        addHint(
          'ENV: Include in .env.example: JWT_SECRET=your_jwt_secret (at least 32 chars) or SESSION_SECRET=...',
          'hint-auth-env',
          'Added JWT_SECRET/SESSION_SECRET to .env.example plan',
        );
        break;

      case 'env-missing-base-url':
        addHint(
          'ENV: Include in .env.example: BASE_URL=http://localhost:3000',
          'hint-base-url-env',
          'Added BASE_URL to .env.example plan',
        );
        break;

      // ── Auth ─────────────────────────────────────────────────────────────
      case 'auth-required-missing-foundation':
        addHint(
          'AUTH: Generate a middleware/auth.js (or lib/auth.js) that validates JWT/session tokens. Export isAuthenticated middleware.',
          'hint-auth-middleware',
          'Added auth middleware requirement to generation hints',
        );
        addFile(
          'middleware/auth.js',
          'inject-auth-middleware',
          'Added middleware/auth.js to planned files',
        );
        break;

      case 'auth-missing-protected-route-strategy':
        addHint(
          'AUTH: Protected routes must redirect to /login if user is not authenticated. Apply isAuthenticated middleware to all non-public routes.',
          'hint-protected-routes',
          'Added protected route strategy to generation hints',
        );
        break;

      case 'roles-missing-guard-shell':
        addHint(
          'ROLES: Generate a hasRole(role) or requireRole(role) middleware for role-based access control.',
          'hint-role-guard',
          'Added role guard requirement to generation hints',
        );
        break;

      // ── Billing ──────────────────────────────────────────────────────────
      case 'billing-missing-utility-plan':
        addFile(
          'lib/stripe.js',
          'inject-stripe-utility',
          'Added lib/stripe.js to planned files',
        );
        addHint(
          'BILLING: Generate lib/stripe.js that exports a Stripe client and checkout/webhook helpers.',
          'hint-stripe-utility',
          'Added Stripe utility requirement to generation hints',
        );
        break;

      case 'billing-missing-stripe-env-vars':
        addHint(
          'BILLING ENV: .env.example must include STRIPE_SECRET_KEY=sk_test_... and STRIPE_PUBLISHABLE_KEY=pk_test_...',
          'hint-billing-env',
          'Added Stripe env vars requirement to generation hints',
        );
        break;

      case 'billing-missing-webhook-secret-env':
        addHint(
          'BILLING ENV: Add STRIPE_WEBHOOK_SECRET=whsec_... to .env.example for webhook signature verification.',
          'hint-webhook-secret-env',
          'Added webhook secret env var to generation hints',
        );
        break;

      case 'billing-missing-checkout-plan':
        addHint(
          'BILLING: Generate a checkout endpoint that creates a Stripe Checkout Session and returns the URL to the client.',
          'hint-checkout-flow',
          'Added checkout flow requirement to generation hints',
        );
        break;

      // ── Mobile ───────────────────────────────────────────────────────────
      case 'mobile-missing-navigation-shell':
        addHint(
          'MOBILE NAV: Generate a navigation shell using @react-navigation/native with Stack and/or Tab navigator. Wrap App in NavigationContainer.',
          'hint-mobile-nav',
          'Added navigation shell requirement to generation hints',
        );
        break;

      case 'mobile-missing-app-config':
        addFile(
          'app.json',
          'inject-app-json',
          'Added app.json to planned files',
        );
        addHint(
          'MOBILE: Generate app.json with: name, slug, version, sdkVersion, platforms: ["ios","android"].',
          'hint-app-json',
          'Added app.json generation requirement',
        );
        break;

      case 'mobile-missing-screen-files':
        addHint(
          'MOBILE: Generate a screens/ directory with one Screen component per planned page.',
          'hint-screen-files',
          'Added screen files requirement to generation hints',
        );
        break;

      case 'mobile-unsafe-localstorage':
        addHint(
          'MOBILE STORAGE: Use AsyncStorage from @react-native-async-storage/async-storage instead of localStorage.',
          'hint-async-storage',
          'Replaced localStorage with AsyncStorage in generation hints',
        );
        break;

      // ── UX states ────────────────────────────────────────────────────────
      case 'dashboard-missing-loading-state':
        addHint(
          'UX: Dashboard components must include loading states (skeleton loaders or spinners) for all async data.',
          'hint-loading-states',
          'Added loading state requirement to generation hints',
        );
        break;

      case 'dashboard-missing-error-state':
        addHint(
          'UX: Dashboard components must include error states for failed API calls — show a message with retry option.',
          'hint-error-states',
          'Added error state requirement to generation hints',
        );
        break;

      case 'dashboard-missing-empty-state':
        addHint(
          'UX: Dashboard tables/charts must include empty states when data is null/empty — show a helpful message.',
          'hint-empty-states',
          'Added empty state requirement to generation hints',
        );
        break;

      // ── Routing ──────────────────────────────────────────────────────────
      case 'missing-404-page-plan':
        addHint(
          'ROUTING: Generate a 404 not-found page for unmatched routes.',
          'hint-404-page',
          'Added 404 page requirement to generation hints',
        );
        break;

      // ── Integration wrappers ──────────────────────────────────────────────
      default:
        if (issue.id.startsWith('integration-missing-wrapper-')) {
          const name = issue.id.replace('integration-missing-wrapper-', '');
          addHint(
            `INTEGRATION: Generate lib/${name}.js as a centralized client/wrapper for ${name} with proper env var handling and fallback if key is missing.`,
            `hint-integration-wrapper-${name}`,
            `Added ${name} integration wrapper to generation hints`,
          );
        }
        if (issue.id.startsWith('env-missing-')) {
          addHint(
            `ENV: Ensure .env.example includes all required env vars for: ${issue.reason}`,
            `hint-${issue.id}`,
            `Added env var requirement to generation hints: ${issue.id}`,
          );
        }
        break;
    }
  }

  // ── Always-on baseline hints for server apps ───────────────────────────────
  const isServer = input.stack?.backend || (input.stack?.tech?.runtime || '').includes('node');
  if (isServer && !addedHints.has('hint-dynamic-port')) {
    addHint(
      'PORT: Server MUST use: const PORT = process.env.PORT || 3000;',
      'hint-dynamic-port-baseline',
      'Added baseline PORT hint to generation hints',
    );
  }

  return { blueprint: bp, injectedDefaults, generationAdjustments };
}

// ── Private helpers ─────────────────────────────────────────────────────────

function _cloneBlueprintShallow(blueprint) {
  return {
    ...blueprint,
    fileList:    [...(blueprint.fileList || [])],
    designNotes: blueprint.designNotes || '',
  };
}

module.exports = { injectSafeDefaults };
