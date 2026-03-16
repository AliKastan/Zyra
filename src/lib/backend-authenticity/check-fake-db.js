'use strict';

/**
 * Fake Database Detector
 *
 * Detects in-memory arrays/objects used as fake "databases" with no
 * real persistence between server restarts. Also detects missing DB
 * connection setup when database operations are expected.
 */

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {Object} files - Normalized file map { path: content }
 * @returns {import('./types').AuthenticityIssue[]}
 */
function checkFakeDb(files) {
  const issues = [];

  const allContent = Object.values(files).join('\n');

  // Determine if any real DB is configured
  const hasRealDb = _hasRealDbConnection(files, allContent);

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue;
    if (/\.(test|spec)\.[jt]sx?$/.test(path)) continue;
    if (!_isBackendFile(path)) continue;

    // ── 1. In-memory array used as data store ─────────────────────────────
    // let users = [...] or const posts = [{...}, {...}]
    const IN_MEM_RE = /(?:let|var)\s+(users|posts|products|items|orders|todos|tasks|data|records|entries|comments|messages|customers)\s*=\s*\[/gi;
    let m;
    while ((m = IN_MEM_RE.exec(content)) !== null) {
      const varName = m[1];
      issues.push({
        id:       `fake-db-in-memory-${varName}-${_slug(path)}`,
        category: 'fake_db',
        severity: 'critical',
        message:  `${path} uses an in-memory array "${varName}" as a database — data is lost on every server restart.`,
        fix:      `Replace the in-memory "${varName}" array with real database queries (Prisma, Mongoose, pg, Supabase, etc.).`,
        file:     path,
        pattern:  `let ${varName} = [...]`,
      });
      break; // one per file
    }

    // ── 2. Hardcoded seed data returned from routes ───────────────────────
    // Arrays of objects with id/name/title fields returned directly
    if (
      /res\s*\.\s*json\s*\(\s*\[/.test(content) &&
      /\{\s*id\s*:\s*[0-9]/.test(content) &&
      !hasRealDb
    ) {
      issues.push({
        id:       `fake-db-hardcoded-response-${_slug(path)}`,
        category: 'fake_db',
        severity: 'high',
        message:  `${path} returns a hardcoded data array from a route with no database backing.`,
        fix:      'Query a real database and return live data, or mark this as a placeholder endpoint.',
        file:     path,
        pattern:  'res.json([{ id: 1, ... }])',
      });
    }

    // ── 3. CRUD operations on in-memory array (push/splice/filter) ────────
    if (
      /\.(push|splice|findIndex)\s*\(/.test(content) &&
      /\b(users|posts|products|orders|items|todos)\b/.test(content) &&
      !hasRealDb
    ) {
      issues.push({
        id:       `fake-db-array-mutation-${_slug(path)}`,
        category: 'fake_db',
        severity: 'high',
        message:  `${path} mutates an in-memory array as if it were a database (push/splice/findIndex on data collections).`,
        fix:      'Use real database INSERT/UPDATE/DELETE operations with a persistent data store.',
        file:     path,
        pattern:  'users.push({...}) / posts.splice(idx, 1)',
      });
    }
  }

  // ── 4. App implies DB but no connection string is configured ────────────
  const impliesDb = (
    /(?:mongoose|prisma|sequelize|pg|mysql2|knex|drizzle|typeorm)/i.test(allContent) &&
    /(?:find|create|save|query|insert|select)/i.test(allContent)
  );

  const envFiles  = Object.entries(files)
    .filter(([p]) => p.endsWith('.env.example') || p.endsWith('.env'))
    .map(([, c]) => c).join('\n');

  const hasDbEnvVar = /(?:DATABASE_URL|MONGO_URI|MONGODB_URI|POSTGRES|MYSQL|DB_HOST|SUPABASE_URL)/i.test(envFiles + allContent);

  if (impliesDb && !hasDbEnvVar) {
    issues.push({
      id:       'fake-db-no-connection-string',
      category: 'fake_db',
      severity: 'high',
      message:  'Project imports a database ORM/client but no DATABASE_URL or equivalent env var is defined.',
      fix:      'Add DATABASE_URL (or MONGO_URI / POSTGRES_URL) to .env.example and initialise the DB client at startup.',
    });
  }

  return _dedup(issues);
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _hasRealDbConnection(files, allContent) {
  // Check for ORM imports AND a connection call
  const hasOrm = /(?:mongoose\.connect|new PrismaClient|createPool|createClient|drizzle\(|knex\()/i.test(allContent);
  if (hasOrm) return true;

  // Check for supabase client
  if (/createClient\s*\(\s*process\.env/.test(allContent)) return true;

  // Check for raw DB env var
  const envContent = Object.entries(files)
    .filter(([p]) => p.endsWith('.env.example') || p.endsWith('.env'))
    .map(([, c]) => c).join('\n');

  return /DATABASE_URL|MONGO_URI|MONGODB_URI|SUPABASE_URL/i.test(envContent);
}

function _isBackendFile(path) {
  if (/\.(test|spec)\.[jt]sx?$/.test(path)) return false;
  return (
    path.endsWith('server.js') || path.endsWith('server.ts') ||
    path.endsWith('app.js')    || path.endsWith('app.ts') ||
    path.includes('routes/')   || path.includes('controllers/') ||
    path.includes('models/')   || path.includes('services/') ||
    path.endsWith('src/index.js') || path.endsWith('src/index.ts')
  );
}

function _dedup(issues) {
  const seen = new Set();
  return issues.filter(i => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
}

function _slug(str) {
  return str.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').slice(0, 40);
}

module.exports = { checkFakeDb };
