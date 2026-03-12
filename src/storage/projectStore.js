const path = require('path');
const fse = require('fs-extra');
const { now } = require('../utils/timestamps');

const PROJECTS_DIR = path.resolve(__dirname, '../../storage/projects');

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

module.exports = { saveProject, getProject, listProjects, updateProject };
