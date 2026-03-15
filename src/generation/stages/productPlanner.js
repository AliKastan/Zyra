'use strict';

const { callClaude, SONNET_MODEL } = require('../../providers/anthropicProvider');
const { buildProductPrompt }        = require('../prompts/product');
const { safeJsonParse }             = require('../../utils/safeJsonParse');
const logger                        = require('../../utils/logger');

/**
 * @param {import('../types').GenerationIntent} intent
 * @returns {import('../types').ProductPlan}
 */
function _defaultProduct(intent) {
  const appName = intent.realContent?.appName || (intent.appType !== 'generic' ? intent.appType : 'my-app');
  return {
    appName:      appName.toLowerCase().replace(/\s+/g, '-'),
    displayName:  appName,
    summary:      intent.category || 'Web application',
    pages:        [{ name: 'Home', path: 'index.html', title: appName, description: 'Main page', layout: 'single column', sections: [], forms: [] }],
    navigation:   { type: 'none', links: [] },
    dataModels:   [],
    stateDesign:  { description: 'Simple localStorage-backed state', globalState: [], localStorage: [] },
    envVars:      [],
    integrations: [],
  };
}

/**
 * Stage 2 — Full Product Specification.
 *
 * Uses Sonnet with a generous token budget to produce a complete product spec:
 * every page with layout and sections, every form with fields and validation,
 * every data model with all fields and types, navigation structure, and state design.
 *
 * Token budget: 2500 — a thorough spec is the foundation of correct code.
 *
 * @param {import('../types').GenerationIntent} intent
 * @param {object} cost - cost tracker instance
 * @returns {Promise<import('../types').ProductPlan>}
 */
async function planProduct(intent, cost) {
  const { system, user } = buildProductPrompt(intent);

  try {
    const raw = await callClaude(system, user, { model: SONNET_MODEL, maxTokens: 2500 });

    if (cost) cost.record('product', system, user, raw, { model: SONNET_MODEL });

    const { success, data: parsed } = safeJsonParse(raw);
    if (!success || !parsed || !parsed.appName) {
      logger.warn('productPlanner: invalid JSON shape, using fallback');
      return _defaultProduct(intent);
    }

    const defaults = _defaultProduct(intent);

    const product = {
      appName:      parsed.appName        || defaults.appName,
      displayName:  parsed.displayName    || parsed.appName,
      summary:      parsed.summary        || intent.category,
      pages:        Array.isArray(parsed.pages)        && parsed.pages.length        ? parsed.pages        : defaults.pages,
      navigation:   parsed.navigation     || defaults.navigation,
      dataModels:   Array.isArray(parsed.dataModels)   ? parsed.dataModels   : [],
      stateDesign:  parsed.stateDesign    || defaults.stateDesign,
      envVars:      Array.isArray(parsed.envVars)      ? parsed.envVars      : [],
      integrations: Array.isArray(parsed.integrations) ? parsed.integrations : [],
    };

    logger.info(`productPlanner: appName=${product.appName} pages=${product.pages.length} models=${product.dataModels.length}`);

    return product;
  } catch (err) {
    logger.warn(`productPlanner: failed (${err.message}), using fallback`);
    return _defaultProduct(intent);
  }
}

module.exports = { planProduct };
