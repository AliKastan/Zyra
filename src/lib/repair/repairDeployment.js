'use strict';

/**
 * DEPLOYMENT READINESS REPAIR
 *
 * Fixes deployment-related issues:
 *   - Injects a health check route into the server file
 *   - Fixes hardcoded port to use process.env.PORT
 *   - Replaces hardcoded localhost URLs with env var references
 *   - Creates a minimal README.md if missing
 *
 * @param {import('./types').RepairContext} ctx
 * @returns {import('./types').RepairIssueResult[]}
 */
function repairDeployment(ctx) {
  const { fileMap, filePaths, issues, decisions, blueprint, intent } = ctx;
  /** @type {import('./types').RepairIssueResult[]} */
  const results = [];

  const deployIssues = issues.filter(i => {
    const d = decisions.get(i.id);
    return d && d.willAutoRepair && (
      i.id === 'missing_health_route' ||
      i.id === 'hardcoded_port' ||
      i.id === 'missing_readme_deploy' ||
      i.id === 'missing_readme' ||
      i.id === 'thin_readme' ||
      i.id.startsWith('hardcoded_localhost:')
    );
  });

  if (deployIssues.length === 0) return results;

  const issueIds = new Set(deployIssues.map(i => i.id));

  // ── 1. Health route ────────────────────────────────────────────────────────
  if (issueIds.has('missing_health_route')) {
    const serverFile = _findServerFile(filePaths, fileMap);
    if (serverFile) {
      const content     = fileMap.get(serverFile);
      const withHealth  = _injectHealthRoute(content);
      if (withHealth !== content) {
        fileMap.set(serverFile, withHealth);
        results.push({
          issueId:    'missing_health_route',
          action:     'injected_code',
          path:       serverFile,
          reason:     `Injected GET /health route into ${serverFile}`,
          safety:     'safe_auto_repair',
          confidence: 0.92,
        });
      }
    }
  }

  // ── 2. Hardcoded port ─────────────────────────────────────────────────────
  if (issueIds.has('hardcoded_port')) {
    const serverFile = _findServerFile(filePaths, fileMap);
    if (serverFile) {
      const content  = fileMap.get(serverFile);
      const fixed    = content.replace(
        /app\.listen\s*\(\s*(\d{4,5})/g,
        (_, port) => `app.listen(process.env.PORT || ${port}`
      );
      if (fixed !== content) {
        fileMap.set(serverFile, fixed);
        results.push({
          issueId:    'hardcoded_port',
          action:     'updated_file',
          path:       serverFile,
          reason:     `Replaced hardcoded port with process.env.PORT in ${serverFile}`,
          safety:     'safe_auto_repair',
          confidence: 0.95,
        });
      }
    }
  }

  // ── 3. Hardcoded localhost URLs ───────────────────────────────────────────
  for (const issue of deployIssues) {
    if (!issue.id.startsWith('hardcoded_localhost:')) continue;
    const filePath = issue.id.slice('hardcoded_localhost:'.length);
    if (!filePaths.has(filePath)) continue;

    const content = fileMap.get(filePath);
    // Replace 'http://localhost:PORT' with a process.env.API_URL reference
    const fixed = content.replace(
      /['"]https?:\/\/localhost:(\d+)([^'"]*)['"]/g,
      (_, port, path) => `(process.env.API_URL || \`http://localhost:${port}\`)${path ? ` + '${path}'` : ''}`
    );
    if (fixed !== content) {
      fileMap.set(filePath, fixed);
      results.push({
        issueId:    issue.id,
        action:     'updated_file',
        path:       filePath,
        reason:     `Replaced hardcoded localhost URL with process.env.API_URL in ${filePath}`,
        safety:     'safe_auto_repair',
        confidence: 0.85,
      });
    }
  }

  // ── 4. README.md ──────────────────────────────────────────────────────────
  const needsReadme = issueIds.has('missing_readme_deploy') ||
    issueIds.has('missing_readme') ||
    issueIds.has('thin_readme');

  if (needsReadme && !filePaths.has('README.md')) {
    const readme = _generateReadme(blueprint, intent);
    fileMap.set('README.md', readme);
    filePaths.add('README.md');
    results.push({
      issueId:    'missing_readme',
      action:     'created_file',
      path:       'README.md',
      reason:     'Created README.md with project setup and deployment documentation',
      safety:     'safe_auto_repair',
      confidence: 0.90,
    });
  }

  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _findServerFile(filePaths, fileMap) {
  const candidates = ['server.js', 'app.js', 'index.js', 'src/server.js', 'src/app.js', 'src/index.js'];
  for (const c of candidates) {
    if (filePaths.has(c)) return c;
  }
  // Find file that contains app.listen
  for (const [p, content] of fileMap) {
    if (p.endsWith('.js') && content && /app\.listen\s*\(/.test(content)) return p;
  }
  return null;
}

function _injectHealthRoute(serverContent) {
  const healthRoute = `
// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
`;

  // Already has health route
  if (/['"]\/health['"]/.test(serverContent)) return serverContent;

  // Inject before app.listen
  if (/app\.listen\s*\(/.test(serverContent)) {
    return serverContent.replace(/(app\.listen\s*\()/, `${healthRoute}$1`);
  }

  // Append at end
  return serverContent + healthRoute;
}

function _generateReadme(blueprint, intent) {
  const projectName  = blueprint.projectName || 'Project';
  const appType      = intent.appType || 'web app';
  const needsAuth    = intent.needsAuth ? '\n- `JWT_SECRET` — secret key for JWT token signing' : '';
  const needsDb      = intent.needsDatabase ? '\n- `DATABASE_URL` — connection string for your database' : '';
  const needsPayments = intent.needsPayments ? '\n- `STRIPE_SECRET_KEY` — Stripe secret key\n- `STRIPE_PUBLISHABLE_KEY` — Stripe publishable key' : '';

  return `# ${projectName}

A ${appType} built with Zyra.

## Getting Started

### Prerequisites

- Node.js >= 18
- npm or yarn

### Installation

\`\`\`bash
npm install
\`\`\`

### Environment Variables

Copy \`.env.example\` to \`.env\` and fill in the values:

\`\`\`bash
cp .env.example .env
\`\`\`

Required variables:
- \`PORT\` — server port (default: 3000)
- \`NODE_ENV\` — \`development\` or \`production\`${needsAuth}${needsDb}${needsPayments}

### Running locally

\`\`\`bash
npm run dev
\`\`\`

### Production

\`\`\`bash
npm start
\`\`\`

## Deployment

### Railway

1. Connect your repository to Railway
2. Add environment variables from \`.env.example\`
3. Railway will auto-detect \`npm start\`

### Vercel

1. Import your repository
2. Set environment variables in project settings
3. Deploy

## Health Check

\`GET /health\` — returns \`{ "status": "ok" }\`
`;
}

module.exports = { repairDeployment };
