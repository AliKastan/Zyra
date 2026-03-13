'use strict';

/**
 * contextBuilder.js
 * Builds a token-efficient structured debug context for AI analysis.
 */

const path = require('path');
const { maskObject, maskString } = require('./secretMasker');
const { buildErrorSummary } = require('./errorClassifier');

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FILE_CHARS   = 4000;
const MAX_FILES        = 4;
const MAX_CONTEXT_CHARS = 14000;

// Priority file names (checked in order after error-mentioned files)
const PRIORITY_FILES = [
  'index.html',
  'app.js', 'main.js', 'index.js',
  'App.jsx', 'App.tsx', 'main.jsx', 'main.tsx',
  'style.css', 'styles.css', 'index.css',
];

// ── File selection ────────────────────────────────────────────────────────────

/**
 * Find all project file paths that are mentioned in error messages.
 * @param {NormalizedError[]} normalizedErrors
 * @param {object} projectFiles
 * @returns {string[]}
 */
function getErrorMentionedFiles(normalizedErrors, projectFiles) {
  if (!projectFiles) return [];
  const filePaths = Object.keys(projectFiles);
  const mentioned = new Set();

  for (const err of (normalizedErrors || [])) {
    if (err.file) {
      // Fuzzy match: find a project file whose path ends with the error's file
      const errFile = err.file.replace(/\\/g, '/');
      for (const fp of filePaths) {
        const normalized = fp.replace(/\\/g, '/');
        if (normalized.endsWith(errFile) || normalized.includes(errFile)) {
          mentioned.add(fp);
        }
      }
    }
    // Also scan message for file references like "src/app.js"
    if (err.message) {
      for (const fp of filePaths) {
        const basename = path.basename(fp);
        if (basename.length > 3 && err.message.includes(basename)) {
          mentioned.add(fp);
        }
      }
    }
  }

  return Array.from(mentioned);
}

/**
 * Select up to MAX_FILES relevant files from projectFiles.
 * Priority: error-mentioned → PRIORITY_FILES → remaining.
 */
function selectRelevantFiles(normalizedErrors, projectFiles) {
  if (!projectFiles || Object.keys(projectFiles).length === 0) return [];

  const filePaths  = Object.keys(projectFiles);
  const selected   = new Set();

  // 1. Files mentioned in errors
  const mentioned = getErrorMentionedFiles(normalizedErrors, projectFiles);
  for (const f of mentioned) {
    if (selected.size >= MAX_FILES) break;
    selected.add(f);
  }

  // 2. Priority files
  for (const priorityName of PRIORITY_FILES) {
    if (selected.size >= MAX_FILES) break;
    const found = filePaths.find((p) =>
      p.replace(/\\/g, '/').toLowerCase().endsWith(priorityName.toLowerCase())
    );
    if (found && !selected.has(found)) selected.add(found);
  }

  // 3. Fill remaining slots with other files (skip node_modules, lock files)
  for (const fp of filePaths) {
    if (selected.size >= MAX_FILES) break;
    if (selected.has(fp)) continue;
    if (/node_modules|package-lock\.json|yarn\.lock|\.min\.js/.test(fp)) continue;
    selected.add(fp);
  }

  return Array.from(selected);
}

/**
 * Truncate file content to MAX_FILE_CHARS and mask secrets.
 */
function prepareFileContent(content) {
  if (!content || typeof content !== 'string') return '';
  const masked = maskString(content);
  if (masked.length <= MAX_FILE_CHARS) return masked;
  return masked.slice(0, MAX_FILE_CHARS) + `\n... [truncated — ${masked.length - MAX_FILE_CHARS} chars omitted]`;
}

// ── Package.json parsing ──────────────────────────────────────────────────────

/**
 * Extract a lightweight subset of package.json.
 */
function parsePackageJson(projectFiles) {
  if (!projectFiles) return null;
  const pkgKey = Object.keys(projectFiles).find((p) => /(?:^|\/)package\.json$/.test(p.replace(/\\/g, '/')));
  if (!pkgKey) return null;

  try {
    const raw = projectFiles[pkgKey];
    const pkg = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      name:            pkg.name    || null,
      version:         pkg.version || null,
      dependencies:    pkg.dependencies    || {},
      devDependencies: pkg.devDependencies || {},
      scripts:         pkg.scripts         || {},
    };
  } catch {
    return null;
  }
}

// ── Config analysis ───────────────────────────────────────────────────────────

/**
 * Analyze project config for common issues:
 * - Broken <script src> references in HTML
 * - Broken <link href> references in HTML
 */
function analyzeConfig(projectFiles) {
  if (!projectFiles) return { brokenScriptRefs: [], missingFiles: [] };

  const filePaths  = Object.keys(projectFiles);
  const htmlKey    = filePaths.find((p) => /index\.html$/i.test(p));
  const htmlContent = htmlKey ? (projectFiles[htmlKey] || '') : '';

  const brokenScriptRefs = [];

  if (htmlContent) {
    // Extract all src="..." and href="..." values
    const srcMatches  = htmlContent.matchAll(/(?:src|href)\s*=\s*['"]([^'"]+)['"]/gi);
    for (const m of srcMatches) {
      const ref = m[1];
      // Skip external URLs, data URIs, anchors
      if (/^https?:\/\/|^\/\/|^data:|^#/.test(ref)) continue;
      // Check if the referenced file exists in projectFiles
      const refBase = ref.replace(/^\.\//, '').replace(/\\/g, '/');
      const exists  = filePaths.some((p) => {
        const normalized = p.replace(/\\/g, '/');
        return normalized.endsWith(refBase) || normalized === refBase;
      });
      if (!exists) brokenScriptRefs.push(ref);
    }
  }

  // Detect missing critical files
  const missingFiles = [];
  if (filePaths.length > 0 && !filePaths.some((p) => /index\.html$/i.test(p))) {
    missingFiles.push('index.html');
  }

  return { brokenScriptRefs, missingFiles };
}

// ── Context truncation ────────────────────────────────────────────────────────

/**
 * Trim the files section of the context if total serialized size exceeds MAX_CONTEXT_CHARS.
 */
function trimToLimit(context) {
  let serialized = JSON.stringify(context);
  if (serialized.length <= MAX_CONTEXT_CHARS) return context;

  // Progressively drop files from the end until within budget
  const trimmed = { ...context, files: [...(context.files || [])] };
  while (trimmed.files.length > 0) {
    trimmed.files.pop();
    serialized = JSON.stringify(trimmed);
    if (serialized.length <= MAX_CONTEXT_CHARS) break;
  }

  // If still over, truncate cluster stack traces
  if (serialized.length > MAX_CONTEXT_CHARS && trimmed.errors && trimmed.errors.clusters) {
    trimmed.errors = {
      ...trimmed.errors,
      clusters: trimmed.errors.clusters.map((c) => ({
        ...c,
        representativeStack: null,
      })),
    };
  }

  return trimmed;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a token-efficient structured debug context for AI.
 *
 * @param {NormalizedError[]} normalizedErrors
 * @param {object}            projectFiles    - { [path]: content }
 * @param {object}            signals         - { previewState, userDescription, ... }
 * @param {object}            projectMeta     - { slug, name, type, ... }
 * @returns {object} masked debug context
 */
function buildDebugContext(normalizedErrors, projectFiles, signals, projectMeta) {
  const errors   = Array.isArray(normalizedErrors) ? normalizedErrors : [];
  const files    = projectFiles || {};
  const sigs     = signals || {};
  const meta     = projectMeta || {};

  // 1. Error summary
  const errorSummary = buildErrorSummary(errors);

  // 2. Relevant files
  const selectedPaths = selectRelevantFiles(errors, files);
  const preparedFiles = selectedPaths.map((filePath) => ({
    path:    filePath,
    content: prepareFileContent(files[filePath]),
  }));

  // 3. Package.json
  const packageInfo = parsePackageJson(files);

  // 4. Config analysis
  const config = analyzeConfig(files);

  // 5. Assemble context
  const context = {
    project: {
      slug:    meta.slug    || null,
      name:    meta.name    || null,
      type:    meta.type    || null,
      appType: meta.appType || null,
    },
    signals: {
      previewState:    sigs.previewState    || 'unknown',
      userDescription: sigs.userDescription ? maskString(sigs.userDescription) : null,
    },
    errors: errorSummary,
    files:  preparedFiles,
    package: packageInfo,
    config,
  };

  // 6. Mask the entire context (catches any secrets that slipped through)
  const masked = maskObject(context);

  // 7. Trim if over limit
  return trimToLimit(masked);
}

module.exports = { buildDebugContext };
