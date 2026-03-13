/**
 * codeValidator.js
 *
 * Static analysis of generated code files to detect common errors
 * before they reach the preview. Conservative by design — only flags
 * high-confidence issues to minimise false positives.
 *
 * Checks:
 *   HTML — unclosed <script> tags, inline JS issues
 *   JS   — const reassignment, severe brace imbalance
 */

const logger = require('./logger');

/**
 * Validates an array of generated file objects.
 * @param {Array<{path: string, content: string}>} files
 * @returns {Array<{type: string, file: string, message: string}>}
 */
function validateGeneratedCode(files) {
  const errors = [];
  for (const file of (files || [])) {
    const filePath = file.path || '';
    const content  = file.content || '';
    const ext      = filePath.split('.').pop().toLowerCase();

    try {
      if (ext === 'html') errors.push(...validateHtml(filePath, content));
      else if (ext === 'js') errors.push(...validateJs(filePath, content));
    } catch (e) {
      logger.debug(`codeValidator: error while validating ${filePath}: ${e.message}`);
    }
  }
  return errors;
}

// ── HTML validation ────────────────────────────────────────────────────────────

function validateHtml(filePath, content) {
  const errors = [];

  // 1. Unclosed <script> tags
  const scriptOpens  = (content.match(/<script(\s[^>]*)?\s*>/gi) || []).length;
  const scriptCloses = (content.match(/<\/script>/gi) || []).length;
  if (scriptOpens > scriptCloses) {
    errors.push({
      type: 'syntax',
      file: filePath,
      message: `Unclosed <script> tag (${scriptOpens} open, ${scriptCloses} close)`,
    });
  }

  // 2. Validate JS inside <script> blocks
  const scriptRe = /<script(?:\s[^>]*)?\s*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptRe.exec(content)) !== null) {
    const jsContent = m[1] || '';
    if (jsContent.trim()) {
      const jsErrors = validateJs(filePath, jsContent);
      errors.push(...jsErrors);
    }
  }

  return errors;
}

// ── JS validation ──────────────────────────────────────────────────────────────

function validateJs(filePath, content) {
  const errors = [];

  // Strip comments and strings to avoid false matches inside them
  const stripped = stripCommentsAndStrings(content);

  // 1. Const reassignment
  // Find all `const varName =` declarations, then check if varName is reassigned
  const constDeclRe = /\bconst\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
  let decl;
  const declared = new Map(); // varName → index of declaration

  while ((decl = constDeclRe.exec(stripped)) !== null) {
    // Don't flag destructuring consts (too many false positives)
    const varName = decl[1];
    if (!declared.has(varName)) {
      declared.set(varName, decl.index);
    }
  }

  for (const [varName, declIdx] of declared) {
    // Look for `varName =` that is NOT `varName ==` / `varName ===` / `varName =>`
    // and NOT the original const declaration itself
    const rePattern = new RegExp(
      `(?<![.?'"\`\\w])${escapeRegex(varName)}\\s*=[^=>]`,
      'g',
    );
    let re;
    while ((re = rePattern.exec(stripped)) !== null) {
      // Allow if it's within 5 chars of the original declaration (same statement)
      if (Math.abs(re.index - declIdx) <= varName.length + 10) continue;
      // Found a reassignment
      errors.push({
        type: 'const_reassignment',
        file: filePath,
        message: `"${varName}" is declared with const but reassigned later — use let instead`,
      });
      break; // only report once per variable
    }
  }

  // 2. Severe brace imbalance (only flag large discrepancies to avoid false positives)
  const opens  = (stripped.match(/\{/g) || []).length;
  const closes = (stripped.match(/\}/g) || []).length;
  const diff   = Math.abs(opens - closes);
  // Only flag if imbalance is > 3 (small imbalances can be template literals or false strips)
  if (diff > 3) {
    errors.push({
      type: 'syntax',
      file: filePath,
      message: `Mismatched braces: ${opens} opening { vs ${closes} closing } (diff ${diff})`,
    });
  }

  return errors;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Removes string literals and comments from JS code.
 * Replaces them with empty equivalents to preserve character positions approximately.
 */
function stripCommentsAndStrings(code) {
  let result = '';
  let i = 0;
  while (i < code.length) {
    // Template literal
    if (code[i] === '`') {
      result += '`';
      i++;
      while (i < code.length && code[i] !== '`') {
        if (code[i] === '\\') { result += '  '; i += 2; continue; }
        result += ' ';
        i++;
      }
      result += '`';
      i++;
      continue;
    }
    // Double-quoted string
    if (code[i] === '"') {
      result += '"';
      i++;
      while (i < code.length && code[i] !== '"') {
        if (code[i] === '\\') { result += '  '; i += 2; continue; }
        result += ' ';
        i++;
      }
      result += '"';
      i++;
      continue;
    }
    // Single-quoted string
    if (code[i] === "'") {
      result += "'";
      i++;
      while (i < code.length && code[i] !== "'") {
        if (code[i] === '\\') { result += '  '; i += 2; continue; }
        result += ' ';
        i++;
      }
      result += "'";
      i++;
      continue;
    }
    // Single-line comment
    if (code[i] === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') { result += ' '; i++; }
      continue;
    }
    // Multi-line comment
    if (code[i] === '/' && code[i + 1] === '*') {
      result += '  ';
      i += 2;
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        result += code[i] === '\n' ? '\n' : ' ';
        i++;
      }
      result += '  ';
      i += 2;
      continue;
    }
    result += code[i];
    i++;
  }
  return result;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Quick fixes ────────────────────────────────────────────────────────────────

/**
 * Applies regex-based fixes for simple, high-confidence errors without an AI call.
 * Currently handles: const_reassignment → replaces `const varName =` with `let varName =`.
 *
 * @param {Array<{path: string, content: string}>} files
 * @param {Array<{type: string, file: string, message: string}>} errors
 * @returns {Array<{path: string, content: string}>} fixed files (same reference if nothing changed)
 */
function applyQuickFixes(files, errors) {
  // Collect const→let targets grouped by file
  const fixesByFile = new Map();
  for (const e of errors) {
    if (e.type !== 'const_reassignment') continue;
    const match = e.message.match(/"([^"]+)" is declared with const/);
    if (!match) continue;
    if (!fixesByFile.has(e.file)) fixesByFile.set(e.file, new Set());
    fixesByFile.get(e.file).add(match[1]);
  }
  if (fixesByFile.size === 0) return files;

  let anyChanged = false;
  const result = files.map((f) => {
    const vars = fixesByFile.get(f.path);
    if (!vars || vars.size === 0) return f;
    let content = f.content;
    for (const varName of vars) {
      content = content.replace(
        new RegExp(`\\bconst\\s+(${escapeRegex(varName)})\\s*=`, 'g'),
        'let $1 =',
      );
    }
    if (content === f.content) return f;
    anyChanged = true;
    return { ...f, content };
  });

  return anyChanged ? result : files;
}

module.exports = { validateGeneratedCode, applyQuickFixes };
