'use strict';

/**
 * @fileoverview Root cause analyzer for the self-healing deploy analyzer.
 *
 * Takes a ClassifiedFailure (from failure-classifier.js) and produces a
 * human-readable RootCause object with:
 *  - A plain-English explanation of what went wrong
 *  - A concrete suggested fix
 *  - Whether automatic fixing is safe (autoFixEligible)
 *  - The most relevant log lines (signal > noise)
 *  - Specific captured values (env var names, module paths, port numbers)
 */

/** @typedef {import('./types').ClassifiedFailure} ClassifiedFailure */
/** @typedef {import('./types').ParsedLogLine}     ParsedLogLine     */
/** @typedef {import('./types').RootCause}         RootCause         */
/** @typedef {import('./types').FailureCategory}   FailureCategory   */

// ---------------------------------------------------------------------------
// Category descriptors
// ---------------------------------------------------------------------------

/**
 * Each descriptor is a function that receives captureGroups and returns
 * { explanation, suggestedFix, autoFixEligible }.
 *
 * Capture groups are filled by the classifier's regex captures, e.g.:
 *   MISSING_ENV  → [0] = env var name
 *   MODULE_NOT_FOUND → [0] = module path
 *   PORT_BIND_ERROR  → [0] = port number
 */
const DESCRIPTORS = {

  MISSING_ENV(captures) {
    const varName = captures[0] || 'one or more required variables';
    return {
      explanation: `Required environment variable ${varName} is not set. ` +
        `The application checks for it at startup and exits when missing.`,
      suggestedFix:
        `1. Add ${varName} to your Railway environment variables (Settings → Variables).\n` +
        `2. Add it to your local .env.local file for development.\n` +
        `3. Run "npm run self-heal" again — this run will also add it to .env.example.`,
      autoFixEligible: true, // auto-fix: update .env.example
    };
  },

  PORT_BIND_ERROR(captures) {
    const port = captures[0] || 'the configured port';
    return {
      explanation: `Port ${port} is already in use or the application is attempting to bind ` +
        `to a hardcoded port instead of process.env.PORT. ` +
        `On Railway, the PORT variable is injected automatically at runtime.`,
      suggestedFix:
        `1. Update your server to listen on process.env.PORT (auto-fix will attempt this).\n` +
        `2. Ensure the server binds to 0.0.0.0, not 127.0.0.1 or localhost.\n` +
        `3. On Railway, do NOT specify a fixed port — let PORT be assigned dynamically.`,
      autoFixEligible: true, // auto-fix: patch listen() call
    };
  },

  MODULE_NOT_FOUND(captures) {
    const mod = captures[0] || 'an unknown module';
    const isRelative = mod.startsWith('.');
    return {
      explanation: isRelative
        ? `Local module "${mod}" could not be found. The file may be missing, ` +
          `misnamed, or the import path may be wrong.`
        : `npm package "${mod}" is not installed or was not included in package.json. ` +
          `This often happens when a dependency is listed in devDependencies but is ` +
          `needed at runtime.`,
      suggestedFix: isRelative
        ? `1. Verify the file "${mod}" exists at the expected path.\n` +
          `2. Check for case-sensitivity issues (common on Linux deploys).\n` +
          `3. Check for typos in the import path.`
        : `1. Run: npm install ${mod} --save\n` +
          `2. Commit the updated package.json and package-lock.json.\n` +
          `3. If it is a dev-only build tool, move it to dependencies instead of devDependencies.`,
      autoFixEligible: !isRelative, // auto-fix: add to package.json proposal
    };
  },

  TYPESCRIPT_BUILD_ERROR(captures) {
    const tsCode = captures[0] ? `TS${captures[0]}` : 'TypeScript';
    return {
      explanation: `TypeScript compilation failed with error ${tsCode}. ` +
        `The build exited before producing output, so the server has nothing to start.`,
      suggestedFix:
        `1. Run "npx tsc --noEmit" locally to see all type errors.\n` +
        `2. Fix the reported type mismatches.\n` +
        `3. Consider adding "skipLibCheck: true" to tsconfig.json to suppress third-party errors.\n` +
        `4. Ensure your build script runs "tsc" before "node".`,
      autoFixEligible: false, // type errors require human judgment
    };
  },

  PRISMA_SCHEMA_ERROR(captures) {
    return {
      explanation:
        `The Prisma client has not been generated or is out of sync with the schema. ` +
        `This usually means "prisma generate" was not run as part of the build step. ` +
        `Without a generated client, any Prisma import will throw at runtime.`,
      suggestedFix:
        `1. Add "prisma generate" to your build script (auto-fix will attempt this):\n` +
        `   "build": "prisma generate && <your existing build command>"\n` +
        `2. Ensure DATABASE_URL is set in Railway environment variables.\n` +
        `3. Add @prisma/client to dependencies (not devDependencies).`,
      autoFixEligible: true, // auto-fix: patch package.json build script
    };
  },

  DATABASE_CONNECTION_ERROR(captures) {
    return {
      explanation:
        `The application cannot connect to the database. ` +
        `The database server may be offline, the connection URL may be wrong, ` +
        `or network access is blocked.`,
      suggestedFix:
        `1. Verify DATABASE_URL (or equivalent) is set and correctly formatted.\n` +
        `2. Check that the database service is running and accessible from Railway.\n` +
        `3. If using Railway's database plugin, ensure it is in the same project/environment.\n` +
        `4. Check SSL requirements — append "?sslmode=require" if needed.`,
      autoFixEligible: false, // can't fix infrastructure from code
    };
  },

  MIGRATION_FAILURE(captures) {
    return {
      explanation:
        `A database migration failed during deployment. ` +
        `This may be due to schema drift (the database is ahead of or behind the code), ` +
        `a destructive migration, or a broken migration file.`,
      suggestedFix:
        `1. Run "prisma migrate status" locally against the production DATABASE_URL to inspect drift.\n` +
        `2. If there is drift: run "prisma migrate resolve --applied <migration_name>" carefully.\n` +
        `3. Do NOT run "prisma migrate reset" in production — it drops all data.\n` +
        `4. Ensure your deploy script runs migrations before starting the server.`,
      autoFixEligible: false, // migration fixes are always human decisions
    };
  },

  START_COMMAND_FAILURE(captures) {
    return {
      explanation:
        `The application process failed to start. ` +
        `The start command may be missing, pointing to a non-existent file, ` +
        `or the entry point crashed immediately on boot.`,
      suggestedFix:
        `1. Verify package.json has a "start" script pointing to the correct entry file.\n` +
        `2. Run the start command locally: npm start\n` +
        `3. Check that all build artifacts exist before start (run build first).\n` +
        `4. Look for startup errors in the runtime logs above this message.`,
      autoFixEligible: true, // auto-fix: verify/correct start script
    };
  },

  PACKAGE_INSTALL_FAILURE(captures) {
    return {
      explanation:
        `npm install (or equivalent) failed during the build phase. ` +
        `This is usually a peer dependency conflict, a native module build failure (gyp), ` +
        `or a network issue reaching the npm registry.`,
      suggestedFix:
        `1. Run "npm install" locally and resolve the conflicts shown.\n` +
        `2. If a peer dep conflict: add --legacy-peer-deps to the install command.\n` +
        `3. If a gyp error: the package requires native compilation; check for a pre-built binary.\n` +
        `4. Pin conflicting packages to compatible versions in package.json.`,
      autoFixEligible: false, // dep conflicts need human review
    };
  },

  HEALTHCHECK_FAILURE(captures) {
    return {
      explanation:
        `The deployment health check failed. Railway (or the container orchestrator) ` +
        `sent an HTTP request to the health endpoint and received no valid 200 response ` +
        `within the timeout window. The service may be starting too slowly or crashing silently.`,
      suggestedFix:
        `1. Ensure a GET /api/health (or /health) route exists and returns HTTP 200 quickly.\n` +
        `2. Ensure the server binds to 0.0.0.0 and uses process.env.PORT.\n` +
        `3. Increase the health check timeout in Railway settings if startup is legitimately slow.\n` +
        `4. Check runtime logs for crash-on-boot errors that prevent the server from accepting requests.`,
      autoFixEligible: true, // auto-fix: verify health route + PORT binding
    };
  },

  UNKNOWN_FAILURE(captures) {
    return {
      explanation:
        `The failure could not be classified from the available logs. ` +
        `This may indicate missing log output, an unusual failure mode, ` +
        `or a crash that occurred before logging was initialized.`,
      suggestedFix:
        `1. Increase log verbosity and redeploy to capture more detail.\n` +
        `2. Check Railway's raw deploy logs (not just app logs) for infrastructure errors.\n` +
        `3. Run the app locally with production environment variables and observe the output.\n` +
        `4. File an issue if this failure repeats — include the full log output.`,
      autoFixEligible: false,
    };
  },
};

// ---------------------------------------------------------------------------
// Signal extraction
// ---------------------------------------------------------------------------

/**
 * Pick the most informative log lines from a match set.
 * Favours error-severity lines, deduplicates, and caps at maxLines.
 *
 * @param {ParsedLogLine[]} matchedLines
 * @param {ParsedLogLine[]} allLines
 * @param {number}          [maxLines]
 * @returns {string[]}
 */
function extractImportantLines(matchedLines, allLines, maxLines = 10) {
  const seen = new Set();
  const out  = [];

  // Priority 1: matched lines (they are what triggered the classification)
  for (const l of matchedLines) {
    const t = (l.text || l.raw).trim();
    if (t && !seen.has(t)) { seen.add(t); out.push(t); }
    if (out.length >= maxLines) return out;
  }

  // Priority 2: any remaining error-severity lines from the full log
  for (const l of allLines) {
    if (l.severity !== 'error') continue;
    const t = (l.text || l.raw).trim();
    if (t && !seen.has(t)) { seen.add(t); out.push(t); }
    if (out.length >= maxLines) return out;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze a classified failure and produce a human-readable root cause.
 *
 * @param {ClassifiedFailure} failure
 * @param {ParsedLogLine[]}   allLines  - Full log line array for context
 * @returns {RootCause}
 */
function analyzeRootCause(failure, allLines = []) {
  const descriptor = DESCRIPTORS[failure.category] ?? DESCRIPTORS.UNKNOWN_FAILURE;
  const { explanation, suggestedFix, autoFixEligible } = descriptor(failure.captureGroups);

  return {
    category:         failure.category,
    confidence:       failure.confidence,
    explanation,
    suggestedFix,
    autoFixEligible,
    importantLogLines: extractImportantLines(failure.matchedLines, allLines),
    captureGroups:     failure.captureGroups,
  };
}

/**
 * Build a short one-liner summary of the root cause (for report headers).
 * @param {RootCause} rootCause
 * @returns {string}
 */
function summarizeRootCause(rootCause) {
  const { category, confidence, captureGroups } = rootCause;
  const pct  = Math.round(confidence * 100);
  const spec = captureGroups.length > 0 ? ` (${captureGroups.slice(0, 2).join(', ')})` : '';
  return `${category}${spec} — ${pct}% confidence`;
}

module.exports = { analyzeRootCause, summarizeRootCause, extractImportantLines };
