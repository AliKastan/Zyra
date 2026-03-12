const { listProjects: listProjectMeta } = require('../storage/projectStore');
const { getProjectFiles, listProjects } = require('../generators/projectGenerator');

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

module.exports = { handleListProjects, handleGetProjectFiles };
