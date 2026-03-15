'use strict';

const FILE_FORMAT = `OUTPUT FORMAT — use EXACTLY this structure, one block per file, nothing outside blocks:
---FILE: path/to/file.html---
[complete file content]
---END FILE---`;

/**
 * Builds the HTML Scaffold pass prompt.
 *
 * Goal: generate all HTML files with complete semantic structure, real content,
 * every UI element, proper head sections, and correct class names.
 *
 * @param {import('../types').PassContext} ctx
 * @returns {{ system: string, user: string }}
 */
function buildScaffoldPrompt(ctx) {
  const { blueprint, intent } = ctx;
  const ds = blueprint.designSystem || {};
  const colors = ds.colors || {};

  const htmlFiles = (blueprint.fileSpecs || []).filter(f => f.path.endsWith('.html'));
  const fileGuide = htmlFiles.map(f => {
    const sections = (f.sections || [])
      .map(s => `    • <${s.semanticElement}> .${(s.classNames || []).join(' .')} — ${s.content || s.description || ''}`)
      .join('\n');
    return `FILE: ${f.path}\n  ${f.htmlStructure || f.description || ''}\n${sections}`;
  }).join('\n\n');

  const cssComponentList = (blueprint.cssComponents || [])
    .slice(0, 20)
    .map(c => `  ${c.className} — ${c.description || ''}`)
    .join('\n');

  const system = `You are writing the HTML scaffold for a web application. This is Pass 1 of a multi-pass generation pipeline.
Your ONLY responsibility: generate complete, production-quality HTML files.
CSS and JavaScript will be generated in dedicated later passes. Do not write <style> or <script> content.

${FILE_FORMAT}

STRICT REQUIREMENTS:
1. Complete <!DOCTYPE html> + <html lang="en"> + <head> + <body> on every HTML file
2. <meta name="viewport" content="width=device-width, initial-scale=1.0"> in every <head>
3. <link rel="stylesheet" href="style.css"> in every <head>
4. <script src="app.js" defer></script> at end of every <body>
5. Semantic HTML: use <header>, <main>, <nav>, <section>, <article>, <aside>, <footer> correctly
6. Real content — use the actual app name, real CTAs, real section names from the spec
7. EVERY UI element present: all buttons, forms, cards, modals, lists, navigation items
8. Use the EXACT class names from the CSS components list
9. data-action, data-id, data-target attributes on interactive elements for JS hooks
10. Every <input> has a <label for="id"> — id attribute on every input
11. aria-label on icon-only buttons, role="dialog" on modals, aria-live on status messages
12. Include hidden empty-state divs for every list container (data-empty-state)
13. Include hidden loading spinner divs where async data loads (data-loading)
14. NO inline styles. NO <style> blocks. NO <script> content.`;

  const user = `Project: ${blueprint.projectName}
App type: ${intent.appType || 'web app'} — ${intent.category || ''}
Tone: ${intent.tone || 'professional'}
App name: ${intent.realContent?.appName || blueprint.projectName}
Tagline: ${intent.realContent?.tagline || ''}
Primary CTA: ${intent.realContent?.primaryCTA || 'Get started'}

Navigation: ${JSON.stringify(blueprint.navigation || {}, null, 0)}

CSS component classes to use (use exact names):
${cssComponentList || '  .btn, .card, .form-field, .nav (standard)'}

Primary color: ${colors.primary || '#4F46E5'}
Background: ${colors.background || '#F8FAFC'}

HTML FILES TO GENERATE:
${fileGuide || htmlFiles.map(f => `  ${f.path}: ${f.description || ''}`).join('\n')}

Generate every HTML file now. Every section, every element, every form field — all complete.`;

  return { system, user };
}

module.exports = { buildScaffoldPrompt };
