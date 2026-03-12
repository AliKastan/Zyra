/**
 * debugPromptBuilder.js — compact AI debug prompt.
 * Target: ~100 token system + compact user context.
 * AI must return: { rootCause, explanation, confidence, affectedFiles, patch, issueType,
 *                   canAutoApply, severity, suggestion }
 */

const MAX_FILE_CHARS  = 5000;
const MAX_TOTAL_CHARS = 15000;

const DEBUG_SYSTEM = `Web app debugger. Analyze the project and identify the root cause of the issue.
Output JSON only:
{"rootCause":"concise description","explanation":"why it broke and how to fix it","confidence":0.9,"affectedFiles":["path.js"],"patch":[{"path":"filename","content":"COMPLETE file content"}],"issueType":"syntax_error|missing_import|undefined_variable|css_visibility|broken_handler|missing_dep|runtime_crash|truncation|logic_error|other","canAutoApply":true,"severity":"high|medium|low","suggestion":"if no safe patch, what user should do manually"}
Rules: include patch only if confident and fix is small/targeted. content must be COMPLETE file, not a diff. canAutoApply=true only if confidence>0.8 and patch is minimal. Output raw JSON only, no markdown.`;

/**
 * Build a compact user context string for the debug prompt.
 *
 * @param {object} signals - { previewState, consoleErrors, userDescription, previewUrl }
 * @param {Array<{path: string, content: string}>} relevantFiles
 * @param {object} projectMeta - { slug, appType, prompt }
 * @returns {{ system: string, user: string, contextChars: number }}
 */
function buildDebugPrompt(signals, relevantFiles, projectMeta) {
  const lines = [];

  // Project context
  if (projectMeta) {
    if (projectMeta.slug)    lines.push(`Project: ${projectMeta.slug}`);
    if (projectMeta.appType) lines.push(`Type: ${projectMeta.appType}`);
    if (projectMeta.prompt)  lines.push(`Original prompt: ${String(projectMeta.prompt).slice(0, 300)}`);
  }

  // Debug signals
  lines.push('');
  lines.push('== Debug Signals ==');

  if (signals.previewState) {
    lines.push(`Preview state: ${signals.previewState}`);
  }

  if (signals.userDescription) {
    lines.push(`User description: ${String(signals.userDescription).slice(0, 500)}`);
  }

  if (signals.consoleErrors && signals.consoleErrors.length > 0) {
    lines.push('Console errors:');
    for (const err of signals.consoleErrors.slice(0, 5)) {
      const msg = (err.message || err.text || '').slice(0, 300);
      const loc = err.filename ? ` [${err.filename}:${err.lineno || '?'}]` : '';
      lines.push(`  - ${msg}${loc}`);
    }
  }

  // Files
  lines.push('');
  lines.push('== Project Files ==');

  let totalChars = lines.join('\n').length;

  for (const file of relevantFiles) {
    const truncated = (file.content || '').slice(0, MAX_FILE_CHARS);
    const wasTruncated = (file.content || '').length > MAX_FILE_CHARS;
    const fileBlock = `\n--- ${file.path} ---\n${truncated}${wasTruncated ? '\n[...truncated]' : ''}`;

    if (totalChars + fileBlock.length > MAX_TOTAL_CHARS) {
      // Partially include if there's room for at least a few hundred chars
      const remaining = MAX_TOTAL_CHARS - totalChars - 50;
      if (remaining > 200) {
        const partial = `\n--- ${file.path} ---\n${truncated.slice(0, remaining)}\n[...truncated due to context limit]`;
        lines.push(partial);
        totalChars += partial.length;
      }
      break;
    }

    lines.push(fileBlock);
    totalChars += fileBlock.length;
  }

  const user = lines.join('\n');

  return {
    system: DEBUG_SYSTEM,
    user,
    contextChars: user.length,
  };
}

/**
 * Select up to 5 most relevant files for the debug prompt.
 * Priority: affectedFiles from local issues > console error filenames > index.html/style.css/app.js
 *
 * @param {Array<{path: string, content: string}>} allFiles
 * @param {object} signals - { consoleErrors }
 * @param {Array} localIssues - issues from analyzeProject
 * @returns {Array<{path: string, content: string}>}
 */
function selectRelevantFiles(allFiles, signals, localIssues) {
  const MAX_FILES = 5;
  const selectedPaths = new Set();
  const result = [];

  function addFile(filePath) {
    if (selectedPaths.has(filePath)) return;
    const file = allFiles.find(f => f.path === filePath);
    if (!file) return;
    selectedPaths.add(filePath);
    result.push(file);
  }

  // Priority 1: Files mentioned in local issues (highest priority)
  for (const issue of (localIssues || [])) {
    for (const fp of (issue.affectedFiles || [])) {
      if (result.length >= MAX_FILES) break;
      addFile(fp);
    }
    if (result.length >= MAX_FILES) break;
  }

  // Priority 2: Files mentioned in console error filenames
  if (result.length < MAX_FILES) {
    for (const err of (signals.consoleErrors || [])) {
      if (result.length >= MAX_FILES) break;
      if (!err.filename) continue;
      // Extract basename from URL
      const parts = err.filename.split('/');
      const basename = parts[parts.length - 1].split('?')[0];
      if (!basename) continue;

      // Find matching file in project
      const match = allFiles.find(f => f.path === basename || f.path.endsWith('/' + basename));
      if (match) addFile(match.path);
    }
  }

  // Priority 3: Core files — always include if space permits
  const coreFiles = ['index.html', 'style.css', 'styles.css', 'app.js', 'main.js', 'script.js', 'index.js'];
  for (const name of coreFiles) {
    if (result.length >= MAX_FILES) break;
    addFile(name);
  }

  // Fill remaining slots with any JS/HTML/CSS files not yet included
  if (result.length < MAX_FILES) {
    for (const file of allFiles) {
      if (result.length >= MAX_FILES) break;
      const ext = file.path.split('.').pop().toLowerCase();
      if (ext === 'js' || ext === 'html' || ext === 'htm' || ext === 'css') {
        addFile(file.path);
      }
    }
  }

  return result;
}

module.exports = { buildDebugPrompt, selectRelevantFiles, DEBUG_SYSTEM };
