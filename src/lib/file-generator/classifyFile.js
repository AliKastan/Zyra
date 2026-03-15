'use strict';

/**
 * Classify a file path into a FileType and auto-generate a description.
 *
 * @param {string} filePath
 * @returns {{ type: import('./types').FileType, description: string }}
 */
function classifyFile(filePath) {
  const base = filePath.split('/').pop() || filePath;
  const lower = filePath.toLowerCase();

  // Rule 1: .env.example or .env (exact)
  if (base === '.env.example' || base === '.env') {
    return { type: 'environment', description: 'Environment variable template' };
  }

  // Rule 2: README.md or *.md
  if (base === 'README.md' || base.endsWith('.md')) {
    return { type: 'documentation', description: 'Project documentation' };
  }

  // Rule 3: package.json
  if (base === 'package.json') {
    return { type: 'config', description: 'Node.js project configuration' };
  }

  // Rule 4: manifest.json
  if (base === 'manifest.json') {
    return { type: 'config', description: 'Web app manifest' };
  }

  // Rule 5: *.config.js, vite.config.js, next.config.js, tailwind.config.js
  if (
    base.endsWith('.config.js') ||
    base === 'vite.config.js' ||
    base === 'next.config.js' ||
    base === 'tailwind.config.js'
  ) {
    return { type: 'config', description: 'Build configuration' };
  }

  // Rule 6: tsconfig.json, jsconfig.json
  if (base === 'tsconfig.json' || base === 'jsconfig.json') {
    return { type: 'config', description: 'TypeScript/JS configuration' };
  }

  // Rule 7: *.prisma or schema.prisma
  if (base.endsWith('.prisma') || base === 'schema.prisma') {
    return { type: 'schema', description: 'Database schema' };
  }

  // Rule 8: *.html
  if (base.endsWith('.html')) {
    if (lower.includes('admin')) {
      return { type: 'page', description: 'Admin panel page' };
    }
    return { type: 'page', description: 'Application page' };
  }

  // Rule 9: *.css
  if (base.endsWith('.css')) {
    if (lower.includes('admin')) {
      return { type: 'frontend', description: 'Admin styles' };
    }
    return { type: 'frontend', description: 'Application stylesheet' };
  }

  // Rule 10: *.js
  if (base.endsWith('.js')) {
    // billing/stripe/payment
    if (/billing|stripe|payment/i.test(lower)) {
      return { type: 'integration', description: 'Payment integration' };
    }
    // ai-service/openai/anthropic/llm
    if (/ai-service|ai_service|openai|anthropic|llm/i.test(lower)) {
      return { type: 'integration', description: 'AI provider integration' };
    }
    // integration/sendgrid/mailgun/twilio/s3/cloudinary
    if (/integration|sendgrid|mailgun|twilio|s3|cloudinary/i.test(lower)) {
      return { type: 'integration', description: 'Third-party service integration' };
    }
    // auth
    if (/auth/i.test(lower)) {
      return { type: 'utility', description: 'Authentication utilities' };
    }
    // admin
    if (/admin/i.test(lower)) {
      return { type: 'page', description: 'Admin page logic' };
    }
    // data
    if (/data/i.test(lower)) {
      return { type: 'utility', description: 'Data layer and storage utilities' };
    }
    // app.js or main.js
    if (base === 'app.js' || base === 'main.js') {
      return { type: 'frontend', description: 'Application entry point' };
    }
    // else
    return { type: 'utility', description: 'Application utilities' };
  }

  // Rule 11: everything else
  return { type: 'utility', description: 'Project file' };
}

module.exports = { classifyFile };
