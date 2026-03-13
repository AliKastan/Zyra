/**
 * Access codes for the Zyra private beta gate.
 * Add new codes here — no other files need to change.
 *
 * Codes are compared case-insensitively.
 */
const ACCESS_CODES = new Set([
  'ZYRA-ALPHA',
  'ZYRA-BETA',
  'ZYRA-DEV',
]);

/**
 * Returns true if the provided code is valid.
 * @param {string} code
 */
function isValidCode(code) {
  if (!code || typeof code !== 'string') return false;
  return ACCESS_CODES.has(code.trim().toUpperCase());
}

module.exports = { ACCESS_CODES, isValidCode };
