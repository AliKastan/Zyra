'use strict';

/**
 * Merge Regenerated Sections
 *
 * Safely merges new section content into an existing project file set.
 *
 * Merge rules:
 *   - Files in plan.filesToRegenerate: replace with new content
 *   - Files in plan.filesToPatch: apply targeted patch (append or partial replace)
 *   - Files in plan.filesToPreserve: never touch — copy as-is
 *   - New files (from newFilesNeeded): create if not present
 *   - plan.changeDetection.action === 'remove': delete matched files
 *
 * Returns a MergeResult with the final merged file set and operation log.
 */

// Max size for patch content that triggers line-level merge vs full replace
const PATCH_SIZE_THRESHOLD = 5000; // chars

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Merge regenerated section files into the existing project.
 *
 * @param {Object.<string,string>} currentFiles     - Existing project files { path: content }
 * @param {Object.<string,string>} regeneratedFiles - New files produced by section regeneration { path: content }
 * @param {import('./types').RegenerationPlan} plan
 * @returns {import('./types').MergeResult}
 */
function mergeRegeneratedSections(currentFiles, regeneratedFiles, plan) {
  const mergedFiles = {};
  const operations  = [];
  const preserved   = [];
  const replaced    = [];
  const created     = [];
  const patched     = [];
  const warnings    = [];

  const regenerateSet = new Set(plan.filesToRegenerate || []);
  const patchSet      = new Set(plan.filesToPatch      || []);
  const preserveSet   = new Set(plan.filesToPreserve   || []);
  const isRemoval     = plan.changeDetection?.action === 'remove';

  // All paths we need to consider
  const allPaths = new Set([
    ...Object.keys(currentFiles),
    ...Object.keys(regeneratedFiles),
  ]);

  for (const path of allPaths) {
    const hasExisting     = path in currentFiles;
    const hasRegenerated  = path in regeneratedFiles;
    const isInRegenerate  = regenerateSet.has(path);
    const isInPatch       = patchSet.has(path);
    const isInPreserve    = preserveSet.has(path);

    // Handle removal: delete files in regenerate scope
    if (isRemoval && isInRegenerate && hasExisting && !hasRegenerated) {
      operations.push({ path, operation: 'delete', reason: 'removal requested' });
      // Not added to mergedFiles → effectively deleted
      continue;
    }

    if (isInPreserve || (!isInRegenerate && !isInPatch && hasExisting)) {
      // Preserve: keep existing content unchanged
      mergedFiles[path] = currentFiles[path];
      preserved.push(path);
      operations.push({ path, operation: 'preserve', reason: 'not in regeneration scope' });

    } else if (isInRegenerate && hasRegenerated) {
      // Full replace with new content
      mergedFiles[path] = regeneratedFiles[path];
      replaced.push(path);
      operations.push({ path, operation: 'replace', reason: 'in primary regeneration scope' });

    } else if (isInPatch && hasRegenerated && hasExisting) {
      // Patch: merge new content into existing
      const patchResult = _applyPatch(currentFiles[path], regeneratedFiles[path], path);
      mergedFiles[path] = patchResult.content;
      patched.push(path);
      operations.push({ path, operation: 'patch', reason: 'in secondary scope — partial update' });
      if (patchResult.warning) warnings.push(patchResult.warning);

    } else if (!hasExisting && hasRegenerated) {
      // Create new file
      mergedFiles[path] = regeneratedFiles[path];
      created.push(path);
      operations.push({ path, operation: 'create', reason: 'new file from section regeneration' });

    } else if (hasExisting && !hasRegenerated) {
      // Existing file not in regenerated output — preserve
      mergedFiles[path] = currentFiles[path];
      preserved.push(path);
      operations.push({ path, operation: 'preserve', reason: 'not regenerated — preserved' });

    } else {
      // Fallback: preserve existing
      if (hasExisting) {
        mergedFiles[path] = currentFiles[path];
        preserved.push(path);
        operations.push({ path, operation: 'preserve', reason: 'fallback preserve' });
      }
    }
  }

  // Safety check: warn if any preserved files have broken imports to deleted files
  const deletedPaths = new Set(
    operations.filter(o => o.operation === 'delete').map(o => o.path),
  );
  if (deletedPaths.size > 0) {
    const warnPaths = _detectBrokenImports(mergedFiles, deletedPaths);
    warnings.push(...warnPaths.map(p => `${p} imports from deleted file — update imports manually`));
  }

  return {
    mergedFiles,
    operations,
    preserved,
    replaced,
    created,
    patched,
    warnings,
  };
}

/**
 * Compute a diff between two file sets (before/after merge).
 * Useful for summarizing what changed.
 *
 * @param {Object.<string,string>} before
 * @param {Object.<string,string>} after
 * @returns {{ added: string[], removed: string[], modified: string[] }}
 */
function computeFileDiff(before, after) {
  const beforeKeys = new Set(Object.keys(before));
  const afterKeys  = new Set(Object.keys(after));

  const added    = [...afterKeys].filter(k => !beforeKeys.has(k));
  const removed  = [...beforeKeys].filter(k => !afterKeys.has(k));
  const modified = [...beforeKeys].filter(k =>
    afterKeys.has(k) && before[k] !== after[k],
  );

  return { added, removed, modified };
}

/**
 * Apply env var additions to .env.example without overwriting existing vars.
 *
 * @param {string}   existingContent - Current .env.example content
 * @param {string[]} newVars         - New env var names to add (no values)
 * @returns {string} Updated .env.example content
 */
function patchEnvExample(existingContent, newVars) {
  const lines       = (existingContent || '').split('\n');
  const existingSet = new Set(
    lines.map(l => l.split('=')[0].trim()).filter(Boolean),
  );
  const toAdd = newVars.filter(v => !existingSet.has(v));
  if (toAdd.length === 0) return existingContent;
  return existingContent.trimEnd() + '\n\n# Added by section regeneration\n' +
         toAdd.map(v => `${v}=`).join('\n') + '\n';
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Apply a targeted patch of newContent into existingContent.
 * For small patches, appends new sections at the end.
 * For large content, falls back to full replace.
 */
function _applyPatch(existingContent, newContent, path) {
  if (!existingContent) {
    return { content: newContent, warning: null };
  }

  // CSS/style files: append new custom properties at the end of :root block or file
  if (/\.(css|scss|sass|less)$/i.test(path)) {
    return _patchCss(existingContent, newContent);
  }

  // .env.example: append new vars
  if (/\.env/i.test(path)) {
    const patched = patchEnvExample(existingContent, _extractEnvVars(newContent));
    return { content: patched, warning: null };
  }

  // package.json: merge scripts/dependencies
  if (/package\.json$/i.test(path)) {
    return _patchPackageJson(existingContent, newContent);
  }

  // For large content, full replace is safer
  if (newContent.length > PATCH_SIZE_THRESHOLD) {
    return { content: newContent, warning: null };
  }

  // Generic: append new content with a separator comment
  const separator = _commentSeparator(path);
  return {
    content: existingContent.trimEnd() + `\n\n${separator}\n` + newContent,
    warning: null,
  };
}

function _patchCss(existing, newContent) {
  // Extract new CSS custom properties and append to existing :root
  const varMatches = newContent.match(/--[\w-]+\s*:[^;]+;/g) || [];
  if (varMatches.length === 0) {
    return { content: newContent, warning: null };
  }
  // Check if existing has :root block
  if (/:root\s*\{/.test(existing)) {
    const updated = existing.replace(/(:root\s*\{[^}]*)(\})/, (_, body, end) => {
      const newVars = varMatches.join('\n  ');
      return `${body}  /* updated */\n  ${newVars}\n${end}`;
    });
    return { content: updated, warning: null };
  }
  return { content: existing + '\n\n' + newContent, warning: null };
}

function _patchPackageJson(existing, newContent) {
  try {
    const existingPkg = JSON.parse(existing);
    const newPkg      = JSON.parse(newContent);

    // Merge scripts
    if (newPkg.scripts) {
      existingPkg.scripts = { ...(existingPkg.scripts || {}), ...newPkg.scripts };
    }
    // Merge dependencies (new ones only — don't downgrade)
    if (newPkg.dependencies) {
      existingPkg.dependencies = { ...(existingPkg.dependencies || {}), ...newPkg.dependencies };
    }
    if (newPkg.devDependencies) {
      existingPkg.devDependencies = { ...(existingPkg.devDependencies || {}), ...newPkg.devDependencies };
    }
    return { content: JSON.stringify(existingPkg, null, 2), warning: null };
  } catch (_) {
    return { content: newContent, warning: `package.json merge failed — replaced with new content` };
  }
}

function _extractEnvVars(content) {
  return (content.match(/^[A-Z_][A-Z0-9_]*/gm) || []).filter(Boolean);
}

function _commentSeparator(path) {
  if (/\.(css|scss|less)$/i.test(path)) return '/* --- added by section regeneration --- */';
  if (/\.(jsx?|tsx?)$/i.test(path))     return '// --- added by section regeneration ---';
  if (/\.(html)$/i.test(path))          return '<!-- added by section regeneration -->';
  return '# --- added by section regeneration ---';
}

function _detectBrokenImports(files, deletedPaths) {
  const broken = [];
  for (const [fp, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue;
    for (const deleted of deletedPaths) {
      const stem = deleted.replace(/\.(js|ts|jsx|tsx)$/, '');
      if (content.includes(stem) && (content.includes('require(') || content.includes('import '))) {
        broken.push(fp);
        break;
      }
    }
  }
  return broken;
}

module.exports = {
  mergeRegeneratedSections,
  computeFileDiff,
  patchEnvExample,
};
