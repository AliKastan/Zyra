'use strict';

const FILE_FORMAT = `OUTPUT FORMAT — one block per file, nothing outside blocks:
---FILE: path/to/file.css---
[complete file content]
---END FILE---`;

/**
 * Builds the CSS Design System pass prompt.
 *
 * Receives real HTML from Pass 1. Generates style.css targeting the actual
 * class names, IDs, and data attributes from the real DOM.
 *
 * @param {import('../types').PassContext} ctx
 * @returns {{ system: string, user: string }}
 */
function buildCssPrompt(ctx) {
  const { blueprint, accumulatedFiles } = ctx;
  const ds = blueprint.designSystem || {};
  const colors     = ds.colors      || {};
  const typography = ds.typography  || {};
  const spacing    = ds.spacing     || {};
  const radii      = ds.borderRadius || {};
  const shadows    = ds.shadows     || {};

  // Build :root block
  const colorVars = Object.entries(colors)
    .map(([k, v]) => `  --color-${k.replace(/([A-Z])/g, m => `-${m.toLowerCase()}`)}: ${v};`)
    .join('\n');

  const spacingVars = Object.entries(spacing)
    .map(([k, v]) => `  --space-${k}: ${v};`)
    .join('\n');

  const radiusVars = Object.entries(radii)
    .map(([k, v]) => `  --radius-${k}: ${v};`)
    .join('\n');

  const shadowVars = Object.entries(shadows)
    .map(([k, v]) => `  --shadow-${k}: ${v};`)
    .join('\n');

  // Inject real HTML reference (compressed)
  const htmlRef = [...accumulatedFiles.entries()]
    .filter(([p]) => p.endsWith('.html'))
    .map(([p, c]) => `=== ${p} ===\n${c.replace(/\s{2,}/g, ' ').slice(0, 3000)}`)
    .join('\n---\n');

  const cssComponentList = (blueprint.cssComponents || [])
    .map(c => `  ${c.className} — ${c.description || ''}${c.variants?.length ? ' [variants: ' + c.variants.join(', ') + ']' : ''}`)
    .join('\n');

  const system = `You are writing the complete CSS stylesheet for a web application. This is Pass 2 of the generation pipeline.
You have the ACTUAL HTML markup from Pass 1 — target real class names, real IDs, real structure.

${FILE_FORMAT}

REQUIREMENTS:
1. Start with :root containing ALL CSS custom properties (colors, spacing, typography, radii, shadows, transitions)
2. CSS reset/normalize (*, ::before, ::after box-sizing, margin, padding)
3. Base typography: body font-family, line-height, color — use design system values
4. Every CSS component class from the blueprint, fully styled
5. Layout: flexbox/grid for all major layout regions
6. Responsive: MUST have @media (max-width: 768px) and @media (max-width: 480px) breakpoints
7. States: :hover, :focus, :active, :disabled on all interactive elements
8. Focus-visible ring for keyboard accessibility
9. Smooth transitions (use --transition or explicit transition values)
10. Empty states, loading states, error states styled
11. NO inline styles, NO !important spam, NO hacks
12. Use CSS custom properties from :root throughout — no hard-coded color values`;

  const user = `Project: ${blueprint.projectName}
Design notes: ${blueprint.designNotes || 'Clean, professional design'}

DESIGN SYSTEM — implement these as CSS custom properties:

Colors:
${colorVars || '  (use professional defaults)'}

Spacing:
${spacingVars}

Border radius:
${radiusVars}

Shadows:
${shadowVars}

Typography: font-family: ${typography.fontFamily || "system-ui, -apple-system, sans-serif"}

CSS COMPONENTS TO STYLE (use exact class names):
${cssComponentList || '  .btn, .card, .form-field, .nav (standard)'}

ACTUAL HTML TO TARGET (class names, IDs, structure):
${htmlRef || '(HTML from scaffold pass)'}

Generate style.css now. Complete, production-quality, mobile-responsive.`;

  return { system, user };
}

module.exports = { buildCssPrompt };
