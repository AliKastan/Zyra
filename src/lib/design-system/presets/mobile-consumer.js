'use strict';

/** @type {import('../types').DesignPresetDefinition} */
const MOBILE_CONSUMER = {
  name:        'MOBILE_CONSUMER',
  displayName: 'Mobile Consumer',
  description: 'Touch-native, app-store-quality mobile interface. Large tap targets, card-based content, bottom navigation.',
  visualTone:  'mobile_native',
  density:     'balanced',
  themeMode:   'light_dark_adaptive',

  colors: {
    primary:       '#3B82F6',
    primaryHover:  '#2563EB',
    secondary:     '#8B5CF6',
    accent:        '#F59E0B',
    background:    '#F2F2F7',
    surface:       '#FFFFFF',
    surfaceHover:  '#F9F9FB',
    text:          '#000000',
    textMuted:     '#8E8E93',
    textOnPrimary: '#FFFFFF',
    border:        '#C6C6C8',
    error:         '#FF3B30',
    success:       '#34C759',
    warning:       '#FF9500',
  },

  typography: {
    fontFamily:   "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif",
    scaleRem:     { xs: '0.75rem', sm: '0.8125rem', base: '1rem', lg: '1.0625rem', xl: '1.1875rem', '2xl': '1.375rem', '3xl': '1.75rem', '4xl': '2.125rem', '5xl': '2.875rem' },
    weights:      { normal: 400, medium: 500, semibold: 600, bold: 700 },
    lineHeights:  { tight: 1.2, normal: 1.5, relaxed: 1.7 },
    headingStyle: 'balanced',
  },

  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '44px', '2xl': '64px', '3xl': '88px' },

  borderRadius: { none: '0', sm: '8px', md: '12px', lg: '16px', xl: '24px', full: '9999px' },

  shadows: {
    sm: '0 1px 4px rgba(0,0,0,0.08)',
    md: '0 4px 16px rgba(0,0,0,0.10)',
    lg: '0 8px 32px rgba(0,0,0,0.14)',
  },

  transitions: 'all 0.2s ease',

  layout: {
    pageWidth:        '100%',
    contentWidth:     '100%',
    navStyle:         'bottomtabs',
    sectionSpacing:   '24px',
    contentStructure: 'full-width',
    heroStyle:        'compact',
  },

  componentRules: {
    buttons: { primaryRadius: 'full', primaryPadding: '14px 28px', primaryWeight: 600, primaryStyle: 'filled', secondaryStyle: 'soft' },
    cards:   { radius: '16px', padding: '16px', shadow: 'sm', hasBorder: false, background: 'surface', hoverStyle: 'none' },
    inputs:  { radius: '12px', padding: '14px 16px', borderStyle: 'filled', focusStyle: 'ring' },
    tables:  { headerBg: 'surface', rowBorder: true, compact: false, stickyHeader: false },
    badges:  { radius: 'full', padding: '3px 10px', style: 'soft' },
    nav:     { type: 'bottom-tabs', height: '82px', activeStyle: 'filled-icon', showLabels: true },
    dialogs: { radius: '20px', backdropBlur: true, padding: '24px', style: 'sheet-bottom' },
    emptyStates:  { style: 'illustration-centered', iconSize: '72px', tone: 'friendly' },
    loadingStates: { style: 'skeleton', color: '#F2F2F7' },
  },

  mobileRules: {
    navigation:     'bottom-tabs',
    tapTargetSize:  '44px',
    cardStyle:      'full-width-stacked',
    baseFontSize:   '17px',
    modalStyle:     'sheet',
    layoutPatterns: ['feed-cards', 'profile-header', 'bottom-sheet', 'onboarding-screens', 'settings-grouped', 'tab-content'],
  },

  webRules: {
    layout:          'topnav-content',
    heroStyle:       'centered-contained',
    sectionDividers: 'whitespace',
    layoutPatterns:  ['app-preview', 'feature-list', 'download-cta'],
  },

  selectionSignals: {
    appTypes:    ['mobile', 'app', 'consumer', 'fitness', 'health', 'social', 'productivity', 'lifestyle', 'entertainment'],
    keywords:    ['mobile', 'ios', 'android', 'app', 'consumer', 'fitness', 'tracking', 'personal', 'habit', 'feed', 'social', 'community', 'profile', 'onboarding', 'notifications', 'push'],
    platforms:   ['mobile'],
    complexity:  ['simple', 'medium', 'advanced'],
    tone:        ['friendly', 'playful', 'professional'],
    antiKeywords:['enterprise', 'internal', 'admin', 'ops', 'b2b', 'table-heavy'],
    baseScore:   8, // High base for mobile platform
  },

  designNotes: 'Native mobile-first design following iOS/Android conventions. System font stack, rounded corners (12-16px+), bottom tab navigation. Touch targets minimum 44px. Cards have no border — elevation via shadow only.',

  generationHints: [
    'Use bottom navigation bar (82px height) with 4-5 icon+label tabs. Active tab uses primary color.',
    'Full-width stacked cards (16px radius, no border, sm shadow). Card content has 16px internal padding.',
    'Status bar area: 44px top padding for safe area. Home indicator: 34px bottom padding on iPhone-style layout.',
    'List items: 60px minimum height, left icon or avatar, text block (title + subtitle), optional right chevron/badge.',
    'Profile header: avatar (72px circle), name in bold, subtitle in muted, follower/stat row below.',
    'Forms use filled input style (grey background, no visible border by default). 12px radius inputs.',
    'Rounded pill buttons (full radius) for primary CTAs. Ghost/text buttons for secondary actions.',
    'Sheet modals slide up from bottom with handle indicator. Backdrop is 50% black.',
    'Empty states: centered illustration area, friendly heading, and short helper text with optional CTA.',
  ],
};

module.exports = MOBILE_CONSUMER;
