const path = require('path');
const fse = require('fs-extra');
const { listProjects: listProjectMeta, deleteProject: deleteProjectMeta } = require('../storage/projectStore');
const { getProjectFiles, listProjects } = require('../generators/projectGenerator');

const GENERATED_DIR = path.resolve(__dirname, '../../generated-projects');

/**
 * GET /api/projects
 */
async function handleListProjects(req, res) {
  try {
    const projects = await listProjectMeta();
    return res.json({ projects });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/projects/:name/files
 */
async function handleGetProjectFiles(req, res) {
  const { name } = req.params;

  // Basic slug validation — no traversal
  if (!/^[a-z0-9-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid project name' });
  }

  try {
    const result = await getProjectFiles(name);
    if (!result) return res.status(404).json({ error: `Project "${name}" not found` });
    return res.json(result);
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

module.exports = { handleListProjects, handleGetProjectFiles, handleDeleteProject };
