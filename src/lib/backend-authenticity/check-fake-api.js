'use strict';

/**
 * Fake API Detector
 *
 * Detects frontend code that calls API endpoints that have no
 * corresponding backend route in the generated files.
 * Also detects routes that immediately return hardcoded data
 * with no actual logic.
 */

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {Object} files - Normalized file map { path: content }
 * @returns {import('./types').AuthenticityIssue[]}
 */
function checkFakeApi(files) {
  const issues = [];

  const frontendPaths  = _filterFiles(files, _isFrontendFile);
  const backendPaths   = _filterFiles(files, _isBackendFile);
  const backendContent = backendPaths.map(p => files[p]).join('\n');

  // ── 1. Frontend calls /api/* routes not defined in backend ──────────────
  const calledRoutes   = _extractCalledApiRoutes(frontendPaths, files);
  const definedRoutes  = _extractDefinedRoutes(backendContent);

  for (const route of calledRoutes) {
    const matched = _routeIsCovered(route, definedRoutes);
    if (!matched) {
      issues.push({
        id:       `fake-api-missing-route-${_slug(route.path)}`,
        category: 'fake_api',
        severity: 'high',
        message:  `Frontend calls ${route.method.toUpperCase()} ${route.path} but no matching backend route was found.`,
        fix:      `Implement the ${route.method.toUpperCase()} ${route.path} route in the backend, or remove the frontend call.`,
        file:     route.file,
        pattern:  route.raw,
      });
    }
  }

  // ── 2. Backend routes that return only hardcoded stub data ──────────────
  for (const [path, content] of Object.entries(files)) {
    if (!_isBackendFile(path)) continue;
    const stubRoutes = _detectStubRoutes(content, path);
    issues.push(...stubRoutes);
  }

  // ── 3. setTimeout-simulated async (fake latency over real calls) ────────
  for (const [path, content] of Object.entries(files)) {
    if (!_isFrontendFile(path) && !_isBackendFile(path)) continue;
    if (typeof content !== 'string') continue;

    // setTimeout(resolve, N) inside a function that looks like a data-fetcher
    if (/setTimeout\s*\(\s*(resolve|cb|callback)\s*,\s*\d+/.test(content) &&
        /\bfetch\b|\baxios\b|\bapi\b/i.test(content)) {
      issues.push({
        id:       `fake-api-simulated-latency-${_slug(path)}`,
        category: 'fake_api',
        severity: 'medium',
        message:  `${path} uses setTimeout to simulate async API calls instead of making real network requests.`,
        fix:      'Replace setTimeout-based mock with a real fetch/axios call to an implemented API endpoint.',
        file:     path,
        pattern:  'setTimeout(resolve|cb, N)',
      });
    }
  }

  return issues;
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _filterFiles(files, pred) {
  return Object.keys(files).filter(pred);
}

function _isFrontendFile(path) {
  if (/\.(test|spec)\.[jt]sx?$/.test(path)) return false;
  return /\.(jsx?|tsx?)$/.test(path) && (
    path.includes('components') || path.includes('pages') || path.includes('views') ||
    path.includes('src/') || path.endsWith('App.js') || path.endsWith('App.jsx') ||
    path.endsWith('App.tsx') || path.includes('frontend') || path.includes('client')
  );
}

function _isBackendFile(path) {
  if (/\.(test|spec)\.[jt]sx?$/.test(path)) return false;
  return (
    path.endsWith('server.js') || path.endsWith('server.ts') ||
    path.endsWith('app.js')    || path.endsWith('app.ts') ||
    path.includes('routes/')   || path.includes('controllers/') ||
    path.includes('api/')      || path.endsWith('src/index.js') ||
    path.endsWith('src/index.ts')
  );
}

// Extract fetch/axios calls to /api/* paths from frontend files
function _extractCalledApiRoutes(paths, files) {
  const routes = [];
  const CALL_RE = /(?:fetch|axios\.(?:get|post|put|patch|delete))\s*\(\s*[`'"](\/api\/[^`'"?\s]+)/gi;
  const FULL_RE = /(?:fetch|axios\.(get|post|put|patch|delete))\s*\(\s*[`'"](\/api\/[^`'"?\s]+)/gi;

  for (const path of paths) {
    const content = files[path];
    if (typeof content !== 'string') continue;

    let m;
    FULL_RE.lastIndex = 0;
    while ((m = FULL_RE.exec(content)) !== null) {
      const method = m[1] || 'get';
      const apiPath = m[2].replace(/\/:[^/]+/g, '/:param').split('?')[0];
      routes.push({ method, path: apiPath, file: path, raw: m[0] });
    }
  }

  // Deduplicate by method+path
  const seen = new Set();
  return routes.filter(r => {
    const key = `${r.method}:${r.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Extract defined routes from backend content
function _extractDefinedRoutes(content) {
  const routes = new Set();
  const ROUTE_RE = /(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*[`'"](\/[^`'"]+)/gi;
  let m;
  while ((m = ROUTE_RE.exec(content)) !== null) {
    const method = m[1].toLowerCase();
    const path   = m[2].replace(/\/:[^/]+/g, '/:param').split('?')[0];
    routes.add(`${method}:${path}`);
  }
  return routes;
}

function _routeIsCovered(route, definedRoutes) {
  // Exact match
  if (definedRoutes.has(`${route.method}:${route.path}`)) return true;
  // GET /api/users/:param matches GET /api/users/:id etc.
  for (const def of definedRoutes) {
    const [dm, dp] = def.split(':').slice(0, 2);
    if (dm !== route.method) continue;
    const rParts = route.path.split('/');
    const dParts = (`/` + def.slice(def.indexOf(':') + 1)).split('/');
    if (rParts.length !== dParts.length) continue;
    const matches = rParts.every((seg, i) => dParts[i] === seg || dParts[i].startsWith(':') || seg.startsWith(':'));
    if (matches) return true;
  }
  return false;
}

// Detect routes that return only static/hardcoded data
function _detectStubRoutes(content, path) {
  const issues = [];

  // Pattern: route handler whose entire body is res.json({ ... hardcoded ... })
  // with no DB call, no service call, nothing async
  const STUB_RE = /(?:app|router)\.(get|post|put|patch|delete)\s*\([^,]+,\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{([^}]{0,300})\}/g;
  let m;
  while ((m = STUB_RE.exec(content)) !== null) {
    const method  = m[1];
    const body    = m[2];

    const hasRealLogic = (
      /await\s+\w+/.test(body)   ||   // await anything
      /db\.|prisma\.|mongoose\.|pool\.|supabase\./.test(body) ||
      /require\(/.test(body)     ||
      /service\.|repository\.|model\./.test(body)
    );

    const isStub = (
      !hasRealLogic &&
      /res\s*\.\s*(?:json|send)\s*\(/.test(body) &&
      (
        /success\s*:\s*true/.test(body) ||
        /\[\s*\{/.test(body) ||          // array literal
        /message\s*:\s*['"`]/.test(body)
      )
    );

    if (isStub) {
      issues.push({
        id:       `fake-api-stub-route-${_slug(path)}-${method}`,
        category: 'fake_api',
        severity: 'high',
        message:  `Backend route (${method.toUpperCase()}) in ${path} returns hardcoded stub data with no real logic.`,
        fix:      'Implement real database queries, service calls, or business logic in the route handler.',
        file:     path,
        pattern:  'res.json({ hardcoded })',
      });
      break; // one per file is enough
    }
  }

  return issues;
}

function _slug(str) {
  return str.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').slice(0, 40);
}

module.exports = { checkFakeApi };
