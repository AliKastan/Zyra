const fse = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');

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
      await fse.writeFile(resolvedPath, file.content || '', 'utf8');
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
