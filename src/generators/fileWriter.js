const fse = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');

const PLANCK_TAG = '<script src="/planck.min.js"></script>';

/**
 * Inject planck.js script tag into index.html if not already present.
 * Inserted just before the first <script> tag or at end of <head>.
 */
function injectPlanck(content) {
  if (!content || content.includes('planck.min.js') || content.includes('planck.js')) return content;
  // Only inject into HTML files that look like games (contain <canvas)
  if (!/<canvas/i.test(content)) return content;
  // Insert before the first <script that is not a data-zyra monitor script
  const firstScriptMatch = content.match(/<script(?![^>]*data-zyra)[^>]*>/i);
  if (firstScriptMatch) {
    const idx = content.indexOf(firstScriptMatch[0]);
    return content.slice(0, idx) + PLANCK_TAG + '\n' + content.slice(idx);
  }
  // Fallback: insert before </head>
  if (/<\/head>/i.test(content)) {
    return content.replace(/<\/head>/i, PLANCK_TAG + '\n</head>');
  }
  return content;
}

/**
 * Writes an array of { path, content } file objects to a target directory.
 * @param {string} targetDir - absolute path to the project output directory
 * @param {Array<{path: string, content: string}>} files
 */
async function writeFiles(targetDir, files) {
  const written = [];
  const failed = [];

  for (const file of files) {
    if (!file.path || typeof file.path !== 'string') {
      logger.warn('fileWriter: skipping file with invalid path', { file });
      failed.push({ path: file.path, error: 'Invalid path' });
      continue;
    }

    // Prevent directory traversal attacks
    const resolvedPath = path.resolve(targetDir, file.path);
    if (!resolvedPath.startsWith(path.resolve(targetDir))) {
      logger.warn('fileWriter: skipping file outside target directory', { path: file.path });
      failed.push({ path: file.path, error: 'Path traversal attempt' });
      continue;
    }

    try {
      await fse.ensureDir(path.dirname(resolvedPath));
      let content = file.content || '';
      // Auto-inject planck.js into game index.html files
      if (file.path === 'index.html' || file.path.endsWith('/index.html')) {
        content = injectPlanck(content);
      }
      await fse.writeFile(resolvedPath, content, 'utf8');
      written.push(file.path);
      logger.debug('fileWriter: wrote', { path: file.path });
    } catch (err) {
      logger.error(`fileWriter: failed to write ${file.path}`, { error: err.message });
      failed.push({ path: file.path, error: err.message });
    }
  }

  return { written, failed };
}

module.exports = { writeFiles };
