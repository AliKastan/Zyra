'use strict';

/**
 * @typedef {'config'|'frontend'|'backend'|'api'|'schema'|'integration'|'utility'|'page'|'middleware'|'environment'|'documentation'} FileType
 */

/**
 * @typedef {'create'|'update'} FileOperation
 */

/**
 * @typedef {Object} FileArtifact
 * @property {string}        path
 * @property {FileType}      type
 * @property {string}        description
 * @property {string}        content
 * @property {FileOperation} operation      - 'create' for new files, 'update' for replacements
 * @property {string[]}      dependencies   - paths of files this file depends on
 * @property {number}        sizeBytes
 * @property {boolean}       valid
 */

/**
 * @typedef {Object} FileValidationIssue
 * @property {'broken_reference'|'empty_file'|'invalid_path'|'duplicate'|'stub_content'} type
 * @property {string}            path
 * @property {string}            message
 * @property {'error'|'warning'} severity
 */

/**
 * @typedef {Object} GeneratedProjectFiles
 * @property {FileArtifact[]}              artifacts
 * @property {FileValidationIssue[]}       issues
 * @property {number}                      totalFiles
 * @property {number}                      totalBytes
 * @property {Partial<Record<FileType,number>>} filesByType
 * @property {boolean}                     valid
 */

/**
 * @typedef {Object} FileGenerationContext
 * @property {import('../../generation/types').AppBlueprint}          blueprint
 * @property {import('../../generation/types').GenerationIntent}      intent
 * @property {import('../complexity/types').AppComplexityReport|null} complexityReport
 * @property {Set<string>}                                            existingPaths  - paths from prior passes
 */

/**
 * @typedef {Object} ExpectedFileEntry
 * @property {string}   path
 * @property {FileType} type
 * @property {string}   description
 * @property {boolean}  required
 */

/**
 * @typedef {Object} FileMap
 * @property {ExpectedFileEntry[]} files
 * @property {string}              projectName
 * @property {string}              tier
 */

module.exports = {};
