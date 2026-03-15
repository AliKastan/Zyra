'use strict';

const FILE_FORMAT = `OUTPUT FORMAT — one block per JS file, nothing outside blocks:
---FILE: path/to/file.js---
[complete file content]
---END FILE---`;

/**
 * Builds the JavaScript Core pass prompt.
 *
 * This pass generates the complete JavaScript implementation:
 *   - Data models and localStorage schema
 *   - CRUD operations for all entities
 *   - Auth state management (if needed)
 *   - All feature logic for every user flow
 *   - Event delegation, form handling, routing
 *   - Empty state / loading state / error state management
 *
 * @param {import('../types').PassContext} ctx
 * @returns {{ system: string, user: string }}
 */
function buildJavaScriptPrompt(ctx) {
  const { blueprint, intent, accumulatedFiles, complexityReport } = ctx;
  const signals = complexityReport?.signals || {};

  const jsFiles = (blueprint.fileSpecs || []).filter(f => f.path.endsWith('.js'));
  const fnGuide = jsFiles.map(f => {
    const fns = (f.jsFunctions || [])
      .map(fn => `    ${fn.signature || fn.name}() — ${fn.description}${fn.callsLocalStorage ? ' [localStorage]' : ''}`)
      .join('\n');
    return `FILE: ${f.path}\n${fns || '  (full implementation required)'}`;
  }).join('\n\n');

  const dataFlow = blueprint.dataFlow || {};
  const storageSchema = (dataFlow.storageSchema || [])
    .map(s => `  ${s.key}: ${s.type} — ${s.structure}`)
    .join('\n');

  const userFlows = (intent.userFlows || [])
    .map(f => `  • ${f.name || f}: ${(f.steps || []).join(' → ')}`)
    .join('\n');

  // Compress HTML for reference
  const htmlRef = [...accumulatedFiles.entries()]
    .filter(([p]) => p.endsWith('.html'))
    .map(([p, c]) => `=== ${p} ===\n${c.replace(/\s{2,}/g, ' ').slice(0, 2500)}`)
    .join('\n---\n');

  const system = `You are writing the complete JavaScript implementation for a web application. This is Pass 3 of the generation pipeline.
You have the actual HTML structure and CSS — write JS that connects precisely to the real DOM.

${FILE_FORMAT}

ARCHITECTURE REQUIREMENTS:
1. Wrap ALL code in DOMContentLoaded: document.addEventListener('DOMContentLoaded', () => { ... })
2. Data layer first: define data models as JS objects, storage keys as constants
3. CRUD functions for EVERY entity in the data model (create, read, update, delete, list)
4. Use localStorage for persistence: JSON.stringify/parse, handle empty/corrupt data gracefully
5. Render functions: for every list/card component, a function that generates innerHTML
6. Event delegation: document.addEventListener('click', e => { if (e.target.matches('[data-action=X]')) ... })
7. Form handling: prevent default, validate, save, re-render, clear form
8. Empty states: call showEmptyState() / hideEmptyState() based on data length
9. Loading states: show/hide [data-loading] elements during async ops
10. Error states: display user-friendly error messages in the UI
11. EVERY user flow must be fully implemented — no stubs, no TODO comments
12. ${signals.hasAuth ? 'Auth state: currentUser, login(), logout(), requireAuth() guard functions' : 'No auth needed — but protect against empty state gracefully'}
13. No console.log in production code

DATA PATTERN:
- Storage key constants at top: const KEYS = { items: 'app_items', ... }
- Load functions: function loadItems() { return JSON.parse(localStorage.getItem(KEYS.items) || '[]'); }
- Save functions: function saveItems(items) { localStorage.setItem(KEYS.items, JSON.stringify(items)); }
- Each entity gets: load, save, add, update, delete, getById functions`;

  const user = `Project: ${blueprint.projectName}
App: ${intent.appType} — ${intent.category}

DATA MODELS (from blueprint):
${storageSchema || '  (derive from app type)'}
Storage pattern: ${dataFlow.description || 'localStorage'}
Update pattern: ${dataFlow.updatePattern || 'Full re-render'}

USER FLOWS TO IMPLEMENT:
${userFlows || '  (all standard flows for app type)'}

JS FUNCTIONS REQUIRED (per blueprint):
${fnGuide || jsFiles.map(f => `  ${f.path}: full implementation`).join('\n')}

ACTUAL HTML DOM TO TARGET (element IDs, class names, data-* attrs):
${htmlRef || '(see scaffold pass HTML)'}

Generate EVERY .js file now. Complete implementations — no stubs, no TODOs, no placeholders.`;

  return { system, user };
}

module.exports = { buildJavaScriptPrompt };
