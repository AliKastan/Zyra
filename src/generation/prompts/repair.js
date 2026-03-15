'use strict';

/**
 * Stage 7 — Repair Pass.
 *
 * Fixes issues found by the validator. Unlike the initial code passes, this
 * prompt provides full context: the blueprint spec, the validation findings,
 * AND the current file content. The repair agent must fix everything — not just
 * critical issues — and must not regress anything that was already working.
 */

/**
 * @param {Array<{path:string,content:string}>} files
 * @param {import('../types').ValidationIssue[]} issues  - all issues, any severity
 * @param {import('../types').AppBlueprint} blueprint
 * @returns {{ system: string, user: string }}
 */
function buildRepairPrompt(files, issues, blueprint) {
  const filesToRepair = [...new Set(issues.map(i => i.file))];

  const fileBlocks = files
    .filter(f => filesToRepair.includes(f.path))
    .map(f => `---FILE: ${f.path}---\n${f.content}\n---END FILE---`)
    .join('\n\n');

  const criticalIssues = issues.filter(i => i.severity === 'critical');
  const warningIssues  = issues.filter(i => i.severity === 'warning');

  const issueList = [
    criticalIssues.length > 0 ? `CRITICAL (must fix):\n${criticalIssues.map(i => `  [${i.file}] ${i.type}: ${i.message}`).join('\n')}` : '',
    warningIssues.length > 0  ? `WARNINGS (fix if possible):\n${warningIssues.map(i => `  [${i.file}] ${i.type}: ${i.message}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  // Blueprint spec for the affected files
  const affectedSpecs = (blueprint.fileSpecs || [])
    .filter(s => filesToRepair.includes(s.path))
    .map(s => `  ${s.path}: ${s.description}\n    ${s.htmlStructure || s.cssRules || ''}`)
    .join('\n');

  const system = `You are a code quality engineer fixing issues in generated web application files.

Return ONLY the corrected files using this exact format:
---FILE: path/to/file---
[complete corrected file content]
---END FILE---

Return the FULL file content, not just the changed sections.

REPAIR PRINCIPLES:
1. Fix every critical issue listed — these must be resolved
2. Fix warnings where you can do so without regressions
3. Do not remove features or functionality that was working
4. Do not change class names, IDs, or data-* attributes — other files depend on them
5. Ensure HTML files still link to their CSS and JS files
6. Ensure JS functions still reference the correct DOM element IDs and classes
7. After fixing a missing file — create it with complete, working content
8. After fixing an empty file — write the complete intended content based on the blueprint spec`;

  const user = `ISSUES TO FIX:\n${issueList}\n\nBLUEPRINT SPEC FOR AFFECTED FILES:\n${affectedSpecs || '(see file content below)'}\n\nCURRENT FILE CONTENT:\n${fileBlocks}`;

  return { system, user };
}

module.exports = { buildRepairPrompt };
