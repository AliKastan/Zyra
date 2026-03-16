'use strict';

/**
 * Platform Structure Definitions
 *
 * Defines project structure, file naming conventions, and core file lists
 * for each platform. Used to guide file generation and validate output.
 */

// ── Project structures per platform ──────────────────────────────────────────

const PLATFORM_STRUCTURES = {

  web: {
    // Next.js (App Router) — default web structure
    nextjs: {
      platform:    'web',
      directories: ['app', 'app/(auth)', 'components', 'lib', 'styles', 'public'],
      coreFiles: [
        'app/layout.tsx',
        'app/page.tsx',
        'app/globals.css',
        'components/ui/',
        'lib/utils.ts',
        'next.config.js',
        'package.json',
        'tsconfig.json',
        '.env.local',
        '.env.example',
      ],
      namingConventions: {
        components: 'PascalCase',
        routes:     'kebab-case (file-based)',
        services:   'camelCase',
        styles:     'kebab-case.module.css',
      },
      generationHints: [
        'Use Next.js App Router (app/ directory, not pages/)',
        'Create server components by default; use "use client" directive only when needed',
        'API routes go in app/api/[route]/route.ts',
        'Use next/navigation for routing (not react-router-dom)',
        'Add metadata export for SEO in layout.tsx',
        'Use server actions for form submissions when possible',
        'Include Tailwind CSS for styling',
        'Add loading.tsx and error.tsx for each route segment',
      ],
    },

    // Vite + React SPA
    vite_react: {
      platform:    'web',
      directories: ['src', 'src/components', 'src/pages', 'src/hooks', 'src/services', 'src/styles', 'public'],
      coreFiles: [
        'src/main.jsx',
        'src/App.jsx',
        'src/index.css',
        'index.html',
        'vite.config.js',
        'package.json',
        '.env',
        '.env.example',
      ],
      namingConventions: {
        components: 'PascalCase',
        routes:     'kebab-case',
        services:   'camelCase',
        styles:     'kebab-case.css',
      },
      generationHints: [
        'Use Vite as the build tool',
        'Use React Router v6 for client-side routing',
        'Keep API calls in src/services/',
        'Use .env for environment variables with VITE_ prefix',
        'Do NOT use Next.js-specific APIs (App Router, server actions, etc.)',
      ],
    },

    // Static HTML/CSS/JS
    static: {
      platform:    'web',
      directories: ['css', 'js', 'assets', 'assets/images'],
      coreFiles: [
        'index.html',
        'css/styles.css',
        'js/main.js',
        '.env.example',
      ],
      namingConventions: {
        components: 'kebab-case',
        routes:     'kebab-case.html',
        services:   'camelCase',
        styles:     'kebab-case',
      },
      generationHints: [
        'Use semantic HTML5 elements',
        'Plain CSS or CSS custom properties — no framework',
        'Vanilla JavaScript — no build step required',
        'Single index.html entry point',
      ],
    },
  },

  mobile: {
    expo: {
      platform:    'mobile',
      directories: ['app', 'app/(tabs)', 'components', 'screens', 'navigation', 'services', 'hooks', 'assets'],
      coreFiles: [
        'app/(tabs)/index.tsx',
        'app/(tabs)/_layout.tsx',
        'app/_layout.tsx',
        'components/',
        'services/',
        'app.json',
        'package.json',
        'tsconfig.json',
        '.env',
        '.env.example',
      ],
      namingConventions: {
        components: 'PascalCase',
        routes:     'kebab-case (file-based via Expo Router)',
        services:   'camelCase',
        styles:     'StyleSheet.create() inline',
      },
      generationHints: [
        'Use Expo Router for navigation (file-based routing in app/ directory)',
        'Use React Native core components (View, Text, TouchableOpacity, ScrollView)',
        'Use StyleSheet.create() for styles — NOT CSS classes',
        'Handle safe area with SafeAreaView or useSafeAreaInsets()',
        'Add loading and error states for all async data',
        'Use expo-constants for environment variables',
        'Implement offline-safe data handling with AsyncStorage',
        'Test touch targets — minimum 44x44 points',
        'Include platform-specific code with Platform.OS checks',
        'Use Expo APIs for device features (camera, location, notifications)',
      ],
    },

    react_native_cli: {
      platform:    'mobile',
      directories: ['src', 'src/screens', 'src/components', 'src/navigation', 'src/services', 'src/hooks', 'src/utils', 'assets'],
      coreFiles: [
        'index.js',
        'App.tsx',
        'src/navigation/RootNavigator.tsx',
        'src/screens/',
        'src/components/',
        'src/services/',
        'package.json',
        'tsconfig.json',
        '.env',
        '.env.example',
      ],
      namingConventions: {
        components: 'PascalCase',
        routes:     'PascalCase (stack navigator)',
        services:   'camelCase',
        styles:     'StyleSheet.create() inline',
      },
      generationHints: [
        'Use React Navigation v6 for navigation',
        'Use React Native core components only',
        'Create typed RootNavigator with stack/tab navigators',
        'StyleSheet.create() for all styles — no CSS',
        'Handle safe area with react-native-safe-area-context',
        'Use react-native-async-storage for local storage',
      ],
    },
  },

  desktop: {
    electron: {
      platform:    'desktop',
      directories: ['src', 'src/main', 'src/renderer', 'src/preload', 'src/renderer/components', 'src/renderer/pages', 'assets'],
      coreFiles: [
        'src/main/index.js',
        'src/preload/index.js',
        'src/renderer/index.html',
        'src/renderer/App.jsx',
        'src/renderer/main.jsx',
        'package.json',
        'vite.config.js',
        'electron-builder.yml',
        '.env.example',
      ],
      namingConventions: {
        components: 'PascalCase',
        routes:     'kebab-case',
        services:   'camelCase (IPC channel names)',
        styles:     'kebab-case.css',
      },
      generationHints: [
        'Separate main process (src/main/) from renderer process (src/renderer/)',
        'Use contextBridge in preload/index.js to expose safe APIs to renderer',
        'Never expose Node.js APIs directly to renderer (contextIsolation: true)',
        'Use ipcMain/ipcRenderer for main-renderer communication',
        'Use app.getPath() for user data, documents, downloads',
        'Add auto-updater with electron-updater',
        'Include native menus via Menu.buildFromTemplate()',
        'Use BrowserWindow with proper security settings',
        'Support filesystem access via dialog.showOpenDialog()',
      ],
    },

    tauri: {
      platform:    'desktop',
      directories: ['src', 'src/components', 'src/pages', 'src-tauri', 'src-tauri/src', 'public'],
      coreFiles: [
        'src/main.jsx',
        'src/App.jsx',
        'src-tauri/src/main.rs',
        'src-tauri/tauri.conf.json',
        'vite.config.js',
        'package.json',
        '.env.example',
      ],
      namingConventions: {
        components: 'PascalCase',
        routes:     'kebab-case',
        services:   'camelCase (Tauri commands)',
        styles:     'kebab-case.css',
      },
      generationHints: [
        'Use Tauri invoke() to call Rust backend commands',
        'Define Tauri commands in src-tauri/src/main.rs',
        'Use @tauri-apps/api for filesystem, dialog, shell access',
        'Frontend is a React SPA in src/',
        'Use tauri.conf.json for app configuration and permissions',
      ],
    },
  },

  backend: {
    express: {
      platform:    'backend',
      directories: ['src', 'src/routes', 'src/services', 'src/models', 'src/middleware', 'src/utils', 'src/config'],
      coreFiles: [
        'src/server.js',
        'src/app.js',
        'src/routes/index.js',
        'src/middleware/errorHandler.js',
        'src/middleware/authenticate.js',
        'src/config/env.js',
        'package.json',
        '.env',
        '.env.example',
        'README.md',
      ],
      namingConventions: {
        components: 'N/A (no UI)',
        routes:     'kebab-case (/api/resource-name)',
        services:   'camelCase (userService.js)',
        models:     'PascalCase (User.js)',
      },
      generationHints: [
        'No frontend/UI files — backend API only',
        'RESTful routes under /api/ prefix',
        'Use Express Router for route organization',
        'Include helmet, cors, express-rate-limit middleware',
        'Add a /health route for uptime monitoring',
        'Return consistent JSON: { success, data, error, message }',
        'Centralize error handling in middleware/errorHandler.js',
        'Load environment variables from .env via dotenv',
        'Include OpenAPI/Swagger documentation at /api/docs',
        'Stateless — no session storage (use JWT)',
      ],
    },

    fastify: {
      platform:    'backend',
      directories: ['src', 'src/routes', 'src/services', 'src/models', 'src/plugins', 'src/schemas'],
      coreFiles: [
        'src/app.js',
        'src/server.js',
        'src/routes/',
        'src/plugins/auth.js',
        'package.json',
        '.env',
        '.env.example',
      ],
      namingConventions: {
        components: 'N/A (no UI)',
        routes:     'kebab-case plugin files',
        services:   'camelCase',
        schemas:    'camelCase JSON schema objects',
      },
      generationHints: [
        'Use Fastify plugins for route organization',
        'Define JSON schemas for all request/response validation',
        'Use Fastify decorators for dependency injection',
        'Include @fastify/swagger for auto-generated API docs',
        'No frontend/UI files — backend API only',
      ],
    },
  },
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the project structure for a given platform and variant.
 * @param {import('./types').PlatformType} platform
 * @param {string} [variant]
 * @returns {import('./types').PlatformStructure}
 */
function getPlatformStructure(platform, variant) {
  const platformStructures = PLATFORM_STRUCTURES[platform];
  if (!platformStructures) return _defaultStructure(platform);

  // Try exact variant match, then default
  const defaults = { web: 'nextjs', mobile: 'expo', desktop: 'electron', backend: 'express' };
  const key = variant && platformStructures[variant] ? variant : defaults[platform];
  const struct = platformStructures[key];

  return struct ? { ...struct, platform } : _defaultStructure(platform);
}

/**
 * Get generation hints for a specific platform stack.
 * @param {import('./types').PlatformType} platform
 * @param {string} [variant]
 * @returns {string[]}
 */
function getGenerationHints(platform, variant) {
  const struct = getPlatformStructure(platform, variant);
  return struct.generationHints || [];
}

/**
 * Get a formatted hint block for the LLM coder prompt.
 * @param {import('./types').PlatformType} platform
 * @param {string} [variant]
 * @returns {string}
 */
function buildPlatformHintBlock(platform, variant) {
  const struct = getPlatformStructure(platform, variant);
  const hints  = struct.generationHints || [];
  if (hints.length === 0) return '';

  return [
    `### Platform: ${platform.toUpperCase()} (${variant || platform})`,
    `Project structure: ${struct.directories.join(', ')}`,
    '',
    'Generation rules:',
    ...hints.map(h => `- ${h}`),
  ].join('\n');
}

function _defaultStructure(platform) {
  return {
    platform,
    directories:        ['src'],
    coreFiles:          ['package.json', '.env.example'],
    namingConventions:  { components: 'PascalCase', routes: 'kebab-case', services: 'camelCase' },
    generationHints:    [],
  };
}

module.exports = { getPlatformStructure, getGenerationHints, buildPlatformHintBlock, PLATFORM_STRUCTURES };
