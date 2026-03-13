'use strict';

/**
 * ruleEngine.js
 * Rule-based fast detection layer. Matches normalized errors + project files
 * against known patterns and returns structured RuleResult objects.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Test whether any normalized error message matches a regex. */
function anyMessage(errors, regex) {
  return errors.some((e) => regex.test(e.message || ''));
}

/** Collect all messages as a single string for multi-match convenience. */
function allMessages(errors) {
  return errors.map((e) => e.message || '').join('\n');
}

/** Find the first error message matching a regex. */
function firstMatch(errors, regex) {
  return errors.find((e) => regex.test(e.message || ''));
}

/** Return file paths from projectFiles that include a given substring. */
function filesContaining(projectFiles, substr) {
  return Object.keys(projectFiles || {}).filter((p) => p.toLowerCase().includes(substr.toLowerCase()));
}

/** Return file content for a path key (case-insensitive best-effort). */
function getFile(projectFiles, name) {
  if (!projectFiles) return null;
  const key = Object.keys(projectFiles).find((k) => k.toLowerCase().endsWith(name.toLowerCase()));
  return key ? projectFiles[key] : null;
}

// ── Rule definitions ──────────────────────────────────────────────────────────

const RULES = [
  // ── 1. MISSING_MODULE ───────────────────────────────────────────────────────
  {
    id: 'MISSING_MODULE',
    match(errors) {
      const rx = /cannot find module ['"]([^'"]+)['"]/i;
      const err = firstMatch(errors, rx);
      if (!err) return null;
      const mod = (err.message.match(rx) || [])[1] || 'unknown';
      return {
        type:         'MISSING_MODULE',
        title:        `Missing module: ${mod}`,
        description:  `The module "${mod}" could not be resolved at runtime or build time.`,
        severity:     'high',
        confidence:   0.93,
        affectedFiles: err.file ? [err.file] : [],
        category:     'import_error',
        patch:        null,
        suggestion:   `Run: npm install ${mod}. If it is a local import, check the relative path.`,
        canAutoApply: false,
      };
    },
  },

  // ── 2. MISSING_ENV ──────────────────────────────────────────────────────────
  {
    id: 'MISSING_ENV',
    match(errors) {
      const rx = /process\.env\.([A-Z_]+)\s*(?:is\s*)?undefined|missing.*env\s+var(?:iable)?[:\s]+([A-Z_]+)/i;
      const err = firstMatch(errors, rx);
      if (!err) {
        // Also catch generic env messages
        const gen = firstMatch(errors, /environment variable|missing.*env|env.*not.*set/i);
        if (!gen) return null;
        return {
          type:         'MISSING_ENV',
          title:        'Missing environment variable',
          description:  'A required environment variable is undefined or not set.',
          severity:     'high',
          confidence:   0.91,
          affectedFiles: [],
          category:     'env_error',
          patch:        null,
          suggestion:   'Check your .env or .env.local file and ensure all required variables are defined.',
          canAutoApply: false,
        };
      }
      const m = err.message.match(rx);
      const varName = (m && (m[1] || m[2])) || 'UNKNOWN_VAR';
      return {
        type:         'MISSING_ENV',
        title:        `Missing env var: ${varName}`,
        description:  `The environment variable ${varName} is undefined at runtime.`,
        severity:     'high',
        confidence:   0.91,
        affectedFiles: err.file ? [err.file] : [],
        category:     'env_error',
        patch:        null,
        suggestion:   `Add ${varName}=<value> to your .env.local file and restart the server.`,
        canAutoApply: false,
      };
    },
  },

  // ── 3. MISSING_ENTRY_POINT ──────────────────────────────────────────────────
  {
    id: 'MISSING_ENTRY_POINT',
    match(errors, projectFiles, signals) {
      const isBlank = signals && signals.previewState === 'blank';
      if (!isBlank) return null;
      const hasIndex = projectFiles && Object.keys(projectFiles).some((p) =>
        /index\.html$/i.test(p)
      );
      if (hasIndex) return null;
      return {
        type:         'MISSING_ENTRY_POINT',
        title:        'Missing index.html entry point',
        description:  'The preview is blank and no index.html was found in the project.',
        severity:     'critical',
        confidence:   0.95,
        affectedFiles: [],
        category:     'not_found',
        patch:        null,
        suggestion:   'Create an index.html file as the application entry point.',
        canAutoApply: false,
      };
    },
  },

  // ── 4. HYDRATION_MISMATCH ───────────────────────────────────────────────────
  {
    id: 'HYDRATION_MISMATCH',
    match(errors) {
      const err = firstMatch(errors, /hydration|hydrating|server.*client.*mismatch|did not match/i);
      if (!err) return null;
      return {
        type:         'HYDRATION_MISMATCH',
        title:        'React hydration mismatch',
        description:  'The server-rendered HTML does not match the client-side React tree.',
        severity:     'medium',
        confidence:   0.89,
        affectedFiles: err.file ? [err.file] : [],
        category:     'hydration_error',
        patch:        null,
        suggestion:   'Ensure no browser-only APIs (window, document) are called during SSR. Wrap in useEffect or use dynamic imports with ssr:false.',
        canAutoApply: false,
      };
    },
  },

  // ── 5. CORS_ERROR ───────────────────────────────────────────────────────────
  {
    id: 'CORS_ERROR',
    match(errors) {
      const err = firstMatch(errors, /CORS|Access-Control|blocked by CORS|cross.?origin/i);
      if (!err) return null;
      return {
        type:         'CORS_ERROR',
        title:        'CORS policy violation',
        description:  'A cross-origin request was blocked by the browser CORS policy.',
        severity:     'high',
        confidence:   0.91,
        affectedFiles: err.file ? [err.file] : [],
        category:     'cors_error',
        patch:        null,
        suggestion:   'Add the Access-Control-Allow-Origin header on the server, or use a proxy. If the API is your own, add cors() middleware.',
        canAutoApply: false,
      };
    },
  },

  // ── 6. SUPABASE_RLS ─────────────────────────────────────────────────────────
  {
    id: 'SUPABASE_RLS',
    match(errors) {
      const err = firstMatch(errors, /RLS|row.?level.?security|permission denied.*table|new row violates row.?level/i);
      if (!err) return null;
      return {
        type:         'SUPABASE_RLS',
        title:        'Supabase RLS policy blocking request',
        description:  'A Supabase query was blocked by a Row Level Security policy.',
        severity:     'high',
        confidence:   0.92,
        affectedFiles: err.file ? [err.file] : [],
        category:     'database_error',
        patch:        null,
        suggestion:   'Review your Supabase RLS policies. Ensure the authenticated user has the required permissions, or use the service role key on the server only.',
        canAutoApply: false,
      };
    },
  },

  // ── 7. CSS_INVISIBLE ────────────────────────────────────────────────────────
  {
    id: 'CSS_INVISIBLE',
    match(errors, projectFiles, signals) {
      const isBlank = signals && signals.previewState === 'blank';
      if (!isBlank) return null;

      const cssContent = getFile(projectFiles, '.css') || '';
      const hasDisplayNone = /display\s*:\s*none/.test(cssContent);
      const hasHeightZero  = /height\s*:\s*0(?:px)?(?:\s*;|\s*$)/.test(cssContent);
      const hasOverflowHidden = /overflow\s*:\s*hidden/.test(cssContent);

      if (!hasDisplayNone && !hasHeightZero && !hasOverflowHidden) return null;

      const issues = [
        hasDisplayNone    ? 'display:none'    : null,
        hasHeightZero     ? 'height:0'        : null,
        hasOverflowHidden ? 'overflow:hidden' : null,
      ].filter(Boolean).join(', ');

      return {
        type:         'CSS_INVISIBLE',
        title:        'CSS making content invisible',
        description:  `Found CSS rules that may hide content on a blank preview: ${issues}.`,
        severity:     'medium',
        confidence:   0.85,
        affectedFiles: filesContaining(projectFiles, '.css'),
        category:     'render_error',
        patch:        null,
        suggestion:   `Remove or override: ${issues} from the main stylesheet to make content visible.`,
        canAutoApply: false,
      };
    },
  },

  // ── 8. TYPESCRIPT_ERROR ─────────────────────────────────────────────────────
  {
    id: 'TYPESCRIPT_ERROR',
    match(errors) {
      const rx = /TS\d{4}:|TypeScript.*error|\.tsx?.*error/i;
      const err = firstMatch(errors, rx);
      if (!err) return null;
      const tsCode = (err.message.match(/TS(\d{4})/) || [])[0] || '';
      return {
        type:         'TYPESCRIPT_ERROR',
        title:        `TypeScript error${tsCode ? ` ${tsCode}` : ''}`,
        description:  err.message,
        severity:     'high',
        confidence:   0.88,
        affectedFiles: err.file ? [err.file] : [],
        category:     'build_error',
        patch:        null,
        suggestion:   'Fix the TypeScript type error reported above. Run tsc --noEmit for a full list.',
        canAutoApply: false,
      };
    },
  },

  // ── 9. CONNECTION_REFUSED ───────────────────────────────────────────────────
  {
    id: 'CONNECTION_REFUSED',
    match(errors) {
      const err = firstMatch(errors, /ECONNREFUSED|connect ECONNREFUSED|connection refused/i);
      if (!err) return null;
      const portMatch = err.message.match(/ECONNREFUSED.*:(\d+)/);
      const port = portMatch ? portMatch[1] : null;
      return {
        type:         'CONNECTION_REFUSED',
        title:        `Connection refused${port ? ` on port ${port}` : ''}`,
        description:  'A network connection attempt was refused by the target host.',
        severity:     'high',
        confidence:   0.90,
        affectedFiles: err.file ? [err.file] : [],
        category:     'network_error',
        patch:        null,
        suggestion:   port
          ? `Ensure the service on port ${port} is running. Check your server start command and PORT env variable.`
          : 'Ensure the target service is running and the host/port are correct.',
        canAutoApply: false,
      };
    },
  },

  // ── 10. JSON_PARSE_ERROR ────────────────────────────────────────────────────
  {
    id: 'JSON_PARSE_ERROR',
    match(errors, projectFiles) {
      const err = firstMatch(errors, /JSON\.parse|invalid json|unexpected token|unexpected end of json/i);
      // Check for JSON files in the project
      const jsonFiles = Object.keys(projectFiles || {}).filter((p) => /\.json$/.test(p) && !/node_modules/.test(p));

      if (!err && jsonFiles.length === 0) return null;

      const confidence = err && jsonFiles.length > 0 ? 0.88 : err ? 0.75 : 0.60;
      return {
        type:         'JSON_PARSE_ERROR',
        title:        'Invalid JSON detected',
        description:  err ? err.message : 'A JSON file in the project may be malformed.',
        severity:     'high',
        confidence,
        affectedFiles: jsonFiles,
        category:     'syntax_error',
        patch:        null,
        suggestion:   'Validate all .json files with a linter (e.g. jsonlint). Check for trailing commas, missing quotes, or truncated content.',
        canAutoApply: false,
      };
    },
  },

  // ── 11. UNCLOSED_HTML_TAG ───────────────────────────────────────────────────
  {
    id: 'UNCLOSED_HTML_TAG',
    match(errors, projectFiles) {
      const htmlContent = getFile(projectFiles, 'index.html') || '';
      if (!htmlContent) return null;

      // Count open vs close tags for common block elements
      const blockTags = ['div', 'section', 'article', 'main', 'header', 'footer', 'nav', 'ul', 'ol', 'table'];
      let mismatchedTag = null;

      for (const tag of blockTags) {
        const opens  = (htmlContent.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
        const closes = (htmlContent.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
        if (opens !== closes) {
          mismatchedTag = { tag, opens, closes };
          break;
        }
      }

      if (!mismatchedTag) return null;

      return {
        type:         'UNCLOSED_HTML_TAG',
        title:        `Mismatched <${mismatchedTag.tag}> tags`,
        description:  `Found ${mismatchedTag.opens} opening <${mismatchedTag.tag}> but ${mismatchedTag.closes} closing </${mismatchedTag.tag}> in index.html.`,
        severity:     'medium',
        confidence:   0.78,
        affectedFiles: filesContaining(projectFiles, 'index.html'),
        category:     'syntax_error',
        patch:        null,
        suggestion:   `Add the missing </${mismatchedTag.tag}> closing tag in index.html.`,
        canAutoApply: false,
      };
    },
  },

  // ── 12. PEER_DEP_MISMATCH ───────────────────────────────────────────────────
  {
    id: 'PEER_DEP_MISMATCH',
    match(errors) {
      const err = firstMatch(errors, /peer dep|peer dependency|incorrect peer|incompatible.*version|ERESOLVE/i);
      if (!err) return null;
      return {
        type:         'PEER_DEP_MISMATCH',
        title:        'Peer dependency version mismatch',
        description:  err.message,
        severity:     'medium',
        confidence:   0.85,
        affectedFiles: [],
        category:     'dependency_error',
        patch:        null,
        suggestion:   'Run: npm install --legacy-peer-deps, or align package versions to satisfy peer requirements.',
        canAutoApply: false,
      };
    },
  },

  // ── 13. UNAUTHORIZED ────────────────────────────────────────────────────────
  {
    id: 'UNAUTHORIZED',
    match(errors) {
      const err = firstMatch(errors, /\b401\b|unauthorized|JWT expired|invalid.*token|authentication.*required/i);
      if (!err) return null;
      return {
        type:         'UNAUTHORIZED',
        title:        '401 Unauthorized — authentication failure',
        description:  err.message,
        severity:     'high',
        confidence:   0.87,
        affectedFiles: err.file ? [err.file] : [],
        category:     'auth_error',
        patch:        null,
        suggestion:   'Verify that the correct API key or JWT token is being sent in the Authorization header. Check token expiration.',
        canAutoApply: false,
      };
    },
  },

  // ── 14. MISSING_CLOSING_TAG ─────────────────────────────────────────────────
  {
    id: 'MISSING_CLOSING_TAG',
    match(errors, projectFiles) {
      const htmlContent = getFile(projectFiles, 'index.html') || '';
      if (!htmlContent) return null;

      // Specifically check for </html>, </body>, </head>
      const missingClose = [];
      if (!/<\/html>/i.test(htmlContent))  missingClose.push('</html>');
      if (!/<\/body>/i.test(htmlContent))  missingClose.push('</body>');
      if (/<head>/i.test(htmlContent) && !/<\/head>/i.test(htmlContent)) missingClose.push('</head>');

      if (missingClose.length === 0) return null;

      return {
        type:         'MISSING_CLOSING_TAG',
        title:        `Missing closing HTML tags: ${missingClose.join(', ')}`,
        description:  `index.html is missing required closing tags: ${missingClose.join(', ')}.`,
        severity:     'high',
        confidence:   0.82,
        affectedFiles: filesContaining(projectFiles, 'index.html'),
        category:     'syntax_error',
        patch:        null,
        suggestion:   `Add the missing ${missingClose.join(', ')} tags to properly close the HTML document.`,
        canAutoApply: false,
      };
    },
  },

  // ── 15. SCRIPT_LOAD_ERROR ───────────────────────────────────────────────────
  {
    id: 'SCRIPT_LOAD_ERROR',
    match(errors) {
      const err = firstMatch(errors, /failed to load|failed to fetch|failed to import|net::ERR_FAILED|ERR_FILE_NOT_FOUND|404.*\.js|\.js.*404/i);
      if (!err) return null;
      // Extract script name if possible
      const scriptMatch = err.message.match(/(['"]?)([^'"]+\.(?:js|mjs|css))(\1)/);
      const scriptName  = scriptMatch ? scriptMatch[2] : 'a script or resource';
      return {
        type:         'SCRIPT_LOAD_ERROR',
        title:        `Failed to load resource: ${scriptName}`,
        description:  `The browser could not load: ${scriptName}. This may cause the app to fail silently.`,
        severity:     'high',
        confidence:   0.86,
        affectedFiles: [],
        category:     'not_found',
        patch:        null,
        suggestion:   `Verify the script/resource path is correct and the file exists. Check for typos in the <script src> or <link href> attributes.`,
        canAutoApply: false,
      };
    },
  },
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run all rules against the normalized errors, project files, and signals.
 *
 * @param {NormalizedError[]} normalizedErrors
 * @param {object}            projectFiles  - { [path]: content }
 * @param {object}            signals
 * @returns {{ matched: boolean, issue: RuleResult|null, candidates: RuleResult[] }}
 */
function runRules(normalizedErrors, projectFiles, signals) {
  const errors   = Array.isArray(normalizedErrors) ? normalizedErrors : [];
  const files    = projectFiles || {};
  const sigs     = signals || {};

  const candidates = [];

  for (const rule of RULES) {
    try {
      const result = rule.match(errors, files, sigs);
      if (result) {
        candidates.push({ ...result, ruleId: rule.id });
      }
    } catch (e) {
      // Rule threw — skip it silently (defensive)
    }
  }

  // Sort by confidence descending
  candidates.sort((a, b) => b.confidence - a.confidence);

  const best    = candidates[0] || null;
  const matched = !!(best && best.confidence >= 0.85);

  return {
    matched,
    issue:      matched ? best : null,
    candidates,
  };
}

module.exports = { runRules };
