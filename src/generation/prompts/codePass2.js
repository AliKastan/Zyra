'use strict';

/**
 * Stage 5, Pass 2 — CSS + JavaScript Implementation.
 *
 * Receives the actual generated HTML from Pass 1 and produces:
 *   1. style.css — complete design system + all component styles + responsive rules
 *   2. app.js (and any additional .js files) — full feature implementation
 *
 * Because this pass sees the exact HTML (real class names, real IDs, real data-* attributes),
 * the CSS and JS are guaranteed to match the actual DOM rather than imagined structures.
 */

const FILE_FORMAT = `OUTPUT FORMAT (strict):
---FILE: path/to/file---
[complete file content]
---END FILE---

One block per file. Nothing outside the blocks.`;

/**
 * @param {import('../types').AppBlueprint} blueprint
 * @param {Array<{path:string,content:string}>} htmlFiles  - generated HTML from Pass 1
 * @returns {{ system: string, user: string }}
 */
function buildImplementationPassPrompt(blueprint, htmlFiles) {
  const ds = blueprint.designSystem || {};
  const colors    = ds.colors     || {};
  const typography = ds.typography || {};
  const spacing   = ds.spacing    || {};
  const radii     = ds.borderRadius || {};
  const shadows   = ds.shadows    || {};

  // Build the design system block to inject into the prompt
  const colorVars = Object.entries(colors)
    .map(([k, v]) => `  --color-${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v};`)
    .join('\n');

  const spacingVars = Object.entries(spacing)
    .map(([k, v]) => `  --space-${k}: ${v};`)
    .join('\n');

  const radiusVars = Object.entries(radii)
    .map(([k, v]) => `  --radius-${k}: ${v};`)
    .join('\n');

  // Condense HTML files into a reference block (trim whitespace, preserve structure)
  const htmlReference = htmlFiles
    .map(f => `=== ${f.path} ===\n${f.content.replace(/\s{2,}/g, ' ').substring(0, 4000)}${f.content.length > 4000 ? '\n...(truncated)' : ''}`)
    .join('\n\n---\n\n');

  // Build per-file spec for CSS and JS files
  const assetSpecs = (blueprint.fileSpecs || [])
    .filter(f => !f.path.endsWith('.html'))
    .map(f => {
      if (f.path.endsWith('.css')) {
        return `  ${f.path}: complete stylesheet\n    ${f.cssRules || f.description}`;
      }
      const fns = (f.jsFunctions || [])
        .map(fn => `      ${fn.signature || fn.name}() — ${fn.description}`)
        .join('\n');
      return `  ${f.path}: ${f.description}${fns ? `\n    Functions:\n${fns}` : ''}`;
    })
    .join('\n\n');

  const system = `You are writing the CSS and JavaScript for a web application. This is Pass 2 of 2.
You have the actual generated HTML below. Target the exact class names, IDs, and data-* attributes in that HTML.

${FILE_FORMAT}

CSS REQUIREMENTS — write a complete, production-quality stylesheet:
1. :root custom properties — all design tokens (colors, spacing, radii, shadows, typography)
2. CSS reset — box-sizing: border-box; html,body { width:100%; min-height:100vh; margin:0; padding:0 } — app must fill the full viewport
3. Base typography — html font-size, body font-family, line-height, color
4. Layout — page shell uses width:100%; min-height:100vh; display:flex; flex-direction:column — NO max-width on the outermost wrapper, header, main, sidebar, footer grid/flex rules
5. Every component class present in the HTML — styled completely (no stubs)
6. Every variant and modifier class — e.g. .btn--primary, .card--featured
7. All interactive states — :hover, :focus-visible, :active, :disabled, [aria-selected]
8. Smooth transitions on interactive elements — 0.15s–0.2s ease
9. Empty state styling — .empty-state properly centered and legible
10. Form styles — inputs, labels, validation error states, focus rings
11. Mobile-first responsive — base = mobile, then min-width: 640px, min-width: 1024px breakpoints
12. No !important unless unavoidable. No inline style duplication.

JAVASCRIPT REQUIREMENTS — implement every feature completely:
1. Strict mode: 'use strict'; at the top
2. DOMContentLoaded wrapper for all initialization
3. Data layer first — load(), save() functions using localStorage
4. Render functions — renderList(), renderItem() etc. using template literals
5. Event delegation for dynamic content — attach listeners to container, not items
6. All features from the intent implemented — not stubs, not TODO comments
7. Error handling — try/catch on localStorage, null checks before DOM operations
8. All interactive behaviours from the blueprint: inline-edit, filtering, sorting, etc.
9. Empty state toggle — show/hide .empty-state based on data length
10. Form validation — check required fields, show error messages in the DOM
11. No console.log in final code. No alert(). Use DOM-based feedback.
12. Accessible focus management — after modal open, focus first focusable element; after close, restore focus

Use the HTML reference below to find the exact class names, IDs, and data-* attributes.`;

  const dsBlock = `DESIGN SYSTEM (use these exact values in the CSS :root):
:root {
${colorVars}
${spacingVars}
${radiusVars}
  --shadow-sm: ${shadows.sm || '0 1px 3px rgba(0,0,0,0.08)'};
  --shadow-md: ${shadows.md || '0 4px 12px rgba(0,0,0,0.1)'};
  --shadow-lg: ${shadows.lg || '0 8px 24px rgba(0,0,0,0.14)'};
  --transition: ${ds.transitions || 'all 0.15s ease'};
  --font-family: ${typography.fontFamily || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"};
}`;

  const dataFlowBlock = blueprint.dataFlow
    ? `DATA FLOW:\n${blueprint.dataFlow}\n\nSTORAGE SCHEMA:\n${JSON.stringify(blueprint.dataFlow?.storageSchema || [], null, 2)}`
    : '';

  const user = `Project: ${blueprint.projectName}

${dsBlock}

NON-CSS/JS FILES TO GENERATE:
${assetSpecs || '  style.css + app.js'}

KEY FUNCTIONS (must be implemented):
${(blueprint.fileSpecs || []).flatMap(f => (f.jsFunctions || []).map(fn => `  ${fn.signature || fn.name}() — ${fn.description}`)).join('\n') || '  (standard CRUD + render functions)'}

ACCESSIBILITY REQUIREMENTS:
${(blueprint.accessibilityRequirements || ['All form inputs have labels', 'Focus indicators visible', 'Color contrast ≥ 4.5:1']).map(r => `  • ${r}`).join('\n')}

${dataFlowBlock}

GENERATED HTML REFERENCE (target these exact class names and IDs):
${htmlReference}

Generate the complete CSS and JavaScript now. Every feature must be fully implemented.`;

  return { system, user };
}

module.exports = { buildImplementationPassPrompt };
