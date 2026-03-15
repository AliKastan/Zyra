'use strict';

const { scoreProductScope } = require('./dimensions/productScope');
const { scorePlatform }     = require('./dimensions/platform');
const { scoreBackend }      = require('./dimensions/backend');
const { scoreRoles }        = require('./dimensions/roles');
const { scoreIntegrations } = require('./dimensions/integrations');
const { scoreOperations }   = require('./dimensions/operations');
const { scoreDeployment }   = require('./dimensions/deployment');
const { getTier }           = require('./thresholds');
const { recommendStrategy } = require('./recommendStrategy');

/**
 * Build a ScoringContext from an enriched intent.
 *
 * @param {import('../../generation/types').GenerationIntent} intent
 * @returns {import('./types').ScoringContext}
 */
function buildScoringContext(intent) {
  const report = intent._inferenceReport || null;

  const features     = (intent.features     || []);
  const flows        = (intent.userFlows    || []);
  const entities     = report ? report.requirements.filter(r => r.category === 'entity')     : [];
  const roles        = report ? report.requirements.filter(r => r.category === 'role')       : [];
  const integrations = report ? report.requirements.filter(r => r.category === 'integration'): [];
  const domain       = report ? report.domain : (intent.appType || 'generic');

  // Build a single lowercase text blob for keyword matching
  const allText = [
    intent.appType || '',
    intent.category || '',
    intent.coreEntity || '',
    intent.target || '',
    ...features.map(f => `${f.name || ''} ${f.description || ''}`),
    ...flows.map(f => f.name || ''),
    ...(intent.uiStates || []),
    ...(intent.potentialPitfalls || []),
    ...(intent.interactions || []).map(i => typeof i === 'string' ? i : i.name || ''),
    ...entities.map(e => e.name || ''),
    ...roles.map(r => r.name || ''),
    ...integrations.map(i => i.name || ''),
  ].join(' ').toLowerCase();

  return { intent, inferenceReport: report, features, flows, entities, roles, integrations, domain, allText };
}

/**
 * Build the full complexity report for an enriched intent.
 *
 * @param {import('../../generation/types').GenerationIntent} intent
 * @returns {import('./types').AppComplexityReport}
 */
function buildComplexityReport(intent) {
  const ctx = buildScoringContext(intent);

  const productScopeResult  = scoreProductScope(ctx);
  const platformResult      = scorePlatform(ctx);
  const backendResult       = scoreBackend(ctx);
  const rolesResult         = scoreRoles(ctx);
  const integrationsResult  = scoreIntegrations(ctx);
  const operationsResult    = scoreOperations(ctx);
  const deploymentResult    = scoreDeployment(ctx);

  const dimensionBreakdown = {
    productScope:     productScopeResult.score,
    platform:         platformResult.score,
    dataBackend:      backendResult.score,
    rolesPermissions: rolesResult.score,
    integrations:     integrationsResult.score,
    operations:       operationsResult.score,
    deployment:       deploymentResult.score,
  };

  const totalScore = Object.values(dimensionBreakdown).reduce((a, b) => a + b, 0);
  const complexityTier = getTier(totalScore);

  // Collect all non-empty reasons
  const allReasons = [
    ...productScopeResult.reasons,
    ...platformResult.reasons,
    ...backendResult.reasons,
    ...rolesResult.reasons,
    ...integrationsResult.reasons,
    ...operationsResult.reasons,
    ...deploymentResult.reasons,
  ].filter(Boolean);

  // Merge all signals
  const allSignals = {
    featureCount:       ctx.features.length,
    inferredFlowCount:  ctx.flows.length,
    entityCount:        ctx.entities.length,
    roleCount:          ctx.roles.length,
    integrationCount:   ctx.integrations.length,
    platformCount:      1 + (platformResult.signals.hasAdmin ? 1 : 0) + (platformResult.signals.hasMobileApp ? 1 : 0),
    hasAuth:            backendResult.signals.hasAuth || false,
    hasPayments:        backendResult.signals.hasPayments || false,
    hasAI:              integrationsResult.signals.hasAI || false,
    hasAdmin:           operationsResult.signals.hasAdminDashboard || false,
    hasAnalytics:       operationsResult.signals.hasAnalytics || false,
    hasRealTime:        backendResult.signals.hasRealTime || false,
    hasBackgroundJobs:  deploymentResult.signals.hasBackgroundJobs || false,
    hasMobile:          platformResult.signals.hasMobileApp || platformResult.signals.hasResponsive || false,
  };

  // Confidence: lower when signals are sparse or domain is generic
  const hasInference = ctx.inferenceReport !== null;
  const confidence   = hasInference ? Math.min(0.85 + (totalScore / 300), 0.99) : 0.65;

  return {
    totalScore,
    complexityTier,
    confidence:          Math.round(confidence * 100) / 100,
    dimensionBreakdown,
    reasons:             allReasons.slice(0, 8), // top 8 most relevant
    signals:             allSignals,
    recommendedStrategy: recommendStrategy(complexityTier, totalScore),
    llmRefined:          false,
  };
}

module.exports = { buildComplexityReport, buildScoringContext };
