'use strict';

/**
 * Deployment / Infrastructure Section Regenerator
 *
 * Spec for deployment-related changes: scripts, env config,
 * health routes, port handling, README, platform config files.
 *
 * Highly targeted — only touches infrastructure files, never app logic.
 */

// Known deployment platform patterns
const PLATFORM_PATTERNS = {
  railway:  /railway/i,
  vercel:   /vercel/i,
  heroku:   /heroku/i,
  netlify:  /netlify/i,
  docker:   /docker/i,
  fly:      /fly\.io|flyctl/i,
  aws:      /\baws\b|elastic[_\s-]?beanstalk|ecs|ec2/i,
};

/**
 * @param {import('./types').RegenerationPlan} plan
 * @param {Object} [context]
 * @param {Object.<string,string>} [context.existingFiles]
 * @param {string} [context.userPrompt]
 * @returns {import('./types').SectionRegenerationSpec}
 */
function regenerateDeploymentSection(plan, context = {}) {
  const { existingFiles = {}, userPrompt = '' } = context;

  // Detect target platform
  const targetPlatform = Object.entries(PLATFORM_PATTERNS).find(([, rx]) => rx.test(userPrompt))?.[0] || null;

  const needsHealthRoute = /health[_\s-]?(?:check|route|endpoint)/i.test(userPrompt);
  const needsEnvDocs     = /env|environment[_\s-]?var|\.env/i.test(userPrompt);
  const needsScripts     = /script|start|build|deploy[_\s-]?script/i.test(userPrompt);
  const needsReadme      = /readme|documentation|setup/i.test(userPrompt);

  const existingDeployFiles = Object.keys(existingFiles).filter(p =>
    /^(?:package\.json|\.env(?:\.example)?|Dockerfile|docker-compose|railway\.json|vercel\.json|netlify\.toml|Procfile|README\.md)$/i.test(p.split('/').pop()) ||
    /health(?:check)?\.(?:js|ts)$/i.test(p),
  );

  const filesToCreate = [];
  if (!existingDeployFiles.includes('.env.example')) {
    filesToCreate.push({ path: '.env.example', description: 'Environment variable documentation' });
  }
  if (needsHealthRoute && !existingDeployFiles.some(p => /health/i.test(p))) {
    filesToCreate.push({ path: 'server/routes/health.js', description: 'GET /health route returning { status: "ok" }' });
  }
  if (needsReadme && !existingDeployFiles.includes('README.md')) {
    filesToCreate.push({ path: 'README.md', description: 'Project setup and deployment instructions' });
  }
  if (targetPlatform === 'railway' && !existingDeployFiles.includes('railway.json')) {
    filesToCreate.push({ path: 'railway.json', description: 'Railway deployment configuration' });
  }
  if (targetPlatform === 'vercel' && !existingDeployFiles.includes('vercel.json')) {
    filesToCreate.push({ path: 'vercel.json', description: 'Vercel deployment configuration' });
  }
  if (targetPlatform === 'docker' && !existingDeployFiles.some(p => /Dockerfile/i.test(p))) {
    filesToCreate.push({ path: 'Dockerfile', description: 'Multi-stage Dockerfile' });
    filesToCreate.push({ path: 'docker-compose.yml', description: 'Docker Compose for local development' });
  }

  const generationHints = [
    'Only update deployment-related files — do not touch app logic',
    'Preserve all existing start/build scripts — add new ones alongside',
    'Update .env.example with all new environment variables needed',
    'Health route must return HTTP 200 with JSON { status: "ok" } when healthy',
    'PORT must read from process.env.PORT with fallback',
  ];

  if (targetPlatform) generationHints.push(`Optimize configuration specifically for ${targetPlatform} deployment`);
  if (needsScripts)   generationHints.push('Add npm scripts for start, build, and dev without overwriting existing scripts');

  const filesToPatch = existingDeployFiles
    .filter(p => p !== '.env.example')  // .env.example is patched by adding lines
    .map(p => ({
      path: p,
      description: 'Update deployment configuration',
      operation: p === 'package.json' ? 'patch' : 'replace',
    }));

  // .env.example is always patched (append), never replaced
  if (existingDeployFiles.includes('.env.example')) {
    filesToPatch.push({ path: '.env.example', description: 'Append new env var documentation', operation: 'patch' });
  }

  return {
    sectionType:        'deployment',
    filesToCreate,
    filesToPatch,
    envVarsNeeded:      ['PORT', 'NODE_ENV'],
    dependenciesNeeded: [],
    generationHints,
    validationHints: [
      'Verify health route exists and returns 200',
      'Check PORT uses process.env.PORT',
      'Verify .env.example covers all env vars used in code',
      'Check start script runs the correct entrypoint',
    ],
    repairHints: [
      'Add missing health route if not present',
      'Replace hardcoded PORT with process.env.PORT || 3000',
      'Add missing env var entries to .env.example',
    ],
    placeholderMode:  false,
    authenticityNote: 'Deployment config should not affect application authenticity',
  };
}

module.exports = { regenerateDeploymentSection };
