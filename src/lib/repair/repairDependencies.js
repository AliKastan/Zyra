'use strict';

/**
 * DEPENDENCY REPAIR
 *
 * Adds missing package.json dependencies for packages that are imported
 * in generated code but not declared.
 *
 * Safe: only ADDS entries, never removes or changes existing ones.
 * Uses known version ranges for popular packages.
 *
 * @param {import('./types').RepairContext} ctx
 * @returns {import('./types').RepairIssueResult[]}
 */
function repairDependencies(ctx) {
  const { fileMap, filePaths, issues, decisions } = ctx;
  /** @type {import('./types').RepairIssueResult[]} */
  const results = [];

  if (!filePaths.has('package.json')) return results;

  // Find dependency issues that are safe to auto-repair
  const depIssues = issues.filter(i => {
    const d = decisions.get(i.id);
    return d && d.willAutoRepair && i.id.startsWith('missing_dependency:');
  });

  if (depIssues.length === 0) return results;

  // Parse package.json
  let pkg;
  try {
    pkg = JSON.parse(fileMap.get('package.json'));
  } catch {
    return results; // invalid JSON — already flagged by validator
  }

  if (!pkg.dependencies) pkg.dependencies = {};

  let changed = false;

  for (const issue of depIssues) {
    const pkgName = issue.id.slice('missing_dependency:'.length);
    if (!pkgName) continue;

    // Already declared (safety check)
    if (pkg.dependencies[pkgName] || pkg.devDependencies?.[pkgName]) continue;

    const version = KNOWN_VERSIONS[pkgName] || '*';
    pkg.dependencies[pkgName] = version;
    changed = true;

    results.push({
      issueId:    issue.id,
      action:     'added_dependency',
      path:       'package.json',
      reason:     `Added "${pkgName}@${version}" to package.json dependencies`,
      safety:     'safe_auto_repair',
      confidence: 0.90,
    });
  }

  if (changed) {
    // Sort dependencies alphabetically for clean output
    pkg.dependencies = _sortObject(pkg.dependencies);
    fileMap.set('package.json', JSON.stringify(pkg, null, 2));
  }

  return results;
}

// ── Known version ranges for common packages ──────────────────────────────────

const KNOWN_VERSIONS = {
  // Core
  express:          '^4.18.3',
  fastify:          '^4.26.1',
  koa:              '^2.15.0',

  // Auth
  bcrypt:           '^5.1.1',
  bcryptjs:         '^2.4.3',
  jsonwebtoken:     '^9.0.2',
  passport:         '^0.7.0',

  // DB
  mongoose:         '^8.2.0',
  prisma:           '^5.10.0',
  '@prisma/client': '^5.10.0',
  knex:             '^3.1.0',
  pg:               '^8.11.3',
  mysql2:           '^3.9.1',
  sqlite3:          '^5.1.7',
  redis:            '^4.6.13',

  // Payments
  stripe:           '^14.21.0',

  // AI / integrations
  openai:           '^4.28.0',
  '@anthropic-ai/sdk': '^0.19.0',
  '@sendgrid/mail': '^8.1.0',
  twilio:           '^5.0.0',
  nodemailer:       '^6.9.11',

  // Storage / cloud
  '@aws-sdk/client-s3':    '^3.525.0',
  firebase:                '^10.8.0',
  'firebase-admin':        '^12.0.0',
  '@supabase/supabase-js': '^2.39.7',
  cloudinary:              '^2.0.1',

  // Utilities
  axios:         '^1.6.7',
  dotenv:        '^16.4.5',
  cors:          '^2.8.5',
  helmet:        '^7.1.0',
  uuid:          '^9.0.1',
  'fs-extra':    '^11.2.0',
  lodash:        '^4.17.21',
  dayjs:         '^1.11.10',
  zod:           '^3.22.4',
  joi:           '^17.12.1',
  multer:        '^1.4.5-lts.1',
  sharp:         '^0.33.2',
  'cookie-parser': '^1.4.6',
  'body-parser':   '^1.20.2',
  'express-rate-limit': '^7.2.0',
  morgan:        '^1.10.0',
  ws:            '^8.16.0',
  'socket.io':   '^4.7.4',
};

function _sortObject(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

module.exports = { repairDependencies };
