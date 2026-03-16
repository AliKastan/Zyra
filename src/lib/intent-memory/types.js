'use strict';

/**
 * User Intent Memory — Type Definitions
 *
 * Tracks the evolving product vision across multiple prompts within a session.
 * Each prompt updates the memory incrementally; downstream systems read it
 * as the authoritative source of what the user is building.
 *
 * @module intent-memory/types
 */

/**
 * Classification of what a new user prompt is doing to the intent.
 * @typedef {
 *   'NEW_PROJECT' |
 *   'ADD_FEATURE' |
 *   'MODIFY_FEATURE' |
 *   'REMOVE_FEATURE' |
 *   'CHANGE_STYLE' |
 *   'CHANGE_PLATFORM' |
 *   'CHANGE_INTEGRATION' |
 *   'CLARIFICATION'
 * } IntentChangeType
 */

/**
 * A single entry in the intent history log.
 * @typedef {Object} IntentHistoryEntry
 * @property {string}           timestamp   - ISO timestamp of the change
 * @property {string}           prompt      - The raw user prompt that triggered this change
 * @property {IntentChangeType} changeType  - Classified change type
 * @property {string}           description - Human-readable summary of what changed
 * @property {Object}           changes     - Diff: { added, updated, removed }
 */

/**
 * The extracted signals from a single prompt, before merging.
 * @typedef {Object} IntentUpdate
 * @property {IntentChangeType} changeType
 * @property {string[]}         [features]        - Feature signals detected
 * @property {string[]}         [integrations]    - Integration signals detected
 * @property {string[]}         [platforms]       - Platform signals detected
 * @property {string[]}         [roles]           - Role signals detected
 * @property {string[]}         [entities]        - Entity signals detected
 * @property {string[]}         [removeFeatures]  - Features to remove
 * @property {string}           [designIntent]    - Design tone signal
 * @property {string}           [appGoal]         - New app goal if NEW_PROJECT
 * @property {string}           [appType]         - App type hint
 * @property {boolean}          [authRequired]    - Auth signal
 * @property {boolean}          [billingRequired] - Billing signal
 * @property {boolean}          [adminRequired]   - Admin signal
 * @property {boolean}          [mobileRequired]  - Mobile signal
 * @property {string}           description       - Human-readable description of the update
 */

/**
 * The persisted intent memory for a session.
 * @typedef {Object} UserIntentMemory
 * @property {string}               sessionId        - Identifies the session
 * @property {string}               appGoal          - Core product goal ("barber booking platform")
 * @property {string}               appType          - App type hint ("booking", "saas", "ecommerce"...)
 * @property {string[]}             coreFeatures     - All active features
 * @property {string[]}             platforms        - Deployment targets ("web", "mobile")
 * @property {string[]}             targetUsers      - End-user roles ("customers", "barbers")
 * @property {string[]}             roles            - System roles ("customer", "admin", "seller")
 * @property {string[]}             integrations     - Active integrations ("Stripe", "OpenAI")
 * @property {string[]}             databaseEntities - Implied entities ("User", "Booking")
 * @property {string}               designIntent     - Design tone ("dark", "minimal", "premium")
 * @property {boolean}              adminRequired    - Admin panel needed
 * @property {boolean}              billingRequired  - Billing/payments needed
 * @property {boolean}              authRequired     - Authentication needed
 * @property {boolean}              mobileRequired   - Mobile platform needed
 * @property {number}               promptCount      - Number of prompts processed
 * @property {string}               createdAt        - ISO timestamp of session start
 * @property {string}               lastUpdated      - ISO timestamp of last update
 * @property {string}               lastPromptUpdate - The last raw prompt that mutated memory
 * @property {IntentHistoryEntry[]} intentHistory    - Chronological change log
 */

/**
 * Result returned by updateIntentMemory().
 * @typedef {Object} IntentMemoryResult
 * @property {UserIntentMemory} intentMemory  - The updated memory object
 * @property {IntentUpdate}     update        - The extracted update from the prompt
 * @property {boolean}          wasReset      - True if the session was reset (NEW_PROJECT)
 */

module.exports = {};
