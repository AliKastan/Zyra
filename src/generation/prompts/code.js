'use strict';

/**
 * Stage 5, Pass 1 — HTML Structure Generation.
 *
 * Generates ONLY the HTML files. Focuses entirely on semantic structure, complete
 * UI elements, real content, accessibility, and the exact class names / data-*
 * attributes that the CSS and JS passes will target.
 *
 * This separation is intentional: HTML written without the distraction of CSS and JS
 * is more complete, more semantic, and gives the second pass real class names to work with.
 */

const FILE_FORMAT = `OUTPUT FORMAT (strict):
---FILE: path/to/file.html---
[complete file content]
---END FILE---

One block per file. Nothing outside the blocks.`;

/**
 * @param {import('../types').AppBlueprint} blueprint
 * @returns {{ system: string, user: string }}
 */
function buildStructurePassPrompt(blueprint) {
  const ds = blueprint.designSystem || {};
  const colors = ds.colors || {};

  const fileGuide = (blueprint.fileSpecs || [])
    .filter(f => f.path.endsWith('.html'))
    .map(f => {
      const sections = (f.sections || [])
        .map(s => `      • <${s.semanticElement}> .${(s.classNames || []).join(' .')} — ${s.content}`)
        .join('\n');
      return `  ${f.path}:\n    Structure: ${f.htmlStructure || f.description}\n${sections}`;
    })
    .join('\n\n');

  const system = `You are writing the HTML structure for a web application. This is Pass 1 of 2. You generate ONLY HTML files. A separate pass will generate CSS and JS.

${FILE_FORMAT}

WHAT MAKES A GREAT HTML FILE:
1. Complete semantic structure — use <header>, <main>, <nav>, <section>, <article>, <aside>, <footer> correctly
2. Every UI element present — all buttons, forms, cards, modals, lists, navigation items
3. Real content — use the actual copy from the blueprint (no Lorem Ipsum, no placeholder text)
4. Meaningful class names — use the exact class names from the blueprint's cssComponents
5. data-* attributes on interactive elements — data-action, data-id, data-target etc. for JS hooks
6. All form inputs have <label for="id"> — id attribute on every input
7. aria-label on icon-only buttons, role="dialog" on modals, aria-live on status messages
8. Empty states — include a hidden empty-state element for every list (js will show/hide it)
9. Loading states — include a hidden loading indicator where data loads asynchronously
10. Link the stylesheet: <link rel="stylesheet" href="style.css"> in every <head>
11. Link script(s) at end of <body>: <script src="app.js"></script>
12. Viewport meta: <meta name="viewport" content="width=device-width, initial-scale=1.0">

DO NOT include any <style> tags or inline styles. CSS is written in Pass 2.
DO NOT include any <script> content. JS is written in Pass 2.`;

  const user = `Project: ${blueprint.projectName}
App: ${blueprint.dataFlow || 'Web application'}
Design notes: ${blueprint.designNotes || 'Clean, professional'}

Navigation: ${JSON.stringify(blueprint.navigation || {})}

CSS classes available (use these exact names):
${(blueprint.cssComponents || []).map(c => `  ${c.className} — ${c.description}`).join('\n') || '  (standard BEM-style classes)'}

HTML FILES TO GENERATE:
${fileGuide || (blueprint.fileSpecs || []).filter(f => f.path.endsWith('.html')).map(f => `  ${f.path}: ${f.description}`).join('\n')}

Generate every HTML file now. Include ALL elements — nothing should be added later.`;

  return { system, user };
}

module.exports = { buildStructurePassPrompt };
