/**
 * generationTimer — utility for formatting elapsed generation time.
 *
 * Used by:
 *   - Backend: logging elapsed time in job records
 *   - Frontend: mirrors formatElapsed() inline for the live display
 */

/**
 * Returns a human-readable elapsed time string from a start ISO timestamp.
 * @param {string} startIso - ISO timestamp of when generation began
 * @returns {string} e.g. "42s", "1m 08s"
 */
function formatElapsed(startIso) {
  const sec = Math.floor((Date.now() - new Date(startIso).getTime()) / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${String(sec % 60).padStart(2, '0')}s`;
}

/**
 * Returns the elapsed milliseconds since a start ISO timestamp.
 */
function elapsedMs(startIso) {
  return Date.now() - new Date(startIso).getTime();
}

/**
 * Returns "Xm Ys elapsed" or "Xs elapsed" — used in UI labels.
 */
function elapsedLabel(startIso) {
  const s = formatElapsed(startIso);
  return `${s} elapsed`;
}

module.exports = { formatElapsed, elapsedMs, elapsedLabel };
