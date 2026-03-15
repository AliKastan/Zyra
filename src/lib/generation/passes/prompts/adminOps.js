'use strict';

const FILE_FORMAT = `OUTPUT FORMAT — one block per file, nothing outside blocks:
---FILE: path/to/file---
[complete file content]
---END FILE---`;

/**
 * Builds the Admin + Operations pass prompt.
 *
 * Generates admin-facing pages and operations interfaces. Builds on the
 * existing core structure — no need to regenerate base files.
 *
 * @param {import('../types').PassContext} ctx
 * @returns {{ system: string, user: string }}
 */
function buildAdminOpsPrompt(ctx) {
  const { blueprint, intent, accumulatedFiles } = ctx;

  const roles = (intent._inferenceReport?.requirements || [])
    .filter(r => r.category === 'role')
    .map(r => r.name);

  const adminFiles = (blueprint.fileList || []).filter(f => f.toLowerCase().includes('admin'));
  const hasAdminSpec = adminFiles.length > 0;

  // Reference what was already built
  const existingFiles = [...accumulatedFiles.keys()].join(', ');

  const system = `You are generating the ADMIN and OPERATIONS section of a web application. This is a focused pass — do not regenerate already-existing files.

${FILE_FORMAT}

SCOPE FOR THIS PASS:
1. Admin dashboard page (admin.html if not yet created, OR admin section within existing HTML)
2. Admin JavaScript logic (admin.js or additions to app.js — generate admin.js as a new file)
3. Admin-specific CSS additions (add to admin-specific classes, or generate admin.css)

ADMIN FEATURES TO BUILD:
- Overview/stats dashboard (key metrics at a glance)
- Management list for the primary entity (table with search, filter, sort)
- CRUD operations for admin-managed resources
- User/account management if applicable
- Status/action controls (approve, reject, disable, enable)
- Simple activity/audit log view

QUALITY STANDARDS:
1. Admin UI should be functional and clear (not consumer-grade polish, but fully usable)
2. Data tables with basic column sorting
3. Confirmation dialogs for destructive actions
4. Status badges/indicators
5. Quick action buttons (edit, delete, view)
6. Use localStorage — same data layer as the main app
7. Admin-only views protected by a simple admin role check`;

  const user = `Project: ${blueprint.projectName}
User roles: ${roles.join(', ') || 'user, admin'}
Existing files already generated: ${existingFiles}

${hasAdminSpec ? `Admin files in blueprint: ${adminFiles.join(', ')}` : 'Add admin functionality — admin.html + admin.js'}

ADMIN REQUIREMENTS:
${(blueprint.fileSpecs || []).filter(f => f.path.includes('admin')).map(f => `  ${f.path}: ${f.description || ''}`).join('\n') || '  Admin dashboard with full management capabilities'}

Generate admin HTML, admin.js, and any admin CSS needed. Do NOT re-generate index.html, style.css, or app.js.`;

  return { system, user };
}

module.exports = { buildAdminOpsPrompt };
