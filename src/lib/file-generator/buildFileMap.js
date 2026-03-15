'use strict';

const { classifyFile } = require('./classifyFile');

/**
 * Build the expected file map from blueprint and complexity context.
 *
 * @param {import('../../generation/types').AppBlueprint} blueprint
 * @param {import('../complexity/types').AppComplexityReport|null} complexityReport
 * @returns {import('./types').FileMap}
 */
function buildFileMap(blueprint, complexityReport) {
  const tier    = complexityReport?.complexityTier || 'medium';
  const signals = complexityReport?.signals || {};
  const paths   = new Set(blueprint.fileList || []);

  // Always add README.md
  paths.add('README.md');

  // Add .env.example if integrations or auth present
  if (signals.hasAuth || signals.hasPayments || signals.hasAI || (signals.integrationCount || 0) >= 2) {
    paths.add('.env.example');
  }

  // Add billing.js if payments needed
  if (signals.hasPayments) paths.add('billing.js');

  // Add ai-service.js if AI needed
  if (signals.hasAI) paths.add('ai-service.js');

  // Add admin.html + admin.js if admin needed
  if (signals.hasAdmin || (signals.roleCount || 0) >= 3) {
    if (![...paths].some(p => p.includes('admin'))) {
      paths.add('admin.html');
      paths.add('admin.js');
    }
  }

  const files = [...paths].map(path => {
    const { type, description } = classifyFile(path);
    // Mark as required if it was in the blueprint fileList
    const required = (blueprint.fileList || []).includes(path);
    return { path, type, description, required };
  });

  // Sort: config/docs first, pages last
  const ORDER = {
    environment:   0,
    config:        1,
    documentation: 2,
    schema:        3,
    frontend:      4,
    utility:       5,
    integration:   6,
    backend:       7,
    api:           8,
    page:          9,
  };
  files.sort((a, b) => (ORDER[a.type] ?? 10) - (ORDER[b.type] ?? 10));

  return { files, projectName: blueprint.projectName, tier };
}

module.exports = { buildFileMap };
