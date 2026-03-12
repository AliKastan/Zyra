const fse = require('fs-extra');

/**
 * Ensures a directory exists, creating it (and parents) if needed.
 */
async function ensureDir(dirPath) {
  await fse.ensureDir(dirPath);
}

module.exports = { ensureDir };
