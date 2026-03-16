'use strict';

/** @type {import('../types').DesignPresetDefinition} */
const LUXURY_DARK = {
  name:        'LUXURY_DARK',
  displayName: 'Luxury Dark',
  description: 'Dark-mode premium product. Refined spacing, restrained accent color, ambient glow shadows. High-end product marketing or elite dashboard.',
  visualTone:  'luxury_refined',
  density:     'spacious',
  themeMode:   'dark',

  colors: {
    primary:       '#C9A96E',
    primaryHover:  '#B8934D',
    secondary:     '#6D7D93',
    accent:        '#E8D5B7',
    background:    '#0C0C0E',
    surface:       '#161618',
    surfaceHover:  '#1E1E22',
    text:          '#F5F3EF',
    textMuted:     '#8A8680',
    textOnPrimary: '#0C0C0E',
    border:        '#2A2A2E',
    error:         '#F87171',
    success:       '#4ADE80',
    warning:       '#FBBF24',
  },

  typography: {
    fontFamily:   "'Playfair Display', 'Georgia', 'Times New Roman', serif",
    scaleRem:     { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '2rem', '4xl': '2.75rem', '5xl': '4rem' },
    weights:      { normal: 300, medium: 400, semibold: 600, bold: 700 },
    lineHeights:  { tight: 1.1, normal: 1.6, relaxed: 1.9 },
    headingStyle: 'tight',
  },

  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '32px', xl: '64px', '2xl': '96px', '3xl': '128px' },

  borderRadius: { none: '0', sm: '2px', md: '6px', lg: '12px', xl: '20px', full: '9999px' },

  shadows: {
    sm:   '0 2px 8px rgba(0,0,0,0.40)',
    md:   '0 8px 32px rgba(0,0,0,0.50), 0 0 0 1px rgba(201,169,110,0.06)',
    lg:   '0 20px 60px rgba(0,0,0,0.60)',
    glow: '0 0 40px rgba(201,169,110,0.12)',
  },

  transitions: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',

  layout: {
    pageWidth:        '1280px',
    contentWidth:     '900px',
    navStyle:         'topbar',
    sectionSpacing:   '120px',
    contentStructure: 'centered',
    heroStyle:        'full-bleed',
  },

  componentRules: {
    buttons: { primaryRadius: '4px', primaryPadding: '14px 32px', primaryWeight: 400, primaryStyle: 'filled', secondaryStyle: 'outlined' },
    cards:   { radius: '8px', padding: '36px', shadow: 'md', hasBorder: true, background: 'surface', hoverStyle: 'glow' },
    inputs:  { radius: '4px', padding: '14px 18px', borderStyle: 'default', focusStyle: 'glow' },
    tables:  { headerBg: 'surfaceHover', rowBorder: true, compact: false, stickyHeader: false },
    badges:  { radius: 'none', padding: '2px 10px', style: 'outlined-accent' },
    nav:     { type: 'topbar', height: '80px', activeStyle: 'underline-accent', transparent: true },
    dialogs: { radius: '4px', backdropBlur: true, padding: '44px', background: 'surface' },
    emptyStates:  { style: 'minimal-text', iconSize: '32px', tone: 'refined' },
    loadingStates: { style: 'fade', color: '#C9A96E' },
  },

  mobileRules: {
    navigation:     'top-header',
    tapTargetSize:  '44px',
    cardStyle:      'full-width-stacked',
    baseFontSize:   '17px',
    modalStyle:     'fullscreen',
    layoutPatterns: ['luxury-hero', 'product-detail', 'editorial-feed'],
  },

  webRules: {
    layout:          'topnav-content',
    heroStyle:       'full-bleed',
    sectionDividers: 'whitespace',
    layoutPatterns:  ['cinematic-hero', 'editorial-split', 'product-spotlight', 'testimonial-quote', 'minimal-cta'],
  },

  selectionSignals: {
    appTypes:    ['luxury', 'premium', 'marketing', 'product', 'fashion', 'exclusive'],
    keywords:    ['luxury', 'premium', 'elite', 'exclusive', 'high-end', 'dark', 'dark mode', 'prestige', 'black', 'gold', 'sophisticated', 'minimalist dark', 'fashion', 'art', 'photography', 'portfolio premium'],
    platforms:   ['web', 'mobile'],
    complexity:  ['simple', 'medium', 'advanced'],
    tone:        ['professional'],
    antiKeywords:['admin tool', 'internal ops', 'enterprise dashboard', 'data table', 'analytics heavy'],
    baseScore:   3,
  },

  designNotes: 'Near-black (#0C0C0E) background with gold (#C9A96E) accent. Serif or refined sans-serif typography with wide letter-spacing in headings. Minimal, high-contrast design language. Shadow style uses ambient glow instead of flat drop-shadows.',

  generationHints: [
    'Background: #0C0C0E (near black). Surface cards: #161618. Borders: #2A2A2E (subtle).',
    'Headings use letter-spacing: 0.02em–0.08em for refinement. Thin/light weights (300) for large display text.',
    'Gold accent (#C9A96E) used sparingly: CTA button fill, icon accents, divider lines, active states.',
    'Topnav: initially transparent, transitions to #161618 on scroll. Logo in gold or white.',
    'Hero: full-viewport height, centered content, background is gradient from #0C0C0E to #161618 or a dark image with overlay.',
    'CTA buttons: gold (#C9A96E) background, very dark text (#0C0C0E), 4px radius (not pill), spaced uppercase tracking.',
    'Cards: #161618 background, 1px #2A2A2E border, no colored shadows. Hover adds subtle gold glow (box-shadow: 0 0 20px rgba(201,169,110,0.08)).',
    'Text: primary #F5F3EF (warm white), muted #8A8680, gold accent for highlights.',
    'Section dividers: a thin gold line (1px, 20% opacity) or just generous whitespace (120px vertical padding).',
  ],
};

module.exports = LUXURY_DARK;
