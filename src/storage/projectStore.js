const path = require('path');
const fse = require('fs-extra');
const { now } = require('../utils/timestamps');
const logger = require('../utils/logger');

const PROJECTS_DIR   = path.resolve(__dirname, '../../storage/projects');
const FILES_DIR      = path.resolve(__dirname, '../../storage/project-files');
const GENERATED_DIR  = path.resolve(__dirname, '../../generated-projects');

async function ensureProjectsDir() {
  await fse.ensureDir(PROJECTS_DIR);
}

/**
 * Saves project metadata.
 */
async function saveProject(slug, metadata) {
  await ensureProjectsDir();
  const record = { slug, createdAt: now(), ...metadata };
  await fse.writeJson(path.join(PROJECTS_DIR, `${slug}.json`), record, { spaces: 2 });
  return record;
}

/**
 * Gets project metadata by slug.
 */
async function getProject(slug) {
  await ensureProjectsDir();
  const filePath = path.join(PROJECTS_DIR, `${slug}.json`);
  if (!(await fse.pathExists(filePath))) return null;
  return fse.readJson(filePath);
}

/**
 * Lists all saved project metadata records.
 */
async function listProjects() {
  await ensureProjectsDir();
  const files = await fse.readdir(PROJECTS_DIR);
  const projects = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const p = await fse.readJson(path.join(PROJECTS_DIR, file));
      projects.push(p);
    } catch (_) {}
  }
  return projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Updates an existing project's metadata (e.g. after an edit).
 * Merges the given updates into the existing record.
 */
async function updateProject(slug, updates) {
  await ensureProjectsDir();
  const filePath = path.join(PROJECTS_DIR, `${slug}.json`);
  const existing = (await fse.pathExists(filePath)) ? await fse.readJson(filePath) : { slug };
  const record = { ...existing, ...updates, updatedAt: now() };
  await fse.writeJson(filePath, record, { spaces: 2 });
  return record;
}

/**
 * Deletes project metadata file.
 */
async function deleteProject(slug) {
  await ensureProjectsDir();
  const filePath = path.join(PROJECTS_DIR, `${slug}.json`);
  if (await fse.pathExists(filePath)) await fse.remove(filePath);
}

/**
 * Persists all generated file contents for a project so they can be restored later.
 * Stored separately from metadata to keep project JSON files small.
 * @param {string} slug
 * @param {Array<{path:string, content:string}>} files
 */
async function storeProjectFiles(slug, files) {
  await fse.ensureDir(FILES_DIR);
  const record = { slug, storedAt: now(), files };
  // Write compact JSON — no spaces — to minimise file size
  await fse.writeFile(path.join(FILES_DIR, `${slug}.json`), JSON.stringify(record), 'utf8');
  logger.debug(`projectStore: stored ${files.length} files for "${slug}"`);
}

/**
 * Returns true if stored file content exists for this slug.
 */
async function hasStoredFiles(slug) {
  return fse.pathExists(path.join(FILES_DIR, `${slug}.json`));
}

/**
 * Restores a project's files from persistent storage back to generated-projects/.
 * Returns true on success, false if no stored files found.
 * @param {string} slug
 */
async function restoreProjectFiles(slug) {
  const filesPath = path.join(FILES_DIR, `${slug}.json`);
  if (!(await fse.pathExists(filesPath))) return false;

  let record;
  try {
    record = JSON.parse(await fse.readFile(filesPath, 'utf8'));
  } catch (e) {
    logger.warn(`projectStore: corrupt file record for "${slug}": ${e.message}`);
    return false;
  }

  const files = record.files;
  if (!Array.isArray(files) || files.length === 0) return false;

  const projectDir = path.join(GENERATED_DIR, slug);
  await fse.remove(projectDir);
  await fse.ensureDir(projectDir);

  let written = 0;
  for (const file of files) {
    if (!file.path || typeof file.content !== 'string') continue;
    // Guard against path traversal
    const fullPath = path.resolve(projectDir, file.path);
    if (!fullPath.startsWith(projectDir + path.sep) && fullPath !== projectDir) continue;
    await fse.ensureDir(path.dirname(fullPath));
    await fse.writeFile(fullPath, file.content, 'utf8');
    written++;
  }

  logger.info(`projectStore: restored ${written}/${files.length} files for "${slug}"`);
  return written > 0;
}

/**
 * Returns the stored files array directly from backup JSON.
 * Does NOT write to disk — for inline code view when disk files are missing.
 * Returns null if no backup exists.
 * @param {string} slug
 * @returns {Promise<Array<{path:string, content:string}>|null>}
 */
async function getStoredFiles(slug) {
  const filesPath = path.join(FILES_DIR, `${slug}.json`);
  if (!(await fse.pathExists(filesPath))) return null;
  try {
    const record = JSON.parse(await fse.readFile(filesPath, 'utf8'));
    return Array.isArray(record.files) && record.files.length > 0 ? record.files : null;
  } catch (e) {
    logger.warn(`projectStore: getStoredFiles failed for "${slug}": ${e.message}`);
    return null;
  }
}

/**
 * Reads all file contents from generated-projects/{slug}/ and stores them
 * to project-files/{slug}.json as a durable backup.
 * Safe to call at any time; silently no-ops if dir doesn't exist.
 * @param {string} slug
 * @returns {Promise<boolean>} true if backup was written
 */
async function backfillProjectFiles(slug) {
  const projectDir = path.join(GENERATED_DIR, slug);
  if (!(await fse.pathExists(projectDir))) return false;

  const files = [];
  async function walk(dir) {
    const entries = await fse.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else {
        const relPath = path.relative(projectDir, full).replace(/\\/g, '/');
        // Skip binary files and large files
        const stat = await fse.stat(full);
        if (stat.size > 500_000) continue;
        try {
          const content = await fse.readFile(full, 'utf8');
          files.push({ path: relPath, content });
        } catch (_) { /* skip unreadable */ }
      }
    }
  }

  try {
    await walk(projectDir);
    if (files.length === 0) return false;
    await storeProjectFiles(slug, files);
    return true;
  } catch (e) {
    logger.warn(`projectStore: backfillProjectFiles failed for "${slug}": ${e.message}`);
    return false;
  }
}

module.exports = {
  saveProject, getProject, listProjects, updateProject, deleteProject,
  storeProjectFiles, hasStoredFiles, restoreProjectFiles,
  getStoredFiles, backfillProjectFiles,
};
