'use strict';

const { classifyFile } = require('./classifyFile');

/**
 * Detect which other files from allPaths this file depends on,
 * based on static analysis of its content.
 *
 * @param {string}   filePath
 * @param {string}   content
 * @param {string[]} allPaths
 * @returns {string[]}
 */
function detectDependencies(filePath, content, allPaths) {
  const base = filePath.split('/').pop() || filePath;
  const allPathsSet = new Set(allPaths);
  const deps = new Set();
  const str = content || '';

  if (base.endsWith('.html')) {
    // Extract href="X.css"
    const hrefRe = /href=["']([^"']+\.css)["']/g;
    let m;
    while ((m = hrefRe.exec(str)) !== null) {
      const ref = m[1].replace(/^\.\//, '');
      if (allPathsSet.has(ref)) deps.add(ref);
    }
    // Extract src="X.js"
    const srcRe = /src=["']([^"']+\.js)["']/g;
    while ((m = srcRe.exec(str)) !== null) {
      const ref = m[1].replace(/^\.\//, '');
      if (allPathsSet.has(ref)) deps.add(ref);
    }
  } else if (base.endsWith('.js')) {
    // Extract require("./X") or require('./X')
    const reqRe = /require\(["'](\.\/[^"']+)["']\)/g;
    let m;
    while ((m = reqRe.exec(str)) !== null) {
      const ref = normalizeJsRef(m[1], allPathsSet);
      if (ref) deps.add(ref);
    }
    // Extract import ... from "./X"
    const importRe = /from\s+["'](\.\/[^"']+)["']/g;
    while ((m = importRe.exec(str)) !== null) {
      const ref = normalizeJsRef(m[1], allPathsSet);
      if (ref) deps.add(ref);
    }
  } else if (base.endsWith('.css')) {
    // Extract @import "./X"
    const importRe = /@import\s+["'](\.\/[^"']+)["']/g;
    let m;
    while ((m = importRe.exec(str)) !== null) {
      const ref = m[1].replace(/^\.\//, '');
      if (allPathsSet.has(ref)) deps.add(ref);
    }
  }

  return [...deps];
}

/**
 * Normalize a JS relative import/require reference to a file path in allPaths.
 * Strips leading "./" and tries with and without ".js" extension.
 *
 * @param {string}   raw
 * @param {Set<string>} allPathsSet
 * @returns {string|null}
 */
function normalizeJsRef(raw, allPathsSet) {
  const stripped = raw.replace(/^\.\//, '');
  if (allPathsSet.has(stripped)) return stripped;
  const withJs = stripped.endsWith('.js') ? stripped : stripped + '.js';
  if (allPathsSet.has(withJs)) return withJs;
  // Also try without .js extension match
  if (allPathsSet.has(stripped.replace(/\.js$/, ''))) return stripped.replace(/\.js$/, '');
  return null;
}

/**
 * Sort order for file types — lower = earlier in dependency order.
 * @type {Record<string, number>}
 */
const TYPE_ORDER = {
  environment:   0,
  config:        1,
  schema:        2,
  documentation: 3,
  // CSS frontend before JS utility
  frontend:      4,
  utility:       5,
  integration:   6,
  backend:       7,
  api:           8,
  page:          9,
  middleware:    10,
};

/**
 * Sort a list of raw files into dependency order.
 * Config/env/docs first, pages (HTML) last.
 * Within a type, app.js/main.js sorts after other JS files.
 *
 * @param {Array<{path:string, content:string}>} files
 * @returns {Array<{path:string, content:string}>}
 */
function sortByDependencyOrder(files) {
  return [...files].sort((a, b) => {
    const { type: typeA } = classifyFile(a.path);
    const { type: typeB } = classifyFile(b.path);
    const orderA = TYPE_ORDER[typeA] ?? 11;
    const orderB = TYPE_ORDER[typeB] ?? 11;
    if (orderA !== orderB) return orderA - orderB;

    // Within frontend type: CSS before JS entry points
    if (typeA === 'frontend' && typeB === 'frontend') {
      const baseA = a.path.split('/').pop() || '';
      const baseB = b.path.split('/').pop() || '';
      const isEntryA = baseA === 'app.js' || baseA === 'main.js';
      const isEntryB = baseB === 'app.js' || baseB === 'main.js';
      if (isEntryA && !isEntryB) return 1;
      if (!isEntryA && isEntryB) return -1;
    }

    return a.path.localeCompare(b.path);
  });
}

module.exports = { detectDependencies, sortByDependencyOrder };
