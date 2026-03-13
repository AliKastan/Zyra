/**
 * System + user prompts for each generation stage.
 *
 * Token budget philosophy:
 *   - DESIGN_GUIDELINES: ~130 tokens (was ~1,060)
 *   - JSON_OUTPUT_RULES: ~50 tokens (was ~345)
 *   - CODER_SYSTEM total: ~280 tokens (was ~1,693)
 *   These reductions save ~1,400 tokens on every full-generation coder call.
 */

// ── Planner (compact) ─────────────────────────────────────────────────────────

const PLANNER_SYSTEM = `App planner. Raw JSON only, no prose.
Schema: {"summary":"≤12 words","stack":"e.g. HTML/CSS/JS","files":["index.html","style.css","app.js"],"steps":["step 1","step 2"]}
Rules: files≤10, steps≤5, frontend→HTML/CSS/JS unless Node explicitly needed.`;

// ── Compact design rules (injected once into each coder prompt) ───────────────
// ~130 tokens vs the previous 1,060-token DESIGN_GUIDELINES block.

const DESIGN = `
UI rules (mandatory):
- Font: system-ui,-apple-system,'Segoe UI',Roboto,sans-serif. H1 clamp(2.5rem,6vw,4.5rem)/800/−.04em. Body 1rem/1.65.
- ONE accent color (indigo #4F46E5, teal #0D9488, violet #7C3AED, or dark-appropriate). Near-white bg for light themes (#f8fafc/#fff). #0f172a primary text.
- Layout: 1100px max-w, 80–120px section padding, 8px grid. Cards: white bg, 1px #e2e8f0 border, 12px radius, subtle shadow.
- Nav sticky 64px. Buttons 44px min-height/8px radius/600 weight. Inputs 44px height.
- NO emoji decorations. NO Bootstrap/CDN frameworks. NO lorem ipsum. Realistic content only.
- Mobile: 44px touch targets, flexbox/grid layout, 768px breakpoint.
- For mobile app UIs: 375px canvas, 44px top bar, 60px tab bar, 16px page margins.`;

// ── JSON output rules (compact) ───────────────────────────────────────────────
// ~50 tokens vs the previous 345-token JSON_OUTPUT_RULES block.

const JSON_RULES = `
OUTPUT: Pure JSON only. No markdown fences, no text before/after.
Escape inside strings: \\" for quotes, \\n for newlines, \\\\ for backslashes.
Must pass JSON.parse() as-is.`;

// ── Full-stack backend rules (~190 tokens) ─────────────────────────────────
// Injected into coder prompts when the app needs data persistence or auth.

const FULLSTACK_RULES = `
BACKEND: This app needs data persistence. Use the ZyraApp SDK (already available as a script tag).

Init pattern (put in every HTML file that uses the backend):
<script src="/zyra-sdk.js"></script>
<script>
const app = new ZyraApp('__ZYRA_PROJECT_ID__');
app.init().then(() => {
  app.onAuth(user => { if (user) showApp(user); else showAuth(); });
});
</script>

Auth (returns { user, error }):
  app.signUp(email, password)   app.signIn(email, password)   app.signOut()   app.currentUser

Data (returns { data, error }):
  app.from('items').getAll()              // all rows
  app.from('items').getAll({ done: 'true' })  // filtered (values must be strings)
  app.from('items').create({ title: 'x', done: false })
  app.from('items').update(id, { done: true })
  app.from('items').delete(id)

Rules: NEVER use localStorage for app data. NEVER change '__ZYRA_PROJECT_ID__' — it is auto-replaced. Always check error field and show friendly messages. Show loading state while awaiting data.`;

// ── Code reliability rules (injected into all coder prompts) ──────────────────
// ~40 tokens — prevents the most common runtime errors in generated code.

const CODE_RELIABILITY = `
Reliability: use let/var for reassigned vars (never reassign const). Check elements exist before addEventListener. Put DOM scripts at body end or in DOMContentLoaded. Wrap fetch in try/catch. Close all HTML tags.`;

// ── Coder system prompts ───────────────────────────────────────────────────────

const CODER_SYSTEM = {
  fast: `Fast code generator. Output raw JSON only.
Format: {"projectName":"slug","files":[{"path":"file","content":"..."}]}
Rules: complete file contents, zero placeholders, 1-3 files preferred, no tests/extra docs.${DESIGN}${CODE_RELIABILITY}${JSON_RULES}`,

  balanced: `Professional code generator. Output raw JSON only.
Format: {"projectName":"slug","files":[{"path":"index.html","content":"..."},{"path":"style.css","content":"..."}]}
Rules: complete files, no placeholders/TODOs, runs as-is, no tests unless asked, include README for Node projects.${DESIGN}${CODE_RELIABILITY}${JSON_RULES}`,

  quality: `Quality code generator. Output raw JSON only.
Format: {"projectName":"slug","files":[{"path":"file","content":"..."}]}
Rules: complete files, no placeholders, clean readable code, error handling, production-quality UI, good naming.${DESIGN}${CODE_RELIABILITY}${JSON_RULES}`,
};

// ── Retry prompt (no design rules — prioritises valid JSON) ───────────────────

const CODER_RETRY_SYSTEM = `Code generator. Output ONLY valid JSON — previous attempt failed to parse.
Format: {"projectName":"slug","files":[{"path":"filename","content":"content here"}]}
ESCAPING: \\" for quotes, \\n for newlines, \\\\ for backslashes inside all string values.
Start with { end with }. No fences, no extra text.`;

// ── Reviewer (minimal) ────────────────────────────────────────────────────────

const REVIEWER_SYSTEM = `Code reviewer. Output raw JSON only.
Format: {"passed":true,"issues":[],"suggestions":["one tip"],"summary":"one sentence"}
Check: missing entry point, missing package.json for Node, empty files, broken structure. Be terse.`;

// ── Builders ──────────────────────────────────────────────────────────────────

function buildPlannerPrompt(userPrompt) {
  return {
    system: PLANNER_SYSTEM,
    user:   `Request: "${userPrompt}"`,
  };
}

function buildCoderPrompt(userPrompt, plan, mode = 'balanced', options = {}) {
  const { fullstack = false } = options;
  const base   = CODER_SYSTEM[mode] || CODER_SYSTEM.balanced;
  const system = fullstack ? base + FULLSTACK_RULES : base;
  const planStr = JSON.stringify({ summary: plan.summary, stack: plan.stack, files: plan.files });
  return {
    system,
    user: `Request: "${userPrompt}"\nPlan: ${planStr}\nGenerate all files as JSON now. Escape all string values properly (\\n for newlines, \\" for quotes).`,
  };
}

function buildCoderRetryPrompt(userPrompt, plan, mode, attempt) {
  if (attempt >= 2) {
    return {
      system: CODER_RETRY_SYSTEM,
      user: `Simplified version of: "${userPrompt}"\nOutput 1-2 files max. Short content. Valid JSON escaping. Output only the JSON:`,
    };
  }
  const planStr = JSON.stringify({ summary: plan.summary, stack: plan.stack, files: plan.files.slice(0, 6) });
  return {
    system: CODER_RETRY_SYSTEM,
    user: `Request: "${userPrompt}"\nPlan: ${planStr}\nGenerate files as valid JSON. All newlines→\\n, all quotes→\\". Output only the JSON object:`,
  };
}

function buildReviewerPrompt(projectName, files) {
  const fileList = files.map((f) => ({
    path:  f.path,
    bytes: Buffer.byteLength(f.content || '', 'utf8'),
    empty: !f.content || f.content.trim().length < 10,
  }));
  return {
    system: REVIEWER_SYSTEM,
    user:   `Project:"${projectName}" Files:${JSON.stringify(fileList)}`,
  };
}

// ── Edit coder — tiered system prompts ───────────────────────────────────────
//
// Tier 1 (~45 tokens): CSS/copy targeted — single file, minimal context
// Tier 2 (~70 tokens): Multi-file focused — layout, components
// Tier 3 (~280 tokens): Full context — bugs, new features, general edits

const EDIT_SYSTEM_TIER1 = `CSS/copy editor. Modify ONLY the provided file. Apply styling words as CSS changes — never as page text. Output: {"files":[{"path":"...","content":"complete file"}]}. Escape \\n and \\".`;

const EDIT_SYSTEM_TIER2 = `Web code editor. Modify only the files needed. Interpret styling words (dark, minimal, blue, modern) as CSS changes — never add them as visible text or headings. Output ONLY changed files: {"files":[{"path":"...","content":"complete file"}]}. Escape \\n newlines and \\" quotes.`;

const EDIT_CODER_SYSTEM = `You are a semantic code editor for web applications. Your job is to modify existing projects based on user instructions — never to create new content from scratch.

CORE RULES:
- Output ONLY files that require modification — never re-output unchanged files
- Each file must contain its COMPLETE updated content (not a diff or partial snippet)
- Preserve the existing code style, structure, naming conventions, and project purpose
- Do not add new files unless explicitly required by the request
- Do not remove files — only modify existing ones

CRITICAL — DESIGN INTENT:
When the user gives a stylistic or aesthetic instruction, you MUST interpret it as a CSS/code modification. NEVER turn style words into visible page content, headlines, titles, or section names.
Examples of correct interpretation:
  - "make it black and white" → change CSS color variables to grayscale values; DO NOT add text like "Black and White Design"
  - "make it minimal" → simplify CSS, reduce decorative elements; DO NOT rename the project to "Minimal App"
  - "use a blue palette" → update CSS color variables to blue tones; DO NOT add a "Blue Palette" heading
  - "dark mode" → change background/text colors to dark values; DO NOT add "Dark Mode" as a page title
  - "more modern" → update typography, spacing, border-radius; DO NOT change project content
The original project's purpose, topic, and content must be preserved through all style edits.

${JSON_RULES}`;

// Edit-type-specific guidance injected into the user prompt
const EDIT_TYPE_GUIDANCE = {
  THEME_CHANGE: `Edit type: THEME_CHANGE
Focus: Update the visual theme of the project. Change CSS custom properties (--color-*, --bg-*, --text-*), dark/light mode values, and any hard-coded color references. Preserve all page content and functionality unchanged.`,

  COLOR_CHANGE: `Edit type: COLOR_CHANGE
Focus: Update colors only. Find CSS variables, hard-coded hex/rgb values, and color class names. Apply the new color to backgrounds, text, borders, and interactive elements as appropriate. Do not alter HTML content, layout, or JavaScript.`,

  TYPOGRAPHY_CHANGE: `Edit type: TYPOGRAPHY_CHANGE
Focus: Update typography only. Modify font-family, font-size, font-weight, line-height, letter-spacing, and text-transform properties in CSS. Do not alter HTML content or JavaScript.`,

  LAYOUT_CHANGE: `Edit type: LAYOUT_CHANGE
Focus: Update layout, spacing, or structure. Modify CSS grid/flexbox properties, margins, paddings, widths, heights, and positional properties. You may restructure HTML if needed to achieve the requested layout. Preserve all page content.`,

  COMPONENT_CHANGE: `Edit type: COMPONENT_CHANGE
Focus: Add, remove, or style a specific UI component. Target only the relevant HTML element and its CSS. Preserve all unrelated content and functionality.`,

  COPY_CHANGE: `Edit type: COPY_CHANGE
Focus: Update visible text content only. Change the specified text in HTML. Do not alter CSS, JavaScript, or layout.`,

  FUNCTIONAL_FIX: `Edit type: FUNCTIONAL_FIX
Focus: Fix broken or misbehaving functionality. Update JavaScript logic, event handlers, or data flow. Do not alter visual design or content unless directly related to the fix.`,

  BUG_FIX_REQUEST: `Edit type: BUG_FIX_REQUEST
Focus: Find and fix the reported bug. Identify the root cause in the code and apply a targeted fix. Do not refactor unrelated code or change the design.`,

  NEW_FEATURE: `Edit type: NEW_FEATURE
Focus: Add the requested new feature or functionality. Integrate it cleanly with the existing code, matching the project's current style and conventions.`,

  GENERAL_EDIT: `Edit type: GENERAL_EDIT
Focus: Apply the user's requested modification. Interpret styling words as CSS changes, not as page content. Preserve the project's original purpose and existing content.`,
};

/**
 * Builds the edit coder prompt, selecting system prompt and context limits by tier.
 *
 * @param {string} userPrompt
 * @param {Array<{path: string, content: string}>} existingFiles  - already filtered by editTier.filterFilesForEdit
 * @param {string} projectSlug
 * @param {string} [editType]       - from classifyEditType()
 * @param {object} [projectContext] - { originalPrompt, appType, title }
 * @param {number} [tier]           - 1/2/3 from getEditTier(); defaults based on editType
 * @returns {{ system: string, user: string, contextChars: number }}
 */
function buildEditCoderPrompt(userPrompt, existingFiles, projectSlug, editType = 'GENERAL_EDIT', projectContext = {}, tier = 3) {
  // Tier-based context limits
  const MAX_TOTAL_CHARS = tier === 1 ? 8_000  : tier === 2 ? 16_000 : 28_000;
  const MAX_FILE_CHARS  = tier === 1 ? 4_000  : tier === 2 ?  6_000 :  8_000;

  let totalChars = 0;
  const included = [];
  const skipped  = [];

  for (const file of existingFiles) {
    if (totalChars >= MAX_TOTAL_CHARS) {
      skipped.push(file.path);
      continue;
    }
    const content = file.content.length > MAX_FILE_CHARS
      ? file.content.slice(0, MAX_FILE_CHARS) + '\n/* …truncated… */'
      : file.content;
    totalChars += content.length;
    included.push({ path: file.path, content });
  }

  const skippedNote = skipped.length
    ? `\nOther unchanged files: ${skipped.join(', ')}`
    : '';

  // Tier 1: compact prompt — no type guidance or context block, just the essentials
  if (tier === 1) {
    return {
      system: EDIT_SYSTEM_TIER1,
      contextChars: totalChars,
      user: `Project: "${projectSlug}"
Files: ${JSON.stringify(included)}${skippedNote}
Change: "${userPrompt}"
Output ONLY changed files as JSON: {"files":[{"path":"...","content":"..."}]}`,
    };
  }

  // Tier 2: focused prompt — brief type guidance, no full editorial block
  if (tier === 2) {
    const typeGuidance = EDIT_TYPE_GUIDANCE[editType] || EDIT_TYPE_GUIDANCE.GENERAL_EDIT;
    return {
      system: EDIT_SYSTEM_TIER2,
      contextChars: totalChars,
      user: `Project: "${projectSlug}"
${typeGuidance}
Files: ${JSON.stringify(included)}${skippedNote}
Change: "${userPrompt}"
Output ONLY changed files: {"files":[{"path":"...","content":"..."}]}`,
    };
  }

  // Tier 3: full prompt with all context and guidance
  const typeGuidance = EDIT_TYPE_GUIDANCE[editType] || EDIT_TYPE_GUIDANCE.GENERAL_EDIT;
  const contextBlock = [
    projectContext.originalPrompt ? `Original prompt: "${projectContext.originalPrompt}"` : null,
    projectContext.appType        ? `App type: ${projectContext.appType}` : null,
  ].filter(Boolean).join('\n');

  return {
    system: EDIT_CODER_SYSTEM,
    contextChars: totalChars,
    user: `Project: "${projectSlug}"
${contextBlock ? `Context: ${contextBlock}\n` : ''}${typeGuidance}

Files: ${JSON.stringify(included)}${skippedNote}

Change: "${userPrompt}"

Output ONLY changed files: {"files":[{"path":"filename","content":"..."}]}
Escape: \\n for newlines, \\" for quotes.`,
  };
}

// ── Auto-fix prompt ───────────────────────────────────────────────────────────

/**
 * Builds a targeted auto-fix prompt for correcting specific code errors.
 * Used by coderService after post-generation validation finds issues.
 *
 * @param {string} userPrompt - original user request (for context)
 * @param {Array<{path: string, content: string}>} files
 * @param {Array<{type: string, file: string, message: string}>} errors
 * @returns {{ system: string, user: string }}
 */
function buildAutoFixPrompt(userPrompt, files, errors) {
  const errorList = errors
    .slice(0, 8) // cap at 8 errors for prompt size
    .map((e) => `- ${e.file}: [${e.type}] ${e.message}`)
    .join('\n');

  // Include only the files that have errors (keep prompt small)
  const errorFiles = new Set(errors.map((e) => e.file));
  const targetFiles = files.filter((f) => errorFiles.has(f.path)).slice(0, 5);
  const otherPaths  = files.filter((f) => !errorFiles.has(f.path)).map((f) => f.path);

  const fileBlock = targetFiles
    .map((f) => `### ${f.path}\n${(f.content || '').slice(0, 3000)}`)
    .join('\n\n');

  const system = `Code fixer. Fix ONLY the listed errors — do not change anything else.
Return ALL files (fixed + unchanged) as JSON: {"projectName":"slug","files":[{"path":"...","content":"..."}]}
Escape strings: \\n for newlines, \\" for quotes. Output valid JSON only, no markdown.`;

  const user = `Original request: "${userPrompt}"

ERRORS TO FIX:
${errorList}

FILES WITH ERRORS:
${fileBlock}
${otherPaths.length ? `\nUnchanged files (include as-is): ${otherPaths.join(', ')}` : ''}

Fix the errors. Return complete corrected files as JSON.`;

  return { system, user };
}

module.exports = {
  buildPlannerPrompt,
  buildCoderPrompt,
  buildCoderRetryPrompt,
  buildReviewerPrompt,
  buildEditCoderPrompt,
  buildAutoFixPrompt,
  FULLSTACK_RULES,
};
