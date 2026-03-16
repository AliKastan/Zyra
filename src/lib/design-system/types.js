'use strict';

/**
 * JSDoc type definitions for the Design System Selector + Theme Preset Engine.
 *
 * Stage 4.5 of the Zyra pipeline — runs after blueprint generation and before
 * multi-pass code generation. Selects a design preset and enriches the blueprint
 * with production-grade design tokens and component style rules.
 */

// ── Enumerations ───────────────────────────────────────────────────────────────

/**
 * @typedef {'MINIMAL_SAAS'|'PREMIUM_STARTUP'|'ENTERPRISE_DASHBOARD'|'MOBILE_CONSUMER'|'MARKETPLACE_MODERN'|'BOOKING_SERVICE'|'AI_NATIVE'|'CREATOR_CONTENT'|'FINANCE_ANALYTICS'|'PLAYFUL_CONSUMER'|'LUXURY_DARK'|'LOCAL_BUSINESS'} DesignPresetName
 */

/**
 * @typedef {'light'|'dark'|'light_dark_adaptive'} ThemeMode
 */

/**
 * @typedef {'compact'|'balanced'|'spacious'} DensityMode
 */

/**
 * @typedef {'modern_clean'|'modern_productive'|'premium_polished'|'enterprise_structured'|'mobile_native'|'marketplace_trustworthy'|'scheduling_clear'|'ai_focused'|'creative_expressive'|'analytical_precise'|'playful_friendly'|'luxury_refined'|'local_approachable'} VisualTone
 */

// ── Token shapes ───────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ColorTokens
 * Compatible with the existing blueprint.designSystem.colors schema.
 * @property {string} primary
 * @property {string} primaryHover
 * @property {string} secondary
 * @property {string} accent
 * @property {string} background
 * @property {string} surface
 * @property {string} surfaceHover
 * @property {string} text
 * @property {string} textMuted
 * @property {string} textOnPrimary
 * @property {string} border
 * @property {string} error
 * @property {string} success
 * @property {string} warning
 */

/**
 * @typedef {Object} TypographyTokens
 * @property {string} fontFamily
 * @property {string} [monoFamily]
 * @property {Object} scaleRem   - { xs, sm, base, lg, xl, 2xl, 3xl, 4xl, 5xl }
 * @property {Object} weights    - { normal, medium, semibold, bold }
 * @property {Object} lineHeights- { tight, normal, relaxed }
 * @property {string} [headingStyle] - 'tight'|'relaxed'|'balanced'
 */

/**
 * @typedef {Object} SpacingTokens
 * @property {string} xs
 * @property {string} sm
 * @property {string} md
 * @property {string} lg
 * @property {string} xl
 * @property {string} 2xl
 * @property {string} 3xl
 */

/**
 * @typedef {Object} RadiusTokens
 * @property {string} none
 * @property {string} sm
 * @property {string} md
 * @property {string} lg
 * @property {string} xl
 * @property {string} full
 */

/**
 * @typedef {Object} ShadowTokens
 * @property {string} sm
 * @property {string} md
 * @property {string} lg
 * @property {string} [xl]   - for hero/modal overlays
 * @property {string} [glow] - for dark-mode ambient glow
 */

/**
 * @typedef {Object} DesignTokenSet
 * The full design token set produced by the design system selector.
 * Fully compatible with blueprint.designSystem schema expected by generation passes.
 * @property {ColorTokens}      colors
 * @property {TypographyTokens} typography
 * @property {SpacingTokens}    spacing
 * @property {RadiusTokens}     borderRadius
 * @property {ShadowTokens}     shadows
 * @property {string}           transitions
 */

// ── Layout rules ───────────────────────────────────────────────────────────────

/**
 * @typedef {Object} LayoutStyleRules
 * @property {string} pageWidth        - e.g. '1200px' | 'full'
 * @property {string} contentWidth     - narrower reading width e.g. '800px'
 * @property {string} navStyle         - 'sidebar'|'topbar'|'bottomtabs'|'none'
 * @property {string} sectionSpacing   - e.g. '80px'
 * @property {string} contentStructure - 'sidebar-main'|'full-width'|'centered'|'split'
 * @property {string} heroStyle        - 'centered'|'split'|'full-bleed'|'compact'
 */

// ── Component rules ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ButtonRules
 * @property {string} primaryRadius
 * @property {string} primaryPadding
 * @property {number} primaryWeight
 * @property {string} primaryStyle   - 'filled'|'filled-subtle'|'elevated'|'gradient'
 * @property {string} secondaryStyle - 'outlined'|'ghost'|'soft'
 */

/**
 * @typedef {Object} CardRules
 * @property {string}  radius
 * @property {string}  padding
 * @property {string}  shadow
 * @property {boolean} hasBorder
 * @property {string}  background - 'surface'|'elevated'|'tinted'
 * @property {string}  hoverStyle - 'lift'|'border-accent'|'none'
 */

/**
 * @typedef {Object} InputRules
 * @property {string} radius
 * @property {string} padding
 * @property {string} borderStyle - 'default'|'underline'|'filled'
 * @property {string} focusStyle  - 'ring'|'border-color'|'glow'
 */

/**
 * @typedef {Object} ComponentStyleRules
 * @property {ButtonRules} buttons
 * @property {CardRules}   cards
 * @property {InputRules}  inputs
 * @property {Object}      tables
 * @property {Object}      badges
 * @property {Object}      nav
 * @property {Object}      dialogs
 * @property {Object}      emptyStates
 * @property {Object}      loadingStates
 */

// ── Platform rules ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} MobilePlatformRules
 * @property {string} navigation    - 'bottom-tabs'|'top-header'|'drawer'
 * @property {string} tapTargetSize - minimum touch target, e.g. '44px'
 * @property {string} cardStyle     - 'full-width-stacked'|'grid'|'horizontal-scroll'
 * @property {string} baseFontSize  - e.g. '16px'
 * @property {string} modalStyle    - 'sheet'|'fullscreen'|'card'
 * @property {string[]} layoutPatterns
 */

/**
 * @typedef {Object} WebPlatformRules
 * @property {string}   layout        - 'sidebar-content'|'topnav-content'|'full-width'
 * @property {string}   heroStyle     - 'centered'|'split'|'full-bleed'|'compact'
 * @property {string}   sectionDividers - 'whitespace'|'lines'|'backgrounds'
 * @property {string[]} layoutPatterns
 */

// ── Selection signals ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} PresetSelectionSignals
 * Used by select-preset.js to score each preset.
 * @property {string[]} appTypes      - app type strings that score high for this preset
 * @property {string[]} keywords      - keywords in prompt/features that score high
 * @property {string[]} platforms     - 'web'|'mobile'
 * @property {string[]} complexity    - complexity tiers that prefer this preset
 * @property {string[]} tone          - intent tones that prefer this preset
 * @property {string[]} [antiKeywords]- keywords that score against this preset
 * @property {number}   [baseScore]   - starting score (0-10, for tiebreaking)
 */

// ── Full preset definition ─────────────────────────────────────────────────────

/**
 * @typedef {Object} DesignPresetDefinition
 * A complete, self-contained design preset.
 * @property {DesignPresetName}       name
 * @property {string}                 displayName
 * @property {string}                 description
 * @property {VisualTone}             visualTone
 * @property {DensityMode}            density
 * @property {ThemeMode}              themeMode
 * @property {ColorTokens}            colors
 * @property {TypographyTokens}       typography
 * @property {SpacingTokens}          spacing
 * @property {RadiusTokens}           borderRadius
 * @property {ShadowTokens}           shadows
 * @property {string}                 transitions
 * @property {LayoutStyleRules}       layout
 * @property {ComponentStyleRules}    componentRules
 * @property {MobilePlatformRules}    mobileRules
 * @property {WebPlatformRules}       webRules
 * @property {PresetSelectionSignals} selectionSignals
 * @property {string}                 designNotes
 * @property {string[]}               generationHints  - injected into generation prompts
 */

// ── Design spec ────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} DesignSelectionContext
 * Input to the design system selector.
 * @property {Object}       intent           - GenerationIntent
 * @property {Object}       [product]        - ProductPlan
 * @property {Object}       [stack]          - StackPlan
 * @property {Object}       blueprint        - AppBlueprint (Stage 4 output)
 * @property {Object|null}  complexityReport - AppComplexityReport
 * @property {Object}       [overrides]      - DesignOverrides from user
 */

/**
 * @typedef {Object} DesignOverrides
 * Optional user-provided overrides.
 * @property {ThemeMode}        [themeMode]
 * @property {VisualTone}       [visualTone]
 * @property {DensityMode}      [density]
 * @property {DesignPresetName} [forcePreset]
 * @property {Partial<ColorTokens>} [colors]
 * @property {string}           [accentMood] - 'restrained'|'bold'|'playful'
 */

/**
 * @typedef {Object} DesignSpec
 * The complete output of Stage 4.5.
 * Contains everything downstream generation needs to produce a visually coherent product.
 *
 * @property {DesignPresetName}    preset
 * @property {DesignPresetName}    fallbackPreset
 * @property {string}              selectionReason    - why this preset was chosen
 * @property {VisualTone}          visualTone
 * @property {DensityMode}         density
 * @property {ThemeMode}           themeMode
 * @property {boolean}             overrideApplied
 * @property {DesignTokenSet}      tokens             - blueprint-compatible tokens
 * @property {LayoutStyleRules}    layout
 * @property {ComponentStyleRules} componentRules
 * @property {MobilePlatformRules} mobileRules
 * @property {WebPlatformRules}    webRules
 * @property {string[]}            designNotes
 * @property {string[]}            generationHints    - injected into pass prompts
 */

module.exports = {};
