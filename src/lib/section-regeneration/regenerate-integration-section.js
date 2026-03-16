'use strict';

/**
 * Integrations Section Regenerator
 *
 * Spec for third-party service integrations: OpenAI, email providers,
 * Supabase, Twilio, Cloudinary, analytics, etc.
 *
 * Uses placeholder mode when no API key is available but scaffolds
 * real service wrappers with proper env var checks.
 */

// Known integrations and their metadata
const KNOWN_INTEGRATIONS = {
  openai:     { envVar: 'OPENAI_API_KEY',     dep: 'openai',          file: 'server/lib/openai.js',       pattern: /openai|gpt|chatgpt/i },
  anthropic:  { envVar: 'ANTHROPIC_API_KEY',  dep: '@anthropic-ai/sdk',file: 'server/lib/anthropic.js',   pattern: /anthropic|claude/i },
  supabase:   { envVar: 'SUPABASE_URL',       dep: '@supabase/supabase-js', file: 'server/lib/supabase.js', pattern: /supabase/i },
  resend:     { envVar: 'RESEND_API_KEY',     dep: 'resend',           file: 'server/lib/email.js',        pattern: /resend/i },
  sendgrid:   { envVar: 'SENDGRID_API_KEY',   dep: '@sendgrid/mail',   file: 'server/lib/email.js',        pattern: /sendgrid/i },
  twilio:     { envVar: 'TWILIO_ACCOUNT_SID', dep: 'twilio',           file: 'server/lib/sms.js',          pattern: /twilio|sms/i },
  cloudinary: { envVar: 'CLOUDINARY_URL',     dep: 'cloudinary',       file: 'server/lib/storage.js',      pattern: /cloudinary|file.*upload/i },
  s3:         { envVar: 'AWS_ACCESS_KEY_ID',  dep: '@aws-sdk/client-s3', file: 'server/lib/storage.js',   pattern: /\bs3\b|aws.*storage/i },
};

/**
 * @param {import('./types').RegenerationPlan} plan
 * @param {Object} [context]
 * @param {Object.<string,string>} [context.existingFiles]
 * @param {string} [context.userPrompt]
 * @returns {import('./types').SectionRegenerationSpec}
 */
function regenerateIntegrationSection(plan, context = {}) {
  const { existingFiles = {}, userPrompt = '' } = context;
  const isRemoval = plan.changeDetection.action === 'remove';

  // Detect which specific integrations are mentioned
  const matchedIntegrations = Object.entries(KNOWN_INTEGRATIONS).filter(
    ([, meta]) => meta.pattern.test(userPrompt),
  );

  const filesToCreate   = [];
  const envVarsNeeded   = [];
  const depsNeeded      = [];
  const generationHints = [
    'Always read API keys from environment variables — never hardcode',
    'Wrap service calls in a module that checks if configured before calling',
    'Return { configured: false, reason: "..." } when env var is missing',
    'Never throw on missing config during app startup — log a warning instead',
  ];

  if (!isRemoval) {
    for (const [name, meta] of matchedIntegrations) {
      const fileExists = Object.keys(existingFiles).some(p =>
        p.includes(name) || p.includes(meta.file.split('/').pop()),
      );
      if (!fileExists) {
        filesToCreate.push({ path: meta.file, description: `${name} integration wrapper with env-var guard` });
      }
      envVarsNeeded.push(meta.envVar);
      depsNeeded.push(meta.dep);
      generationHints.push(`${name}: use ${meta.envVar} from process.env`);
    }
  }

  const existingIntegrationFiles = Object.keys(existingFiles).filter(p =>
    Object.values(KNOWN_INTEGRATIONS).some(m => m.pattern.test(p)),
  );

  const filesToPatch = existingIntegrationFiles.map(p => ({
    path: p,
    description: isRemoval ? 'Remove integration' : 'Update integration implementation',
    operation:   isRemoval ? 'delete' : 'replace',
  }));

  if (isRemoval) {
    generationHints.push('Remove integration wrapper files and corresponding env vars from .env.example');
    generationHints.push('Remove import of integration in any files that use it');
  }

  return {
    sectionType:        'integrations',
    filesToCreate,
    filesToPatch,
    envVarsNeeded:      [...new Set(envVarsNeeded)],
    dependenciesNeeded: [...new Set(depsNeeded)],
    generationHints,
    validationHints: [
      'Verify all env vars have entries in .env.example',
      'Check service wrapper returns { configured: false } when key missing',
      'Verify no hardcoded API keys in generated files',
    ],
    repairHints: [
      'Add env-var guard if API call is made without checking configuration',
      'Add .env.example entries for all new integration env vars',
    ],
    placeholderMode:  true,  // Integrations default to placeholder until env vars are set
    authenticityNote: 'Integration wrappers must check env vars at call time. Never simulate API responses in production code paths.',
  };
}

module.exports = { regenerateIntegrationSection };
