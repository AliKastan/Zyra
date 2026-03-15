'use strict';

/**
 * Stage 5 — Two-Pass Code Generation.
 *
 * Pass 1 — Structure: generates ALL HTML files.
 *   Each page is written as complete, semantic HTML with real content, proper
 *   class names, data-* attributes, and correct <link>/<script> references.
 *   No CSS or JS is written in this pass — full focus on structure.
 *
 * Pass 2 — Implementation: given the actual HTML, generates CSS and JS.
 *   Because this pass sees the exact class names, IDs, and DOM structure, the
 *   stylesheet and logic are guaranteed to match the real HTML rather than a
 *   hypothetical structure.
 *
 * Why two passes outperforms one:
 *   - Each pass has a single clear responsibility and a full token budget
 *   - CSS targets real class names (not imagined ones), preventing orphaned rules
 *   - JS references real element IDs and data-* attributes, preventing null errors
 *   - HTML receives full attention first; CSS and JS receive full attention second
 *   - No single pass is budget-constrained by the combined size of all three layers
 */

const { callClaudeStream, SONNET_MODEL }         = require('../../providers/anthropicProvider');
const { buildStructurePassPrompt }                = require('../prompts/code');
const { buildImplementationPassPrompt }           = require('../prompts/codePass2');
const { parseFileDelimited }                      = require('../../utils/parseFileDelimited');
const { validateGeneratedCode, applyQuickFixes }  = require('../../utils/codeValidator');
const { withTimeout }                             = require('../../utils/withTimeout');
const limits                                      = require('../../config/limits');
const logger                                      = require('../../utils/logger');

// Token budgets per pass — quality-focused; no artificial caps
const PASS_TOKENS = {
  structure:      parseInt(process.env.CODE_PASS1_TOKENS || '16000', 10),  // HTML files
  implementation: parseInt(process.env.CODE_PASS2_TOKENS || '28000', 10), // CSS + JS
};

/**
 * Streams a Sonnet generation call and collects the full raw text.
 *
 * @param {string} system
 * @param {string} user
 * @param {number} maxTokens
 * @param {string} timeoutLabel
 * @param {Function} [onFileFound]  - called each time a new ---FILE: header is detected
 * @returns {Promise<string>}
 */
async function _stream(system, user, maxTokens, timeoutLabel, onFileFound) {
  let raw       = '';
  let fileCount = 0;

  const onChunk = (delta) => {
    raw += delta;
    const newCount = (raw.match(/---FILE:/g) || []).length;
    if (newCount > fileCount) {
      fileCount = newCount;
      if (onFileFound) onFileFound(fileCount);
    }
  };

  await withTimeout(
    callClaudeStream(system, user, { model: SONNET_MODEL, maxTokens }, onChunk),
    limits.CODER_TIMEOUT_MS,
    timeoutLabel,
  );

  return raw;
}

/**
 * Parses ---FILE--- blocks and throws if nothing was produced.
 * @param {string} raw
 * @param {string} passName
 * @returns {Array<{path:string,content:string}>}
 */
function _parseOrThrow(raw, passName) {
  const { success, files, error } = parseFileDelimited(raw);
  if (!success || !files || files.length === 0) {
    const err = new Error(`${passName} produced no parseable ---FILE--- blocks: ${error || 'unknown'}`);
    err.errorType = 'parse_error';
    throw err;
  }
  return files;
}

/**
 * Stage 5 — Two-Pass Code Generation.
 *
 * @param {import('../types').AppBlueprint} blueprint
 * @param {object} cost            - cost tracker instance
 * @param {Function} [onProgress]  - (progress: { current, total, stage }) => void
 * @param {Function} [log]         - async (msg: string) => void
 * @returns {Promise<{ files: import('../types').GeneratedFile[], projectName: string }>}
 */
async function generateCode(blueprint, cost, onProgress, log) {
  const emit        = async (msg) => { try { if (log) await log(msg); } catch (_) {} };
  const htmlFiles   = (blueprint.fileList || []).filter(f => f.endsWith('.html'));
  const assetFiles  = (blueprint.fileList || []).filter(f => !f.endsWith('.html'));
  const totalFiles  = (blueprint.fileList || []).length;

  logger.info(`codeGenerator: pass1 HTML (${htmlFiles.length} files), pass2 assets (${assetFiles.length} files)`);

  // ── Pass 1: HTML Structure ──────────────────────────────────────────────────
  await emit(`Pass 1 of 2 — generating HTML structure (${htmlFiles.length} pages)...`);

  const { system: s1, user: u1 } = buildStructurePassPrompt(blueprint);

  let pass1Count = 0;
  const raw1 = await _stream(s1, u1, PASS_TOKENS.structure, 'Pass 1: HTML structure', (n) => {
    pass1Count = n;
    if (onProgress) onProgress({ current: n, total: totalFiles, stage: 'structure' });
  });

  if (cost) cost.record('code-pass1', s1, u1, raw1, { model: SONNET_MODEL });

  const htmlParsed = _parseOrThrow(raw1, 'Pass 1 (HTML structure)');
  logger.info(`codeGenerator: pass1 produced ${htmlParsed.length} file(s)`);

  // Apply quick-fixes to HTML (doctype, viewport meta, link tags)
  const htmlValidationErrors = validateGeneratedCode(htmlParsed);
  const htmlFixed            = applyQuickFixes(htmlParsed, htmlValidationErrors);

  // ── Pass 2: CSS + JavaScript ────────────────────────────────────────────────
  await emit(`Pass 2 of 2 — generating CSS and JavaScript...`);

  const { system: s2, user: u2 } = buildImplementationPassPrompt(blueprint, htmlFixed);

  let pass2Count = htmlFixed.length; // start progress counter after HTML files
  const raw2 = await _stream(s2, u2, PASS_TOKENS.implementation, 'Pass 2: CSS + JS', (n) => {
    pass2Count = htmlFixed.length + n;
    if (onProgress) onProgress({ current: pass2Count, total: totalFiles, stage: 'implementation' });
  });

  if (cost) cost.record('code-pass2', s2, u2, raw2, { model: SONNET_MODEL });

  const assetParsed = _parseOrThrow(raw2, 'Pass 2 (CSS + JS)');
  logger.info(`codeGenerator: pass2 produced ${assetParsed.length} file(s)`);

  // Apply quick-fixes to JS files
  const assetValidationErrors = validateGeneratedCode(assetParsed);
  const assetFixed            = applyQuickFixes(assetParsed, assetValidationErrors);

  // ── Merge: HTML from Pass 1 + CSS/JS from Pass 2 ───────────────────────────
  // Pass 2 may regenerate or patch HTML files — if so, its version wins
  const fileMap = new Map(htmlFixed.map(f => [f.path, f.content]));
  for (const f of assetFixed) fileMap.set(f.path, f.content);

  const files = Array.from(fileMap.entries()).map(([path, content]) => ({ path, content }));

  if (onProgress) onProgress({ current: files.length, total: totalFiles, stage: 'done' });

  logger.info(`codeGenerator: total ${files.length} files (${htmlFixed.length} HTML + ${assetFixed.length} CSS/JS)`);

  return { files, projectName: blueprint.projectName };
}

module.exports = { generateCode };
