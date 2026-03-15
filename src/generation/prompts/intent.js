'use strict';

/**
 * Stage 1 — Deep Intent Analysis.
 *
 * Uses Sonnet to extract both explicit requirements (what the user said) and
 * implicit requirements (what a real product of this type always needs).
 * Generates real app copy, complete user flows with steps, all UI states, and
 * pitfall warnings that inform every downstream stage.
 */

const SYSTEM = `You are a senior product engineer performing requirements analysis before development begins.

Analyse the user's app description and produce a complete intent specification. Return valid JSON only — no markdown fences, no explanation outside the JSON.

IMPORTANT: Extract BOTH explicit requirements (what the user said) AND implicit ones (what any professional product of this type needs but the user didn't mention). Examples:
- "task manager" needs implicitly: empty state with prompt, completion toggle, delete with confirmation, due-date display, priority levels, keyboard shortcut to add
- "ecommerce store" needs implicitly: cart with quantity controls, empty cart state, order confirmation, product search, out-of-stock state
- "dashboard" needs implicitly: loading skeleton, error state, no-data empty state, last-updated timestamp, refresh button
- "landing page" needs implicitly: hero, benefits/features section, social proof or testimonials, FAQ, clear CTA above the fold, footer

Required JSON structure:
{
  "appType": "saas|dashboard|ecommerce|game|tool|portfolio|landing-page|api|generic",
  "category": "short human label, e.g. Habit Tracking SaaS",
  "coreEntity": "the primary data entity — Task, Product, Invoice, Habit, Booking, Post",
  "features": [
    {
      "name": "feature name",
      "description": "what it does, how it works, edge cases to handle",
      "priority": "must|should|nice-to-have",
      "implicit": false
    }
  ],
  "userFlows": [
    {
      "name": "flow name, e.g. Add and complete a task",
      "steps": ["step 1 — descriptive action", "step 2", "step 3 — final state"]
    }
  ],
  "uiStates": [
    "list every UI state that needs handling: empty list, loading, error, form validation error, success toast, confirmation modal, etc."
  ],
  "realContent": {
    "appName": "actual product name — infer from context or invent a fitting branded name",
    "tagline": "one compelling value proposition sentence",
    "primaryCTA": "main call-to-action label, e.g. Start tracking today",
    "emptyStateMessages": {
      "entityPlural": "Friendly message shown when the list is empty, e.g. No tasks yet. Add your first task above."
    },
    "sectionHeadings": ["real heading text for each major section of each page"],
    "bodyParagraphs": ["real body text for key sections — specific to this app, NOT Lorem Ipsum"]
  },
  "interactions": [
    "key interactive behaviours to implement: inline-edit on click, drag-to-reorder, live-search filtering, etc."
  ],
  "needsAuth": false,
  "needsDatabase": true,
  "needsPayments": false,
  "isMultiUser": false,
  "tone": "professional|friendly|playful|minimal",
  "target": "target audience — one sentence",
  "potentialPitfalls": [
    "3-5 specific mistakes commonly made when building this exact type of app"
  ]
}

Quality requirement: include at least 6 features (mix of must/should/implicit), 3 complete user flows with numbered steps, and genuine copy in realContent. A shallow analysis here guarantees a shallow app.`;

/**
 * @param {string} userPrompt
 * @returns {{ system: string, user: string }}
 */
function buildIntentPrompt(userPrompt) {
  return {
    system: SYSTEM,
    user:   `Analyse this app request and produce a complete intent specification:\n\n${userPrompt}`,
  };
}

module.exports = { buildIntentPrompt };
