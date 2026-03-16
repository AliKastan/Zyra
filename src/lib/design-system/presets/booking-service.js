'use strict';

/** @type {import('../types').DesignPresetDefinition} */
const BOOKING_SERVICE = {
  name:        'BOOKING_SERVICE',
  displayName: 'Booking Service',
  description: 'Schedule-focused service booking platform. Clear CTAs, calendar/time-slot UI, and balanced business+customer flow.',
  visualTone:  'scheduling_clear',
  density:     'balanced',
  themeMode:   'light',

  colors: {
    primary:       '#0D9488',
    primaryHover:  '#0F766E',
    secondary:     '#6366F1',
    accent:        '#F59E0B',
    background:    '#F8FAFC',
    surface:       '#FFFFFF',
    surfaceHover:  '#F0FDFA',
    text:          '#1E293B',
    textMuted:     '#64748B',
    textOnPrimary: '#FFFFFF',
    border:        '#E2E8F0',
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

  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '40px', '2xl': '64px', '3xl': '96px' },

  borderRadius: { none: '0', sm: '4px', md: '8px', lg: '16px', xl: '24px', full: '9999px' },

  shadows: {
    sm: '0 1px 3px rgba(0,0,0,0.06)',
    md: '0 4px 16px rgba(13,148,136,0.08), 0 2px 4px rgba(0,0,0,0.04)',
    lg: '0 12px 32px rgba(13,148,136,0.12)',
  },

  transitions: 'all 0.15s ease',

  layout: {
    pageWidth:        '1100px',
    contentWidth:     '860px',
    navStyle:         'topbar',
    sectionSpacing:   '48px',
    contentStructure: 'centered',
    heroStyle:        'split',
  },

  componentRules: {
    buttons: { primaryRadius: '10px', primaryPadding: '12px 24px', primaryWeight: 600, primaryStyle: 'filled', secondaryStyle: 'outlined' },
    cards:   { radius: '16px', padding: '24px', shadow: 'sm', hasBorder: true, background: 'surface', hoverStyle: 'border-accent' },
    inputs:  { radius: '8px', padding: '12px 14px', borderStyle: 'default', focusStyle: 'ring' },
    tables:  { headerBg: 'surfaceHover', rowBorder: true, compact: false, stickyHeader: false },
    badges:  { radius: 'full', padding: '3px 10px', style: 'soft-colored' },
    nav:     { type: 'topbar', height: '64px', activeStyle: 'text-primary' },
    dialogs: { radius: '20px', backdropBlur: true, padding: '32px' },
    emptyStates:  { style: 'calendar-empty', iconSize: '56px', tone: 'friendly' },
    loadingStates: { style: 'skeleton', color: '#F0FDFA' },
  },

  mobileRules: {
    navigation:     'bottom-tabs',
    tapTargetSize:  '48px',
    cardStyle:      'full-width-stacked',
    baseFontSize:   '16px',
    modalStyle:     'sheet',
    layoutPatterns: ['service-list', 'calendar-picker', 'time-slots', 'booking-confirm', 'my-bookings'],
  },

  webRules: {
    layout:          'topnav-content',
    heroStyle:       'split',
    sectionDividers: 'whitespace',
    layoutPatterns:  ['service-cards', 'calendar-widget', 'step-booking-flow', 'provider-profile', 'confirmation-page'],
  },

  selectionSignals: {
    appTypes:    ['booking', 'scheduling', 'reservation', 'appointment', 'calendar', 'service'],
    keywords:    ['book', 'booking', 'appointment', 'schedule', 'reservation', 'calendar', 'slot', 'availability', 'service', 'barber', 'salon', 'clinic', 'doctor', 'trainer', 'class', 'session', 'rent'],
    platforms:   ['web', 'mobile'],
    complexity:  ['simple', 'medium', 'advanced'],
    tone:        ['professional', 'friendly'],
    antiKeywords:['enterprise ops', 'marketplace browse', 'social feed'],
    baseScore:   6,
  },

  designNotes: 'Trust-building teal color system for service/booking platforms. Clear step-by-step booking flow, date/time slot picker, and confirmation states. Provider profile cards and service listing cards are core components.',

  generationHints: [
    'Hero section: split layout — left side has headline, trust badges (star ratings, client count), and "Book Now" CTA. Right side has a service selector or calendar preview.',
    'Service cards: image or icon, service name, duration, price, and "Book" button. Grid of 3 per row on desktop.',
    'Calendar widget: monthly grid, available dates in teal, unavailable in muted/strikethrough, selected in primary filled.',
    'Time slot grid: pill buttons for each time slot. Available = outlined teal. Selected = filled teal. Unavailable = muted disabled.',
    'Booking flow: 3-step progress bar (Select Service → Choose Time → Confirm). Each step is a card with back/next navigation.',
    'Provider/business profile: cover image, avatar overlapping bottom edge, name, rating stars, location, short bio, service list.',
    'Confirmation page: success checkmark, booking summary card (service, date, time, provider), add-to-calendar button, directions link.',
    'My Bookings: tabbed (Upcoming / Past), each booking as a card with status badge (Confirmed, Pending, Completed, Cancelled).',
    'Trust signals: "Verified business" badge, avg response time, number of bookings, customer photos.',
  ],
};

module.exports = BOOKING_SERVICE;
