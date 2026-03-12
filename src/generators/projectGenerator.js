const path = require('path');
const fse = require('fs-extra');
const { writeFiles } = require('./fileWriter');
const logger = require('../utils/logger');

const GENERATED_PROJECTS_DIR = path.resolve(__dirname, '../../generated-projects');

/**
 * Writes a generated project to disk.
 * @param {string} projectSlug - folder name for the project
 * @param {Array<{path, content}>} files
 * @returns {Promise<{projectDir, written, failed}>}
 */
async function generateProject(projectSlug, files) {
  const projectDir = path.join(GENERATED_PROJECTS_DIR, projectSlug);

  // Remove existing output if present, then recreate
  await fse.remove(projectDir);
  await fse.ensureDir(projectDir);

  logger.info(`projectGenerator: writing ${files.length} files to ${projectDir}`);

  const { written, failed } = await writeFiles(projectDir, files);

  logger.success(`projectGenerator: wrote ${written.length} files, ${failed.length} failed`);

  return { projectDir, written, failed };
}

/**
 * Returns a list of all generated project folder names.
 */
async function listProjects() {
  await fse.ensureDir(GENERATED_PROJECTS_DIR);
  const entries = await fse.readdir(GENERATED_PROJECTS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

/**
 * Returns a recursive file tree for a project folder.
 */
async function getProjectFiles(projectSlug) {
  const projectDir = path.join(GENERATED_PROJECTS_DIR, projectSlug);

  if (!(await fse.pathExists(projectDir))) {
    return null;
  }

  const files = await walkDir(projectDir, projectDir);
  return { projectDir, files };
}

async function walkDir(dir, rootDir) {
  const entries = await fse.readdir(dir, { withFileTypes: true });
  const results = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      const children = await walkDir(fullPath, rootDir);
      results.push({ type: 'dir', path: relativePath, children });
    } else {
      results.push({ type: 'file', path: relativePath });
    }
  }

  return results;
}

module.exports = { generateProject, listProjects, getProjectFiles, GENERATED_PROJECTS_DIR };
