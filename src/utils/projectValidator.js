const path = require('path');
const fse = require('fs-extra');

const GENERATED_DIR = path.resolve(__dirname, '../../generated-projects');

// Files/directories to skip during deployment
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cache']);
const SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db', '.env', '.env.local', '.env.production']);
const MAX_DEPLOY_FILES = 500;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_TOTAL_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB total

/**
 * Validates that a project is ready for deployment.
 * Returns { valid, errors, warnings, projectDir, files }
 */
async function validateProjectForDeploy(slug) {
  const projectDir = path.resolve(GENERATED_DIR, slug);

  // Ensure the project directory exists
  if (!(await fse.pathExists(projectDir))) {
    return {
      valid: false,
      errors: ['Project directory not found. Try regenerating this project first.'],
      projectDir,
      files: [],
    };
  }

  const files = await listDeployableFiles(projectDir);

  if (files.length === 0) {
    return {
      valid: false,
      errors: ['Project has no files. Try regenerating this project first.'],
      projectDir,
      files: [],
    };
  }

  const errors = [];
  const warnings = [];

  // Check file count
  if (files.length > MAX_DEPLOY_FILES) {
    errors.push(`Project has too many files (${files.length}). Maximum allowed is ${MAX_DEPLOY_FILES}.`);
  }

  // Check for a valid entry point
  const relPaths = files.map(f => f.rel);
  const hasIndexHtml = relPaths.includes('index.html');
  const hasIndexJs   = relPaths.includes('index.js');
  const hasPackageJson = relPaths.includes('package.json');

  if (!hasIndexHtml && !hasIndexJs) {
    errors.push('No entry point found (index.html or index.js). The project may not render correctly.');
  }

  // Check total size
  let totalSize = 0;
  for (const f of files) {
    const stat = await fse.stat(f.abs);
    if (stat.size > MAX_FILE_SIZE_BYTES) {
      warnings.push(`File "${f.rel}" is very large (${(stat.size / 1024 / 1024).toFixed(1)} MB) and may slow deployment.`);
    }
    totalSize += stat.size;
  }
  if (totalSize > MAX_TOTAL_SIZE_BYTES) {
    errors.push(`Project is too large to deploy (${(totalSize / 1024 / 1024).toFixed(1)} MB). Maximum is 100 MB.`);
  }

  // Warn about Node.js apps (limited Vercel support without config)
  if (hasPackageJson && !hasIndexHtml) {
    const pkg = await fse.readJson(path.join(projectDir, 'package.json')).catch(() => ({}));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.express || deps.fastify || deps.koa) {
      warnings.push('Node.js server apps need a vercel.json configuration for full Vercel support. A basic one will be generated automatically.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    projectDir,
    files,
  };
}

/**
 * Recursively collects all deployable files under a directory.
 * Returns an array of { abs, rel } objects.
 */
async function listDeployableFiles(dir, baseDir = dir) {
  const entries = await fse.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (SKIP_FILES.has(entry.name)) continue;

    const absPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, absPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const sub = await listDeployableFiles(absPath, baseDir);
      files.push(...sub);
    } else {
      files.push({ abs: absPath, rel: relPath });
    }
  }

  return files;
}

module.exports = { validateProjectForDeploy, listDeployableFiles };
