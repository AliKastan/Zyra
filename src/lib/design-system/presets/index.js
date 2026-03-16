'use strict';

/**
 * All 12 design preset definitions, keyed by DesignPresetName.
 */

const MINIMAL_SAAS         = require('./minimal-saas');
const PREMIUM_STARTUP      = require('./premium-startup');
const ENTERPRISE_DASHBOARD = require('./enterprise-dashboard');
const MOBILE_CONSUMER      = require('./mobile-consumer');
const MARKETPLACE_MODERN   = require('./marketplace-modern');
const BOOKING_SERVICE      = require('./booking-service');
const AI_NATIVE            = require('./ai-native');
const CREATOR_CONTENT      = require('./creator-content');
const FINANCE_ANALYTICS    = require('./finance-analytics');
const PLAYFUL_CONSUMER     = require('./playful-consumer');
const LUXURY_DARK          = require('./luxury-dark');
const LOCAL_BUSINESS       = require('./local-business');

/** @type {Record<import('../types').DesignPresetName, import('../types').DesignPresetDefinition>} */
const ALL_PRESETS = {
  MINIMAL_SAAS,
  PREMIUM_STARTUP,
  ENTERPRISE_DASHBOARD,
  MOBILE_CONSUMER,
  MARKETPLACE_MODERN,
  BOOKING_SERVICE,
  AI_NATIVE,
  CREATOR_CONTENT,
  FINANCE_ANALYTICS,
  PLAYFUL_CONSUMER,
  LUXURY_DARK,
  LOCAL_BUSINESS,
};

/** @type {import('../types').DesignPresetName[]} */
const PRESET_NAMES = Object.keys(ALL_PRESETS);

/**
 * Get a preset by name, with a safe fallback.
 * @param {string} name
 * @returns {import('../types').DesignPresetDefinition}
 */
function getPreset(name) {
  return ALL_PRESETS[name] || MINIMAL_SAAS;
}

module.exports = { ALL_PRESETS, PRESET_NAMES, getPreset };
