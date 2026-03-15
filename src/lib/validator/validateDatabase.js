'use strict';

/**
 * DATABASE / BACKEND VALIDATION
 *
 * Only runs when intent.needsDatabase === true.
 *
 * Checks:
 *   - A schema or model file exists                             [critical]
 *   - A database client is initialized                          [critical]
 *   - CRUD operation patterns exist                             [major]
 *   - Key entities from blueprint are represented in schema     [major]
 *   - Database connection string is in .env.example            [medium]
 *
 * @param {import('./types').ValidatorContext} ctx
 * @returns {import('./types').ValidationCheckResult}
 */
function validateDatabase(ctx) {
  const { fileMap, filePaths, intent, blueprint } = ctx;
  /** @type {import('./types').ValidationIssue[]} */
  const issues = [];

  if (!intent.needsDatabase) {
    return { status: 'pass', issues: [] };
  }

  const allContent = _joinAllJsFiles(fileMap);

  // ── 1. Schema / model file ───────────────────────────────────────────────
  const schemaFilePatterns = [
    'schema', 'model', 'models/', 'prisma/',
    'db.js', 'database.js', 'db/', 'data/',
  ];
  const hasSchemaFile = schemaFilePatterns.some(pattern =>
    [...filePaths].some(p => p.includes(pattern))
  );

  if (!hasSchemaFile) {
    issues.push({
      id:         'missing_schema_file',
      severity:   'critical',
      message:    'No schema, model, or database definition file found — data layer is missing',
      suggestion: 'Create db.js or models/ directory with data schema definitions',
    });
  }

  // ── 2. Database client initialization ───────────────────────────────────
  const dbClientPatterns = [
    /new PrismaClient/,
    /mongoose\.connect\s*\(/,
    /createClient\s*\(/,
    /new Pool\s*\(/,
    /knex\s*\(/,
    /createPool\s*\(/,
    /drizzle\s*\(/,
    /openDatabase\s*\(/,
    /supabase\.createClient/,
    /createConnection\s*\(/,
    /new Sequelize\s*\(/,
  ];
  const hasDbClient = dbClientPatterns.some(p => p.test(allContent));

  if (!hasDbClient) {
    issues.push({
      id:         'missing_db_client',
      severity:   'critical',
      message:    'No database client initialization found (PrismaClient, mongoose.connect, createPool, etc.)',
      suggestion: 'Initialize a database client (e.g., new PrismaClient()) in a db.js or database.js file',
    });
  }

  // ── 3. CRUD operation patterns ───────────────────────────────────────────
  const crudPatterns = [
    /\.find\s*\(/,    /\.findOne\s*\(/,  /\.findMany\s*\(/,
    /\.create\s*\(/,  /\.insert\s*\(/,   /\.insertOne\s*\(/,
    /\.update\s*\(/,  /\.updateOne\s*\(/, /\.updateMany\s*\(/,
    /\.delete\s*\(/,  /\.deleteOne\s*\(/, /\.remove\s*\(/,
    /SELECT .+FROM/i, /INSERT INTO/i,     /UPDATE .+SET/i,
    /\.query\s*\(/,   /\.run\s*\(/,
  ];
  const hasCrud = crudPatterns.some(p => p.test(allContent));

  if (!hasCrud) {
    issues.push({
      id:         'missing_crud_operations',
      severity:   'major',
      message:    'No CRUD operation patterns found in any JS file — data persistence may be missing',
      suggestion: 'Implement create/read/update/delete operations against the database client',
    });
  }

  // ── 4. Key entities from blueprint represented ───────────────────────────
  const dataModels = blueprint.product?.dataModels || blueprint.dataModels || [];
  const allContentLower = allContent.toLowerCase();
  const missingModels = [];

  for (const model of dataModels.slice(0, 6)) { // check up to 6
    const modelName = (model.name || model).toLowerCase();
    if (modelName.length < 3) continue;
    if (!allContentLower.includes(modelName)) {
      missingModels.push(model.name || model);
    }
  }

  if (missingModels.length > 0) {
    issues.push({
      id:         `missing_data_models:${missingModels.join(',')}`,
      severity:   'major',
      message:    `Blueprint data model(s) not found in any JS file: ${missingModels.join(', ')}`,
      suggestion: `Define schema/model for: ${missingModels.join(', ')}`,
    });
  }

  // ── 5. Database connection env var ───────────────────────────────────────
  const envContent = fileMap.get('.env.example') || '';
  const hasDbEnvVar = /DATABASE_URL|DB_HOST|MONGO_URI|REDIS_URL|SUPABASE_URL/.test(allContent);
  const hasDbEnvDeclared = /DATABASE_URL|DB_HOST|MONGO_URI|REDIS_URL|SUPABASE_URL/.test(envContent);

  if (hasDbEnvVar && !hasDbEnvDeclared) {
    issues.push({
      id:         'missing_db_env_var',
      severity:   'medium',
      message:    'Database connection env var (DATABASE_URL, DB_HOST, etc.) is used in code but not in .env.example',
      file:       '.env.example',
      suggestion: 'Add DATABASE_URL=postgresql://user:password@localhost:5432/dbname to .env.example',
    });
  }

  return { status: _checkStatus(issues), issues };
}

function _joinAllJsFiles(fileMap) {
  const parts = [];
  for (const [p, content] of fileMap) {
    if ((p.endsWith('.js') || p.endsWith('.ts')) && content) parts.push(content);
  }
  return parts.join('\n');
}

/**
 * @param {import('./types').ValidationIssue[]} issues
 * @returns {import('./types').CheckStatus}
 */
function _checkStatus(issues) {
  if (issues.length === 0) return 'pass';
  if (issues.some(i => i.severity === 'critical' || i.severity === 'major')) return 'fail';
  return 'warning';
}

module.exports = { validateDatabase };
