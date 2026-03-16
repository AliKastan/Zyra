'use strict';

/** @type {import('../types').DesignPresetDefinition} */
const PLAYFUL_CONSUMER = {
  name:        'PLAYFUL_CONSUMER',
  displayName: 'Playful Consumer',
  description: 'Friendly, expressive consumer app. Rounder corners, warmer colors, more personality — still production-safe.',
  visualTone:  'playful_friendly',
  density:     'balanced',
  themeMode:   'light',

  colors: {
    primary:       '#F43F5E',
    primaryHover:  '#E11D48',
    secondary:     '#8B5CF6',
    accent:        '#06B6D4',
    background:    '#FFFBF5',
    surface:       '#FFFFFF',
    surfaceHover:  '#FFF1F2',
    text:          '#1C1917',
    textMuted:     '#78716C',
    textOnPrimary: '#FFFFFF',
    border:        '#E7E5E4',
    error:         '#EF4444',
    success:       '#22C55E',
    warning:       '#FB923C',
  },

  typography: {
    fontFamily:   "'Nunito', 'Poppins', system-ui, -apple-system, sans-serif",
    scaleRem:     { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '2rem', '4xl': '2.5rem', '5xl': '3rem' },
    weights:      { normal: 400, medium: 600, semibold: 700, bold: 800 },
    lineHeights:  { tight: 1.2, normal: 1.6, relaxed: 1.8 },
    headingStyle: 'relaxed',
  },

  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '40px', '2xl': '64px', '3xl': '96px' },

  borderRadius: { none: '0', sm: '8px', md: '14px', lg: '20px', xl: '28px', full: '9999px' },

  shadows: {
    sm: '0 2px 8px rgba(244,63,94,0.08)',
    md: '0 8px 24px rgba(244,63,94,0.10)',
    lg: '0 16px 48px rgba(244,63,94,0.14)',
  },

  transitions: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',

  layout: {
    pageWidth:        '1100px',
    contentWidth:     '800px',
    navStyle:         'topbar',
    sectionSpacing:   '64px',
    contentStructure: 'centered',
    heroStyle:        'centered',
  },

  componentRules: {
    buttons: { primaryRadius: 'full', primaryPadding: '12px 28px', primaryWeight: 700, primaryStyle: 'filled', secondaryStyle: 'soft' },
    cards:   { radius: '20px', padding: '24px', shadow: 'md', hasBorder: false, background: 'surface', hoverStyle: 'lift' },
    inputs:  { radius: '14px', padding: '12px 16px', borderStyle: 'default', focusStyle: 'ring' },
    tables:  { headerBg: 'surfaceHover', rowBorder: false, compact: false, stickyHeader: false },
    badges:  { radius: 'full', padding: '4px 14px', style: 'soft-colored' },
    nav:     { type: 'topbar', height: '68px', activeStyle: 'filled-pill' },
    dialogs: { radius: '24px', backdropBlur: true, padding: '32px' },
    emptyStates:  { style: 'illustrated-friendly', iconSize: '80px', tone: 'playful' },
    loadingStates: { style: 'dots-bounce', color: 'primary' },
  },

  mobileRules: {
    navigation:     'bottom-tabs',
    tapTargetSize:  '48px',
    cardStyle:      'full-width-stacked',
    baseFontSize:   '17px',
    modalStyle:     'sheet',
    layoutPatterns: ['fun-onboarding', 'card-feed', 'activity-feed', 'achievement-display'],
  },

  webRules: {
    layout:          'topnav-content',
    heroStyle:       'centered',
    sectionDividers: 'backgrounds',
    layoutPatterns:  ['hero-fun', 'feature-icons', 'testimonial-cards', 'community-grid'],
  },

  selectionSignals: {
    appTypes:    ['game', 'quiz', 'fun', 'social', 'hobby', 'lifestyle', 'community', 'food', 'pet'],
    keywords:    ['fun', 'game', 'quiz', 'challenge', 'points', 'reward', 'friend', 'social', 'activity', 'habit', 'daily', 'streak', 'community', 'food', 'recipe', 'pet', 'kids', 'play'],
    platforms:   ['web', 'mobile'],
    complexity:  ['simple', 'medium'],
    tone:        ['playful', 'friendly'],
    antiKeywords:['enterprise', 'admin', 'finance', 'analytics', 'internal'],
    baseScore:   3,
  },

  designNotes: 'Warm, expressive consumer app with a rose/pink primary, rounded everything (20px+ cards, full-radius buttons), bouncy transitions, and a friendly tone. Heavier type weights (700/800) for personality.',

  generationHints: [
    'Hero: bright, energetic. Large headline (3rem+) with a warm accent color. Illustration or vibrant image. Pill-shaped CTA button.',
    'Cards have 20px+ border radius, no visible borders, only shadow for depth. Hover lifts the card subtly.',
    'Buttons are full-radius pills with bold (700) weight. Primary uses filled rose. Secondary uses a soft/tinted style.',
    'Navigation topbar: logo with a playful accent, rounded active state (pill shape).',
    'Color pops used intentionally: accent colors on icons, badges, and highlights (not all over).',
    'Achievement/gamification elements: point badges (circles with number), streak counters, progress bars (rounded ends).',
    'Transitions use a slight overshoot (cubic-bezier with bounce) for personality.',
    'Empty states: large friendly illustration, encouraging headline, inviting CTA.',
    'Form inputs: 14px border-radius, friendly placeholder text, clear validation messages.',
  ],
};

module.exports = PLAYFUL_CONSUMER;
