'use strict';

/** @type {import('../types').DesignPresetDefinition} */
const CREATOR_CONTENT = {
  name:        'CREATOR_CONTENT',
  displayName: 'Creator Content',
  description: 'Media-forward creator platform. Content cards, profile-centric patterns, feed/library organization, expressive typography.',
  visualTone:  'creative_expressive',
  density:     'balanced',
  themeMode:   'light_dark_adaptive',

  colors: {
    primary:       '#E11D48',
    primaryHover:  '#BE123C',
    secondary:     '#8B5CF6',
    accent:        '#F59E0B',
    background:    '#FAFAFA',
    surface:       '#FFFFFF',
    surfaceHover:  '#F5F5F5',
    text:          '#09090B',
    textMuted:     '#71717A',
    textOnPrimary: '#FFFFFF',
    border:        '#E4E4E7',
    error:         '#EF4444',
    success:       '#22C55E',
    warning:       '#F59E0B',
  },

  typography: {
    fontFamily:   "'Georgia', 'Times New Roman', system-ui, serif",
    scaleRem:     { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '2rem', '4xl': '2.5rem', '5xl': '3.5rem' },
    weights:      { normal: 400, medium: 500, semibold: 600, bold: 700 },
    lineHeights:  { tight: 1.2, normal: 1.65, relaxed: 1.8 },
    headingStyle: 'relaxed',
  },

  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '28px', xl: '48px', '2xl': '72px', '3xl': '96px' },

  borderRadius: { none: '0', sm: '4px', md: '8px', lg: '16px', xl: '24px', full: '9999px' },

  shadows: {
    sm: '0 1px 3px rgba(0,0,0,0.08)',
    md: '0 4px 16px rgba(0,0,0,0.10)',
    lg: '0 16px 40px rgba(0,0,0,0.12)',
  },

  transitions: 'all 0.2s ease',

  layout: {
    pageWidth:        '1200px',
    contentWidth:     '740px',
    navStyle:         'topbar',
    sectionSpacing:   '64px',
    contentStructure: 'centered',
    heroStyle:        'full-bleed',
  },

  componentRules: {
    buttons: { primaryRadius: 'full', primaryPadding: '10px 24px', primaryWeight: 600, primaryStyle: 'filled', secondaryStyle: 'outlined' },
    cards:   { radius: '12px', padding: '0', shadow: 'sm', hasBorder: false, background: 'surface', hoverStyle: 'lift' },
    inputs:  { radius: '8px', padding: '10px 14px', borderStyle: 'default', focusStyle: 'ring' },
    tables:  { headerBg: 'surfaceHover', rowBorder: false, compact: false, stickyHeader: false },
    badges:  { radius: 'full', padding: '3px 12px', style: 'soft-colored' },
    nav:     { type: 'topbar', height: '64px', activeStyle: 'underline', showAvatar: true },
    dialogs: { radius: '20px', backdropBlur: true, padding: '32px' },
    emptyStates:  { style: 'creator-prompt', iconSize: '64px', tone: 'expressive' },
    loadingStates: { style: 'skeleton', color: '#F5F5F5' },
  },

  mobileRules: {
    navigation:     'bottom-tabs',
    tapTargetSize:  '44px',
    cardStyle:      'full-width-stacked',
    baseFontSize:   '17px',
    modalStyle:     'sheet',
    layoutPatterns: ['content-feed', 'creator-profile', 'media-viewer', 'comment-thread', 'library-grid'],
  },

  webRules: {
    layout:          'topnav-content',
    heroStyle:       'full-bleed',
    sectionDividers: 'whitespace',
    layoutPatterns:  ['content-grid', 'creator-profile', 'article-reader', 'media-gallery', 'subscription-tiers', 'follower-feed'],
  },

  selectionSignals: {
    appTypes:    ['blog', 'creator', 'content', 'media', 'portfolio', 'newsletter', 'social', 'community'],
    keywords:    ['creator', 'content', 'blog', 'article', 'post', 'media', 'video', 'photo', 'gallery', 'portfolio', 'newsletter', 'subscribe', 'follow', 'audience', 'publish', 'read', 'watch', 'share', 'community'],
    platforms:   ['web', 'mobile'],
    complexity:  ['simple', 'medium', 'advanced'],
    tone:        ['friendly', 'playful', 'professional'],
    antiKeywords:['enterprise', 'internal', 'admin', 'ops'],
    baseScore:   4,
  },

  designNotes: 'Media-forward creator platform with serif headings for editorial feel. Content cards lead with the image, clean article reading layout with generous line-height. Creator profile is the central organizing element.',

  generationHints: [
    'Content card: image on top (no padding, aspect-ratio 16:9 or 3:2), then card body with category badge, title in serif bold, excerpt in regular, author avatar+name+date.',
    'Article/post reader: centered column (max 680px), serif font for body (1.1rem, 1.75 line-height), large hero image, author byline.',
    'Creator profile: full-width cover banner, avatar overlapping bottom (96px circle), name, tagline, subscriber count, social links, tabbed content (Posts/Gallery/About).',
    'Content grid: masonry or uniform grid. Category filter pills at top. Load more button at bottom.',
    'Subscription tiers: horizontal cards (Free / Pro / Premium). Highlighted middle tier with accent border.',
    'Navigation: sticky topbar, logo left, category links center, search + notification + avatar right.',
    'Comment thread: nested indent up to 3 levels, avatar + name + timestamp + content + like/reply buttons.',
    'Media gallery: grid with hover overlay showing title. Click opens lightbox/fullscreen viewer.',
  ],
};

module.exports = CREATOR_CONTENT;
