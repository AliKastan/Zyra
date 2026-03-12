/**
 * Races a promise against a timeout.
 * If the promise does not resolve within `ms`, rejects with a clear error.
 *
 * @param {Promise} promise
 * @param {number} ms
 * @param {string} label - shown in the error message
 */
function withTimeout(promise, ms, label) {
  const timeout = new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
      ms
    )
  );
  return Promise.race([promise, timeout]);
}

module.exports = { withTimeout };
