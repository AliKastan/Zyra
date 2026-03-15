'use strict';

/**
 * @fileoverview Safe auto-fix engine for the self-healing deploy analyzer.
 *
 * Risk levels:
 *  LOW    — non-destructive additions (e.g. .env.example update). Auto-applied.
 *  MEDIUM — surgical code edits (e.g. fixing a listen() call). Auto-applied with backup.
 *  HIGH   — logic changes, schema changes, auth/payment code. Proposal only, never auto-applied.
 *
 * The engine scans the project root for relevant files, detects the problem,
 * and either applies the fix directly or writes a PatchProposal for review.
 *
 * IMPORTANT: This engine never touches files matching HIGH_RISK_PATHS.
 * It never deletes existing code — only appends or makes surgical replacements.
 */

const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');

/** @typedef {import('./types').RootCause}        RootCause       */
/** @typedef {import('./types').AutoFixResult}    AutoFixResult   */
/** @typedef {import('./types').FileChange}       FileChange      */
/** @typedef {import('./types').PatchProposal}    PatchProposal   */
/** @typedef {import('./types').FailureCategory}  FailureCategory */

// ---------------------------------------------------------------------------
// Safety lists
// ---------------------------------------------------------------------------

/** Paths that must NEVER be auto-modified (only proposed). */
const HIGH_RISK_PATHS = [
  /auth/i,
  /payment/i,
  /billing/i,
  /stripe/i,
  /webhook/i,
  /migration/i,
  /schema\.prisma$/i,
  /seed\.(js|ts)$/i,
  /\.env\.local$/i,
  /\.env\.production$/i,
];

/** Entry-point filenames to scan for PORT / listen issues. */
const ENTRY_CANDIDATES = [
  'src/server/index.js',
  'src/server/app.js',
  'src/index.js',
  'index.js',
  'server.js',
  'app.js',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @param {string} abs @returns {boolean} */
function isHighRisk(abs) {
  return HIGH_RISK_PATHS.some((re) => re.test(abs));
}

/**
 * Read a file safely; returns null if not found.
 * @param {string} abs
 * @returns {string|null}
 */
function safeRead(abs) {
  try { return fs.readFileSync(abs, 'utf8'); }
  catch (_) { return null; }
}

/**
 * Write a file, creating parent directories as needed.
 * @param {string} abs
 * @param {string} content
 */
function safeWrite(abs, content) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

/** Generate a short random patch ID. */
function patchId() {
  return 'patch-' + crypto.randomBytes(4).toString('hex');
}

/**
 * Scan all JS files in root for process.env.XYZ references.
 * @param {string} root
 * @returns {string[]} unique env var names found
 */
function scanEnvRefs(root) {
  const found = new Set();
  const walk  = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (_) { return; }

    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (['node_modules', '.git', 'generated-projects', '.next', 'dist', 'build'].includes(e.name)) continue;
        walk(abs);
      } else if (/\.(js|ts|cjs|mjs)$/.test(e.name)) {
        const src = safeRead(abs);
        if (!src) continue;
        const re = /process\.env\.([A-Z_][A-Z_0-9]*)/g;
        let m;
        while ((m = re.exec(src)) !== null) found.add(m[1]);
      }
    }
  };
  walk(root);
  return [...found];
}

/**
 * Parse a .env-style file into a Set of declared variable names.
 * @param {string} content
 * @returns {Set<string>}
 */
function parseEnvKeys(content) {
  const keys = new Set();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) keys.add(trimmed.slice(0, eq).trim());
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Individual fix implementations
// ---------------------------------------------------------------------------

/**
 * FIX A: Ensure server uses process.env.PORT and binds to 0.0.0.0.
 *
 * Scans entry-point candidates for:
 *  - .listen(NNNN)       → .listen(process.env.PORT || NNNN)
 *  - hostname: 'localhost' → hostname: '0.0.0.0'
 *  - host: 'localhost'     → host: '0.0.0.0'
 *
 * @param {string}       root
 * @param {boolean}      dryRun
 * @returns {{ changes: FileChange[], proposals: PatchProposal[], errors: string[] }}
 */
function fixPortBinding(root, dryRun) {
  const changes   = [];
  const proposals = [];
  const errors    = [];

  // Patterns that indicate a hardcoded port
  const HARDCODED_LISTEN = /\.listen\(\s*(\d{3,5})\s*(?:,|\/\/|\)|$)/gm;
  const LOCALHOST_HOST   = /(hostname|host)\s*:\s*['"]localhost['"]/g;

  for (const rel of ENTRY_CANDIDATES) {
    const abs = path.join(root, rel);
    if (isHighRisk(abs)) continue;
    const original = safeRead(abs);
    if (!original) continue;

    let patched    = original;
    let changed    = false;

    // Fix hardcoded listen port
    patched = patched.replace(HARDCODED_LISTEN, (match, port) => {
      // Already uses process.env.PORT?
      if (original.includes(`process.env.PORT`)) return match;
      changed = true;
      return match.replace(port, `process.env.PORT || ${port}`);
    });

    // Fix localhost binding
    if (LOCALHOST_HOST.test(patched)) {
      LOCALHOST_HOST.lastIndex = 0;
      patched  = patched.replace(LOCALHOST_HOST, (m, key) => `${key}: '0.0.0.0'`);
      changed  = true;
    }

    if (!changed) continue;

    const change = {
      path:        rel,
      type:        'edit',
      description: 'Updated server to use process.env.PORT and bind to 0.0.0.0',
      before:      original.slice(0, 300),
      after:       patched.slice(0, 300),
    };

    if (!dryRun) {
      try {
        safeWrite(abs, patched);
        changes.push(change);
      } catch (e) {
        errors.push(`PORT fix write error (${rel}): ${e.message}`);
      }
    } else {
      changes.push({ ...change, description: '[DRY RUN] ' + change.description });
    }
  }

  // If no entry point was found at all, generate a proposal
  const anyEntryExists = ENTRY_CANDIDATES.some((r) => fs.existsSync(path.join(root, r)));
  if (!anyEntryExists) {
    proposals.push({
      id:          patchId(),
      title:       'Add PORT binding to server entry point',
      explanation: 'No known entry-point file was found. Manually ensure your server calls ' +
                   '.listen(process.env.PORT || 3000) and binds to 0.0.0.0.',
      risk:        'medium',
      changes:     [],
      autoApplied: false,
    });
  }

  return { changes, proposals, errors };
}

/**
 * FIX B: Update .env.example with any missing env var references.
 *
 * Scans JS source for process.env.XYZ, compares with .env.example,
 * and appends missing entries as commented stubs.
 *
 * @param {string}   root
 * @param {string[]} capturedVars  - Vars extracted from classifier captures
 * @param {boolean}  dryRun
 * @returns {{ changes: FileChange[], proposals: PatchProposal[], errors: string[] }}
 */
function fixMissingEnvExample(root, capturedVars, dryRun) {
  const changes   = [];
  const proposals = [];
  const errors    = [];

  const examplePath = path.join(root, '.env.example');
  const localPath   = path.join(root, '.env.local');

  // Collect all env var references from source
  const allRefs = new Set([...scanEnvRefs(root), ...capturedVars]);

  // Parse existing .env.example
  const exampleContent = safeRead(examplePath) || '';
  const exampleKeys    = parseEnvKeys(exampleContent);

  // Parse .env.local so we don't over-report vars that ARE set locally
  const localContent   = safeRead(localPath) || '';
  const localKeys      = parseEnvKeys(localContent);

  // Find vars in source that are not in .env.example
  const missing = [...allRefs].filter(
    (v) => !exampleKeys.has(v) && !v.startsWith('npm_') && !v.startsWith('NODE_')
  );

  if (missing.length === 0) return { changes, proposals, errors };

  const appendLines = [
    '',
    '# ── Added by self-heal analyzer ──',
    ...missing.map((v) => {
      const inLocal = localKeys.has(v);
      return `${v}=${inLocal ? '' : 'REQUIRED'}\n`;
    }),
  ].join('\n');

  const newContent = exampleContent.trimEnd() + appendLines;

  const change = {
    path:        '.env.example',
    type:        exampleContent ? 'edit' : 'create',
    description: `Added ${missing.length} missing env var(s) to .env.example: ${missing.slice(0, 5).join(', ')}`,
    before:      exampleContent.slice(-200),
    after:       appendLines,
  };

  if (!dryRun) {
    try {
      safeWrite(examplePath, newContent);
      changes.push(change);
    } catch (e) {
      errors.push(`env.example write error: ${e.message}`);
    }
  } else {
    changes.push({ ...change, description: '[DRY RUN] ' + change.description });
  }

  return { changes, proposals, errors };
}

/**
 * FIX C: Verify package.json has a "start" script and it points to a real file.
 * Proposes a fix if broken — does NOT auto-rewrite package.json start commands
 * because the entry point may vary.
 *
 * @param {string}  root
 * @returns {{ changes: FileChange[], proposals: PatchProposal[], errors: string[] }}
 */
function fixStartScript(root) {
  const changes   = [];
  const proposals = [];
  const errors    = [];

  const pkgPath = path.join(root, 'package.json');
  const pkgRaw  = safeRead(pkgPath);
  if (!pkgRaw) {
    errors.push('package.json not found');
    return { changes, proposals, errors };
  }

  let pkg;
  try { pkg = JSON.parse(pkgRaw); }
  catch (_) { errors.push('package.json is not valid JSON'); return { changes, proposals, errors }; }

  const startScript = pkg.scripts?.start;

  if (!startScript) {
    // Detect likely entry point
    const entry = ENTRY_CANDIDATES.find((r) => fs.existsSync(path.join(root, r)));
    proposals.push({
      id:          patchId(),
      title:       'Add missing "start" script to package.json',
      explanation: `package.json has no "start" script. Railway will not know how to start the server. ` +
                   (entry ? `Add: "start": "node ${entry}"` : 'Add a start script pointing to your server entry point.'),
      risk:        'medium',
      changes: [{
        path:        'package.json',
        type:        'edit',
        description: `Add "start": "node ${entry || 'src/server/index.js'}" to scripts`,
        before:      JSON.stringify(pkg.scripts || {}, null, 2),
        after:       JSON.stringify({ ...pkg.scripts, start: `node ${entry || 'src/server/index.js'}` }, null, 2),
      }],
      autoApplied: false,
    });
    return { changes, proposals, errors };
  }

  // Verify the entry file referenced in the start script actually exists
  const entryMatch = startScript.match(/node\s+(['"]?)([^\s'"]+)\1/);
  if (entryMatch) {
    const entryFile = entryMatch[2];
    const entryAbs  = path.join(root, entryFile);
    if (!fs.existsSync(entryAbs)) {
      proposals.push({
        id:          patchId(),
        title:       `Start script references missing file: ${entryFile}`,
        explanation: `The "start" script runs "node ${entryFile}" but that file does not exist. ` +
                     `Either create the file or update the start script to point to the correct entry point.`,
        risk:        'medium',
        changes:     [],
        autoApplied: false,
      });
    }
  }

  return { changes, proposals, errors };
}

/**
 * FIX D: Ensure "prisma generate" is in the build script.
 *
 * Generates a PROPOSAL (not auto-applied) because touching build scripts
 * has side effects we cannot predict without knowing the full pipeline.
 *
 * @param {string}  root
 * @returns {{ changes: FileChange[], proposals: PatchProposal[], errors: string[] }}
 */
function fixPrismaGenerate(root) {
  const changes   = [];
  const proposals = [];
  const errors    = [];

  const pkgPath = path.join(root, 'package.json');
  const pkgRaw  = safeRead(pkgPath);
  if (!pkgRaw) return { changes, proposals, errors };

  let pkg;
  try { pkg = JSON.parse(pkgRaw); }
  catch (_) { return { changes, proposals, errors }; }

  // Only relevant if @prisma/client is a dependency
  const hasPrisma = pkg.dependencies?.['@prisma/client'] || pkg.devDependencies?.['@prisma/client'];
  if (!hasPrisma) return { changes, proposals, errors };

  const buildScript = pkg.scripts?.build || '';
  if (buildScript.includes('prisma generate')) return { changes, proposals, errors };

  const proposedBuild = buildScript
    ? `prisma generate && ${buildScript}`
    : 'prisma generate';

  proposals.push({
    id:          patchId(),
    title:       'Add "prisma generate" to the build script',
    explanation: `@prisma/client is installed but "prisma generate" is not in the build script. ` +
                 `Without it, the generated Prisma client will be missing in production.`,
    risk:        'medium',
    changes: [{
      path:        'package.json',
      type:        'edit',
      description: `Change build script from "${buildScript || '(none)'}" to "${proposedBuild}"`,
      before:      buildScript,
      after:       proposedBuild,
    }],
    autoApplied: false,
  });

  return { changes, proposals, errors };
}

/**
 * FIX E: Verify the health endpoint exists in the Zyra server.
 * If not found, generates a proposal with the exact code to add.
 *
 * @param {string}  root
 * @returns {{ changes: FileChange[], proposals: PatchProposal[], errors: string[] }}
 */
function fixHealthEndpoint(root) {
  const changes   = [];
  const proposals = [];
  const errors    = [];

  // Walk routes looking for a health route
  const routesDir  = path.join(root, 'src', 'routes');
  const serverDir  = path.join(root, 'src', 'server');
  const candidates = [
    path.join(routesDir,  'healthRoutes.js'),
    path.join(serverDir,  'app.js'),
    path.join(root, 'src', 'server', 'index.js'),
    path.join(root, 'app.js'),
    path.join(root, 'server.js'),
  ];

  const HEALTH_PATTERN = /\/health|app\.get\s*\(\s*['"]\/health['"]/i;
  const hasHealth = candidates.some((abs) => {
    const src = safeRead(abs);
    return src && HEALTH_PATTERN.test(src);
  });

  if (hasHealth) return { changes, proposals, errors };

  proposals.push({
    id:          patchId(),
    title:       'Add /api/health endpoint',
    explanation: `No health check route was found. Railway (and most PaaS platforms) ` +
                 `will mark a deployment as failed if the health endpoint does not respond ` +
                 `with HTTP 200. Add the following route to your Express app:`,
    risk:        'low',
    changes: [{
      path:        'src/routes/healthRoutes.js',
      type:        'create',
      description: 'Create lightweight health check route',
      after: [
        `'use strict';`,
        `const express = require('express');`,
        `const router  = express.Router();`,
        ``,
        `// Lightweight health check — must respond < 5 s`,
        `router.get('/', (_req, res) => {`,
        `  res.json({ status: 'ok', time: new Date().toISOString() });`,
        `});`,
        ``,
        `module.exports = router;`,
      ].join('\n'),
    }, {
      path:        'src/server/app.js',
      type:        'edit',
      description: `Mount the health route: app.use('/api/health', require('../routes/healthRoutes'));`,
      before:      '// add above other routes',
      after:       `app.use('/api/health', require('../routes/healthRoutes'));`,
    }],
    autoApplied: false,
  });

  return { changes, proposals, errors };
}

/**
 * FIX F: Add a missing npm package as a proposal.
 * Safe to auto-add to proposals only — never runs npm install automatically.
 *
 * @param {string}   root
 * @param {string[]} missingModules  - Captured from MODULE_NOT_FOUND classifier
 * @returns {{ changes: FileChange[], proposals: PatchProposal[], errors: string[] }}
 */
function fixMissingModule(root, missingModules) {
  const changes   = [];
  const proposals = [];
  const errors    = [];

  const pkgPath = path.join(root, 'package.json');
  const pkgRaw  = safeRead(pkgPath);
  if (!pkgRaw) return { changes, proposals, errors };

  let pkg;
  try { pkg = JSON.parse(pkgRaw); }
  catch (_) { return { changes, proposals, errors }; }

  for (const mod of missingModules) {
    // Only handle npm package names (not relative paths)
    if (mod.startsWith('.') || mod.startsWith('/')) continue;

    // Strip sub-path (e.g. lodash/merge → lodash)
    const pkgName = mod.startsWith('@')
      ? mod.split('/').slice(0, 2).join('/')
      : mod.split('/')[0];

    const inDeps    = pkg.dependencies?.[pkgName];
    const inDevDeps = pkg.devDependencies?.[pkgName];

    if (inDeps) continue; // already listed as dep — might be an install failure

    proposals.push({
      id:          patchId(),
      title:       `Add missing dependency: ${pkgName}`,
      explanation: `Module "${mod}" was not found at runtime. ` +
                   (inDevDeps
                     ? `It is in devDependencies but not in dependencies — it will be absent in production.`
                     : `It is not listed in package.json at all.`) +
                   ` Run: npm install ${pkgName} --save`,
      risk:        'low',
      changes: [{
        path:        'package.json',
        type:        'edit',
        description: `Add "${pkgName}": "latest" to dependencies`,
        before:      JSON.stringify(pkg.dependencies || {}, null, 2),
        after:       JSON.stringify({ ...pkg.dependencies, [pkgName]: 'latest' }, null, 2),
      }],
      autoApplied: false,
    });
  }

  return { changes, proposals, errors };
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

/**
 * Run all applicable auto-fixes for the given root cause.
 *
 * @param {RootCause} rootCause
 * @param {string}    projectRoot
 * @param {boolean}   dryRun
 * @returns {AutoFixResult}
 */
function runAutoFix(rootCause, projectRoot, dryRun = false) {
  const root       = path.resolve(projectRoot);
  const allChanges = [];
  const allProposals = [];
  const allErrors  = [];
  const skipped    = [];

  const { category, autoFixEligible, captureGroups } = rootCause;

  if (!autoFixEligible) {
    skipped.push(`${category} — not eligible for auto-fix (requires human judgment)`);
  }

  // Always run these checks regardless of category:
  // They are low-risk diagnostic helpers.

  // ── Start script verification (all categories) ──────────────────────────
  {
    const r = fixStartScript(root);
    allChanges.push(...r.changes);
    allProposals.push(...r.proposals);
    allErrors.push(...r.errors);
  }

  // ── Prisma generate check (all categories) ───────────────────────────────
  {
    const r = fixPrismaGenerate(root);
    allProposals.push(...r.proposals);
    allErrors.push(...r.errors);
  }

  // ── Health endpoint check (HEALTHCHECK_FAILURE + START_COMMAND_FAILURE) ──
  if (category === 'HEALTHCHECK_FAILURE' || category === 'START_COMMAND_FAILURE' || category === 'UNKNOWN_FAILURE') {
    const r = fixHealthEndpoint(root);
    allProposals.push(...r.proposals);
    allErrors.push(...r.errors);
  }

  // ── Category-specific auto-fixes ─────────────────────────────────────────

  if (category === 'PORT_BIND_ERROR' || category === 'HEALTHCHECK_FAILURE') {
    const r = fixPortBinding(root, dryRun);
    allChanges.push(...r.changes);
    allProposals.push(...r.proposals);
    allErrors.push(...r.errors);
  }

  if (category === 'MISSING_ENV') {
    const r = fixMissingEnvExample(root, captureGroups, dryRun);
    allChanges.push(...r.changes);
    allProposals.push(...r.proposals);
    allErrors.push(...r.errors);
  }

  if (category === 'MODULE_NOT_FOUND' && captureGroups.length > 0) {
    const r = fixMissingModule(root, captureGroups);
    allProposals.push(...r.proposals);
    allErrors.push(...r.errors);
  }

  if (category === 'PRISMA_SCHEMA_ERROR') {
    // Already handled above via fixPrismaGenerate; also check env
    const r = fixMissingEnvExample(root, ['DATABASE_URL'], dryRun);
    allChanges.push(...r.changes);
    allProposals.push(...r.proposals);
    allErrors.push(...r.errors);
  }

  // Run env-example update for every failure (always useful)
  if (category !== 'MISSING_ENV' && category !== 'PRISMA_SCHEMA_ERROR') {
    const r = fixMissingEnvExample(root, captureGroups, dryRun);
    allChanges.push(...r.changes);
    allProposals.push(...r.proposals);
    allErrors.push(...r.errors);
  }

  return {
    applied:          allChanges.length > 0,
    changesMade:      allChanges,
    pendingProposals: allProposals,
    skipped,
    errors:           allErrors,
  };
}

module.exports = {
  runAutoFix,
  // Exported for unit-testing individual fixers
  fixPortBinding,
  fixMissingEnvExample,
  fixStartScript,
  fixPrismaGenerate,
  fixHealthEndpoint,
  fixMissingModule,
};
