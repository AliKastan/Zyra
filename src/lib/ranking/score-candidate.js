'use strict';

/**
 * Candidate Scorer
 *
 * Runs all evaluators against a single candidate and produces a
 * CandidateEvaluation with a weighted composite score.
 *
 * Dimension weights (sum = 1.0):
 *   architecture  0.20
 *   backend       0.25   ← highest: authenticity is the hardest to fix
 *   completeness  0.20
 *   readiness     0.15
 *   ux            0.10
 *   design        0.05
 *   consistency   0.05
 */

const { evaluateArchitecture } = require('./evaluate-architecture');
const { evaluateBackend }      = require('./evaluate-backend');
const { evaluateCompleteness } = require('./evaluate-completeness');
const { evaluateReadiness }    = require('./evaluate-readiness');
const { evaluateUx }           = require('./evaluate-ux');
const { evaluateDesign }       = require('./evaluate-design');
const { evaluateConsistency }  = require('./evaluate-consistency');

// Dimension weights — must sum to 1.0
const WEIGHTS = {
  architecture:  0.20,
  backend:       0.25,
  completeness:  0.20,
  readiness:     0.15,
  ux:            0.10,
  design:        0.05,
  consistency:   0.05,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score a single generated candidate across all dimensions.
 *
 * @param {import('./types').GeneratedCandidate} candidate
 * @returns {import('./types').CandidateEvaluation}
 */
function scoreCandidate(candidate) {
  const files = _normalizeFiles(candidate.files || {});

  // Run all evaluators
  const archResult  = evaluateArchitecture(files, candidate.blueprint);
  const backResult  = evaluateBackend(files, candidate.authenticityReport || null);
  const compResult  = evaluateCompleteness(files, candidate.validationReport || null, candidate.preventionReport || null, candidate.blueprint);
  const readResult  = evaluateReadiness(files, candidate.readinessReport || null);
  const uxResult    = evaluateUx(files);
  const dsnResult   = evaluateDesign(files, candidate.blueprint);
  const consResult  = evaluateConsistency(files);

  // Per-dimension scores
  const dimensionScores = {
    architecture:  archResult.score,
    backend:       backResult.score,
    completeness:  compResult.score,
    readiness:     readResult.score,
    ux:            uxResult.score,
    design:        dsnResult.score,
    consistency:   consResult.score,
  };

  // Weighted composite
  const total = Math.round(
    Object.entries(WEIGHTS).reduce(
      (sum, [dim, w]) => sum + (dimensionScores[dim] * w),
      0,
    ),
  );

  // Aggregate strengths / weaknesses across all evaluators
  const strengths  = _dedup([
    ...archResult.strengths,
    ...backResult.strengths,
    ...compResult.strengths,
    ...readResult.strengths,
    ...uxResult.strengths,
    ...dsnResult.strengths,
    ...consResult.strengths,
  ]).slice(0, 8);

  const weaknesses = _dedup([
    ...archResult.weaknesses,
    ...backResult.weaknesses,
    ...compResult.weaknesses,
    ...readResult.weaknesses,
    ...uxResult.weaknesses,
    ...dsnResult.weaknesses,
    ...consResult.weaknesses,
  ]).slice(0, 8);

  // Ranking reasons: top strengths + most impactful weaknesses
  const reasons = [
    ...strengths.slice(0, 4),
    ...weaknesses.slice(0, 2).map(w => `Issue: ${w}`),
  ];

  return {
    candidateId:    candidate.candidateId,
    dimensionScores,
    total,
    strengths,
    weaknesses,
    reasons,
  };
}

/**
 * Build a concise log-line for a scored candidate.
 * @param {import('./types').CandidateEvaluation} evaluation
 * @returns {string}
 */
function formatCandidateScore(evaluation) {
  const d = evaluation.dimensionScores;
  return [
    `${evaluation.candidateId}: total=${evaluation.total}`,
    `arch=${d.architecture}`,
    `backend=${d.backend}`,
    `complete=${d.completeness}`,
    `ready=${d.readiness}`,
    `ux=${d.ux}`,
  ].join(' ');
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _normalizeFiles(files) {
  if (files instanceof Map) {
    const obj = {};
    for (const [k, v] of files) obj[k] = typeof v === 'string' ? v : (v?.content || '');
    return obj;
  }
  if (Array.isArray(files)) {
    const obj = {};
    for (const f of files) {
      if (f?.path) obj[f.path] = f.content || '';
    }
    return obj;
  }
  return typeof files === 'object' && files !== null ? files : {};
}

function _dedup(arr) {
  return [...new Set(arr)];
}

module.exports = { scoreCandidate, formatCandidateScore };
