'use strict';

/** @type {import('../types').DesignPresetDefinition} */
const LOCAL_BUSINESS = {
  name:        'LOCAL_BUSINESS',
  displayName: 'Local Business',
  description: 'Practical, conversion-focused local service business site. Trust-building sections, contact/booking emphasis, and simple clear CTAs.',
  visualTone:  'local_approachable',
  density:     'balanced',
  themeMode:   'light',

  colors: {
    primary:       '#D97706',
    primaryHover:  '#B45309',
    secondary:     '#059669',
    accent:        '#2563EB',
    background:    '#FFFBF0',
    surface:       '#FFFFFF',
    surfaceHover:  '#FFFBEB',
    text:          '#1C1917',
    textMuted:     '#78716C',
    textOnPrimary: '#FFFFFF',
    border:        '#E7E5E4',
    error:         '#EF4444',
    success:       '#10B981',
    warning:       '#F59E0B',
  },

  typography: {
    fontFamily:   "'Georgia', system-ui, -apple-system, serif",
    scaleRem:     { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.25rem', '5xl': '3rem' },
    weights:      { normal: 400, medium: 500, semibold: 600, bold: 700 },
    lineHeights:  { tight: 1.25, normal: 1.6, relaxed: 1.8 },
    headingStyle: 'balanced',
  },

  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '48px', '2xl': '72px', '3xl': '96px' },

  borderRadius: { none: '0', sm: '4px', md: '8px', lg: '16px', xl: '24px', full: '9999px' },

  shadows: {
    sm: '0 2px 8px rgba(0,0,0,0.08)',
    md: '0 6px 20px rgba(0,0,0,0.10)',
    lg: '0 12px 40px rgba(0,0,0,0.12)',
  },

  transitions: 'all 0.15s ease',

  layout: {
    pageWidth:        '1100px',
    contentWidth:     '800px',
    navStyle:         'topbar',
    sectionSpacing:   '72px',
    contentStructure: 'centered',
    heroStyle:        'split',
  },

  componentRules: {
    buttons: { primaryRadius: '8px', primaryPadding: '14px 28px', primaryWeight: 700, primaryStyle: 'filled', secondaryStyle: 'outlined' },
    cards:   { radius: '12px', padding: '24px', shadow: 'sm', hasBorder: true, background: 'surface', hoverStyle: 'lift' },
    inputs:  { radius: '8px', padding: '12px 14px', borderStyle: 'default', focusStyle: 'ring' },
    tables:  { headerBg: 'surfaceHover', rowBorder: true, compact: false, stickyHeader: false },
    badges:  { radius: 'full', padding: '3px 10px', style: 'soft-colored' },
    nav:     { type: 'topbar', height: '72px', activeStyle: 'text-primary', phoneNumber: true },
    dialogs: { radius: '16px', backdropBlur: true, padding: '32px' },
    emptyStates:  { style: 'contact-prompt', iconSize: '48px', tone: 'approachable' },
    loadingStates: { style: 'skeleton', color: '#FFFBEB' },
  },

  mobileRules: {
    navigation:     'top-header',
    tapTargetSize:  '48px',
    cardStyle:      'full-width-stacked',
    baseFontSize:   '17px',
    modalStyle:     'sheet',
    layoutPatterns: ['services-list', 'contact-card', 'map-section', 'hours-info'],
  },

  webRules: {
    layout:          'topnav-content',
    heroStyle:       'split',
    sectionDividers: 'backgrounds',
    layoutPatterns:  ['hero-with-cta', 'services-grid', 'about-split', 'testimonials', 'contact-section', 'map-embed', 'footer-info'],
  },

  selectionSignals: {
    appTypes:    ['restaurant', 'cafe', 'barber', 'salon', 'local', 'service', 'shop', 'small-business', 'contractor'],
    keywords:    ['restaurant', 'cafe', 'coffee', 'food', 'barber', 'salon', 'hair', 'beauty', 'spa', 'local', 'service', 'plumber', 'electrician', 'contractor', 'delivery', 'menu', 'hours', 'location', 'contact', 'reservation', 'order', 'small business'],
    platforms:   ['web', 'mobile'],
    complexity:  ['simple', 'medium'],
    tone:        ['friendly', 'professional'],
    antiKeywords:['enterprise', 'b2b', 'analytics', 'admin', 'marketplace scale'],
    baseScore:   5,
  },

  designNotes: 'Warm amber-toned local business aesthetic. Serif font for headings gives approachability and trust. Phone number and hours prominently displayed. Contact/booking CTAs are high-contrast amber buttons. Google Maps embed and business info block are core components.',

  generationHints: [
    'Phone number displayed in the topnav (right side) and in the hero section. Make it easy to contact.',
    'Hero: split layout. Left: headline ("Welcome to X"), tagline, CTA button ("Book Now" or "Order Online"), trust badge (e.g. "Open Today · 9am-9pm"). Right: hero food/service photo.',
    'Services section: 3-column grid of service cards. Each has a photo, name, short description, and price if relevant.',
    'About section: photo of owner/team on left, story text on right. Warm, personal, real.',
    'Testimonials/reviews: horizontal card strip or 3-column grid. Stars, quote, reviewer name, date.',
    'Hours + Location section: two columns — hours table (Mon-Sun) on left, Google Maps embed on right.',
    'Contact section: simple form (Name, Phone, Message) + contact details (address, phone, email, hours).',
    'Footer: business name, address, phone, hours, social links, and a brief "About" tagline.',
    'Sticky topnav with logo/name left, nav links center, phone number and CTA button right.',
    'Color pops: amber (#D97706) for CTA buttons and accent decorations. Green (#059669) for "Open" status or confirmation.',
  ],
};

module.exports = LOCAL_BUSINESS;
