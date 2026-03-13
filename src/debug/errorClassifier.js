'use strict';

/**
 * errorClassifier.js
 * Clusters and deduplicates normalized errors to reduce AI token consumption.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_CLUSTERS = 12;

// Severity ordering for sorting (lower index = higher priority)
const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

// ── Signature normalization ───────────────────────────────────────────────────

// Patterns to strip from messages before comparing
const STRIP_UUID        = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const STRIP_LONG_HEX    = /\b[0-9a-f]{16,}\b/gi;
const STRIP_LONG_NUMBER = /\b\d{5,}\b/g;
const STRIP_URL         = /https?:\/\/[^\s"']+/g;
const STRIP_LONG_STR    = /(['"])[^'"]{40,}\1/g;  // long quoted strings
const STRIP_FILEPATH    = /(?:\/[\w.-]+){3,}/g;    // long Unix paths
const STRIP_WINPATH     = /[A-Za-z]:\\(?:[\w\s.-]+\\){2,}[\w\s.-]*/g;
const STRIP_TIMESTAMP   = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g;
const STRIP_PORT        = /:\d{4,5}\b/g;           // :3001, :8080, etc.
const NORMALIZE_SPACES  = /\s+/g;

/**
 * Compute a stable signature for an error message.
 * Strips dynamic values (UUIDs, numbers, URLs) so similar errors cluster together.
 *
 * @param {string} message
 * @param {string} source
 * @param {string} category
 * @returns {string}
 */
function computeSignature(message, source, category) {
  let sig = (message || '').toLowerCase();

  sig = sig.replace(STRIP_TIMESTAMP,   '<ts>');
  sig = sig.replace(STRIP_UUID,        '<id>');
  sig = sig.replace(STRIP_LONG_HEX,    '<hex>');
  sig = sig.replace(STRIP_URL,         '<url>');
  sig = sig.replace(STRIP_LONG_STR,    '"<str>"');
  sig = sig.replace(STRIP_FILEPATH,    '<path>');
  sig = sig.replace(STRIP_WINPATH,     '<path>');
  sig = sig.replace(STRIP_LONG_NUMBER, '<n>');
  sig = sig.replace(STRIP_PORT,        ':<port>');
  sig = sig.replace(NORMALIZE_SPACES,  ' ').trim();

  // Truncate to avoid huge signatures from massive stack dumps
  if (sig.length > 200) sig = sig.slice(0, 200);

  return `${source || 'unknown'}:${category || 'runtime_error'}:${sig}`;
}

// ── Severity comparison ───────────────────────────────────────────────────────

function severityScore(severity) {
  return SEVERITY_ORDER[severity] ?? 4;
}

function higherSeverity(a, b) {
  return severityScore(a) <= severityScore(b) ? a : b;
}

// ── Clustering ────────────────────────────────────────────────────────────────

/**
 * Cluster normalized errors by signature, deduplicating similar messages.
 *
 * @param {NormalizedError[]} normalizedErrors
 * @returns {ErrorCluster[]} sorted by severity then occurrences, capped at MAX_CLUSTERS
 */
function clusterErrors(normalizedErrors) {
  if (!Array.isArray(normalizedErrors) || normalizedErrors.length === 0) return [];

  const clusterMap = new Map(); // signature → ErrorCluster

  for (const err of normalizedErrors) {
    const sig = computeSignature(err.message, err.source, err.category);

    if (clusterMap.has(sig)) {
      const cluster = clusterMap.get(sig);
      cluster.occurrences += 1;
      cluster.severity = higherSeverity(cluster.severity, err.severity);
      cluster.timestamps.push(err.timestamp);
      if (err.file && !cluster.likelyFiles.includes(err.file)) {
        cluster.likelyFiles.push(err.file);
      }
    } else {
      clusterMap.set(sig, {
        signature:              sig,
        source:                 err.source,
        category:               err.category,
        severity:               err.severity,
        occurrences:            1,
        representativeMessage:  err.message,
        representativeStack:    err.stacktrace || null,
        likelyFiles:            err.file ? [err.file] : [],
        timestamps:             [err.timestamp],
      });
    }
  }

  const clusters = Array.from(clusterMap.values());

  // Sort: critical first, then by occurrence count descending
  clusters.sort((a, b) => {
    const sevDiff = severityScore(a.severity) - severityScore(b.severity);
    if (sevDiff !== 0) return sevDiff;
    return b.occurrences - a.occurrences;
  });

  return clusters.slice(0, MAX_CLUSTERS);
}

// ── Summary builder ───────────────────────────────────────────────────────────

/**
 * Build a token-efficient summary of all normalized errors.
 *
 * @param {NormalizedError[]} normalizedErrors
 * @returns {{ totalErrors, uniqueErrors, clusters, criticalCount, highCount }}
 */
function buildErrorSummary(normalizedErrors) {
  const errors   = Array.isArray(normalizedErrors) ? normalizedErrors : [];
  const clusters = clusterErrors(errors);

  const criticalCount = errors.filter((e) => e.severity === 'critical').length;
  const highCount     = errors.filter((e) => e.severity === 'high').length;

  return {
    totalErrors:  errors.length,
    uniqueErrors: clusters.length,
    clusters,
    criticalCount,
    highCount,
  };
}

module.exports = { clusterErrors, buildErrorSummary };
