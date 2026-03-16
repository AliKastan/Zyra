'use strict';

/** @type {import('../types').DesignPresetDefinition} */
const ENTERPRISE_DASHBOARD = {
  name:        'ENTERPRISE_DASHBOARD',
  displayName: 'Enterprise Dashboard',
  description: 'Dense, structured, data-heavy internal tool aesthetic. Operational clarity, strong hierarchy, minimal decoration.',
  visualTone:  'enterprise_structured',
  density:     'compact',
  themeMode:   'light',

  colors: {
    primary:       '#1D4ED8',
    primaryHover:  '#1E40AF',
    secondary:     '#0284C7',
    accent:        '#7C3AED',
    background:    '#F1F5F9',
    surface:       '#FFFFFF',
    surfaceHover:  '#F8FAFC',
    text:          '#0F172A',
    textMuted:     '#475569',
    textOnPrimary: '#FFFFFF',
    border:        '#CBD5E1',
    error:         '#DC2626',
    success:       '#16A34A',
    warning:       '#D97706',
  },

  typography: {
    fontFamily:   "'Inter', system-ui, -apple-system, sans-serif",
    monoFamily:   "'JetBrains Mono', 'Fira Code', monospace",
    scaleRem:     { xs: '0.7rem', sm: '0.8125rem', base: '0.875rem', lg: '1rem', xl: '1.125rem', '2xl': '1.25rem', '3xl': '1.5rem', '4xl': '1.875rem', '5xl': '2.25rem' },
    weights:      { normal: 400, medium: 500, semibold: 600, bold: 700 },
    lineHeights:  { tight: 1.25, normal: 1.4, relaxed: 1.6 },
    headingStyle: 'tight',
  },

  spacing: { xs: '2px', sm: '6px', md: '12px', lg: '20px', xl: '32px', '2xl': '48px', '3xl': '64px' },

  borderRadius: { none: '0', sm: '2px', md: '4px', lg: '8px', xl: '12px', full: '9999px' },

  shadows: {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 2px 8px rgba(0,0,0,0.08)',
    lg: '0 4px 16px rgba(0,0,0,0.10)',
  },

  transitions: 'all 0.1s ease',

  layout: {
    pageWidth:        'full',
    contentWidth:     '100%',
    navStyle:         'sidebar',
    sectionSpacing:   '20px',
    contentStructure: 'sidebar-main',
    heroStyle:        'compact',
  },

  componentRules: {
    buttons: { primaryRadius: '4px', primaryPadding: '8px 16px', primaryWeight: 600, primaryStyle: 'filled', secondaryStyle: 'outlined' },
    cards:   { radius: '4px', padding: '16px', shadow: 'sm', hasBorder: true, background: 'surface', hoverStyle: 'border-accent' },
    inputs:  { radius: '4px', padding: '7px 12px', borderStyle: 'default', focusStyle: 'border-color' },
    tables:  { headerBg: '#F1F5F9', rowBorder: true, compact: true, stickyHeader: true, fontSize: '0.8125rem', alternateRows: true },
    badges:  { radius: 'sm', padding: '1px 8px', style: 'outlined' },
    nav:     { type: 'sidebar', width: '220px', activeStyle: 'filled-accent', itemRadius: '4px', showIcons: true, collapsible: true },
    dialogs: { radius: '8px', backdropBlur: false, padding: '24px' },
    emptyStates:  { style: 'text-centered', iconSize: '36px', tone: 'muted' },
    loadingStates: { style: 'skeleton', color: '#E2E8F0' },
  },

  mobileRules: {
    navigation:     'top-header',
    tapTargetSize:  '40px',
    cardStyle:      'full-width-stacked',
    baseFontSize:   '14px',
    modalStyle:     'fullscreen',
    layoutPatterns: ['data-list', 'detail-view', 'filter-search'],
  },

  webRules: {
    layout:          'sidebar-content',
    heroStyle:       'compact',
    sectionDividers: 'lines',
    layoutPatterns:  ['data-table-full', 'stat-row', 'filter-toolbar', 'sidebar-tree', 'split-pane', 'form-sections'],
  },

  selectionSignals: {
    appTypes:    ['dashboard', 'admin', 'crm', 'erp', 'ops', 'internal', 'enterprise', 'analytics', 'management', 'portal'],
    keywords:    ['internal', 'admin', 'enterprise', 'management', 'ops', 'operations', 'team', 'b2b', 'corporate', 'staff', 'employee', 'report', 'audit', 'compliance', 'pipeline', 'monitor'],
    platforms:   ['web'],
    complexity:  ['advanced', 'production_heavy'],
    tone:        ['professional'],
    antiKeywords:['consumer', 'mobile', 'landing', 'marketing', 'luxury', 'game', 'social'],
    baseScore:   3,
  },

  designNotes: 'Dense enterprise-grade internal tool. Smaller base font (0.875rem), compact spacing, 4px border-radius throughout. Full-width layout with collapsible sidebar. Tables are the primary UI element — designed to be information-dense and scannable.',

  generationHints: [
    'Use full-width layout with a 220px collapsible sidebar. Page background is #F1F5F9 (light slate).',
    'Header bar: 48px tall, white background, 1px bottom border, breadcrumbs left, action buttons right.',
    'Data tables are the primary content: th has #F1F5F9 bg, 0.8125rem font, medium weight, border-bottom. td has 0.8125rem font, py-2 px-3. Alternating row bg on hover.',
    'Metric stat cards: white bg, 1px border, compact 16px padding. Large number in 1.5rem bold, label in 0.75rem uppercase tracking-wide muted.',
    'Status badges: pill shape (full radius), xs/sm text, outlined or soft-color style (green=success, red=error, amber=warning, blue=info).',
    'Filter toolbar above tables: search input left, filter dropdowns, date range picker, action buttons right.',
    'Sidebar navigation: grouped items with category headers in 0.7rem uppercase muted text. Active item has #EFF6FF background with blue left border.',
    'Form layouts: two-column grid for settings, full labels above inputs, compact spacing, grouped sections with subheadings.',
  ],
};

module.exports = ENTERPRISE_DASHBOARD;
