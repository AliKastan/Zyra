'use strict';

/**
 * Context Window Pruning
 *
 * Instead of sending the full project context to every pipeline stage,
 * extract only the slice that is relevant to the current task.
 *
 * Task → relevant context domains:
 *   ui         → design tokens, components, pages, layout (no backend)
 *   backend    → API routes, models, auth, database (no UI copy)
 *   planning   → summary, file tree, tech stack (no implementation detail)
 *   validation → files, requirements, schema
 *   repair     → specific issue + minimal surrounding context
 *   ranking    → architecture, completeness, readiness summaries
 */

// Keyword patterns that make a context key relevant for a task type
const TASK_RELEVANCE = {
  ui:         ['design', 'component', 'page', 'color', 'token', 'typography', 'layout', 'ux', 'theme', 'css', 'style', 'font', 'spacing'],
  backend:    ['api', 'route', 'model', 'auth', 'database', 'middleware', 'service', 'integration', 'server', 'controller'],
  planning:   ['summary', 'stack', 'files', 'steps', 'apptype', 'goal', 'feature', 'platform'],
  validation: ['files', 'requirement', 'schema', 'check', 'issue', 'error'],
  repair:     ['issue', 'target', 'context', 'blueprint', 'fix', 'repair'],
  ranking:    ['architecture', 'completeness', 'readiness', 'authenticity', 'prevention', 'score'],
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Prune a context object to include only keys relevant for the given task type.
 *
 * @param {Object} context - Full context object (blueprint, intent, etc.)
 * @param {string} taskType - 'ui' | 'backend' | 'planning' | 'validation' | 'repair' | 'ranking'
 * @returns {{ pruned: Object, removedKeys: string[], tokensSaved: number }}
 */
function pruneContextForTask(context, taskType) {
  if (!context || typeof context !== 'object') {
    return { pruned: {}, removedKeys: [], tokensSaved: 0 };
  }

  const patterns = TASK_RELEVANCE[taskType];
  if (!patterns || patterns.length === 0) {
    return { pruned: context, removedKeys: [], tokensSaved: 0 };
  }

  const pruned      = {};
  const removedKeys = [];
  let   removedChars = 0;

  for (const [key, value] of Object.entries(context)) {
    const lowerKey   = key.toLowerCase();
    const isRelevant = patterns.some(p => lowerKey.includes(p));
    if (isRelevant) {
      pruned[key] = value;
    } else {
      removedKeys.push(key);
      try { removedChars += JSON.stringify(value).length; } catch (_) {}
    }
  }

  return {
    pruned,
    removedKeys,
    tokensSaved: Math.ceil(removedChars / 4),
  };
}

/**
 * Extract a relevant slice of a prompt string by task type.
 * Splits on Markdown section headers and keeps only relevant sections.
 *
 * @param {string} promptText
 * @param {string} taskType
 * @returns {{ sliced: string, originalTokens: number, slicedTokens: number, saved: number }}
 */
function slicePromptByTask(promptText, taskType) {
  if (!promptText || typeof promptText !== 'string') {
    return { sliced: '', originalTokens: 0, slicedTokens: 0, saved: 0 };
  }

  const originalTokens = Math.ceil(promptText.length / 4);
  const patterns       = TASK_RELEVANCE[taskType];

  if (!patterns || patterns.length === 0) {
    return { sliced: promptText, originalTokens, slicedTokens: originalTokens, saved: 0 };
  }

  const sections = _splitIntoSections(promptText);
  const kept     = sections.filter(s => {
    if (s.isFirst) return true;   // always keep the preamble/intro
    const headerLower = (s.header || '').toLowerCase();
    return patterns.some(p => headerLower.includes(p));
  });

  const sliced       = kept.map(s => s.content).join('\n\n').trim();
  const slicedTokens = Math.ceil(sliced.length / 4);

  return {
    sliced,
    originalTokens,
    slicedTokens,
    saved: Math.max(0, originalTokens - slicedTokens),
  };
}

/**
 * Estimate context size in tokens.
 * @param {*} context - String or JSON-serializable value
 * @returns {number}
 */
function estimateContextSize(context) {
  if (!context) return 0;
  try {
    const str = typeof context === 'string' ? context : JSON.stringify(context);
    return Math.ceil(str.length / 4);
  } catch (_) {
    return 0;
  }
}

/**
 * Stub large file contents to reduce context size.
 * Files larger than maxFileSizeChars have their content replaced with a placeholder.
 *
 * @param {Object} files           - { path: content } map
 * @param {number} [maxFileSizeChars=2000]
 * @returns {{ pruned: Object, stubCount: number, tokensSaved: number }}
 */
function pruneFileContext(files, maxFileSizeChars = 2000) {
  if (!files || typeof files !== 'object') {
    return { pruned: {}, stubCount: 0, tokensSaved: 0 };
  }

  const pruned    = {};
  let   stubCount  = 0;
  let   tokensSaved = 0;

  for (const [path, content] of Object.entries(files)) {
    const str = typeof content === 'string' ? content : (content?.content || '');
    if (str.length > maxFileSizeChars) {
      const stub = `[${path}: ${str.length} chars — omitted for context efficiency]`;
      pruned[path] = stub;
      stubCount++;
      tokensSaved += Math.ceil((str.length - stub.length) / 4);
    } else {
      pruned[path] = str;
    }
  }

  return { pruned, stubCount, tokensSaved };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _splitIntoSections(text) {
  const lines    = text.split('\n');
  const sections = [];
  let   current  = { header: '', content: '', isFirst: true };
  let   pastFirst = false;

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/) ||
                        line.match(/^(={3,}|-{3,})\s*(.*)$/);
    if (headerMatch && pastFirst) {
      sections.push(current);
      current = { header: (headerMatch[2] || '').trim(), content: line + '\n', isFirst: false };
    } else {
      current.content += line + '\n';
      if (!pastFirst && line.trim()) pastFirst = true;
    }
  }
  sections.push(current);
  return sections;
}

module.exports = {
  pruneContextForTask,
  slicePromptByTask,
  estimateContextSize,
  pruneFileContext,
};
