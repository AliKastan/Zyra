'use strict';

/**
 * Stage 2 — Full Product Specification.
 *
 * Uses Sonnet to produce a complete product spec: every page with its full layout,
 * every data model with all fields and types, every form with its validation rules,
 * and the complete navigation structure. This spec constrains the blueprint.
 */

const SYSTEM = `You are a product architect turning an intent analysis into a detailed product specification.
Return valid JSON only — no markdown fences, no explanation outside the JSON.

Produce a COMPLETE spec. The code generator will have no other reference for what to build — everything must be specified here. Vague specs produce vague apps.

Required JSON structure:
{
  "appName": "kebab-case slug, e.g. habit-tracker",
  "displayName": "Title-cased display name, e.g. Habit Tracker",
  "summary": "2-3 sentences describing the app, its value, and its primary user",
  "pages": [
    {
      "name": "page name",
      "path": "filename.html",
      "title": "browser <title> text",
      "description": "what this page does and who uses it",
      "layout": "describe the page layout: hero + cards, sidebar + main, header + grid, etc.",
      "sections": [
        {
          "name": "section name",
          "content": "what goes in this section — specific elements, text, and purpose",
          "interactive": false
        }
      ],
      "forms": [
        {
          "purpose": "what this form does",
          "fields": [
            { "name": "field name", "type": "text|email|password|number|textarea|select|checkbox|date", "label": "label text", "placeholder": "placeholder text", "required": true, "validation": "validation rule if any" }
          ],
          "submitLabel": "Submit button text"
        }
      ]
    }
  ],
  "navigation": {
    "type": "topnav|sidebar|tabs|bottomnav|none",
    "links": [{ "label": "link text", "href": "target.html", "active": false }]
  },
  "dataModels": [
    {
      "name": "ModelName",
      "description": "what this model represents",
      "fields": [
        { "name": "field", "type": "string|number|boolean|date|array|object", "description": "purpose", "required": true }
      ],
      "storageKey": "localStorage key name, e.g. ht_habits"
    }
  ],
  "stateDesign": {
    "description": "how app state is managed",
    "globalState": ["list of global state variables and their initial values"],
    "localStorage": ["list of keys and what they store"]
  },
  "envVars": ["required env var names if any"],
  "integrations": ["third-party services if any"]
}

Completeness check: every page must have sections defined, every interactive page must have forms or interactions described, every data model must have all fields. Do not use vague descriptions like "main content area" — be specific about what goes there.`;

/**
 * @param {import('../types').GenerationIntent} intent
 * @returns {{ system: string, user: string }}
 */
function buildProductPrompt(intent) {
  return {
    system: SYSTEM,
    user:   `Produce a complete product specification for this intent:\n\n${JSON.stringify(intent, null, 2)}`,
  };
}

module.exports = { buildProductPrompt };
