'use strict';

/** @type {import('../types').DesignPresetDefinition} */
const FINANCE_ANALYTICS = {
  name:        'FINANCE_ANALYTICS',
  displayName: 'Finance & Analytics',
  description: 'Metrics-first financial and analytics product. Charts, tables, and KPI cards as primary UI elements. Restrained, trustworthy visual language.',
  visualTone:  'analytical_precise',
  density:     'compact',
  themeMode:   'light_dark_adaptive',

  colors: {
    primary:       '#1E40AF',
    primaryHover:  '#1E3A8A',
    secondary:     '#0284C7',
    accent:        '#059669',
    background:    '#F8FAFC',
    surface:       '#FFFFFF',
    surfaceHover:  '#F1F5F9',
    text:          '#0F172A',
    textMuted:     '#475569',
    textOnPrimary: '#FFFFFF',
    border:        '#CBD5E1',
    error:         '#DC2626',
    success:       '#059669',
    warning:       '#D97706',
  },

  typography: {
    fontFamily:   "'Inter', system-ui, -apple-system, sans-serif",
    monoFamily:   "'JetBrains Mono', 'Fira Code', monospace",
    scaleRem:     { xs: '0.6875rem', sm: '0.8125rem', base: '0.9375rem', lg: '1.0625rem', xl: '1.1875rem', '2xl': '1.375rem', '3xl': '1.75rem', '4xl': '2.125rem', '5xl': '2.75rem' },
    weights:      { normal: 400, medium: 500, semibold: 600, bold: 700 },
    lineHeights:  { tight: 1.2, normal: 1.4, relaxed: 1.6 },
    headingStyle: 'tight',
  },

  spacing: { xs: '3px', sm: '6px', md: '12px', lg: '20px', xl: '32px', '2xl': '48px', '3xl': '64px' },

  borderRadius: { none: '0', sm: '2px', md: '6px', lg: '10px', xl: '16px', full: '9999px' },

  shadows: {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 2px 8px rgba(0,0,0,0.06)',
    lg: '0 6px 20px rgba(0,0,0,0.08)',
  },

  transitions: 'all 0.1s ease',

  layout: {
    pageWidth:        'full',
    contentWidth:     '100%',
    navStyle:         'sidebar',
    sectionSpacing:   '24px',
    contentStructure: 'sidebar-main',
    heroStyle:        'compact',
  },

  componentRules: {
    buttons: { primaryRadius: '6px', primaryPadding: '8px 16px', primaryWeight: 600, primaryStyle: 'filled', secondaryStyle: 'outlined' },
    cards:   { radius: '8px', padding: '20px', shadow: 'sm', hasBorder: true, background: 'surface', hoverStyle: 'none' },
    inputs:  { radius: '4px', padding: '8px 12px', borderStyle: 'default', focusStyle: 'border-color' },
    tables:  { headerBg: '#F8FAFC', rowBorder: true, compact: true, stickyHeader: true, monoNumbers: true, alternateRows: true },
    badges:  { radius: 'sm', padding: '2px 8px', style: 'soft-colored' },
    nav:     { type: 'sidebar', width: '220px', activeStyle: 'filled-accent', collapsible: true, showIcons: true },
    dialogs: { radius: '8px', backdropBlur: false, padding: '24px' },
    emptyStates:  { style: 'chart-empty', iconSize: '40px', tone: 'muted' },
    loadingStates: { style: 'skeleton', color: '#F1F5F9' },
  },

  mobileRules: {
    navigation:     'bottom-tabs',
    tapTargetSize:  '40px',
    cardStyle:      'full-width-stacked',
    baseFontSize:   '15px',
    modalStyle:     'fullscreen',
    layoutPatterns: ['kpi-cards', 'chart-view', 'transaction-list', 'account-summary'],
  },

  webRules: {
    layout:          'sidebar-content',
    heroStyle:       'compact',
    sectionDividers: 'lines',
    layoutPatterns:  ['kpi-row', 'chart-grid', 'data-table', 'date-range-filter', 'drill-down-drawer', 'comparison-view'],
  },

  selectionSignals: {
    appTypes:    ['analytics', 'finance', 'accounting', 'reporting', 'trading', 'dashboard', 'metrics', 'data'],
    keywords:    ['analytics', 'finance', 'financial', 'accounting', 'budget', 'revenue', 'expense', 'chart', 'graph', 'metrics', 'kpi', 'reporting', 'trading', 'investment', 'portfolio', 'transaction', 'balance', 'profit', 'loss', 'forecast'],
    platforms:   ['web', 'mobile'],
    complexity:  ['medium', 'advanced', 'production_heavy'],
    tone:        ['professional'],
    antiKeywords:['consumer game', 'social media', 'creator', 'luxury marketing'],
    baseScore:   5,
  },

  designNotes: 'Precision-first financial analytics with tabular number font, compact density, and a navy/slate color system that communicates trust. Charts and metric cards are the primary content. Numbers use monospace font for alignment.',

  generationHints: [
    'KPI row at the top: 4 metric cards in a row. Each shows: label (small caps, muted), large number (1.75rem bold, mono font), delta % (green if positive, red if negative), and a small sparkline.',
    'Chart area: takes up 60-70% of main content. Chart type matches data: line for trends, bar for comparisons, pie for composition.',
    'Data table: mono font for numbers, right-aligned number columns, left-aligned text. Sticky header, alternating row background.',
    'Date range picker in the top-right of each section. "Last 7d / 30d / 90d / Custom" segment control.',
    'Summary sidebar or secondary panel: shows top performers, recent transactions, or breakdown list.',
    'Positive values: green (#059669). Negative values: red (#DC2626). Neutral/projected: blue (#0284C7).',
    'Navigation sidebar: grouped sections (Overview, Revenue, Expenses, Reports, Settings). Section headers in uppercase muted.',
    'Color-coded status: pie chart segments use a consistent 6-color sequential palette (not random colors).',
    'Export button on all data views: CSV / PDF download icon-button in table header.',
  ],
};

module.exports = FINANCE_ANALYTICS;
