'use strict';

/**
 * Generation Ranking Layer — Type Definitions
 *
 * Evaluates and ranks multiple generated candidate outputs, selecting
 * the highest-quality version before final packaging.
 *
 * @module ranking/types
 */

/**
 * Score breakdown across all ranking criteria.
 * Each dimension is 0–100; the total is the weighted composite.
 *
 * @typedef {Object} RankingCriteria
 * @property {number} architecture    - Clean structure, modularity, file organisation (0–100)
 * @property {number} backend         - Real wiring, routes, DB, auth (0–100)
 * @property {number} completeness    - Required routes, integrations, UI coverage (0–100)
 * @property {number} readiness       - Scripts, env, health route, port config (0–100)
 * @property {number} ux              - Loading / error / empty states (0–100)
 * @property {number} design          - CSS tokens, layout, component hierarchy (0–100)
 * @property {number} consistency     - Naming, imports, dependency alignment (0–100)
 */

/**
 * Detailed evaluation for a single candidate.
 * @typedef {Object} CandidateEvaluation
 * @property {string}           candidateId        - "candidate_a", "candidate_b", etc.
 * @property {RankingCriteria}  dimensionScores    - Per-dimension raw scores (0–100 each)
 * @property {number}           total              - Weighted composite score (0–100)
 * @property {string[]}         strengths          - What this candidate does well
 * @property {string[]}         weaknesses         - What this candidate lacks
 * @property {string[]}         reasons            - Human-readable ranking rationale
 */

/**
 * Score summary stored in the ranking result's scores map.
 * @typedef {Object} CandidateScore
 * @property {number}          total           - Composite score (0–100)
 * @property {RankingCriteria} breakdown       - Per-dimension scores
 * @property {string[]}        reasons         - Rationale bullets
 */

/**
 * Final output of the ranking layer.
 * @typedef {Object} RankingResult
 * @property {string}                        bestCandidateId   - ID of the winning candidate
 * @property {Object}                        files             - Files from the winning candidate
 * @property {Object}                        [blueprint]       - Blueprint from the winning candidate
 * @property {Object|null}                   [validationReport] - Validation from the winner
 * @property {Object|null}                   [readinessReport]  - Readiness from the winner
 * @property {Object|null}                   [authenticityReport] - Authenticity from the winner
 * @property {Object|null}                   [preventionReport]   - Prevention from the winner
 * @property {Record<string, CandidateScore>} scores           - All candidate scores
 * @property {Record<string, string[]>}      rankingReasons    - Per-candidate rationale
 * @property {number}                        candidateCount    - Total candidates evaluated
 * @property {boolean}                       multiCandidate    - True when > 1 candidate
 * @property {string}                        summary           - Human-readable outcome
 * @property {string}                        rankedAt          - ISO timestamp
 */

/**
 * A generated candidate ready for ranking.
 * Wraps the output from runAdvancedPipeline (or equivalent).
 *
 * @typedef {Object} GeneratedCandidate
 * @property {string}           candidateId          - "candidate_a" | "candidate_b" | ...
 * @property {Object|Array|Map} files                - Generated file map
 * @property {Object}           [blueprint]          - Enriched blueprint
 * @property {Object}           [validationReport]   - From AI Validator (Stage 6.5)
 * @property {Object}           [stageValidationReport] - From Stage 6 HTML/CSS/JS validator
 * @property {Object}           [readinessReport]    - From Production Readiness Checker (Stage 12)
 * @property {Object}           [authenticityReport] - From Backend Authenticity Layer (Stage 13)
 * @property {Object}           [preventionReport]   - From Error Prevention Layer (Stage 7+10.5)
 * @property {Object}           [repairReport]       - From Repair/Self-Healing system
 * @property {Object}           [intent]             - Scored intent
 * @property {string}           [generatedAt]        - ISO timestamp
 */

/**
 * Input to rankCandidates().
 * @typedef {Object} RankingInput
 * @property {GeneratedCandidate[]} candidates   - Array of generated candidates
 * @property {Object}               [blueprint]  - Original blueprint (for context)
 * @property {Object}               [intent]     - Session intent memory
 */

module.exports = {};
