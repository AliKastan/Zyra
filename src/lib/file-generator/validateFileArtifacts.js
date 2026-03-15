'use strict';

/**
 * Validate a set of FileArtifacts and return issues.
 *
 * @param {import('./types').FileArtifact[]} artifacts
 * @returns {import('./types').FileValidationIssue[]}
 */
function validateFileArtifacts(artifacts) {
  /** @type {import('./types').FileValidationIssue[]} */
  const issues = [];
  const pathCount = new Map();
  const allPaths = new Set(artifacts.map(a => a.path));

  // First pass: count duplicate paths
  for (const artifact of artifacts) {
    pathCount.set(artifact.path, (pathCount.get(artifact.path) || 0) + 1);
  }

  // Track which paths already had a duplicate issue reported
  const duplicateReported = new Set();

  for (const artifact of artifacts) {
    const { path, content } = artifact;

    // 1. Duplicate (error)
    if (pathCount.get(path) > 1 && !duplicateReported.has(path)) {
      duplicateReported.add(path);
      issues.push({
        type: 'duplicate',
        path,
        message: `Duplicate file path: "${path}" appears ${pathCount.get(path)} times`,
        severity: 'error',
      });
    }

    // 2. Empty file (error)
    if ((content || '').trim().length < 20) {
      issues.push({
        type: 'empty_file',
        path,
        message: `File "${path}" has insufficient content (< 20 chars)`,
        severity: 'error',
      });
    }

    // 3. Invalid path (error)
    if (!path || path.includes('..') || path.startsWith('/') || path.startsWith('\\')) {
      issues.push({
        type: 'invalid_path',
        path,
        message: `Invalid file path: "${path}"`,
        severity: 'error',
      });
    }

    // 4. Broken reference (warning) — only for HTML files
    const base = path.split('/').pop() || path;
    if (base.endsWith('.html')) {
      const str = content || '';

      // Check href CSS references
      const hrefRe = /href=["']([^"']+\.css)["']/g;
      let m;
      while ((m = hrefRe.exec(str)) !== null) {
        const ref = m[1].replace(/^\.\//, '');
        if (!allPaths.has(ref)) {
          issues.push({
            type: 'broken_reference',
            path,
            message: `"${path}" references "${ref}" which is not in the artifact set`,
            severity: 'warning',
          });
        }
      }

      // Check src JS references
      const srcRe = /src=["']([^"']+\.js)["']/g;
      while ((m = srcRe.exec(str)) !== null) {
        const ref = m[1].replace(/^\.\//, '');
        if (!allPaths.has(ref)) {
          issues.push({
            type: 'broken_reference',
            path,
            message: `"${path}" references "${ref}" which is not in the artifact set`,
            severity: 'warning',
          });
        }
      }
    }

    // 5. Stub content (warning)
    const stubRe = /\b(TODO|FIXME|placeholder|lorem ipsum)\b/i;
    if (stubRe.test(content || '')) {
      issues.push({
        type: 'stub_content',
        path,
        message: `"${path}" contains stub/placeholder content`,
        severity: 'warning',
      });
    }
  }

  return issues;
}

module.exports = { validateFileArtifacts };
