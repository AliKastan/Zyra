'use strict';

/**
 * Deployment Planning Checks
 *
 * Verifies deployment-critical planning:
 * - dynamic port usage
 * - health route planning
 * - CORS / callback URL safety
 * - deployment target compatibility
 */

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {import('./types').PreventionInput} input
 * @returns {import('./types').PreventionIssue[]}
 */
function checkDeploymentPlanning(input) {
  const { intent = {}, stack = {}, blueprint = {}, product = {}, complexityReport = null } = input;

  const issues = [];
  const allText  = _buildAllText(intent, product, blueprint, stack);
  const isServer = _isServerApp(intent, stack, blueprint);
  const fileList = _getFileList(stack, blueprint);

  // ── Dynamic port ──────────────────────────────────────────────────────────
  if (isServer) {
    const portMentioned = allText.includes('process.env.port') || allText.includes('env.port');
    const hardcodedPort = /port\s*[=:]\s*[0-9]{4}/.test(allText) && !portMentioned;

    if (!portMentioned) {
      issues.push({
        id: 'server-needs-dynamic-port',
        category: 'port_config',
        severity: 'high',
        action: 'generation_hint_added',
        reason: 'Cloud deployment platforms (Railway, Render, Heroku) assign ports dynamically via PORT env var. Hardcoded ports will cause deployment failures.',
        fix: 'Ensure server startup uses: const PORT = process.env.PORT || 3000',
      });
    }
  }

  // ── Health route ──────────────────────────────────────────────────────────
  if (isServer) {
    const hasHealthRoute = (
      allText.includes('/health') ||
      allText.includes('healthcheck') ||
      allText.includes('health route') ||
      fileList.some(f => f.includes('health'))
    );

    if (!hasHealthRoute) {
      issues.push({
        id: 'server-missing-health-route',
        category: 'healthcheck',
        severity: 'medium',
        action: 'generation_hint_added',
        reason: 'Deployment platforms use health checks to detect when the app is ready. A missing /health route causes deployment failures on Railway, Render, and Docker.',
        fix: 'Add GET /health route that returns { ok: true, uptime: ... }',
      });
    }
  }

  // ── Localhost / hardcoded callback URLs ───────────────────────────────────
  if (allText.includes('localhost') && isServer) {
    issues.push({
      id: 'localhost-callback-risk',
      category: 'deployment',
      severity: 'low',
      action: 'warning_only',
      reason: 'References to localhost in server config may break in deployed environments.',
      fix: 'Use process.env.BASE_URL or process.env.APP_URL instead of hardcoded localhost URLs',
    });
  }

  // ── Missing .env.example ──────────────────────────────────────────────────
  const hasEnvExample = fileList.some(f =>
    f === '.env.example' || f.endsWith('/.env.example') || f === '.env.sample',
  );

  if (!hasEnvExample && isServer) {
    issues.push({
      id: 'missing-env-example-plan',
      category: 'env',
      severity: 'medium',
      action: 'safe_default_injected',
      reason: '.env.example is expected by developers and CI/CD systems. Without it, required env vars are invisible.',
      fix: 'Add .env.example to planned files listing all required environment variables',
    });
  }

  // ── CORS planning ─────────────────────────────────────────────────────────
  const hasApi = allText.includes('api') || allText.includes('rest') || allText.includes('endpoint');
  if (isServer && hasApi && !allText.includes('cors')) {
    issues.push({
      id: 'api-server-missing-cors-plan',
      category: 'backend_foundation',
      severity: 'low',
      action: 'generation_hint_added',
      reason: 'API servers without CORS configuration will fail when accessed from browser-based frontends on different origins.',
      fix: 'Add cors middleware to the server plan (npm install cors)',
    });
  }

  return issues;
}

// ── Private helpers ─────────────────────────────────────────────────────────

function _isServerApp(intent, stack, blueprint) {
  const appType = (intent.appType || '').toLowerCase();
  const runtime = (stack.tech?.runtime || stack.runtime || '').toLowerCase();
  if (appType === 'mobile') return false;
  if (appType === 'static' || appType === 'landing-page') return false;
  if (stack.backend || stack.tech?.backend) return true;
  if (runtime === 'node') return true;

  const files = _getFileList(stack, blueprint);
  return files.some(f => f.endsWith('server.js') || f.endsWith('src/index.js'));
}

function _getFileList(stack, blueprint) {
  return [...new Set([...(stack?.files || []), ...(blueprint?.fileList || [])])];
}

function _buildAllText(intent, product, blueprint, stack) {
  return [
    intent.appType || '',
    (intent.features || []).map(f => `${f.name} ${f.description || ''}`).join(' '),
    product.summary || '',
    (product.pages || []).map(p => p.name || p).join(' '),
    blueprint.designNotes || '',
    (blueprint._designSpec?.generationHints || []).join(' '),
    (stack?.files || []).join(' '),
  ].join(' ').toLowerCase();
}

module.exports = { checkDeploymentPlanning };
