'use strict';

/**
 * @fileoverview Failure classifier for the self-healing deploy analyzer.
 *
 * Maps an array of ParsedLogLine objects to structured ClassifiedFailure objects
 * using a rule-based pattern engine. Rules are ordered by specificity.
 *
 * Each rule contains one or more regex patterns with individual confidence
 * scores. Multiple pattern matches within a rule boost the final confidence
 * slightly (capped at 1.0).
 *
 * Exit-code 0 with no errors is treated as UNKNOWN_FAILURE with very low
 * confidence — the caller can decide how to handle a "no error found" case.
 */

/** @typedef {import('./types').FailureCategory}    FailureCategory    */
/** @typedef {import('./types').ParsedLogLine}       ParsedLogLine      */
/** @typedef {import('./types').ClassifiedFailure}   ClassifiedFailure  */

// ---------------------------------------------------------------------------
// Rule definitions
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} PatternEntry
 * @property {RegExp} regex
 * @property {number} confidence - 0.0..1.0
 * @property {number} [capture]  - capture group index to extract
 */

/**
 * @typedef {Object} ClassifierRule
 * @property {FailureCategory} category
 * @property {PatternEntry[]}  patterns
 */

/** @type {ClassifierRule[]} */
const RULES = [
  // ── MISSING_ENV ──────────────────────────────────────────────────────────
  {
    category: 'MISSING_ENV',
    patterns: [
      { regex: /ANTHROPIC_API_KEY is not set|Cannot call Claude/i,            confidence: 0.98 },
      { regex: /SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set/i,       confidence: 0.98 },
      { regex: /Required environment variable ["']?([A-Z_0-9]+)["']? is missing/i, confidence: 0.97, capture: 1 },
      { regex: /missing required environment variable[:\s]+([A-Z_0-9]+)/i,    confidence: 0.96, capture: 1 },
      { regex: /Error: ([A-Z_0-9]+) must be set/i,                            confidence: 0.94, capture: 1 },
      { regex: /process\.env\.([A-Z_0-9]+) is (not set|undefined|required)/i, confidence: 0.93, capture: 1 },
      { regex: /env(ironment)? var(iable)? ([A-Z_0-9]+) not found/i,          confidence: 0.91, capture: 3 },
      { regex: /getenv\(["']([A-Z_0-9]+)["']\).*undefined/i,                  confidence: 0.88, capture: 1 },
    ],
  },

  // ── PORT_BIND_ERROR ───────────────────────────────────────────────────────
  {
    category: 'PORT_BIND_ERROR',
    patterns: [
      { regex: /listen EADDRINUSE[:\s]+.*:(\d+)/i,          confidence: 0.99, capture: 1 },
      { regex: /Error: listen EADDRINUSE/i,                  confidence: 0.99 },
      { regex: /EADDRINUSE.*address already in use/i,        confidence: 0.97 },
      { regex: /bind EACCES.*:(\d+)/i,                       confidence: 0.96, capture: 1 },
      { regex: /port (\d+) is already in use/i,              confidence: 0.95, capture: 1 },
      { regex: /cannot bind to port (\d+)/i,                 confidence: 0.93, capture: 1 },
      { regex: /address already in use 0\.0\.0\.0:(\d+)/i,   confidence: 0.99, capture: 1 },
    ],
  },

  // ── MODULE_NOT_FOUND ──────────────────────────────────────────────────────
  {
    category: 'MODULE_NOT_FOUND',
    patterns: [
      { regex: /Cannot find module '([^']+)'/i,                             confidence: 0.99, capture: 1 },
      { regex: /Error: Cannot find module '([^']+)'/i,                       confidence: 0.99, capture: 1 },
      { regex: /Module not found: Can't resolve '([^']+)'/i,                 confidence: 0.97, capture: 1 },
      { regex: /code: 'MODULE_NOT_FOUND'/i,                                   confidence: 0.95 },
      { regex: /MODULE_NOT_FOUND/i,                                           confidence: 0.90 },
      { regex: /require\(\) of ES Module.*not supported/i,                    confidence: 0.88 },
      { regex: /Cannot use import statement in a CommonJS module/i,           confidence: 0.88 },
      { regex: /does not provide an export named '([^']+)'/i,                 confidence: 0.86, capture: 1 },
      { regex: /SyntaxError: Unexpected token 'export'/i,                     confidence: 0.82 },
    ],
  },

  // ── TYPESCRIPT_BUILD_ERROR ────────────────────────────────────────────────
  {
    category: 'TYPESCRIPT_BUILD_ERROR',
    patterns: [
      { regex: /error TS(\d+):[^\n]+/i,                                       confidence: 0.99, capture: 1 },
      { regex: /TypeScript compilation failed/i,                               confidence: 0.99 },
      { regex: /Found \d+ error(s)? in \d+ file/i,                            confidence: 0.96 },
      { regex: /Type '([^']+)' is not assignable to type '([^']+)'/i,         confidence: 0.95, capture: 1 },
      { regex: /tsc.*exited with code [^0]/i,                                 confidence: 0.93 },
      { regex: /Argument of type '([^']+)' is not assignable/i,               confidence: 0.90, capture: 1 },
      { regex: /Property '([^']+)' does not exist on type/i,                  confidence: 0.90, capture: 1 },
    ],
  },

  // ── PRISMA_SCHEMA_ERROR ───────────────────────────────────────────────────
  {
    category: 'PRISMA_SCHEMA_ERROR',
    patterns: [
      { regex: /PrismaClientInitializationError/i,                            confidence: 0.99 },
      { regex: /@prisma\/client did not initialize yet/i,                     confidence: 0.99 },
      { regex: /Cannot find module '\.prisma\/client'/i,                      confidence: 0.99 },
      { regex: /run `prisma generate`/i,                                      confidence: 0.98 },
      { regex: /prisma generate.*failed|failed.*prisma generate/i,            confidence: 0.97 },
      { regex: /Error validating.*schema\.prisma/i,                           confidence: 0.97 },
      { regex: /Prisma schema validation.*error/i,                            confidence: 0.97 },
      { regex: /no Prisma Schema found/i,                                     confidence: 0.96 },
      { regex: /PrismaClientKnownRequestError/i,                              confidence: 0.70 }, // runtime, not schema
    ],
  },

  // ── DATABASE_CONNECTION_ERROR ─────────────────────────────────────────────
  {
    category: 'DATABASE_CONNECTION_ERROR',
    patterns: [
      { regex: /ECONNREFUSED.*(?:5432|3306|27017|6379)/i,                     confidence: 0.99 },
      { regex: /connect ECONNREFUSED.*database/i,                             confidence: 0.97 },
      { regex: /could not connect to (the )?server: Connection refused/i,     confidence: 0.97 },
      { regex: /password authentication failed for user/i,                    confidence: 0.96 },
      { regex: /database connection.*failed|failed.*database connection/i,     confidence: 0.95 },
      { regex: /MongoNetworkError|MongoServerError/i,                          confidence: 0.95 },
      { regex: /ETIMEDOUT.*(?:postgres|mysql|mongo|redis)/i,                  confidence: 0.93 },
      { regex: /SSL SYSCALL error: EOF detected/i,                            confidence: 0.90 },
      { regex: /DATABASE_URL.*not set|invalid.*database.?url/i,              confidence: 0.92 },
      { regex: /relation "([^"]+)" does not exist/i,                          confidence: 0.88, capture: 1 },
    ],
  },

  // ── MIGRATION_FAILURE ─────────────────────────────────────────────────────
  {
    category: 'MIGRATION_FAILURE',
    patterns: [
      { regex: /prisma migrate.*(?:failed|error)/i,                           confidence: 0.98 },
      { regex: /There are \d+ unapplied migration/i,                          confidence: 0.98 },
      { regex: /schema drift detected/i,                                      confidence: 0.98 },
      { regex: /migration.*failed|failed.*migration/i,                        confidence: 0.92 },
      { regex: /knex.*migration.*failed/i,                                    confidence: 0.93 },
      { regex: /alembic.*(error|failed)/i,                                    confidence: 0.93 },
      { regex: /flyway.*migration.*failed/i,                                  confidence: 0.93 },
      { regex: /ERROR.*running migration/i,                                   confidence: 0.88 },
    ],
  },

  // ── START_COMMAND_FAILURE ─────────────────────────────────────────────────
  {
    category: 'START_COMMAND_FAILURE',
    patterns: [
      { regex: /missing script:\s*["']?start["']?/i,                          confidence: 0.99 },
      { regex: /npm run start.*exited with code [^0\s]/i,                     confidence: 0.96 },
      { regex: /node: command not found/i,                                     confidence: 0.99 },
      { regex: /sh: (\d+:? )?[\w./]+: command not found/i,                   confidence: 0.92 },
      { regex: /Cannot find module '\.\/(?:server|index|app)'/i,              confidence: 0.95 },
      { regex: /ENOENT.*no such file.*(?:server|index)\.js/i,                 confidence: 0.93 },
      { regex: /exec.*: no such file or directory/i,                          confidence: 0.90 },
      { regex: /Entrypoint.*not found/i,                                      confidence: 0.90 },
      { regex: /process exited with code 1/i,                                 confidence: 0.55 }, // low — too generic
    ],
  },

  // ── PACKAGE_INSTALL_FAILURE ───────────────────────────────────────────────
  {
    category: 'PACKAGE_INSTALL_FAILURE',
    patterns: [
      { regex: /npm ERR!.*code ERESOLVE/i,                                    confidence: 0.99 },
      { regex: /npm ERR!.*ERESOLVE could not resolve/i,                       confidence: 0.99 },
      { regex: /npm ERR!.*peer dep.*conflict/i,                               confidence: 0.97 },
      { regex: /gyp ERR! build error/i,                                       confidence: 0.97 },
      { regex: /npm ERR!.*ENOTFOUND.*registry\.npmjs\.org/i,                  confidence: 0.98 },
      { regex: /npm ERR!.*Conflicting peer dependency/i,                      confidence: 0.97 },
      { regex: /yarn error.*peer/i,                                           confidence: 0.92 },
      { regex: /pnpm.*peer dep.*conflict/i,                                   confidence: 0.92 },
      { regex: /npm install.*exited with code [^0\s]/i,                       confidence: 0.88 },
      { regex: /Could not resolve dependency/i,                               confidence: 0.88 },
    ],
  },

  // ── HEALTHCHECK_FAILURE ───────────────────────────────────────────────────
  {
    category: 'HEALTHCHECK_FAILURE',
    patterns: [
      { regex: /health.?check.*(?:failed|timeout)/i,                         confidence: 0.98 },
      { regex: /deployment.*health.*failed/i,                                  confidence: 0.97 },
      { regex: /container.*(?:unhealthy|failed health)/i,                     confidence: 0.97 },
      { regex: /railway.*health.*(?:fail|timeout)/i,                          confidence: 0.97 },
      { regex: /service.*unavailable|503 service unavailable/i,               confidence: 0.90 },
      { regex: /ECONNRESET.*(?:health|probe)/i,                               confidence: 0.92 },
      { regex: /readiness probe failed/i,                                     confidence: 0.98 },
      { regex: /liveness probe failed/i,                                      confidence: 0.98 },
      { regex: /startup probe failed/i,                                       confidence: 0.98 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all rules against the provided log lines and return every match,
 * sorted by confidence descending.
 *
 * @param {ParsedLogLine[]} lines
 * @returns {ClassifiedFailure[]}
 */
function classifyFailures(lines) {
  const results = [];

  for (const rule of RULES) {
    const matchedLines  = [];
    const captureGroups = [];
    let   maxConfidence = 0;
    let   matchCount    = 0;

    for (const line of lines) {
      const haystack = line.text || line.raw;

      for (const { regex, confidence, capture } of rule.patterns) {
        const m = regex.exec(haystack);
        if (!m) continue;

        if (!matchedLines.includes(line)) matchedLines.push(line);
        maxConfidence = Math.max(maxConfidence, confidence);
        matchCount++;

        if (capture !== undefined && m[capture]) {
          const cap = m[capture].trim();
          if (cap && !captureGroups.includes(cap)) captureGroups.push(cap);
        }
      }
    }

    if (matchCount === 0) continue;

    // Multi-match boost: each additional matched line adds 0.5% up to 3%
    const boost     = Math.min((matchCount - 1) * 0.005, 0.03);
    const finalConf = Math.min(+(maxConfidence + boost).toFixed(3), 1.0);

    results.push({
      category:     rule.category,
      confidence:   finalConf,
      matchedLines,
      captureGroups,
      ruleName:     rule.category,
    });
  }

  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

/**
 * Return the single highest-confidence failure, or UNKNOWN_FAILURE
 * if nothing matches with confidence ≥ 0.60.
 *
 * @param {ParsedLogLine[]} lines
 * @returns {ClassifiedFailure}
 */
function getPrimaryFailure(lines) {
  const all = classifyFailures(lines);

  if (all.length > 0 && all[0].confidence >= 0.60) {
    return all[0];
  }

  const errorLines = lines.filter((l) => l.severity === 'error');
  return {
    category:     'UNKNOWN_FAILURE',
    confidence:   0.25,
    matchedLines: errorLines.slice(0, 8),
    captureGroups: [],
    ruleName:     'UNKNOWN_FALLBACK',
  };
}

/**
 * Synthesize a failure record from a non-zero exit code with no log matches.
 * Useful when logs are empty but the process died.
 *
 * @param {number} exitCode
 * @returns {ClassifiedFailure}
 */
function failureFromExitCode(exitCode) {
  const base = {
    matchedLines:  [],
    captureGroups: [],
    ruleName:      'EXIT_CODE',
  };

  if (exitCode === 127) {
    return { ...base, category: 'START_COMMAND_FAILURE', confidence: 0.80 };
  }
  if (exitCode === 137) {
    // SIGKILL — OOM or timeout
    return { ...base, category: 'HEALTHCHECK_FAILURE', confidence: 0.65 };
  }
  return { ...base, category: 'UNKNOWN_FAILURE', confidence: 0.40 };
}

module.exports = { classifyFailures, getPrimaryFailure, failureFromExitCode };
