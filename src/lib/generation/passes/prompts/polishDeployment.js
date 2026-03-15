'use strict';

const FILE_FORMAT = `OUTPUT FORMAT — one block per file, nothing outside blocks:
---FILE: path/to/file---
[complete file content]
---END FILE---`;

/**
 * Builds the Polish + Deployment pass prompt.
 *
 * Generates deployment documentation, environment configuration,
 * and any final CSS polish improvements.
 *
 * @param {import('../types').PassContext} ctx
 * @returns {{ system: string, user: string }}
 */
function buildPolishDeploymentPrompt(ctx) {
  const { blueprint, intent, accumulatedFiles, complexityReport } = ctx;
  const signals = complexityReport?.signals || {};

  const existingFiles = [...accumulatedFiles.keys()].join(', ');
  const fileList = [...accumulatedFiles.keys()];

  const envVars = [
    signals.hasPayments && 'STRIPE_PUBLISHABLE_KEY=pk_test_...',
    signals.hasPayments && 'STRIPE_SECRET_KEY=sk_test_...',
    signals.hasAI      && 'OPENAI_API_KEY=sk-...',
    signals.hasAI      && 'ANTHROPIC_API_KEY=sk-ant-...',
    signals.hasAuth    && 'JWT_SECRET=your-secret-here',
    signals.hasAnalytics && 'ANALYTICS_ID=GA-...',
  ].filter(Boolean);

  const system = `You are writing deployment documentation and final polish for a web application. This is the final generation pass.

${FILE_FORMAT}

WHAT TO GENERATE:
1. README.md — complete setup guide with: project description, prerequisites, local setup steps, environment variables, deployment instructions (Netlify/Vercel/Railway), features list
2. .env.example — all required environment variables with descriptions and example values
3. (Optional) manifest.json — PWA manifest if the app benefits from it

WHAT NOT TO DO:
- Do NOT regenerate HTML, CSS, or JS files
- Do NOT add features not already implemented
- Do NOT change the app architecture

README QUALITY BAR:
- Clear one-paragraph project description
- Prerequisites list (just a browser for static apps)
- Step-by-step local setup (git clone → open index.html)
- Complete environment variables table
- Deployment guide (Netlify drag-and-drop, Vercel CLI, Railway)
- Features list (what the app does)
- Tech stack section`;

  const user = `Project: ${blueprint.projectName}
App: ${intent.appType} — ${intent.realContent?.appName || blueprint.projectName}
Description: ${intent.category || 'Web application'}
Files generated: ${existingFiles}

Environment variables needed:
${envVars.length > 0 ? envVars.join('\n') : '  (no external services required for this app)'}

Signals: auth=${signals.hasAuth}, payments=${signals.hasPayments}, ai=${signals.hasAI}, mobile=${signals.hasMobile}

Generate README.md and .env.example now.`;

  return { system, user };
}

module.exports = { buildPolishDeploymentPrompt };
