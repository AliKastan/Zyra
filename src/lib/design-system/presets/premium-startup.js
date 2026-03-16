'use strict';

/** @type {import('../types').DesignPresetDefinition} */
const PREMIUM_STARTUP = {
  name:        'PREMIUM_STARTUP',
  displayName: 'Premium Startup',
  description: 'Polished, high-conversion landing page and product marketing aesthetic. Generous spacing, elegant type, and high-contrast hero sections.',
  visualTone:  'premium_polished',
  density:     'spacious',
  themeMode:   'light',

  colors: {
    primary:       '#4F46E5',
    primaryHover:  '#4338CA',
    secondary:     '#06B6D4',
    accent:        '#F59E0B',
    background:    '#FFFFFF',
    surface:       '#FFFFFF',
    surfaceHover:  '#F9FAFB',
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
    scaleRem:     { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.5rem', '5xl': '3.5rem' },
    weights:      { normal: 400, medium: 500, semibold: 600, bold: 800 },
    lineHeights:  { tight: 1.1, normal: 1.5, relaxed: 1.75 },
    headingStyle: 'tight',
  },

  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '32px', xl: '64px', '2xl': '96px', '3xl': '128px' },

  borderRadius: { none: '0', sm: '6px', md: '12px', lg: '20px', xl: '32px', full: '9999px' },

  shadows: {
    sm: '0 1px 4px rgba(0,0,0,0.06)',
    md: '0 8px 32px rgba(79,70,229,0.10), 0 2px 8px rgba(0,0,0,0.06)',
    lg: '0 20px 60px rgba(79,70,229,0.15), 0 8px 16px rgba(0,0,0,0.08)',
    xl: '0 32px 80px rgba(79,70,229,0.18)',
  },

  transitions: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',

  layout: {
    pageWidth:        '1280px',
    contentWidth:     '860px',
    navStyle:         'topbar',
    sectionSpacing:   '96px',
    contentStructure: 'centered',
    heroStyle:        'centered',
  },

  componentRules: {
    buttons: { primaryRadius: '12px', primaryPadding: '14px 28px', primaryWeight: 700, primaryStyle: 'filled', secondaryStyle: 'outlined' },
    cards:   { radius: '20px', padding: '32px', shadow: 'md', hasBorder: false, background: 'surface', hoverStyle: 'lift' },
    inputs:  { radius: '10px', padding: '12px 16px', borderStyle: 'default', focusStyle: 'ring' },
    tables:  { headerBg: 'surface', rowBorder: true, compact: false, stickyHeader: false },
    badges:  { radius: 'full', padding: '4px 12px', style: 'soft-colored' },
    nav:     { type: 'topbar', height: '72px', activeStyle: 'underline', itemRadius: '0' },
    dialogs: { radius: '24px', backdropBlur: true, padding: '40px' },
    emptyStates:  { style: 'illustration-centered', iconSize: '64px', tone: 'branded' },
    loadingStates: { style: 'spinner', color: 'primary' },
  },

  mobileRules: {
    navigation:     'top-header',
    tapTargetSize:  '48px',
    cardStyle:      'full-width-stacked',
    baseFontSize:   '17px',
    modalStyle:     'sheet',
    layoutPatterns: ['hero-cta', 'feature-cards', 'social-proof', 'pricing-tiers'],
  },

  webRules: {
    layout:          'topnav-content',
    heroStyle:       'full-bleed',
    sectionDividers: 'backgrounds',
    layoutPatterns:  ['hero-full-bleed', 'features-3col', 'testimonials-carousel', 'pricing-cards', 'cta-band', 'footer-rich'],
  },

  selectionSignals: {
    appTypes:    ['landing-page', 'marketing', 'startup', 'product', 'homepage', 'generic'],
    keywords:    ['landing', 'homepage', 'marketing', 'launch', 'startup', 'product', 'startup page', 'website for', 'site for', 'company', 'brand', 'pitch', 'pricing', 'saas landing', 'conversion'],
    platforms:   ['web'],
    complexity:  ['simple', 'medium'],
    tone:        ['professional', 'friendly'],
    antiKeywords:['dashboard', 'admin', 'internal', 'enterprise', 'ops', 'dark'],
    baseScore:   4,
  },

  designNotes: 'Premium startup landing page aesthetic. Large hero headings (3.5rem+), generous section padding, and brand-colored CTA buttons. Cards float with colored drop shadows. Topnav is clean with logo left, nav links center/right, CTA button.',

  generationHints: [
    'Hero section: full-width, centered text, headline in 3.5-5rem bold, subtitle in 1.25rem muted, two CTA buttons (primary + ghost), and optionally a product screenshot or hero image placeholder below.',
    'Navigation: sticky transparent-to-white topnav, logo left, nav links in the middle, "Get started" CTA button right.',
    'Feature sections: alternating left/right split layout OR 3-column grid with icon, heading, and description per feature.',
    'Pricing cards: 3 tiers, middle card highlighted with primary color border and "Most popular" badge.',
    'Social proof: logo marquee or testimonial cards with avatar, name, role, quote.',
    'Section backgrounds alternate: white → light-gray (#F9FAFB) → white to create visual rhythm.',
    'CTA sections: full-width band with primary background color, white heading, and ghost/white CTA button.',
    'Footer: dark background (#111827), white text, 4-column link grid, copyright.',
  ],
};

module.exports = PREMIUM_STARTUP;
