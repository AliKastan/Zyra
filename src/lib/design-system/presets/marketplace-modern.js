'use strict';

/** @type {import('../types').DesignPresetDefinition} */
const MARKETPLACE_MODERN = {
  name:        'MARKETPLACE_MODERN',
  displayName: 'Marketplace Modern',
  description: 'Browse-first, discovery-oriented marketplace. Listing cards, search/filter emphasis, trust signals, and detail page polish.',
  visualTone:  'marketplace_trustworthy',
  density:     'balanced',
  themeMode:   'light',

  colors: {
    primary:       '#2563EB',
    primaryHover:  '#1D4ED8',
    secondary:     '#059669',
    accent:        '#F59E0B',
    background:    '#F9FAFB',
    surface:       '#FFFFFF',
    surfaceHover:  '#F3F4F6',
    text:          '#111827',
    textMuted:     '#6B7280',
    textOnPrimary: '#FFFFFF',
    border:        '#E5E7EB',
    error:         '#EF4444',
    success:       '#10B981',
    warning:       '#F59E0B',
  },

  typography: {
    fontFamily:   "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    scaleRem:     { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.25rem', '5xl': '3rem' },
    weights:      { normal: 400, medium: 500, semibold: 600, bold: 700 },
    lineHeights:  { tight: 1.25, normal: 1.5, relaxed: 1.75 },
    headingStyle: 'balanced',
  },

  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '40px', '2xl': '64px', '3xl': '80px' },

  borderRadius: { none: '0', sm: '4px', md: '8px', lg: '12px', xl: '20px', full: '9999px' },

  shadows: {
    sm: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.05)',
    md: '0 4px 16px rgba(0,0,0,0.08)',
    lg: '0 12px 32px rgba(0,0,0,0.10)',
  },

  transitions: 'all 0.15s ease',

  layout: {
    pageWidth:        '1280px',
    contentWidth:     '1100px',
    navStyle:         'topbar',
    sectionSpacing:   '48px',
    contentStructure: 'centered',
    heroStyle:        'compact',
  },

  componentRules: {
    buttons: { primaryRadius: '8px', primaryPadding: '10px 20px', primaryWeight: 600, primaryStyle: 'filled', secondaryStyle: 'outlined' },
    cards:   { radius: '12px', padding: '0', shadow: 'sm', hasBorder: true, background: 'surface', hoverStyle: 'lift' },
    inputs:  { radius: '8px', padding: '10px 14px', borderStyle: 'default', focusStyle: 'ring' },
    tables:  { headerBg: 'surfaceHover', rowBorder: true, compact: false, stickyHeader: false },
    badges:  { radius: 'full', padding: '2px 10px', style: 'soft-colored' },
    nav:     { type: 'topbar', height: '64px', activeStyle: 'text-primary', searchBar: true },
    dialogs: { radius: '16px', backdropBlur: true, padding: '28px' },
    emptyStates:  { style: 'search-no-results', iconSize: '56px', tone: 'muted' },
    loadingStates: { style: 'skeleton-cards', color: '#F3F4F6' },
  },

  mobileRules: {
    navigation:     'bottom-tabs',
    tapTargetSize:  '44px',
    cardStyle:      'horizontal-scroll',
    baseFontSize:   '16px',
    modalStyle:     'sheet',
    layoutPatterns: ['browse-grid', 'product-detail', 'cart-sheet', 'category-tabs'],
  },

  webRules: {
    layout:          'topnav-content',
    heroStyle:       'compact',
    sectionDividers: 'whitespace',
    layoutPatterns:  ['search-hero', 'category-pills', 'listing-grid', 'detail-sidebar', 'seller-profile', 'review-section'],
  },

  selectionSignals: {
    appTypes:    ['marketplace', 'ecommerce', 'shop', 'store', 'listing', 'classifieds', 'exchange'],
    keywords:    ['marketplace', 'listing', 'buy', 'sell', 'shop', 'browse', 'discover', 'search', 'filter', 'category', 'vendor', 'seller', 'product', 'inventory', 'cart', 'checkout', 'review', 'rating'],
    platforms:   ['web', 'mobile'],
    complexity:  ['medium', 'advanced', 'production_heavy'],
    tone:        ['professional', 'friendly'],
    antiKeywords:['internal', 'enterprise', 'admin-only', 'ops-tool'],
    baseScore:   4,
  },

  designNotes: 'Marketplace-first design optimized for browse, discovery, and conversion. Listing cards have image-top layout with metadata below. Category pills for filtering. Trust signals (ratings, reviews, badges) built into the component system.',

  generationHints: [
    'Sticky topnav with logo left, search bar center (large, rounded), auth + cart right.',
    'Category pills row below nav: horizontally scrollable tags with outline/filled toggle state.',
    'Listing cards: image on top (16:9 or 4:3 aspect ratio, object-cover), no padding on image. Card body has 12px padding with title (semibold), price (bold primary), rating stars, and secondary info.',
    'Listing grid: responsive 2→3→4 column grid with 16px gap.',
    'Detail page: sticky sidebar on desktop with price/CTA. Image gallery left (large main + thumbnail strip).',
    'Trust badges: verified seller badge, response rate, rating count. All visible near the CTA.',
    'Search/filter sidebar on desktop: category tree, price range slider, checkboxes, star rating filter.',
    'Review section: average rating display (large number + stars + bar chart of distribution), individual reviews below.',
    'Empty search state: friendly icon, "No results for X", suggested categories and search tips.',
  ],
};

module.exports = MARKETPLACE_MODERN;
