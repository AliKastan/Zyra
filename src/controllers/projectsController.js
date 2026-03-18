const path = require('path');
const fse = require('fs-extra');
const {
  listProjects: listProjectMeta,
  getProject,
  deleteProject: deleteProjectMeta,
  updateProject,
  restoreProjectFiles,
  hasStoredFiles,
  getStoredFiles,
  backfillProjectFiles,
} = require('../storage/projectStore');
const { getProjectFiles, listProjects } = require('../generators/projectGenerator');
const { now } = require('../utils/timestamps');

const GENERATED_DIR = path.resolve(__dirname, '../../generated-projects');

/**
 * GET /api/projects
 * Returns saved project metadata list, annotated with whether files are restorable.
 */
async function handleListProjects(req, res) {
  try {
    const projects = await listProjectMeta();
    // Annotate each project with filesystem availability (non-blocking)
    const annotated = await Promise.all(projects.map(async (p) => {
      const dirExists = await fse.pathExists(path.join(GENERATED_DIR, p.slug)).catch(() => false);
      const canRestore = dirExists ? false : await hasStoredFiles(p.slug).catch(() => false);
      return { ...p, _filesOnDisk: dirExists, _canRestore: canRestore };
    }));
    return res.json({ projects: annotated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/projects/:name
 */
async function handleGetProject(req, res) {
  const { name } = req.params;
  if (!/^[a-z0-9-]+$/.test(name)) return res.status(400).json({ error: 'Invalid project name' });
  const projectDir = path.join(GENERATED_DIR, name);
  const exists = await fse.pathExists(projectDir);
  if (!exists) return res.status(404).json({ error: 'Project not found', exists: false });
  return res.json({ exists: true, slug: name });
}

/**
 * GET /api/projects/:name/files
 * Returns the file tree for a project.
 * Auto-restores from backup if disk files are missing.
 */
async function handleGetProjectFiles(req, res) {
  const { name } = req.params;

  // Basic slug validation — no traversal
  if (!/^[a-z0-9-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid project name' });
  }

  try {
    let result = await getProjectFiles(name);

    if (!result) {
      // Disk files missing — try to restore from stored backup
      const restored = await restoreProjectFiles(name).catch(() => false);
      if (restored) result = await getProjectFiles(name).catch(() => null);
    }

    if (!result) return res.status(404).json({ error: `Project "${name}" not found` });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/projects/:name/stored-files
 * Returns files directly from the persistent backup store (no disk needed).
 * Used as a fallback when preview is unavailable but we still want to show code.
 */
async function handleGetStoredFiles(req, res) {
  const { name } = req.params;
  if (!/^[a-z0-9-]+$/.test(name)) return res.status(400).json({ error: 'Invalid project name' });

  try {
    const files = await getStoredFiles(name);
    if (!files) {
      // No backup — try to build one from disk now
      const backedUp = await backfillProjectFiles(name).catch(() => false);
      if (backedUp) {
        const retried = await getStoredFiles(name);
        if (retried) return res.json({ files: retried, _source: 'backfill' });
      }
      return res.status(404).json({ error: `No stored files found for "${name}"` });
    }
    return res.json({ files, _source: 'backup' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * DELETE /api/projects/:name
 */
async function handleDeleteProject(req, res) {
  const { name } = req.params;
  if (!/^[a-z0-9-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid project name' });
  }
  try {
    // Delete metadata and generated files
    await deleteProjectMeta(name);
    const projectDir = path.join(GENERATED_DIR, name);
    if (await fse.pathExists(projectDir)) await fse.remove(projectDir);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/projects/:name/open
 * Records that the user opened this project (updates last_opened_at).
 */
async function handleOpenProject(req, res) {
  const { name } = req.params;
  if (!/^[a-z0-9-]+$/.test(name)) return res.status(400).json({ error: 'Invalid project name' });
  try {
    await updateProject(name, { lastOpenedAt: now() });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/projects/:name/restore
 * Restores project files from persistent storage to generated-projects/.
 * Returns { success, restored, message }.
 */
async function handleRestoreProject(req, res) {
  const { name } = req.params;
  if (!/^[a-z0-9-]+$/.test(name)) return res.status(400).json({ error: 'Invalid project name' });
  try {
    // Check if already on disk
    const dirExists = await fse.pathExists(path.join(GENERATED_DIR, name));
    if (dirExists) return res.json({ success: true, restored: false, message: 'Files already on disk' });

    const canRestore = await hasStoredFiles(name);
    if (!canRestore) {
      return res.status(404).json({ success: false, restored: false, message: 'No saved file snapshot found for this project' });
    }

    const restored = await restoreProjectFiles(name);
    if (!restored) {
      return res.status(500).json({ success: false, restored: false, message: 'Restore failed — file snapshot may be corrupt' });
    }

    await updateProject(name, { lastRestoredAt: now() }).catch(() => {});
    return res.json({ success: true, restored: true, message: 'Project files restored from saved snapshot' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

module.exports = {
  handleListProjects, handleGetProject, handleGetProjectFiles, handleDeleteProject,
  handleOpenProject, handleRestoreProject, handleGetStoredFiles,
};
