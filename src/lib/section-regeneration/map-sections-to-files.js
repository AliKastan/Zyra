'use strict';

/**
 * Section-to-File Mapping
 *
 * Maps section types to actual file paths in the project.
 * Uses path-pattern matching — no LLM calls needed.
 *
 * Each section owns a set of path patterns. A file is "owned" by the first
 * section whose patterns match it. Some files are shared (e.g. package.json
 * belongs to deployment; .env.example is shared by multiple sections).
 *
 * Also defines:
 *   - expected new files for each section (if a section is being added)
 *   - env vars a section needs
 *   - npm dependencies a section needs
 */

// ── File path patterns per section ───────────────────────────────────────────
// Patterns are tested against full file paths (forward slashes, relative).
// Multiple patterns per section; first match wins across sections in PRIORITY ORDER.

const SECTION_PATTERNS = {
  // Deployment files (checked early — package.json, .env.example are primarily deployment)
  'deployment': [
    /^package\.json$/i,
    /^\.env(?:\.example)?$/i,
    /Dockerfile/i,
    /docker-compose/i,
    /^railway\.json$/i,
    /^vercel\.json$/i,
    /^netlify\.toml$/i,
    /^Procfile$/i,
    /\/health(?:check)?\.(?:js|ts)$/i,
    /\/status\.(?:js|ts)$/i,
    /^README\.md$/i,
    /^\.env\.\w+$/i,
    /startup|entrypoint/i,
  ],

  // Auth files
  'auth': [
    /\/(?:lib\/)?auth(?:enticate|entication|orization)?\.(?:js|ts)$/i,
    /\/middleware\/(?:auth|authenticate|require-?auth|protect)\.(?:js|ts)$/i,
    /\/(?:pages?|app|views?|screens?)\/(?:login|sign-?in|sign-?up|register|forgot-?password|reset-?password)(?:\/index)?\.(?:jsx?|tsx?|vue)$/i,
    /\/routes?\/auth(?:entication)?\.(?:js|ts)$/i,
    /\/controllers?\/auth\.(?:js|ts)$/i,
    /passport|jwt-?strategy|session-?store/i,
    /\/guards?\/auth/i,
  ],

  // Billing files
  'billing': [
    /stripe/i,
    /billing/i,
    /\/(?:pages?|app|views?|screens?)\/(?:pricing|checkout|subscription|billing)(?:\/index)?\.(?:jsx?|tsx?|vue)$/i,
    /\/routes?\/billing(?:Webhook)?\.(?:js|ts)$/i,
    /\/api\/billing/i,
    /\/webhooks?\/stripe/i,
    /subscription/i,
    /checkout/i,
  ],

  // Integration files (checked before backend-api to catch service wrappers)
  'integrations': [
    /\/(?:lib|services?|integrations?|providers?)\/(?:openai|anthropic|claude|supabase|firebase|resend|sendgrid|mailgun|twilio|vonage|cloudinary|s3|stripe)\.(?:js|ts)$/i,
    /\/(?:config|lib)\/(?:email|smtp|mailer|storage|ai)\.(?:js|ts)$/i,
    /openai|anthropic|supabase|firebase|sendgrid|mailgun|resend|twilio|cloudinary/i,
  ],

  // Admin files
  'admin': [
    /\/(?:pages?|app|views?|screens?)\/admin(?:\/.*)?\.(?:jsx?|tsx?|vue)$/i,
    /\/routes?\/admin(?:\/.*)?\.(?:js|ts)$/i,
    /\/controllers?\/admin\.(?:js|ts)$/i,
    /admin(?:-|_)?(?:dashboard|panel|layout|sidebar)/i,
    /\/middleware\/require-?admin/i,
    /moderat(?:ion|e)/i,
  ],

  // Mobile shell / navigation files
  'mobile-shell': [
    /\/(?:src\/)?navigation\/(?:index|App|Root|Main)\.(?:jsx?|tsx?)$/i,
    /\/(?:components?|src)\/(?:TabBar|BottomNav|AppShell|NavigationStack|DrawerNav)\.(?:jsx?|tsx?)$/i,
    /app\.json$/i,
    /expo\.json$/i,
    /\/navigation\//i,
    /(?:Tab|Stack|Drawer)Navigator/i,
    /app\/_layout\.(?:jsx?|tsx?)$/i,
  ],

  // Design system files
  'design-system': [
    /\/(?:styles?|css|design|theme)\/(?:tokens?|variables?|theme|colors?|typography|spacing)\.(?:css|scss|sass|js|ts|json)$/i,
    /(?:design-?system|theme-?config|style-?guide)/i,
    /\/presets?\//i,
    /tokens?\.(?:js|ts|json|css)$/i,
    /palette\.(?:js|ts|json|css)$/i,
    /tailwind\.config/i,
  ],

  // Database / model files
  'database': [
    /\/(?:models?|entities|schema)\/(?:\w+)\.(?:js|ts)$/i,
    /\/(?:db|database|prisma)\//i,
    /schema\.(?:js|ts|prisma|graphql)$/i,
    /migration(?:s)?\/.*\.(?:js|ts|sql)$/i,
    /mongoose\.(?:js|ts)$/i,
    /sequelize\.(?:js|ts)$/i,
    /knex(?:file)?\.(?:js|ts)$/i,
  ],

  // UX states files
  'ux-states': [
    /\/(?:components?|ui)\/(?:Loading|Spinner|Skeleton|ErrorState|EmptyState|NoResults|LoadingState|ErrorBoundary)\.(?:jsx?|tsx?)$/i,
    /loading-state|error-state|empty-state|skeleton-loader/i,
    /LoadingScreen|LoadingPage|ErrorPage/i,
  ],

  // Backend / API files (broad — matched after more specific sections above)
  'backend-api': [
    /\/(?:routes?|controllers?|services?|api)\//i,
    /\/server\.(?:js|ts)$/i,
    /\/app\.(?:js|ts)$/i,
    /\/index\.(?:js|ts)$/, // root server file
    /\/(?:middleware)\//i,
  ],

  // UI / Presentation files (matched last — broadest category)
  'ui-presentation': [
    /\.(?:css|scss|sass|less)$/i,
    /\/(?:components?|ui)\//i,
    /\/(?:styles?|stylesheets?)\//i,
    /theme\.(?:js|ts|json)$/i,
  ],

  // Routes / Pages (matched last alongside UI)
  'routes-pages': [
    /\/(?:pages?|views?|screens?)\//i,
    /\/app\//i,   // Next.js app router
    /router\.(?:js|ts)$/i,
    /routes?\.(?:js|ts)$/i,
    /App\.(?:jsx?|tsx?)$/i,
  ],
};

// Priority order for ambiguous files — sections listed earlier win
const SECTION_PRIORITY = [
  'deployment',
  'auth',
  'billing',
  'integrations',
  'admin',
  'mobile-shell',
  'design-system',
  'database',
  'ux-states',
  'backend-api',
  'ui-presentation',
  'routes-pages',
];

// ── Expected new files per section (when section is being added) ──────────────

const SECTION_NEW_FILES = {
  'billing': [
    'server/routes/billing.js',
    'server/routes/billing-webhook.js',
    'client/pages/Pricing.jsx',
    'client/pages/Checkout.jsx',
    'client/components/PricingCard.jsx',
  ],
  'auth': [
    'server/middleware/authenticate.js',
    'server/routes/auth.js',
    'client/pages/Login.jsx',
    'client/pages/Signup.jsx',
  ],
  'admin': [
    'client/pages/Admin.jsx',
    'server/routes/admin.js',
    'server/middleware/requireAdmin.js',
  ],
  'integrations': [
    'server/lib/integration.js',
  ],
  'deployment': [
    '.env.example',
    'README.md',
  ],
  'mobile-shell': [
    'navigation/index.js',
    'navigation/TabNavigator.js',
  ],
  'ux-states': [
    'client/components/LoadingState.jsx',
    'client/components/ErrorState.jsx',
    'client/components/EmptyState.jsx',
  ],
  'design-system': [
    'client/styles/tokens.css',
    'client/styles/theme.js',
  ],
  'database': [
    'server/models/index.js',
  ],
  'backend-api': [
    'server/routes/api.js',
    'server/app.js',
  ],
  'ui-presentation': [
    'client/styles/main.css',
    'client/components/ui/',
  ],
  'routes-pages': [
    'client/pages/',
    'client/App.jsx',
  ],
};

// ── Env vars needed per section ───────────────────────────────────────────────

const SECTION_ENV_VARS = {
  'billing':      ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET'],
  'auth':         ['JWT_SECRET', 'SESSION_SECRET'],
  'integrations': ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'SENDGRID_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'],
  'database':     ['DATABASE_URL'],
  'deployment':   ['PORT', 'NODE_ENV'],
  'admin':        [],
  'mobile-shell': [],
};

// ── Dependencies needed per section ──────────────────────────────────────────

const SECTION_DEPENDENCIES = {
  'billing':      ['stripe'],
  'auth':         ['jsonwebtoken', 'bcryptjs'],
  'integrations': [],  // varies by integration
  'database':     [],  // varies by DB
  'deployment':   [],
  'admin':        [],
  'mobile-shell': ['@react-navigation/native', '@react-navigation/bottom-tabs'],
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Map a list of sections to their matching files in the existing project.
 *
 * @param {string[]} sections                  - Section types to map
 * @param {Object.<string,string>} existingFiles - Current project files { path: content }
 * @returns {import('./types').FileImpactMapping[]}
 */
function mapSectionsToFiles(sections, existingFiles = {}) {
  const filePaths    = Object.keys(existingFiles);
  const assignments  = _assignFilesToSections(filePaths);

  return sections.map(section => {
    const matchedFiles = filePaths.filter(p => assignments[p] === section);
    return {
      section,
      matchedFiles,
      expectedNewFiles:    SECTION_NEW_FILES[section]  || [],
      envVarsNeeded:       SECTION_ENV_VARS[section]    || [],
      dependenciesNeeded:  SECTION_DEPENDENCIES[section] || [],
    };
  });
}

/**
 * Get the section that owns a file path.
 *
 * @param {string} filePath
 * @returns {string | null} section type or null if unrecognized
 */
function getSectionForFile(filePath) {
  const normalPath = filePath.replace(/\\/g, '/');
  for (const section of SECTION_PRIORITY) {
    const patterns = SECTION_PATTERNS[section] || [];
    if (patterns.some(rx => rx.test(normalPath))) return section;
  }
  return null;
}

/**
 * Get all files belonging to a section from an existing files map.
 *
 * @param {string} section
 * @param {Object.<string,string>} existingFiles
 * @returns {string[]}
 */
function getFilesForSection(section, existingFiles) {
  return Object.keys(existingFiles).filter(p => getSectionForFile(p) === section);
}

/**
 * Partition all project files by section ownership.
 *
 * @param {Object.<string,string>} existingFiles
 * @returns {Object.<string, string[]>} section → file paths
 */
function partitionFilesBySection(existingFiles) {
  const result  = {};
  const filePaths = Object.keys(existingFiles);
  const assignments = _assignFilesToSections(filePaths);

  for (const [path, section] of Object.entries(assignments)) {
    if (!result[section]) result[section] = [];
    result[section].push(path);
  }
  return result;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _assignFilesToSections(filePaths) {
  const result = {};
  for (const fp of filePaths) {
    result[fp] = getSectionForFile(fp) || 'ui-presentation'; // fallback
  }
  return result;
}

module.exports = {
  mapSectionsToFiles,
  getSectionForFile,
  getFilesForSection,
  partitionFilesBySection,
  SECTION_PATTERNS,
  SECTION_PRIORITY,
  SECTION_NEW_FILES,
  SECTION_ENV_VARS,
  SECTION_DEPENDENCIES,
};
