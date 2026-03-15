'use strict';

/**
 * ENVIRONMENT VARIABLE REPAIR
 *
 * Adds missing env var entries to .env.example.
 * Creates .env.example if absent but env vars are needed.
 *
 * Safe to auto-repair: only adds new lines, never removes existing ones.
 *
 * @param {import('./types').RepairContext} ctx
 * @returns {import('./types').RepairIssueResult[]}
 */
function repairEnv(ctx) {
  const { fileMap, filePaths, issues, decisions, intent } = ctx;
  /** @type {import('./types').RepairIssueResult[]} */
  const results = [];

  // Determine which env-related issues are safe to repair
  const envIssues = issues.filter(i => {
    const d = decisions.get(i.id);
    return d && d.willAutoRepair && (
      i.id.startsWith('undeclared_env_var:') ||
      i.id.startsWith('missing_integration_env:') ||
      i.id === 'missing_env_example' ||
      i.id === 'missing_env_example_with_vars' ||
      i.id === 'missing_env_example_deploy' ||
      i.id === 'empty_env_example' ||
      i.id === 'missing_stripe_secret_env' ||
      i.id === 'missing_stripe_publishable_env' ||
      i.id === 'missing_db_env_var'
    );
  });

  if (envIssues.length === 0) return results;

  // Parse existing .env.example (or start empty)
  const existingContent = fileMap.get('.env.example') || '';
  const existingLines   = existingContent.split('\n');

  // Collect currently declared var names
  const declaredVars = new Set();
  for (const line of existingLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) declaredVars.add(trimmed.slice(0, eqIdx).trim());
  }

  // Gather all vars to add
  const toAdd = new Map(); // varName → placeholder
  const addedBy = new Map(); // varName → issueId

  for (const issue of envIssues) {
    if (issue.id.startsWith('undeclared_env_var:')) {
      const varName = issue.id.slice('undeclared_env_var:'.length);
      if (!declaredVars.has(varName) && !toAdd.has(varName)) {
        toAdd.set(varName, _placeholder(varName));
        addedBy.set(varName, issue.id);
      }
    } else if (issue.id.startsWith('missing_integration_env:')) {
      // Format: missing_integration_env:serviceName:VARNAME
      const parts = issue.id.split(':');
      const varName = parts[parts.length - 1];
      if (varName && !declaredVars.has(varName) && !toAdd.has(varName)) {
        toAdd.set(varName, _placeholder(varName));
        addedBy.set(varName, issue.id);
      }
    } else if (issue.id === 'missing_stripe_secret_env') {
      if (!declaredVars.has('STRIPE_SECRET_KEY')) {
        toAdd.set('STRIPE_SECRET_KEY', 'sk_test_your_stripe_secret_key');
        addedBy.set('STRIPE_SECRET_KEY', issue.id);
      }
    } else if (issue.id === 'missing_stripe_publishable_env') {
      if (!declaredVars.has('STRIPE_PUBLISHABLE_KEY')) {
        toAdd.set('STRIPE_PUBLISHABLE_KEY', 'pk_test_your_stripe_publishable_key');
        addedBy.set('STRIPE_PUBLISHABLE_KEY', issue.id);
      }
    }
  }

  // Always add base vars when creating a new .env.example
  const isCreatingNew = !filePaths.has('.env.example');
  if (isCreatingNew) {
    if (!declaredVars.has('PORT')     && !toAdd.has('PORT'))     toAdd.set('PORT',     '3000');
    if (!declaredVars.has('NODE_ENV') && !toAdd.has('NODE_ENV')) toAdd.set('NODE_ENV', 'development');
  }

  // Also add standard env vars based on intent
  if (intent.needsAuth && !declaredVars.has('JWT_SECRET') && !toAdd.has('JWT_SECRET')) {
    toAdd.set('JWT_SECRET', 'change-me-to-a-secure-random-string');
  }
  if (intent.needsDatabase) {
    if (!declaredVars.has('DATABASE_URL') && !toAdd.has('DATABASE_URL')) {
      toAdd.set('DATABASE_URL', 'postgresql://user:password@localhost:5432/dbname');
    }
  }

  if (toAdd.size === 0 && existingContent.trim().length > 0) return results;

  // Build new .env.example content
  let newContent = existingContent.trimEnd();
  if (newContent.length > 0 && !newContent.endsWith('\n')) newContent += '\n';

  if (toAdd.size > 0) {
    newContent += '\n# ── Auto-added by Zyra repair pass ──────────────────────────────────────────\n';

    // Group by service category
    const groups = _groupVarsByCategory([...toAdd.entries()]);
    for (const [groupName, vars] of groups) {
      if (vars.length === 0) continue;
      newContent += `# ${groupName}\n`;
      for (const [varName, placeholder] of vars) {
        newContent += `${varName}=${placeholder}\n`;
      }
      newContent += '\n';
    }
  }

  // Write updated .env.example
  const isCreating = isCreatingNew;
  fileMap.set('.env.example', newContent);
  filePaths.add('.env.example');

  // Record results for each added var
  for (const [varName, issueId] of addedBy) {
    results.push({
      issueId,
      action: 'added_env_var',
      path:   '.env.example',
      reason: `Added ${varName} to .env.example`,
      safety: 'safe_auto_repair',
      confidence: 0.95,
    });
  }

  // Also record the file creation/update action
  results.push({
    issueId: isCreating ? 'missing_env_example' : 'env_example_updated',
    action:  isCreating ? 'created_file' : 'updated_file',
    path:    '.env.example',
    reason:  isCreating
      ? 'Created .env.example with required environment variable placeholders'
      : `Added ${toAdd.size} missing environment variable(s) to .env.example`,
    safety:     'safe_auto_repair',
    confidence: 0.95,
  });

  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a sensible placeholder value for a given env var name.
 * @param {string} varName
 * @returns {string}
 */
function _placeholder(varName) {
  const name = varName.toUpperCase();
  if (name.includes('KEY'))       return 'your_api_key_here';
  if (name.includes('SECRET'))    return 'your_secret_here';
  if (name.includes('PASSWORD'))  return 'your_password_here';
  if (name.includes('TOKEN'))     return 'your_token_here';
  if (name.includes('URL'))       return 'https://your-service-url';
  if (name.includes('SID'))       return 'your_account_sid';
  if (name.includes('ID'))        return 'your_client_id';
  if (name.includes('PORT'))      return '3000';
  return 'your_value_here';
}

/**
 * Groups env vars by service category for cleaner .env.example output.
 * @param {Array<[string, string]>} entries
 * @returns {Map<string, Array<[string, string]>>}
 */
function _groupVarsByCategory(entries) {
  const groups = new Map([
    ['App config',    []],
    ['Database',      []],
    ['Authentication',[]],
    ['Stripe',        []],
    ['OpenAI',        []],
    ['Email',         []],
    ['Storage',       []],
    ['Other',         []],
  ]);

  for (const [varName, placeholder] of entries) {
    const upper = varName.toUpperCase();
    if (/^PORT$|^NODE_ENV$|^APP_URL$/.test(upper))         groups.get('App config').push([varName, placeholder]);
    else if (/DATABASE|DB_|MONGO|REDIS|SUPABASE/.test(upper)) groups.get('Database').push([varName, placeholder]);
    else if (/JWT|SESSION|AUTH/.test(upper))               groups.get('Authentication').push([varName, placeholder]);
    else if (/STRIPE/.test(upper))                         groups.get('Stripe').push([varName, placeholder]);
    else if (/OPENAI|GPT|ANTHROPIC|CLAUDE/.test(upper))   groups.get('OpenAI').push([varName, placeholder]);
    else if (/SENDGRID|SMTP|EMAIL|TWILIO|MAILGUN/.test(upper)) groups.get('Email').push([varName, placeholder]);
    else if (/AWS|S3|FIREBASE|CLOUDINARY|STORAGE/.test(upper)) groups.get('Storage').push([varName, placeholder]);
    else                                                    groups.get('Other').push([varName, placeholder]);
  }

  // Filter out empty groups
  for (const [key, list] of groups) {
    if (list.length === 0) groups.delete(key);
  }

  return groups;
}

module.exports = { repairEnv };
