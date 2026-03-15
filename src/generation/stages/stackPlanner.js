'use strict';

const { callClaude, SONNET_MODEL } = require('../../providers/anthropicProvider');
const { buildStackPrompt }          = require('../prompts/stack');
const { safeJsonParse }             = require('../../utils/safeJsonParse');
const logger                        = require('../../utils/logger');

/**
 * @param {import('../types').ProductPlan} product
 * @returns {import('../types').StackPlan}
 */
function _defaultStack(product) {
  const pageFiles = (product.pages || []).map(p => p.path || 'index.html');
  const files     = [...new Set([...pageFiles, 'style.css', 'app.js'])];
  return {
    tech: {
      frontend: 'HTML5 + CSS3 + ES6 JavaScript',
      backend:  'none',
      storage:  'localStorage',
      auth:     'none',
      styling:  'CSS custom properties + BEM-like class naming',
    },
    files,
    entryPoint: files.find(f => f.endsWith('.html')) || 'index.html',
    cssArchitecture: {
      customProperties: ['--color-primary', '--color-background', '--color-text', '--space-md', '--radius-md'],
      components:       ['.btn', '.card', '.form-field', '.nav'],
      namingConvention: 'BEM-inspired: .component and .component--modifier',
    },
    jsArchitecture: {
      pattern:       'module pattern with DOMContentLoaded',
      modules:       [{ name: 'app', file: 'app.js', responsibility: 'all application logic' }],
      dataLayer:     'localStorage with JSON parse/stringify',
      renderPattern: 'innerHTML template literals',
    },
    rationale: 'Plain HTML/CSS/JS for zero build-step deployability.',
  };
}

/**
 * Stage 3 — Architecture + File Plan.
 *
 * Uses Sonnet to select the tech stack with rationale, define the complete file
 * manifest, and specify the CSS and JS architecture (naming conventions, module
 * structure, state patterns). This document constrains the blueprint generator.
 *
 * Token budget: 1500 — architecture must be explicit, not implied.
 * File cap: removed — quality mode may need more files to structure code properly.
 *
 * @param {import('../types').GenerationIntent} intent
 * @param {import('../types').ProductPlan} product
 * @param {object} cost - cost tracker instance
 * @returns {Promise<import('../types').StackPlan>}
 */
async function planStack(intent, product, cost) {
  const { system, user } = buildStackPrompt(intent, product);

  try {
    const raw = await callClaude(system, user, { model: SONNET_MODEL, maxTokens: 1500 });

    if (cost) cost.record('stack', system, user, raw, { model: SONNET_MODEL });

    const { success, data: parsed } = safeJsonParse(raw);
    if (!success || !parsed || !Array.isArray(parsed.files) || parsed.files.length === 0) {
      logger.warn('stackPlanner: invalid JSON shape, using fallback');
      return _defaultStack(product);
    }

    const stack = {
      tech:            parsed.tech            || _defaultStack(product).tech,
      files:           parsed.files,
      entryPoint:      parsed.entryPoint      || parsed.files.find(f => f.endsWith('.html')) || 'index.html',
      cssArchitecture: parsed.cssArchitecture || _defaultStack(product).cssArchitecture,
      jsArchitecture:  parsed.jsArchitecture  || _defaultStack(product).jsArchitecture,
      rationale:       parsed.rationale       || '',
    };

    logger.info(`stackPlanner: files=${stack.files.length} storage="${stack.tech.storage}" auth="${stack.tech.auth}"`);

    return stack;
  } catch (err) {
    logger.warn(`stackPlanner: failed (${err.message}), using fallback`);
    return _defaultStack(product);
  }
}

module.exports = { planStack };
