'use strict';

/**
 * Database Readiness Check
 *
 * If a database is present, verifies:
 * - connection string env var exists
 * - migration notes or schema files exist
 * - db client initialization exists
 */

const DB_KEYWORDS = {
  postgresql: ['pg', 'postgres', 'postgresql', 'pgclient', 'pool.query', 'knex'],
  mysql:      ['mysql2', 'mysql.createconnection', 'sequelize'],
  mongodb:    ['mongoose', 'mongodb', 'mongoclient', 'mongodburi'],
  sqlite:     ['better-sqlite3', 'sqlite3', 'database.db'],
  supabase:   ['supabase', '@supabase/supabase-js'],
  prisma:     ['prisma', '@prisma/client', 'prisma.schema'],
  drizzle:    ['drizzle-orm', 'drizzle'],
  redis:      ['redis', 'ioredis', 'redisclient'],
};

const DB_ENV_VARS = {
  postgresql: ['DATABASE_URL', 'POSTGRES_URL', 'POSTGRES_CONNECTION_STRING'],
  mysql:      ['DATABASE_URL', 'MYSQL_URL', 'MYSQL_CONNECTION_STRING'],
  mongodb:    ['MONGODB_URI', 'MONGO_URL', 'DATABASE_URL'],
  sqlite:     [],  // SQLite uses a local file, no env var needed
  supabase:   ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
  prisma:     ['DATABASE_URL'],
  drizzle:    ['DATABASE_URL'],
  redis:      ['REDIS_URL', 'REDIS_CONNECTION_STRING'],
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {import('./types').ReadinessInput} input
 * @returns {import('./types').DatabaseCheckResult}
 */
function checkDatabase(input) {
  const { files = {} } = input;
  const allContent  = Object.values(files).join('\n').toLowerCase();
  const filePaths   = Object.keys(files);

  /** @type {import('./types').ReadinessIssue[]} */
  const issues = [];

  // ── Detect DB type ────────────────────────────────────────────────────────
  const dbType = _detectDbType(allContent);

  if (!dbType) {
    return { detected: false, hasConnectionString: false, hasMigrationNotes: false, hasSchemaFile: false, issues: [], score: 100 };
  }

  // ── Connection string env var ─────────────────────────────────────────────
  const requiredVars = DB_ENV_VARS[dbType] || [];
  const hasConnectionString = requiredVars.length === 0
    || requiredVars.some(v => allContent.includes(v.toLowerCase()));

  if (!hasConnectionString && requiredVars.length > 0) {
    issues.push({
      severity: 'critical',
      category: 'database',
      message:  `${dbType} database detected but no connection string env var found (expected: ${requiredVars.join(' or ')})`,
      fix:      `Add ${requiredVars[0]}=your_connection_string to .env.example`,
    });
  }

  // ── Migration notes / schema ──────────────────────────────────────────────
  const hasMigrationNotes = filePaths.some(p =>
    p.includes('migration') || p.includes('migrate') ||
    p.endsWith('MIGRATIONS.md') || p.endsWith('SETUP.md') ||
    p.endsWith('SCHEMA.md'),
  );

  const hasSchemaFile = filePaths.some(p =>
    p.endsWith('schema.prisma') || p.endsWith('schema.sql') ||
    p.endsWith('schema.ts') || p.endsWith('schema.js') ||
    p.includes('drizzle') || p.includes('migrations/'),
  );

  if (!hasMigrationNotes && !hasSchemaFile && dbType !== 'redis') {
    issues.push({
      severity: 'info',
      category: 'database',
      message:  `${dbType} database detected but no schema file or migration notes found`,
      fix:      'Add a schema file (schema.prisma, schema.sql, etc.) or a MIGRATIONS.md with setup instructions',
    });
  }

  // ── Client initialization ─────────────────────────────────────────────────
  const hasClientInit = _detectClientInit(allContent, dbType);
  if (!hasClientInit) {
    issues.push({
      severity: 'warning',
      category: 'database',
      message:  `${dbType} database referenced but no client initialization found`,
      fix:      `Add a db.js or database.js file that creates and exports the ${dbType} client`,
    });
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'critical') score -= 35;
    else if (issue.severity === 'warning') score -= 15;
    else if (issue.severity === 'info') score -= 5;
  }
  score = Math.max(0, score);

  return {
    detected: true,
    dbType,
    hasConnectionString,
    hasMigrationNotes,
    hasSchemaFile,
    issues,
    score,
  };
}

// ── Private helpers ─────────────────────────────────────────────────────────

function _detectDbType(allContent) {
  for (const [type, keywords] of Object.entries(DB_KEYWORDS)) {
    if (keywords.some(kw => allContent.includes(kw))) return type;
  }
  return null;
}

function _detectClientInit(allContent, dbType) {
  const initPatterns = {
    postgresql: ['new pool(', 'createconnection(', 'pgclient('],
    mysql:      ['mysql.createconnection', 'mysql2.createconnection', 'sequelize('],
    mongodb:    ['mongoclient(', 'mongoose.connect('],
    sqlite:     ['new database(', 'sqlite3.database('],
    supabase:   ['createclient('],
    prisma:     ['new prismaclient(', 'prismaclient()'],
    drizzle:    ['drizzle('],
    redis:      ['createclient(', 'redis.createclient(', 'ioredis('],
  };

  const patterns = initPatterns[dbType] || [];
  return patterns.length === 0 || patterns.some(p => allContent.includes(p));
}

module.exports = { checkDatabase };
