'use strict';

/**
 * visualDebugger.js
 * Visual bug analysis using Claude's vision API (claude-sonnet-4-6).
 * Falls back to text-only CSS/HTML analysis when no screenshot is available.
 */

const axios           = require('axios');
const { env }         = require('../config/env');
const logger          = require('../utils/logger');
const { maskString }  = require('./secretMasker');
const { safeJsonParse } = require('../utils/safeJsonParse');

// ── Constants ─────────────────────────────────────────────────────────────────

const VISUAL_TIMEOUT     = 45000;
const ANTHROPIC_API_URL  = 'https://api.anthropic.com/v1/messages';
const VISION_MODEL       = 'claude-sonnet-4-6';
const MAX_TOKENS         = 1024;

const ISSUE_CLASSES = [
  'broken_layout', 'overflow', 'modal_issue', 'nav_issue',
  'spacing', 'responsive', 'contrast', 'hidden_elements',
  'form_misalignment', 'general_ui',
];

// ── System prompt ─────────────────────────────────────────────────────────────

const VISUAL_SYSTEM_PROMPT = `You are a UI/UX debugging AI. Analyze this app screenshot for bugs and visual issues.
Return JSON only:
{
  "summary": "one sentence describing the visual issue",
  "issueClass": "broken_layout|overflow|modal_issue|nav_issue|spacing|responsive|contrast|hidden_elements|form_misalignment|general_ui",
  "affectedComponent": "component name or area",
  "probableFile": "most likely source file",
  "rootCause": "technical explanation of what causes this",
  "suggestedFix": "concrete fix description",
  "confidence": 0.0,
  "cssSnippet": "relevant CSS snippet or null"
}`;

// ── Text-only CSS/HTML analysis ───────────────────────────────────────────────

/**
 * Resolve a file from projectFiles by partial name match (case-insensitive).
 */
function getFile(projectFiles, suffix) {
  if (!projectFiles) return null;
  const key = Object.keys(projectFiles).find((p) =>
    p.replace(/\\/g, '/').toLowerCase().endsWith(suffix.toLowerCase())
  );
  return key ? projectFiles[key] : null;
}

/**
 * Analyze CSS and HTML files for common visibility/layout bugs without a screenshot.
 * Returns a VisualFinding with screenshotAnalyzed: false.
 */
function analyzeTextOnly(projectFiles, userDescription, projectMeta) {
  const cssContent  = getFile(projectFiles, '.css')       || '';
  const htmlContent = getFile(projectFiles, 'index.html') || '';

  const issues  = [];
  let issueClass = 'general_ui';
  let probableFile = null;
  let cssSnippet   = null;

  // --- display:none on major containers ---
  const displayNoneMatch = cssContent.match(/(?:body|html|#app|#root|\.app|\.container|\.wrapper|main)[^{]*\{[^}]*display\s*:\s*none[^}]*\}/gi);
  if (displayNoneMatch) {
    issues.push('display:none applied to a major container element');
    issueClass  = 'hidden_elements';
    cssSnippet  = displayNoneMatch[0].slice(0, 300);
    probableFile = Object.keys(projectFiles || {}).find((p) => p.endsWith('.css')) || null;
  }

  // --- overflow:hidden on body blocking scroll ---
  const overflowHiddenBody = /body\s*\{[^}]*overflow\s*:\s*hidden/i.test(cssContent);
  if (overflowHiddenBody) {
    issues.push('overflow:hidden on body may cut off content');
    if (!issueClass || issueClass === 'general_ui') issueClass = 'overflow';
    cssSnippet = cssSnippet || 'body { overflow: hidden; }';
    probableFile = probableFile || Object.keys(projectFiles || {}).find((p) => p.endsWith('.css')) || null;
  }

  // --- z-index issues (very high z-index overlay) ---
  const highZindex = cssContent.match(/z-index\s*:\s*(?:99999|9999999|\d{6,})/g);
  if (highZindex) {
    issues.push(`Extreme z-index values (${highZindex[0]}) may block interaction`);
    if (issueClass === 'general_ui') issueClass = 'modal_issue';
  }

  // --- fixed heights blocking content ---
  const fixedHeightMatch = cssContent.match(/(?:body|html|#app|#root|\.app|\.container)[^{]*\{[^}]*height\s*:\s*\d+px[^}]*\}/gi);
  if (fixedHeightMatch) {
    issues.push('Fixed pixel height on a root element may clip content');
    if (issueClass === 'general_ui') issueClass = 'broken_layout';
    cssSnippet = cssSnippet || fixedHeightMatch[0].slice(0, 200);
  }

  // --- visibility:hidden on major elements ---
  const visHiddenMatch = cssContent.match(/(?:body|html|#app|#root)[^{]*\{[^}]*visibility\s*:\s*hidden/gi);
  if (visHiddenMatch) {
    issues.push('visibility:hidden on root element');
    issueClass = 'hidden_elements';
    probableFile = probableFile || Object.keys(projectFiles || {}).find((p) => p.endsWith('.css')) || null;
  }

  // --- No viewport meta in HTML (mobile issues) ---
  if (htmlContent && !/<meta[^>]+viewport/i.test(htmlContent)) {
    issues.push('Missing viewport meta tag — may cause mobile layout issues');
    if (issueClass === 'general_ui') issueClass = 'responsive';
    probableFile = probableFile || Object.keys(projectFiles || {}).find((p) => p.endsWith('.html')) || null;
  }

  // --- color contrast: light text on light bg (very rough heuristic) ---
  const lightOnLight = /#f{3,6}|#e{3,6}|rgb\(25[0-5]/gi;
  const darkContrast = /color\s*:\s*(?:#fff|white|#f{3,6})/gi;
  if (lightOnLight.test(cssContent) && !darkContrast.test(cssContent)) {
    issues.push('Possible low contrast: light background with no explicit dark text');
    if (issueClass === 'general_ui') issueClass = 'contrast';
  }

  const summary = issues.length > 0
    ? issues.join('; ')
    : userDescription
      ? `No obvious CSS issues found — user reported: ${maskString(userDescription)}`
      : 'No obvious visual issues detected in CSS/HTML static analysis.';

  const confidence = issues.length >= 2 ? 0.70
    : issues.length === 1 ? 0.55
    : 0.25;

  return {
    summary:             summary.slice(0, 400),
    issueClass,
    affectedComponent:   issueClass !== 'general_ui' ? issueClass.replace(/_/g, ' ') : 'Unknown',
    probableFile:        probableFile || null,
    rootCause:           issues.length > 0 ? issues[0] : 'No CSS/HTML root cause identified.',
    suggestedFix:        issues.length > 0
      ? 'Review the flagged CSS rules and remove or override the problematic declarations.'
      : 'Share a screenshot for more accurate visual debugging.',
    confidence,
    screenshotAnalyzed:  false,
  };
}

// ── Vision API call ───────────────────────────────────────────────────────────

/**
 * Build the image content block for the Claude vision request.
 */
function buildImageBlock(screenshotBase64, screenshotUrl) {
  if (screenshotBase64) {
    return {
      type:   'image',
      source: {
        type:       'base64',
        media_type: 'image/png',
        data:       screenshotBase64,
      },
    };
  }
  // URL-based image
  return {
    type:   'image',
    source: {
      type: 'url',
      url:  screenshotUrl,
    },
  };
}

/**
 * Send screenshot to Claude vision and parse the response.
 */
async function callClaudeVision(imageBlock, textDescription) {
  const response = await axios.post(
    ANTHROPIC_API_URL,
    {
      model:      VISION_MODEL,
      max_tokens: MAX_TOKENS,
      system:     VISUAL_SYSTEM_PROMPT,
      messages:   [{
        role:    'user',
        content: [
          imageBlock,
          { type: 'text', text: textDescription },
        ],
      }],
    },
    {
      headers: {
        'x-api-key':          env.ANTHROPIC_API_KEY,
        'anthropic-version':  '2023-06-01',
        'content-type':       'application/json',
      },
      timeout: VISUAL_TIMEOUT,
    }
  );

  const content = response.data && response.data.content;
  if (!Array.isArray(content) || content.length === 0) {
    throw new Error('Claude vision returned empty response');
  }

  const textBlock = content.find((c) => c.type === 'text');
  if (!textBlock || !textBlock.text) {
    throw new Error('Claude vision response contained no text block');
  }

  return textBlock.text;
}

// ── Response validation ───────────────────────────────────────────────────────

function validateVisualFinding(data, screenshotAnalyzed) {
  if (!data || typeof data !== 'object') return null;

  const issueClass = ISSUE_CLASSES.includes(data.issueClass) ? data.issueClass : 'general_ui';
  const confidence = typeof data.confidence === 'number'
    ? Math.max(0, Math.min(1, data.confidence))
    : 0.5;

  return {
    summary:            typeof data.summary === 'string'            ? maskString(data.summary) : 'Visual analysis complete.',
    issueClass,
    affectedComponent:  typeof data.affectedComponent === 'string'  ? data.affectedComponent : null,
    probableFile:       typeof data.probableFile === 'string'       ? data.probableFile : null,
    rootCause:          typeof data.rootCause === 'string'          ? maskString(data.rootCause) : null,
    suggestedFix:       typeof data.suggestedFix === 'string'       ? maskString(data.suggestedFix) : null,
    confidence,
    screenshotAnalyzed,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyze a visual bug using a screenshot (vision) or text-only CSS/HTML analysis.
 *
 * @param {object} params
 * @param {string|null}  params.screenshotBase64   - base64-encoded PNG
 * @param {string|null}  params.screenshotUrl      - public URL of screenshot
 * @param {string|null}  params.userDescription    - what the user says is wrong
 * @param {object}       params.projectFiles       - { [path]: content }
 * @param {object}       params.projectMeta        - { slug, name, type }
 * @returns {Promise<VisualFinding>}
 */
async function analyzeVisualBug({ screenshotBase64, screenshotUrl, userDescription, projectFiles, projectMeta }) {
  const files = projectFiles || {};
  const meta  = projectMeta || {};
  const desc  = userDescription ? maskString(String(userDescription)) : '';

  const hasScreenshot = (screenshotBase64 && screenshotBase64.length > 0) ||
                        (screenshotUrl    && screenshotUrl.length > 0);

  // ── Vision path ─────────────────────────────────────────────────────────────
  if (hasScreenshot && env.ANTHROPIC_API_KEY) {
    logger.debug('visualDebugger: using vision API', { model: VISION_MODEL });

    try {
      const imageBlock = buildImageBlock(screenshotBase64 || null, screenshotUrl || null);

      // Build descriptive text for the vision call
      const projectName = meta.name || meta.slug || 'the project';
      const fileList    = Object.keys(files).filter((p) => !/node_modules/.test(p)).join(', ') || 'unknown';
      const textMsg     = [
        `Project: ${projectName}`,
        `Files: ${fileList.slice(0, 300)}`,
        desc ? `User reported issue: ${desc}` : null,
        'Analyze the screenshot above and identify any UI/UX bugs or visual issues. Return your findings as JSON.',
      ].filter(Boolean).join('\n');

      const rawText = await callClaudeVision(imageBlock, textMsg);

      const parsed = safeJsonParse(rawText);
      if (parsed.success && parsed.data) {
        const finding = validateVisualFinding(parsed.data, true);
        if (finding) {
          logger.info('visualDebugger: vision analysis complete', { issueClass: finding.issueClass, confidence: finding.confidence });
          return finding;
        }
      }

      logger.warn('visualDebugger: vision response parse failed, falling back to text analysis');
    } catch (err) {
      logger.error('visualDebugger: vision API call failed', { error: err.message });
      // Fall through to text-only analysis
    }
  }

  // ── Text-only path ───────────────────────────────────────────────────────────
  logger.debug('visualDebugger: using text-only CSS/HTML analysis');
  return analyzeTextOnly(files, desc, meta);
}

module.exports = { analyzeVisualBug };
