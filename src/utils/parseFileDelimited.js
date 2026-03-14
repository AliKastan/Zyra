const logger = require('./logger');

/**
 * Parses the ---FILE: path--- ... ---END FILE--- delimiter format from AI responses.
 *
 * This format is used by the full-generation coder prompts. It avoids JSON escaping
 * issues entirely, handles large multi-file outputs cleanly, and never truncates content.
 *
 * Expected format:
 *   ---FILE: path/to/file.ext---
 *   [file content]
 *   ---END FILE---
 *
 * Flexible matching: handles --- FILE: path ---, ----FILE:path----, etc.
 *
 * @param {string} raw - Raw AI response text
 * @returns {{ success: boolean, files: Array<{path: string, content: string}>, error: string|null }}
 */
function parseFileDelimited(raw) {
  if (!raw || typeof raw !== 'string') {
    return { success: false, files: [], error: 'Empty or non-string response' };
  }

  const files = [];

  // Flexible regex: tolerates extra dashes, spaces around FILE:/END FILE, case-insensitive
  const filePattern = /---+\s*FILE:\s*(.+?)\s*---+\r?\n?([\s\S]*?)---+\s*END FILE\s*---+/gi;

  let match;
  while ((match = filePattern.exec(raw)) !== null) {
    const filePath = match[1].trim();
    let content = match[2];

    // Normalize line endings
    content = content.replace(/\r\n/g, '\n');

    // Strip exactly one leading and one trailing newline (added by the format itself)
    if (content.startsWith('\n')) content = content.slice(1);
    if (content.endsWith('\n'))   content = content.slice(0, -1);

    if (!filePath) continue;

    // Reject path traversal attempts
    if (filePath.includes('..')) {
      logger.warn(`parseFileDelimited: skipping suspicious path "${filePath}"`);
      continue;
    }

    files.push({ path: filePath, content });
  }

  if (files.length > 0) {
    logger.debug(`parseFileDelimited: found ${files.length} file(s)`);
    return { success: true, files, error: null };
  }

  logger.warn('parseFileDelimited: no ---FILE--- blocks found', {
    rawLength: raw.length,
    snippet:   raw.slice(0, 300),
  });

  return {
    success: false,
    files:   [],
    error:   'No ---FILE--- blocks found in response',
  };
}

module.exports = { parseFileDelimited };
