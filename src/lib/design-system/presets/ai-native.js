'use strict';

/** @type {import('../types').DesignPresetDefinition} */
const AI_NATIVE = {
  name:        'AI_NATIVE',
  displayName: 'AI Native',
  description: 'Prompt/result interface for AI tools and LLM products. Structured output panels, monospace for code/output, modern productivity-first aesthetic.',
  visualTone:  'ai_focused',
  density:     'balanced',
  themeMode:   'light_dark_adaptive',

  colors: {
    primary:       '#7C3AED',
    primaryHover:  '#6D28D9',
    secondary:     '#06B6D4',
    accent:        '#10B981',
    background:    '#FAFAFA',
    surface:       '#FFFFFF',
    surfaceHover:  '#F5F5F5',
    text:          '#18181B',
    textMuted:     '#71717A',
    textOnPrimary: '#FFFFFF',
    border:        '#E4E4E7',
    error:         '#EF4444',
    success:       '#10B981',
    warning:       '#F59E0B',
  },

  typography: {
    fontFamily:   "'Inter', system-ui, -apple-system, sans-serif",
    monoFamily:   "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
    scaleRem:     { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.25rem', '5xl': '3rem' },
    weights:      { normal: 400, medium: 500, semibold: 600, bold: 700 },
    lineHeights:  { tight: 1.3, normal: 1.6, relaxed: 1.8 },
    headingStyle: 'balanced',
  },

  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '40px', '2xl': '64px', '3xl': '96px' },

  borderRadius: { none: '0', sm: '6px', md: '10px', lg: '16px', xl: '24px', full: '9999px' },

  shadows: {
    sm: '0 1px 3px rgba(0,0,0,0.06)',
    md: '0 4px 16px rgba(124,58,237,0.08), 0 2px 4px rgba(0,0,0,0.04)',
    lg: '0 12px 32px rgba(124,58,237,0.12)',
  },

  transitions: 'all 0.15s ease',

  layout: {
    pageWidth:        '100%',
    contentWidth:     '900px',
    navStyle:         'sidebar',
    sectionSpacing:   '32px',
    contentStructure: 'sidebar-main',
    heroStyle:        'centered',
  },

  componentRules: {
    buttons: { primaryRadius: '8px', primaryPadding: '10px 20px', primaryWeight: 600, primaryStyle: 'filled', secondaryStyle: 'soft' },
    cards:   { radius: '12px', padding: '20px', shadow: 'sm', hasBorder: true, background: 'surface', hoverStyle: 'border-accent' },
    inputs:  { radius: '8px', padding: '12px 16px', borderStyle: 'default', focusStyle: 'ring' },
    tables:  { headerBg: 'surfaceHover', rowBorder: true, compact: false, stickyHeader: false },
    badges:  { radius: 'full', padding: '2px 10px', style: 'soft-colored' },
    nav:     { type: 'sidebar', width: '256px', activeStyle: 'filled-subtle', showIcons: true },
    dialogs: { radius: '16px', backdropBlur: true, padding: '28px' },
    emptyStates:  { style: 'prompt-hint', iconSize: '48px', tone: 'branded' },
    loadingStates: { style: 'streaming-dots', color: 'primary' },
  },

  mobileRules: {
    navigation:     'bottom-tabs',
    tapTargetSize:  '44px',
    cardStyle:      'full-width-stacked',
    baseFontSize:   '16px',
    modalStyle:     'sheet',
    layoutPatterns: ['prompt-input', 'message-thread', 'result-card', 'tool-sheet'],
  },

  webRules: {
    layout:          'sidebar-content',
    heroStyle:       'centered',
    sectionDividers: 'whitespace',
    layoutPatterns:  ['prompt-main', 'result-panel', 'history-sidebar', 'settings-panel', 'model-selector'],
  },

  selectionSignals: {
    appTypes:    ['ai', 'ai_tool', 'chat', 'assistant', 'generator', 'tool', 'productivity'],
    keywords:    ['ai', 'gpt', 'llm', 'claude', 'openai', 'anthropic', 'gemini', 'chat', 'assistant', 'generate', 'prompt', 'model', 'neural', 'machine learning', 'chatbot', 'copilot', 'writing assistant', 'image generation', 'code generation'],
    platforms:   ['web', 'mobile'],
    complexity:  ['simple', 'medium', 'advanced'],
    tone:        ['professional', 'minimal'],
    antiKeywords:['booking', 'restaurant', 'local business', 'marketplace', 'ecommerce'],
    baseScore:   7,
  },

  designNotes: 'AI-product-first layout with a two-panel structure: sidebar for history/sessions + main area for prompt input and results. Monospace font for output areas. Violet as the primary brand color (signals intelligence + modernity).',

  generationHints: [
    'Two-panel layout: left sidebar (256px) lists conversation history or tool sessions. Right panel is the main workspace.',
    'Prompt input area: full-width textarea at the bottom of the main panel, with a send button. Auto-resizes as user types.',
    'Result/output panel: white card above the prompt area. Renders generated content with proper heading hierarchy.',
    'Code blocks inside output: monospace font (JetBrains Mono), dark background (#1E1E2E), syntax-highlighted, copy button top-right.',
    'Streaming indicator: three animated dots while AI is generating. "Stop generating" button appears.',
    'Sidebar history: each session as a compact list item (title = first message truncated, timestamp). Search bar at top.',
    'Model/settings selector: dropdown or popover above the prompt showing current model and parameters.',
    'Welcome/empty state: centered violet icon, "What would you like to create?", and 3-4 example prompt cards.',
    'Token/usage counter: subtle display in the toolbar or sidebar footer showing remaining credits or usage.',
  ],
};

module.exports = AI_NATIVE;
