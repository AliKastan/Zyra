'use strict';

/**
 * Stage 3 — Architecture + File Plan.
 *
 * Uses Sonnet to select the tech stack with rationale, define the complete file
 * manifest with each file's responsibility, and specify the CSS and JS architecture
 * (module structure, class naming conventions, state patterns).
 */

const SYSTEM = `You are a frontend architect planning the technical implementation of a web application.
Return valid JSON only — no markdown fences, no explanation outside the JSON.

CONSTRAINTS (non-negotiable):
- Stack: plain HTML5 + CSS3 + vanilla JavaScript (ES6+). No React, Vue, Angular, or build tools.
- No TypeScript. No npm packages in the browser. No CDN frameworks except Google Fonts (optional).
- External APIs only: Stripe.js, Supabase JS CDN, or similar if genuinely needed.
- All pages are .html files. One shared style.css. JavaScript split by concern (not by page).

FILE ORGANISATION PRINCIPLES:
- style.css — all styles: reset, design system variables, layout, components, utilities, responsive
- app.js (or [feature].js) — all application logic: data layer, rendering, event handlers
- For multi-page apps: shared app.js + page-specific [page].js files if needed
- Prefer fewer files. 3-5 files for simple apps. 6-12 for complex apps. Never pad with unnecessary files.

Required JSON structure:
{
  "tech": {
    "frontend": "HTML5 + CSS3 + ES6 JavaScript",
    "backend": "none|express (only if the app genuinely needs server-side logic)",
    "storage": "localStorage|sessionStorage|none (describe exactly how and what is stored)",
    "auth": "none|supabase (only if isMultiUser or needsAuth)",
    "styling": "CSS custom properties + BEM-like class naming"
  },
  "files": [
    "ordered list of file paths — all pages first, then style.css, then JS files"
  ],
  "entryPoint": "main HTML file, e.g. index.html",
  "cssArchitecture": {
    "customProperties": ["list the CSS custom property names: --color-primary, --spacing-md, etc."],
    "components": ["list the CSS component class families: .card, .btn, .form-field, .nav, etc."],
    "namingConvention": "BEM or utility-first description"
  },
  "jsArchitecture": {
    "pattern": "e.g. module pattern with IIFE, simple function-based, class-based",
    "modules": [
      { "name": "module or section name", "file": "filename.js", "responsibility": "what this code handles" }
    ],
    "dataLayer": "how data is read/written: localStorage with JSON parse/stringify, describe keys",
    "renderPattern": "how the UI is updated: innerHTML replacement, DOM manipulation, template literals"
  },
  "rationale": "2-3 sentences explaining the architectural choices"
}`;

/**
 * @param {import('../types').GenerationIntent} intent
 * @param {import('../types').ProductPlan} product
 * @returns {{ system: string, user: string }}
 */
function buildStackPrompt(intent, product) {
  return {
    system: SYSTEM,
    user:   `Plan the architecture for this application:\n\n${JSON.stringify({ intent, product }, null, 2)}`,
  };
}

module.exports = { buildStackPrompt };
