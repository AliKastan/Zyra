'use strict';

/**
 * Platform Rules
 *
 * Defines what IS and IS NOT allowed in each platform's generated output.
 * Used by the platform validator to detect incompatible patterns.
 */

// ── Rules per platform ────────────────────────────────────────────────────────

const PLATFORM_RULES = {

  web: {
    platform: 'web',
    mustInclude: [
      // At least one HTML file or React/JSX component
    ],
    mustExclude: [
      // Mobile-specific patterns
      'react-native',
      'expo',
      'StyleSheet.create',
      'TouchableOpacity',
      'FlatList',
      'ScrollView',
      'SafeAreaView',
      'NavigationContainer',
      'createStackNavigator',
      'createBottomTabNavigator',
      'AsyncStorage',
      'react-navigation',
      // Desktop-specific patterns
      'electron',
      'ipcMain',
      'ipcRenderer',
      'BrowserWindow',
      'contextBridge',
      'app.getPath',
      '@tauri-apps/api',
    ],
    fileExtensions:  ['.html', '.css', '.js', '.jsx', '.ts', '.tsx', '.json', '.svg', '.env', '.md'],
    generationHints: [
      'Use standard web APIs (fetch, localStorage, sessionStorage)',
      'Target browsers — do not use Node.js-specific APIs in frontend',
      'Support SSR/SEO — use semantic HTML with proper meta tags',
    ],
    validationChecks: [
      'no-mobile-navigation',
      'no-electron-apis',
      'has-html-or-jsx',
      'has-package-json',
    ],
  },

  mobile: {
    platform: 'mobile',
    mustInclude: [
      'react-native',
    ],
    mustExclude: [
      // Web-specific patterns that don't work in RN
      'document.',
      'window.location',
      'localStorage.',
      'sessionStorage.',
      '<html',
      '<body',
      '<div',
      '<span',
      '<p>',
      '.innerHTML',
      'next/navigation',
      'next/router',
      'next/link',
      'useRouter',   // next-specific
      // Desktop-specific
      'electron',
      'ipcMain',
      'BrowserWindow',
      '@tauri-apps/api',
    ],
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.png', '.jpg', '.svg'],
    generationHints: [
      'Use React Native core components only',
      'Use StyleSheet.create() for all styles — no CSS classes',
      'Use TouchableOpacity or Pressable for interactive elements',
      'Handle offline scenarios with AsyncStorage or MMKV',
    ],
    validationChecks: [
      'uses-react-native',
      'no-dom-apis',
      'no-next-apis',
      'has-navigation',
    ],
  },

  desktop: {
    platform: 'desktop',
    mustInclude: [],
    mustExclude: [
      // Mobile patterns
      'react-native',
      'expo',
      'StyleSheet.create',
      'TouchableOpacity',
      'AsyncStorage',
      // Disallow direct Node.js in renderer without contextBridge (security)
      // These are warnings rather than hard blocks:
    ],
    fileExtensions: ['.html', '.css', '.js', '.jsx', '.ts', '.tsx', '.json', '.rs', '.env'],
    generationHints: [
      'Separate main process from renderer process',
      'Use contextBridge for secure IPC communication',
      'Never access Node.js APIs directly from renderer without preload bridge',
    ],
    validationChecks: [
      'no-mobile-apis',
      'has-main-process-entry',
      'secure-context-bridge',
    ],
  },

  backend: {
    platform: 'backend',
    mustInclude: [],
    mustExclude: [
      // No UI in a backend service
      'react',
      'react-dom',
      '.jsx',
      '.tsx',
      '<html',
      '<div',
      'document.',
      'window.',
      'localStorage',
      // Mobile
      'react-native',
      'expo',
      // Desktop
      'electron',
      '@tauri-apps/api',
    ],
    fileExtensions: ['.js', '.ts', '.json', '.yaml', '.env', '.md', '.sql'],
    generationHints: [
      'No UI files — backend only',
      'Stateless design — store state in database or cache (Redis)',
      'All endpoints return consistent JSON format',
      'Include proper HTTP status codes for all responses',
    ],
    validationChecks: [
      'no-ui-files',
      'no-client-side-code',
      'has-api-routes',
      'has-health-endpoint',
    ],
  },
};

// ── Cross-platform incompatibility map ────────────────────────────────────────
// Patterns that should NOT appear in a given platform

const INCOMPATIBILITY_PATTERNS = {
  web: [
    { pattern: /react-native|expo|StyleSheet\.create|TouchableOpacity|FlatList|SafeAreaView|NavigationContainer|createBottomTabNavigator|AsyncStorage/i, message: 'Mobile-specific API detected in web project' },
    { pattern: /require\('electron'\)|ipcMain|ipcRenderer|BrowserWindow|contextBridge/i, message: 'Electron desktop API detected in web project' },
    { pattern: /@tauri-apps\/api/i, message: 'Tauri desktop API detected in web project' },
  ],
  mobile: [
    { pattern: /document\.|window\.location|localStorage\.|sessionStorage\.|innerHTML/i, message: 'Browser DOM API detected in mobile project (not available in React Native)' },
    { pattern: /next\/navigation|next\/router|next\/link/i, message: 'Next.js API detected in mobile project' },
    { pattern: /require\('electron'\)|ipcMain|ipcRenderer/i, message: 'Electron API detected in mobile project' },
    { pattern: /<html|<body|<div|<p>|<span/i, message: 'HTML markup detected in React Native project (use RN components instead)' },
  ],
  desktop: [
    { pattern: /react-native|expo|StyleSheet\.create|TouchableOpacity/i, message: 'Mobile-specific API detected in desktop project' },
  ],
  backend: [
    { pattern: /import\s+React|require\('react'\)|require\("react"\)|from\s+'react'|from\s+"react"/i, message: 'React UI library detected in backend service' },
    { pattern: /document\.|window\.|localStorage/i, message: 'Browser DOM API detected in backend service' },
    { pattern: /react-native|expo/i, message: 'Mobile framework detected in backend service' },
    { pattern: /require\('electron'\)|ipcMain/i, message: 'Electron API detected in backend service' },
  ],
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get rules for a given platform.
 * @param {import('./types').PlatformType} platform
 * @returns {import('./types').PlatformRules}
 */
function getPlatformRules(platform) {
  return PLATFORM_RULES[platform] || PLATFORM_RULES.web;
}

/**
 * Get incompatibility patterns for a given platform.
 * @param {import('./types').PlatformType} platform
 * @returns {Array<{ pattern: RegExp, message: string }>}
 */
function getIncompatibilityPatterns(platform) {
  return INCOMPATIBILITY_PATTERNS[platform] || [];
}

/**
 * Quick check: does a file path look compatible with the platform?
 * @param {string} filePath
 * @param {import('./types').PlatformType} platform
 * @returns {{ compatible: boolean, warning: string|null }}
 */
function checkFilePathCompatibility(filePath, platform) {
  const lp = filePath.toLowerCase();

  if (platform === 'backend') {
    if (/\.(jsx|tsx)$/.test(lp) || /\/components\/|\/pages\/|\/screens\//.test(lp)) {
      return { compatible: false, warning: `UI file path detected in backend project: ${filePath}` };
    }
  }
  if (platform === 'mobile') {
    if (/^pages\/|^app\//.test(lp) && !/expo|rn/.test(lp)) {
      return { compatible: false, warning: `Next.js-style pages/ directory in mobile project: ${filePath}` };
    }
  }

  return { compatible: true, warning: null };
}

module.exports = { getPlatformRules, getIncompatibilityPatterns, checkFilePathCompatibility, PLATFORM_RULES };
