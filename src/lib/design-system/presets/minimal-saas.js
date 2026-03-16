'use strict';

/** @type {import('../types').DesignPresetDefinition} */
const MINIMAL_SAAS = {
  name:        'MINIMAL_SAAS',
  displayName: 'Minimal SaaS',
  description: 'Clean, modern SaaS dashboard with restrained whitespace, soft cards, and professional typography.',
  visualTone:  'modern_clean',
  density:     'balanced',
  themeMode:   'light',

  colors: {
    primary:       '#6366F1',
    primaryHover:  '#4F46E5',
    secondary:     '#0EA5E9',
    accent:        '#8B5CF6',
    background:    '#F8FAFC',
    surface:       '#FFFFFF',
    surfaceHover:  '#F1F5F9',
    text:          '#1E293B',
    textMuted:     '#64748B',
    textOnPrimary: '#FFFFFF',
    border:        '#E2E8F0',
    error:         '#EF4444',
    success:       '#22C55E',
    warning:       '#F59E0B',
  },

  typography: {
    fontFamily:   "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    scaleRem:     { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.25rem', '5xl': '3rem' },
    weights:      { normal: 400, medium: 500, semibold: 600, bold: 700 },
    lineHeights:  { tight: 1.2, normal: 1.5, relaxed: 1.75 },
    headingStyle: 'balanced',
  },

  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '40px', '2xl': '64px', '3xl': '96px' },

  borderRadius: { none: '0', sm: '4px', md: '8px', lg: '12px', xl: '20px', full: '9999px' },

  shadows: {
    sm: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
    md: '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
    lg: '0 8px 24px rgba(0,0,0,0.10), 0 4px 8px rgba(0,0,0,0.06)',
  },

  transitions: 'all 0.15s ease',

  layout: {
    pageWidth:        '1200px',
    contentWidth:     '860px',
    navStyle:         'sidebar',
    sectionSpacing:   '40px',
    contentStructure: 'sidebar-main',
    heroStyle:        'centered',
  },

  componentRules: {
    buttons: { primaryRadius: '8px', primaryPadding: '10px 20px', primaryWeight: 600, primaryStyle: 'filled', secondaryStyle: 'outlined' },
    cards:   { radius: '12px', padding: '24px', shadow: 'sm', hasBorder: true, background: 'surface', hoverStyle: 'lift' },
    inputs:  { radius: '8px', padding: '10px 14px', borderStyle: 'default', focusStyle: 'ring' },
    tables:  { headerBg: 'surfaceHover', rowBorder: true, compact: false, stickyHeader: true },
    badges:  { radius: 'full', padding: '2px 10px', style: 'soft' },
    nav:     { type: 'sidebar', width: '240px', activeStyle: 'filled-subtle', itemRadius: '8px' },
    dialogs: { radius: '16px', backdropBlur: true, padding: '28px' },
    emptyStates:  { style: 'icon-centered', iconSize: '48px', tone: 'muted' },
    loadingStates: { style: 'skeleton', color: 'surfaceHover' },
  },

  mobileRules: {
    navigation:      'bottom-tabs',
    tapTargetSize:   '44px',
    cardStyle:       'full-width-stacked',
    baseFontSize:    '16px',
    modalStyle:      'sheet',
    layoutPatterns:  ['stacked-list', 'card-feed', 'settings-groups'],
  },

  webRules: {
    layout:          'sidebar-content',
    heroStyle:       'centered-contained',
    sectionDividers: 'whitespace',
    layoutPatterns:  ['dashboard-grid', 'data-table', 'metric-cards', 'sidebar-nav'],
  },

  selectionSignals: {
    appTypes:    ['saas', 'dashboard', 'tool', 'platform', 'admin', 'crm', 'erp', 'utility', 'portal'],
    keywords:    ['dashboard', 'saas', 'tool', 'productivity', 'team', 'workflow', 'manage', 'track', 'monitor', 'users', 'settings'],
    platforms:   ['web'],
    complexity:  ['medium', 'advanced'],
    tone:        ['professional', 'minimal'],
    antiKeywords:['luxury', 'premium landing', 'consumer', 'game', 'social media', 'dating'],
    baseScore:   5,
  },

  designNotes: 'Clean professional SaaS with sidebar navigation, soft card elevation, and indigo primary palette. Restrained use of color — primary used only for interactive elements and CTAs.',

  generationHints: [
    'Use a 240px fixed sidebar with logo at top, navigation items with icon+label, and user avatar at bottom.',
    'Main content area has 40px horizontal padding and starts with a page title + optional breadcrumb.',
    'Metric/stat cards: white background, 1px border, subtle shadow, number in 2xl bold, label in sm textMuted.',
    'Data tables: sticky th with #F1F5F9 background, row hover with surfaceHover, border-bottom on each row.',
    'Primary CTA buttons: filled indigo, 8px radius, 600 weight. Secondary: outlined with border.',
    'All cards use 12px border-radius, 24px padding, 1px solid border in addition to shadow.',
    'Typography: headings in semibold/bold (slate-900), body in regular (slate-700), labels in medium (slate-600).',
    'Empty states: centered icon (48px, muted), heading, short description, optional CTA.',
  ],
};

module.exports = MINIMAL_SAAS;
