'use strict';

const FILE_FORMAT = `OUTPUT FORMAT — one block per file, nothing outside blocks:
---FILE: path/to/file---
[complete file content]
---END FILE---`;

/**
 * Builds the Billing + Integrations pass prompt.
 *
 * Generates integration stubs, billing UI, and payment flow code.
 * All integrations must be configuration-aware (gracefully handle missing API keys).
 *
 * @param {import('../types').PassContext} ctx
 * @returns {{ system: string, user: string }}
 */
function buildBillingIntegrationsPrompt(ctx) {
  const { blueprint, intent, accumulatedFiles, complexityReport } = ctx;
  const signals = complexityReport?.signals || {};

  const integrations = (intent._inferenceReport?.requirements || [])
    .filter(r => r.category === 'integration')
    .map(r => `  - ${r.name}: ${r.description || r.rationale || ''}`);

  const existingFiles = [...accumulatedFiles.keys()].join(', ');

  const system = `You are generating the BILLING and INTEGRATIONS code for a web application. This is a focused pass.

${FILE_FORMAT}

CRITICAL RULES:
1. DO NOT fake working integrations — all external API calls must check for config/keys
2. Integration stubs must clearly indicate when keys are missing (console.warn, UI message)
3. For Stripe: implement UI flow + client-side validation + payment intent creation stub
4. For AI APIs: implement the prompt/response UI + service abstraction with config check
5. For email: implement email composition + service stub that logs in development
6. All billing/integration code in separate files (integrations.js, billing.js, etc.)
7. Document required environment variables clearly at the top of each integration file
8. Graceful degradation: app must remain functional even without external service keys

BILLING PATTERNS (for localStorage-based apps):
- Subscription state stored in localStorage: { plan, status, expiresAt }
- Feature gating: isPremium() function checks subscription status
- Upgrade prompt: showUpgradeModal() function with plan comparison
- Payment flow: opens external payment URL or Stripe checkout (stub with clear TODO)`;

  const user = `Project: ${blueprint.projectName}
Existing files: ${existingFiles}

INTEGRATION REQUIREMENTS:
${integrations.join('\n') || '  (derive from app requirements)'}

${signals.hasPayments ? 'BILLING REQUIRED: Generate billing.js with subscription management, plan checking, upgrade flow. Generate billing UI additions.' : ''}
${signals.hasAI ? 'AI INTEGRATION REQUIRED: Generate ai-service.js with provider abstraction, config check, prompt/response handling.' : ''}
${signals.integrationCount >= 3 ? 'INTEGRATIONS REQUIRED: Generate integrations.js with all third-party service stubs.' : ''}

Generate integration and billing files. Do NOT re-generate core files already created.`;

  return { system, user };
}

module.exports = { buildBillingIntegrationsPrompt };
