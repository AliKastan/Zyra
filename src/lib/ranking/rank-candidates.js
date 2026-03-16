'use strict';

/**
 * Candidate Ranker
 *
 * Evaluates all generated candidates, selects the best one,
 * and returns a structured RankingResult.
 *
 * Supports both:
 *   - Single-candidate mode (N=1): scores the one candidate, wraps it in a ranking result
 *   - Multi-candidate mode (N>1): compares all candidates, selects the winner
 */

const { scoreCandidate, formatCandidateScore } = require('./score-candidate');

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Rank all candidates and return the best one.
 *
 * @param {import('./types').RankingInput} input
 * @returns {import('./types').RankingResult}
 */
function rankCandidates(input) {
  const { candidates = [] } = input;

  if (candidates.length === 0) {
    throw new Error('rankCandidates: at least one candidate is required');
  }

  // Score every candidate
  const evaluations = candidates.map(scoreCandidate);

  // Sort descending by total score
  const ranked = [...evaluations].sort((a, b) => b.total - a.total);
  const winner = ranked[0];

  // Find the winning candidate's full data
  const bestCandidate = candidates.find(c => c.candidateId === winner.candidateId);

  // Build scores map
  const scores = {};
  for (const ev of evaluations) {
    scores[ev.candidateId] = {
      total:     ev.total,
      breakdown: ev.dimensionScores,
      reasons:   ev.reasons,
    };
  }

  // Build rankingReasons map (per candidate)
  const rankingReasons = {};
  for (const ev of evaluations) {
    rankingReasons[ev.candidateId] = ev.reasons;
  }

  const summary = _buildSummary(ranked, candidates.length);

  return {
    bestCandidateId:      winner.candidateId,
    // Pass through all outputs from the winning candidate
    files:                bestCandidate.files,
    blueprint:            bestCandidate.blueprint         || null,
    validationReport:     bestCandidate.validationReport  || null,
    stageValidationReport: bestCandidate.stageValidationReport || null,
    readinessReport:      bestCandidate.readinessReport   || null,
    authenticityReport:   bestCandidate.authenticityReport || null,
    preventionReport:     bestCandidate.preventionReport  || null,
    repairReport:         bestCandidate.repairReport      || null,
    intent:               bestCandidate.intent            || null,
    // Ranking metadata
    scores,
    rankingReasons,
    evaluations,          // full per-candidate evaluations (for debugging)
    candidateCount:       candidates.length,
    multiCandidate:       candidates.length > 1,
    summary,
    rankedAt:             new Date().toISOString(),
  };
}

/**
 * Select the best candidate from an already-evaluated set.
 * Useful when evaluations were computed separately.
 *
 * @param {import('./types').CandidateEvaluation[]} evaluations
 * @returns {import('./types').CandidateEvaluation}
 */
function selectBestCandidate(evaluations) {
  if (evaluations.length === 0) throw new Error('selectBestCandidate: empty evaluations array');
  return [...evaluations].sort((a, b) => b.total - a.total)[0];
}

/**
 * One-line log summary of a ranking result.
 * @param {import('./types').RankingResult} result
 * @returns {string}
 */
function summarizeRanking(result) {
  const scores = Object.entries(result.scores)
    .map(([id, s]) => `${id}=${s.total}`)
    .join(' ');
  return `winner="${result.bestCandidateId}" candidates=${result.candidateCount} scores={${scores}}`;
}

/**
 * Build a lean UI payload from a ranking result.
 * @param {import('./types').RankingResult} result
 * @returns {Object}
 */
function buildUiRankingPayload(result) {
  return {
    bestCandidateId:  result.bestCandidateId,
    candidateCount:   result.candidateCount,
    multiCandidate:   result.multiCandidate,
    scores:           Object.fromEntries(
      Object.entries(result.scores).map(([id, s]) => [id, { total: s.total, breakdown: s.breakdown }]),
    ),
    bestScore:        result.scores[result.bestCandidateId]?.total ?? 0,
    bestReasons:      (result.rankingReasons[result.bestCandidateId] || []).slice(0, 5),
    summary:          result.summary,
    rankedAt:         result.rankedAt,
  };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _buildSummary(ranked, total) {
  const winner = ranked[0];
  const runnerUp = ranked[1];

  if (total === 1) {
    return `Single candidate scored ${winner.total}/100. ${winner.strengths[0] || ''}`;
  }

  const margin = runnerUp ? winner.total - runnerUp.total : 0;
  const topReasons = winner.reasons.slice(0, 3).join(', ');

  return (
    `Best: ${winner.candidateId} (${winner.total}/100) — ${margin > 0 ? `+${margin} over runner-up` : 'tied'}. ` +
    `Key strengths: ${topReasons || 'see breakdown'}.`
  );
}

module.exports = { rankCandidates, selectBestCandidate, summarizeRanking, buildUiRankingPayload };
