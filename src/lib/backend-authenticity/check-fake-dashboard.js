'use strict';

/**
 * Fake Dashboard Detector
 *
 * Detects dashboard/analytics components that display static metrics,
 * hardcoded numbers, or Math.random() data instead of real backend data.
 */

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {Object} files - Normalized file map { path: content }
 * @returns {import('./types').AuthenticityIssue[]}
 */
function checkFakeDashboard(files) {
  const issues = [];

  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue;
    if (/\.(test|spec)\.[jt]sx?$/.test(path)) continue;

    // Only check dashboard/analytics/stats files
    const isDashboardFile = /dashboard|analytics|stats|metrics|overview|summary/i.test(path);
    const hasDashboardContent = /dashboard|analytics|stats|metrics/i.test(content);
    if (!isDashboardFile && !hasDashboardContent) continue;

    // ── 1. Math.random() used for chart/metric data ─────────────────────
    if (
      /Math\.random\s*\(\s*\)/.test(content) &&
      /chart|graph|metric|stat|revenue|user.*count|visits/i.test(content)
    ) {
      issues.push({
        id:       `fake-dashboard-random-data-${_slug(path)}`,
        category: 'fake_dashboard',
        severity: 'high',
        message:  `${path} uses Math.random() to generate dashboard metrics — displays fake data to users.`,
        fix:      'Fetch real metrics from a backend analytics endpoint (GET /api/analytics/summary).',
        file:     path,
        pattern:  'Math.random() for chart/metric data',
      });
    }

    // ── 2. Hardcoded stats object with plausible-looking numbers ────────
    // const stats = { users: 1247, revenue: 45600, orders: 392 }
    if (
      /(?:const|let|var)\s+(?:stats|metrics|data|analytics|kpis?)\s*=\s*\{/.test(content) &&
      /:\s*[0-9]{3,6}/.test(content) &&  // numeric values of 3-6 digits
      !/(await|fetch|axios|useEffect|useState.*loading)/i.test(
        content.slice(
          content.search(/(?:const|let|var)\s+(?:stats|metrics|data|analytics|kpis?)\s*=/),
          content.search(/(?:const|let|var)\s+(?:stats|metrics|data|analytics|kpis?)\s*=/) + 400,
        ),
      )
    ) {
      issues.push({
        id:       `fake-dashboard-hardcoded-stats-${_slug(path)}`,
        category: 'fake_dashboard',
        severity: 'critical',
        message:  `${path} defines a hardcoded stats/metrics object with static numbers instead of fetching real data.`,
        fix:      'Replace hardcoded stats with a useEffect that fetches GET /api/analytics/summary and stores the result in state.',
        file:     path,
        pattern:  'const stats = { users: 1247, revenue: 45600 }',
      });
    }

    // ── 3. Static chart data arrays (labels/datasets hardcoded) ─────────
    if (
      /(?:labels|datasets)\s*:\s*\[/.test(content) &&
      /['"`](?:Jan|Feb|Mar|Apr|Mon|Tue|Week|Day\s*\d)/i.test(content) &&
      !/fetch|axios|useEffect|fromApi|fromServer/i.test(content)
    ) {
      issues.push({
        id:       `fake-dashboard-static-chart-${_slug(path)}`,
        category: 'fake_dashboard',
        severity: 'high',
        message:  `${path} renders charts with hardcoded labels/data arrays (Jan, Feb, Mon... series) instead of real time-series data.`,
        fix:      'Fetch chart data from GET /api/analytics/timeseries and feed the response into the chart component.',
        file:     path,
        pattern:  "labels: ['Jan','Feb','Mar'...] (hardcoded)",
      });
    }

    // ── 4. Fake "live" indicators (blinking dot but static value) ────────
    if (
      /(?:live|realtime|real-time|online)/i.test(content) &&
      /(?:const|let|var)\s+\w+Count\s*=\s*[0-9]+/.test(content) &&
      !/(fetch|websocket|ws:|socket\.io|polling)/i.test(content)
    ) {
      issues.push({
        id:       `fake-dashboard-fake-realtime-${_slug(path)}`,
        category: 'fake_dashboard',
        severity: 'medium',
        message:  `${path} shows a "live/realtime" indicator but uses a hardcoded count with no WebSocket or polling backend.`,
        fix:      'Connect to a real WebSocket endpoint or implement polling (setInterval → GET /api/stats/live).',
        file:     path,
        pattern:  '"live" label + const onlineCount = 42',
      });
    }
  }

  return _dedup(issues);
}

// ── Private helpers ──────────────────────────────────────────────────────────

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

module.exports = { checkFakeDashboard };
