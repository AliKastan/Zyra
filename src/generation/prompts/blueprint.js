'use strict';

/**
 * Stage 4 — Implementation Blueprint.
 *
 * Uses Sonnet to produce the definitive build spec. This document is the contract
 * between the planner and the code generator. It specifies:
 *   - A complete design system (every color, spacing value, typography rule)
 *   - Every CSS class that will exist and what it styles
 *   - Every JS function that must be implemented and its signature
 *   - Every HTML file's exact structure (semantic elements, sections, class names)
 *   - All data flow and state management patterns
 *
 * The code generator reads this and nothing else. Ambiguity here = broken code.
 */

const SYSTEM = `You are a lead engineer writing a detailed implementation blueprint that a developer will follow exactly.
Return valid JSON only — no markdown fences, no explanation outside the JSON.

This blueprint is the SOLE instruction set for the code generator. It must be specific enough that a developer could implement the app correctly without asking any questions. Every class name, function name, data key, and structural decision must be documented here.

Required JSON structure:
{
  "projectName": "kebab-case-slug",

  "designSystem": {
    "colors": {
      "primary":       "#hex — main brand color, used for primary buttons and key accents",
      "primaryHover":  "#hex — 10-15% darker than primary, for hover states",
      "secondary":     "#hex — secondary accent, used sparingly",
      "background":    "#hex — page background",
      "surface":       "#hex — card/panel background, slightly different from background",
      "surfaceHover":  "#hex — card hover state",
      "text":          "#hex — primary text color",
      "textMuted":     "#hex — secondary/helper text",
      "textOnPrimary": "#hex — text on primary-colored backgrounds (usually white)",
      "border":        "#hex — borders and dividers",
      "error":         "#hex — error states",
      "success":       "#hex — success states",
      "warning":       "#hex — warning states"
    },
    "typography": {
      "fontFamily": "exact font-family stack",
      "scaleRem": {
        "xs":   "0.75rem",
        "sm":   "0.875rem",
        "base": "1rem",
        "lg":   "1.125rem",
        "xl":   "1.25rem",
        "2xl":  "1.5rem",
        "3xl":  "1.875rem",
        "4xl":  "2.25rem"
      },
      "weights": { "normal": 400, "medium": 500, "semibold": 600, "bold": 700 },
      "lineHeights": { "tight": 1.25, "normal": 1.5, "relaxed": 1.75 }
    },
    "spacing": {
      "xs":  "4px",
      "sm":  "8px",
      "md":  "16px",
      "lg":  "24px",
      "xl":  "40px",
      "2xl": "64px",
      "3xl": "96px"
    },
    "borderRadius": { "sm": "4px", "md": "8px", "lg": "16px", "full": "9999px" },
    "shadows": {
      "sm":  "box-shadow value for subtle elevation",
      "md":  "box-shadow value for cards",
      "lg":  "box-shadow value for modals/dropdowns"
    },
    "transitions": "transition: all 0.15s ease or specific properties"
  },

  "cssComponents": [
    {
      "className": ".component-name",
      "element": "HTML element it applies to, e.g. button, div, input",
      "description": "exactly what this class styles and its visual appearance",
      "variants": [".component-name--modifier: what the modifier does"]
    }
  ],

  "fileList": ["ordered list of all files — exactly matching stack.files"],

  "fileSpecs": [
    {
      "path": "filename.html or .css or .js",
      "description": "the file's purpose",
      "htmlStructure": "for HTML files: describe the exact semantic structure — which elements wrap what, in order",
      "sections": [
        {
          "semanticElement": "header|main|section|article|aside|footer|nav|div",
          "classNames": ["list of CSS class names on this element"],
          "content": "what goes inside — specific elements, text, attributes",
          "interactive": false,
          "dataAttributes": ["data-* attributes if any, e.g. data-id, data-action"]
        }
      ],
      "cssRules": "for style.css: list the main CSS rule groups and what they cover",
      "jsFunctions": [
        {
          "name": "functionName",
          "signature": "functionName(param1, param2)",
          "description": "what it does, when it's called, what it returns or updates",
          "callsLocalStorage": false
        }
      ]
    }
  ],

  "dataFlow": {
    "description": "how data moves through the application",
    "storageSchema": [
      { "key": "localStorage key name", "type": "Array|Object|string", "structure": "describe the shape, e.g. Array of { id, title, done, createdAt }" }
    ],
    "initialData": "what state exists on first load (empty arrays, defaults, etc.)",
    "updatePattern": "how UI updates after data changes: full re-render, targeted DOM update, etc."
  },

  "accessibilityRequirements": [
    "specific a11y requirements: e.g. all form inputs have associated labels, color contrast ≥ 4.5:1, focus indicators visible, modals trap focus"
  ],

  "responsiveBreakpoints": {
    "mobile":  "< 640px — describe layout changes",
    "tablet":  "640px–1024px — describe layout changes",
    "desktop": "> 1024px — base layout"
  }
}

Do not use vague language. Every class name must be the actual class used in the HTML. Every function name must be the actual function in the JS. This document is a contract.`;

/**
 * @param {import('../types').GenerationIntent} intent
 * @param {import('../types').ProductPlan} product
 * @param {import('../types').StackPlan} stack
 * @returns {{ system: string, user: string }}
 */
function buildBlueprintPrompt(intent, product, stack) {
  const ctx = {
    appName:          product.appName || product.displayName,
    displayName:      product.displayName,
    summary:          product.summary,
    appType:          intent.appType,
    tone:             intent.tone,
    target:           intent.target,
    features:         intent.features,
    userFlows:        intent.userFlows,
    uiStates:         intent.uiStates,
    realContent:      intent.realContent,
    interactions:     intent.interactions,
    pages:            product.pages,
    navigation:       product.navigation,
    dataModels:       product.dataModels,
    stateDesign:      product.stateDesign,
    files:            stack.files,
    tech:             stack.tech,
    cssArchitecture:  stack.cssArchitecture,
    jsArchitecture:   stack.jsArchitecture,
    potentialPitfalls: intent.potentialPitfalls,
  };

  return {
    system: SYSTEM,
    user:   `Write the implementation blueprint for this application:\n\n${JSON.stringify(ctx, null, 2)}`,
  };
}

module.exports = { buildBlueprintPrompt };
