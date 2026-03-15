'use strict';

const { classifyFile }       = require('./classifyFile');
const { detectDependencies } = require('./resolveFileDependencies');

/**
 * Enrich raw generated files into structured FileArtifacts.
 *
 * @param {Array<{path:string, content:string}>} rawFiles
 * @param {import('./types').FileGenerationContext} [context]
 * @returns {import('./types').FileArtifact[]}
 */
function buildFileArtifacts(rawFiles, context) {
  const allPaths      = rawFiles.map(f => f.path);
  const existingPaths = context?.existingPaths || new Set();

  return rawFiles.map(({ path, content }) => {
    const { type, description } = classifyFile(path);
    const dependencies = detectDependencies(path, content, allPaths);
    const operation    = existingPaths.has(path) ? 'update' : 'create';
    const sizeBytes    = Buffer.byteLength(content || '', 'utf8');
    const valid        = (content || '').trim().length >= 20;

    return { path, type, description, content, operation, dependencies, sizeBytes, valid };
  });
}

module.exports = { buildFileArtifacts };
