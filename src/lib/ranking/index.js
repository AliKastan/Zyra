'use strict';

/**
 * Generation Ranking Layer — Public API
 *
 * Evaluates generated candidate outputs and selects the highest-quality one.
 * Runs as Stage 14 of the Zyra pipeline (after post-generation repair,
 * before final packaging).
 *
 * Primary entry points:
 *   rankCandidates(input)          — rank N candidates, return best
 *   evaluateCandidate(candidate)   — score one candidate across all dimensions
 *   calculateRankingScore(candidate) — return numeric score only
 */

const { scoreCandidate, formatCandidateScore }                     = require('./score-candidate');
const { rankCandidates, selectBestCandidate, summarizeRanking,
        buildUiRankingPayload }                                    = require('./rank-candidates');
const { evaluateArchitecture }                                     = require('./evaluate-architecture');
const { evaluateBackend }                                          = require('./evaluate-backend');
const { evaluateCompleteness }                                     = require('./evaluate-completeness');
const { evaluateReadiness }                                        = require('./evaluate-readiness');
const { evaluateUx }                                               = require('./evaluate-ux');
const { evaluateDesign }                                           = require('./evaluate-design');
const { evaluateConsistency }                                      = require('./evaluate-consistency');

// ── Primary entry points ─────────────────────────────────────────────────────

/**
 * Fully evaluate a single candidate.
 * Alias: used when calling from the orchestrator with a single output.
 *
 * @param {import('./types').GeneratedCandidate} candidate
 * @returns {import('./types').CandidateEvaluation}
 */
function evaluateCandidate(candidate) {
  return scoreCandidate(candidate);
}

/**
 * Calculate the numeric quality score for a candidate.
 * Returns just the total (0–100).
 *
 * @param {import('./types').GeneratedCandidate} candidate
 * @returns {number}
 */
function calculateRankingScore(candidate) {
  return scoreCandidate(candidate).total;
}

/**
 * Wrap a single pipeline output as a ranked result (single-candidate mode).
 * This is how the orchestrator uses the ranking layer when candidateCount = 1.
 *
 * @param {import('./types').GeneratedCandidate} candidate
 * @returns {import('./types').RankingResult}
 */
function rankSingleCandidate(candidate) {
  return rankCandidates({ candidates: [candidate] });
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Primary API
  rankCandidates,
  evaluateCandidate,
  calculateRankingScore,
  rankSingleCandidate,

  // Multi-candidate helpers
  selectBestCandidate,
  summarizeRanking,
  buildUiRankingPayload,

  // Individual evaluators (for selective use)
  evaluateArchitecture,
  evaluateBackend,
  evaluateCompleteness,
  evaluateReadiness,
  evaluateUx,
  evaluateDesign,
  evaluateConsistency,

  // Score utilities
  scoreCandidate,
  formatCandidateScore,
};
