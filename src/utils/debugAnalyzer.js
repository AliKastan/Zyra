/**
 * debugAnalyzer.js — local heuristic analysis for common web app issues.
 * Runs before any AI call to resolve obvious problems for free.
 *
 * Returns: { issues: Array<Issue>, best: Issue|null }
 * Issue: { type, message, confidence: 0-1, affectedFiles: [], severity: 'high'|'medium'|'low' }
 */

const ISSUE_TYPES = {
  MISSING_ENTRY_POINT: 'missing_entry_point',
  EMPTY_FILE:          'empty_file',
  BROKEN_REFERENCE:    'broken_reference',
  CSS_INVISIBLE:       'css_invisible',
  MISSING_CLOSING_TAG: 'missing_closing_tag',
  INVALID_JSON:        'invalid_json',
  JS_BRACKET_MISMATCH: 'js_bracket_mismatch',
  CONSOLE_ERROR_MATCH: 'console_error_match',
  PREVIEW_BLANK:       'preview_blank',
  SCRIPT_LOAD_ERROR:   'script_load_error',
};

/**
 * Strip JS string literals and comments to avoid false positives in bracket counting.
 */
function stripStringsAndComments(js) {
  let result = '';
  let i = 0;
  const len = js.length;

  while (i < len) {
    // Single-line comment
    if (js[i] === '/' && js[i + 1] === '/') {
      while (i < len && js[i] !== '\n') i++;
      continue;
    }
    // Multi-line comment
    if (js[i] === '/' && js[i + 1] === '*') {
      i += 2;
      while (i < len && !(js[i] === '*' && js[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // Template literal
    if (js[i] === '`') {
      i++;
      while (i < len && js[i] !== '`') {
        if (js[i] === '\\') i++; // skip escape
        i++;
      }
      i++; // closing backtick
      continue;
    }
    // Double-quoted string
    if (js[i] === '"') {
      i++;
      while (i < len && js[i] !== '"') {
        if (js[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    // Single-quoted string
    if (js[i] === "'") {
      i++;
      while (i < len && js[i] !== "'") {
        if (js[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    result += js[i];
    i++;
  }
  return result;
}

/**
 * Extract local file references from HTML src/href attributes.
 */
function extractLocalRefs(html) {
  const refs = [];
  // src="...", href="..."
  const attrPattern = /(?:src|href)\s*=\s*["']([^"'#?]+)["']/gi;
  let m;
  while ((m = attrPattern.exec(html)) !== null) {
    const ref = m[1].trim();
    // Skip external URLs, data URIs, and root-relative paths that are clearly CDN/external
    if (ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('//')) continue;
    if (ref.startsWith('data:')) continue;
    if (!ref) continue;
    refs.push(ref);
  }
  return refs;
}

/**
 * Check whether CSS content (anywhere in all CSS files or <style> blocks) makes
 * a container element invisible.
 */
function detectInvisibleCss(files) {
  const invisiblePatterns = [
    // display:none on body or common containers
    /(?:body|html|\.container|\.wrapper|\.app|#app|#root|main)\s*\{[^}]*display\s*:\s*none/i,
    // visibility:hidden on body
    /body\s*\{[^}]*visibility\s*:\s*hidden/i,
    // opacity:0 on body
    /body\s*\{[^}]*opacity\s*:\s*0(?:\s*;|\s*\})/i,
  ];

  const affectedFiles = [];
  let found = false;
  let matchedPattern = null;

  for (const file of files) {
    const isCssFile = file.path.endsWith('.css');
    const isHtmlFile = file.path.endsWith('.html') || file.path.endsWith('.htm');
    if (!isCssFile && !isHtmlFile) continue;

    let cssContent = file.content;

    // For HTML files, extract only <style> block content
    if (isHtmlFile) {
      const styleMatches = [];
      const stylePattern = /<style[^>]*>([\s\S]*?)<\/style>/gi;
      let sm;
      while ((sm = stylePattern.exec(file.content)) !== null) {
        styleMatches.push(sm[1]);
      }
      cssContent = styleMatches.join('\n');
    }

    for (const pattern of invisiblePatterns) {
      if (pattern.test(cssContent)) {
        found = true;
        matchedPattern = pattern.toString();
        if (!affectedFiles.includes(file.path)) affectedFiles.push(file.path);
      }
    }
  }

  return { found, affectedFiles, matchedPattern };
}

/**
 * Main analyzer — runs all heuristic checks on project files.
 *
 * @param {Array<{path: string, content: string}>} files
 * @param {object} signals - optional client-side signals { consoleErrors, previewState, previewUrl }
 * @returns {{ issues: Array, best: object|null }}
 */
function analyzeProject(files, signals = {}) {
  const issues = [];
  const filePaths = new Set(files.map(f => f.path));

  // ── Check 1: Missing index.html ───────────────────────────────────────────
  const hasIndexHtml = filePaths.has('index.html') || filePaths.has('index.htm');
  if (!hasIndexHtml) {
    issues.push({
      type: ISSUE_TYPES.MISSING_ENTRY_POINT,
      message: 'No index.html found. The app has no entry point and cannot be displayed in the preview.',
      confidence: 0.95,
      affectedFiles: [],
      severity: 'high',
    });
  }

  // ── Check 2: Empty/near-empty files ──────────────────────────────────────
  for (const file of files) {
    const ext = file.path.split('.').pop().toLowerCase();
    if (ext !== 'html' && ext !== 'htm' && ext !== 'js') continue;
    if ((file.content || '').trim().length < 50) {
      issues.push({
        type: ISSUE_TYPES.EMPTY_FILE,
        message: `File "${file.path}" is empty or nearly empty (${(file.content || '').trim().length} chars). It may have been truncated during generation.`,
        confidence: 0.9,
        affectedFiles: [file.path],
        severity: 'high',
      });
    }
  }

  // ── Check 3: Broken references ────────────────────────────────────────────
  for (const file of files) {
    const ext = file.path.split('.').pop().toLowerCase();
    if (ext !== 'html' && ext !== 'htm') continue;

    const refs = extractLocalRefs(file.content || '');
    const broken = [];

    for (const ref of refs) {
      // Normalize: remove leading ./ and handle relative paths
      const normalized = ref.replace(/^\.\//, '');
      // Check both the raw ref and normalized version
      if (!filePaths.has(normalized) && !filePaths.has(ref)) {
        // Also check basename in case of subdirectory references
        const basename = normalized.split('/').pop();
        const existsAnywhere = Array.from(filePaths).some(p => p === normalized || p.endsWith('/' + basename));
        if (!existsAnywhere) {
          broken.push(ref);
        }
      }
    }

    if (broken.length > 0) {
      issues.push({
        type: ISSUE_TYPES.BROKEN_REFERENCE,
        message: `${file.path} references file(s) that don't exist: ${broken.slice(0, 3).join(', ')}${broken.length > 3 ? ` (+${broken.length - 3} more)` : ''}. These will fail to load.`,
        confidence: 0.85,
        affectedFiles: [file.path, ...broken.slice(0, 3)],
        severity: 'medium',
      });
    }
  }

  // ── Check 4: CSS making content invisible ─────────────────────────────────
  const { found: invisibleFound, affectedFiles: invisibleFiles } = detectInvisibleCss(files);
  if (invisibleFound) {
    issues.push({
      type: ISSUE_TYPES.CSS_INVISIBLE,
      message: 'CSS is hiding the main content area (display:none or visibility:hidden on body/container). The page renders blank.',
      confidence: 0.92,
      affectedFiles: invisibleFiles,
      severity: 'high',
    });
  }

  // ── Check 5: Missing closing tags ─────────────────────────────────────────
  for (const file of files) {
    const ext = file.path.split('.').pop().toLowerCase();
    if (ext !== 'html' && ext !== 'htm') continue;
    const content = file.content || '';
    const hasBody = /<body[\s>]/i.test(content);
    const hasClosingBody = /<\/body\s*>/i.test(content);
    const hasClosingHtml = /<\/html\s*>/i.test(content);

    if (hasBody && (!hasClosingBody || !hasClosingHtml)) {
      issues.push({
        type: ISSUE_TYPES.MISSING_CLOSING_TAG,
        message: `${file.path} is missing ${!hasClosingBody ? '</body>' : ''}${!hasClosingBody && !hasClosingHtml ? ' and ' : ''}${!hasClosingHtml ? '</html>' : ''}. The file was likely truncated mid-generation.`,
        confidence: 0.88,
        affectedFiles: [file.path],
        severity: 'high',
      });
    }
  }

  // ── Check 6: Invalid package.json ─────────────────────────────────────────
  for (const file of files) {
    if (file.path !== 'package.json' && !file.path.endsWith('/package.json')) continue;
    try {
      JSON.parse(file.content || '');
    } catch (e) {
      issues.push({
        type: ISSUE_TYPES.INVALID_JSON,
        message: `${file.path} contains invalid JSON: ${e.message}. This will prevent npm from reading the project configuration.`,
        confidence: 0.98,
        affectedFiles: [file.path],
        severity: 'high',
      });
    }
  }

  // ── Check 7: JS bracket mismatch ─────────────────────────────────────────
  for (const file of files) {
    const ext = file.path.split('.').pop().toLowerCase();
    if (ext !== 'js' && ext !== 'ts' && ext !== 'jsx' && ext !== 'tsx') continue;
    const content = file.content || '';
    if (content.trim().length < 50) continue; // already caught by empty file check

    const stripped = stripStringsAndComments(content);
    const opens  = (stripped.match(/\{/g) || []).length;
    const closes = (stripped.match(/\}/g) || []).length;
    const diff   = Math.abs(opens - closes);

    if (diff > 3) {
      issues.push({
        type: ISSUE_TYPES.JS_BRACKET_MISMATCH,
        message: `${file.path} has mismatched curly braces: ${opens} opening vs ${closes} closing (diff: ${diff}). The file is likely truncated or has a syntax error.`,
        confidence: 0.78,
        affectedFiles: [file.path],
        severity: 'high',
      });
    }
  }

  // ── Check 8: Console error pattern matching ───────────────────────────────
  const consoleErrors = signals.consoleErrors || [];
  for (const err of consoleErrors) {
    const msg = (err.message || err.text || '').toLowerCase();
    if (!msg) continue;

    if (msg.includes('cannot read properties of null') || msg.includes('cannot read property')) {
      issues.push({
        type: ISSUE_TYPES.CONSOLE_ERROR_MATCH,
        message: `Runtime error: querySelector or property access on a null element. Check that DOM elements exist before accessing them. Original error: "${(err.message || '').slice(0, 200)}"`,
        confidence: 0.75,
        affectedFiles: err.filename ? [err.filename.split('/').pop()] : [],
        severity: 'high',
      });
    } else if (msg.includes('is not defined') || msg.includes('referenceerror')) {
      issues.push({
        type: ISSUE_TYPES.CONSOLE_ERROR_MATCH,
        message: `ReferenceError: a variable or function is used before it's defined, or a required script/import is missing. Original error: "${(err.message || '').slice(0, 200)}"`,
        confidence: 0.75,
        affectedFiles: err.filename ? [err.filename.split('/').pop()] : [],
        severity: 'high',
      });
    } else if (msg.includes('404') || msg.includes('failed to fetch') || msg.includes('net::err')) {
      issues.push({
        type: ISSUE_TYPES.SCRIPT_LOAD_ERROR,
        message: `A resource failed to load (404 or network error). A script, stylesheet, or asset referenced in HTML cannot be found. Original error: "${(err.message || '').slice(0, 200)}"`,
        confidence: 0.75,
        affectedFiles: err.filename ? [err.filename.split('/').pop()] : [],
        severity: 'high',
      });
    } else if (msg.length > 5) {
      // Generic console error — still worth noting
      issues.push({
        type: ISSUE_TYPES.CONSOLE_ERROR_MATCH,
        message: `Console error detected: "${(err.message || '').slice(0, 300)}"`,
        confidence: 0.6,
        affectedFiles: err.filename ? [err.filename.split('/').pop()] : [],
        severity: 'medium',
      });
    }
  }

  // ── Check 9: Preview blank but HTML exists ────────────────────────────────
  if (signals.previewState === 'blank' && hasIndexHtml) {
    // Only add this if we haven't already found a higher-confidence root cause
    const highConfidenceIssues = issues.filter(i => i.confidence >= 0.88);
    if (highConfidenceIssues.length === 0) {
      issues.push({
        type: ISSUE_TYPES.PREVIEW_BLANK,
        message: 'The preview iframe is blank even though index.html exists. This may indicate a JavaScript error preventing render, CSS hiding content, or an empty body.',
        confidence: 0.7,
        affectedFiles: ['index.html'],
        severity: 'high',
      });
    }
  }

  // ── Determine best issue ─────────────────────────────────────────────────
  // Sort by confidence descending, then severity (high > medium > low)
  const severityOrder = { high: 3, medium: 2, low: 1 };
  const sorted = [...issues].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
  });

  return {
    issues: sorted,
    best: sorted[0] || null,
  };
}

/**
 * Attempt to auto-fix the issue locally without an AI call.
 * Returns [{ path, content }] or null if no local fix is possible.
 *
 * @param {object} issue - Issue from analyzeProject
 * @param {Array<{path: string, content: string}>} files
 * @returns {Array<{path: string, content: string}>|null}
 */
function generateLocalPatch(issue, files) {
  if (!issue) return null;

  // ── Fix MISSING_CLOSING_TAG: append </body></html> ────────────────────────
  if (issue.type === ISSUE_TYPES.MISSING_CLOSING_TAG) {
    const patch = [];
    for (const filePath of issue.affectedFiles) {
      const file = files.find(f => f.path === filePath);
      if (!file) continue;

      let content = file.content || '';
      const hasClosingBody = /<\/body\s*>/i.test(content);
      const hasClosingHtml = /<\/html\s*>/i.test(content);

      if (!hasClosingBody || !hasClosingHtml) {
        if (!hasClosingBody) content += '\n</body>';
        if (!hasClosingHtml) content += '\n</html>';
        patch.push({ path: filePath, content });
      }
    }
    return patch.length > 0 ? patch : null;
  }

  // ── Fix CSS_INVISIBLE: remove display:none from main containers ───────────
  if (issue.type === ISSUE_TYPES.CSS_INVISIBLE) {
    const patch = [];
    const invisibleContainerPattern = /(body|html|\.container|\.wrapper|\.app|#app|#root|main)(\s*\{[^}]*?)display\s*:\s*none([^}]*\})/gi;
    const visibilityHiddenPattern = /(body)(\s*\{[^}]*?)visibility\s*:\s*hidden([^}]*\})/gi;
    const opacityZeroPattern = /(body)(\s*\{[^}]*?)opacity\s*:\s*0\s*([;}\s])/gi;

    for (const filePath of issue.affectedFiles) {
      const file = files.find(f => f.path === filePath);
      if (!file) continue;

      let content = file.content || '';
      let changed = false;

      // Replace display:none with display:block on major containers
      const newContent = content
        .replace(invisibleContainerPattern, (match, selector, before, after) => {
          changed = true;
          return `${selector}${before}display: block${after}`;
        })
        .replace(visibilityHiddenPattern, (match, selector, before, after) => {
          changed = true;
          return `${selector}${before}visibility: visible${after}`;
        })
        .replace(opacityZeroPattern, (match, selector, before, after) => {
          changed = true;
          return `${selector}${before}opacity: 1${after}`;
        });

      if (changed) {
        patch.push({ path: filePath, content: newContent });
      }
    }
    return patch.length > 0 ? patch : null;
  }

  // No local fix available
  return null;
}

module.exports = { analyzeProject, generateLocalPatch, ISSUE_TYPES };
