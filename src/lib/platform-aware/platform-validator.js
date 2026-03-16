'use strict';

/**
 * Platform Validator
 *
 * Validates generated file content against platform compatibility rules.
 * Returns violations, warnings, and a compatibility score.
 */

const { getIncompatibilityPatterns, checkFilePathCompatibility } = require('./platform-rules');

// Max chars to scan per file (avoids performance issues on large files)
const MAX_SCAN_CHARS = 8000;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate a file set against the rules for the given platform.
 *
 * @param {Object.<string, string>} files  - { filePath: content }
 * @param {import('./types').PlatformType} platform
 * @returns {import('./types').PlatformValidationResult}
 */
function validatePlatformCompatibility(files, platform) {
  const violations = [];
  const warnings   = [];

  if (!files || typeof files !== 'object') {
    return { valid: false, violations: ['No files provided'], warnings: [], score: 0, summary: 'No files to validate' };
  }

  const patterns = getIncompatibilityPatterns(platform);

  for (const [filePath, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue;

    // 1. Check file path compatibility
    const pathCheck = checkFilePathCompatibility(filePath, platform);
    if (!pathCheck.compatible) {
      violations.push(`[path] ${pathCheck.warning}`);
    }

    // 2. Scan file content for incompatible patterns (limit scan length)
    const snippet = content.slice(0, MAX_SCAN_CHARS);
    for (const { pattern, message } of patterns) {
      if (pattern.test(snippet)) {
        violations.push(`[${filePath}] ${message}`);
      }
    }
  }

  // 3. Platform-specific presence checks
  const presenceWarnings = _checkPresence(files, platform);
  warnings.push(...presenceWarnings);

  // 4. Compute score
  const totalFiles = Object.keys(files).length || 1;
  const violationWeight = violations.length * 15;
  const warningWeight   = warnings.length   * 5;
  const score = Math.max(0, Math.min(100, 100 - violationWeight - warningWeight));

  const valid   = violations.length === 0;
  const summary = _buildSummary(platform, valid, violations.length, warnings.length, score);

  return { valid, violations, warnings, score, summary };
}

/**
 * Validate a single file for platform compatibility.
 * @param {string} filePath
 * @param {string} content
 * @param {import('./types').PlatformType} platform
 * @returns {{ violations: string[], warnings: string[] }}
 */
function validateFile(filePath, content, platform) {
  const result = validatePlatformCompatibility({ [filePath]: content }, platform);
  return { violations: result.violations, warnings: result.warnings };
}

/**
 * Quick compatibility check: does the file list look right for the platform?
 * Returns true if the file set seems platform-appropriate.
 * @param {string[]} filePaths
 * @param {import('./types').PlatformType} platform
 * @returns {boolean}
 */
function isFilesListCompatible(filePaths, platform) {
  if (!filePaths || filePaths.length === 0) return true;

  const paths = filePaths.join('\n');

  if (platform === 'mobile') {
    // Mobile should not have pages/ (Next.js) or index.html at root
    if (/^pages\//m.test(paths) || /^index\.html$/m.test(paths)) return false;
    // Mobile should have screens/ or app/ (Expo Router)
    return /screens\/|app\/\(tabs\)|navigation\//.test(paths);
  }

  if (platform === 'backend') {
    // Backend should have no .jsx/.tsx or components/
    if (/\.jsx$|\.tsx$|\/components\//m.test(paths)) return false;
    return /routes\/|src\//.test(paths);
  }

  if (platform === 'desktop') {
    // Desktop should have either electron or tauri dirs
    return /src\/main\/|src-tauri\/|electron/.test(paths);
  }

  // web: should have .html, .jsx, or .tsx
  return /\.html$|\.jsx$|\.tsx$/m.test(paths);
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _checkPresence(files, platform) {
  const warnings = [];
  const paths    = Object.keys(files);
  const joined   = paths.join('\n');

  if (platform === 'web') {
    if (!paths.some(p => /\.(html|jsx|tsx)$/.test(p))) {
      warnings.push('No HTML or JSX/TSX files found — expected for a web project');
    }
    if (!paths.some(p => /package\.json$/.test(p))) {
      warnings.push('No package.json found');
    }
  }

  if (platform === 'mobile') {
    if (!paths.some(p => /\.(jsx|tsx|js|ts)$/.test(p))) {
      warnings.push('No JS/TS files found in mobile project');
    }
    const hasRN = Object.values(files).some(c => typeof c === 'string' && c.slice(0, 8000).includes('react-native'));
    if (!hasRN) {
      warnings.push('No react-native import detected — verify this is a React Native project');
    }
  }

  if (platform === 'backend') {
    const hasApiRoute = paths.some(p => /routes\/|controllers\//.test(p));
    if (!hasApiRoute) {
      warnings.push('No routes/ or controllers/ directory found in backend project');
    }
    const hasHealth = Object.values(files).some(c => typeof c === 'string' && /\/health|health.*route/i.test(c.slice(0, 8000)));
    if (!hasHealth) {
      warnings.push('No health check endpoint detected — recommended for backend services');
    }
  }

  if (platform === 'desktop') {
    const hasMain = paths.some(p => /main\/index|main\.js|main\.ts/.test(p));
    if (!hasMain) {
      warnings.push('No main process entry file detected for desktop app');
    }
  }

  return warnings;
}

function _buildSummary(platform, valid, violationCount, warningCount, score) {
  if (valid && warningCount === 0) {
    return `Platform "${platform}" — fully compatible (score: ${score}/100)`;
  }
  if (valid) {
    return `Platform "${platform}" — compatible with ${warningCount} warning(s) (score: ${score}/100)`;
  }
  return `Platform "${platform}" — ${violationCount} violation(s), ${warningCount} warning(s) (score: ${score}/100)`;
}

module.exports = { validatePlatformCompatibility, validateFile, isFilesListCompatible };
