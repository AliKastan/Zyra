'use strict';

/**
 * Platform Stack Selection
 *
 * Maps each detected platform to the best-fit technology stack.
 * Stack refinement is done based on prompt keywords — e.g. "Expo" → expo variant.
 */

// ── Available stacks per platform ─────────────────────────────────────────────

const PLATFORM_STACKS = {

  web: {
    default: 'nextjs',
    variants: {
      nextjs: {
        platform:        'web',
        variant:         'nextjs',
        framework:       'Next.js',
        ui:              'React + Tailwind CSS',
        routing:         'Next.js App Router (file-based)',
        backend:         'Next.js API routes / Server Actions',
        dependencies:    ['next', 'react', 'react-dom'],
        devDependencies: ['tailwindcss', 'postcss', 'autoprefixer', '@types/node'],
        buildConfig:     { tool: 'Next.js', config: 'next.config.js' },
        entryFile:       'app/page.tsx',
      },
      vite_react: {
        platform:        'web',
        variant:         'vite_react',
        framework:       'React + Vite',
        ui:              'React + CSS Modules',
        routing:         'React Router v6',
        backend:         'Separate Express/Node.js API',
        dependencies:    ['react', 'react-dom', 'react-router-dom'],
        devDependencies: ['vite', '@vitejs/plugin-react'],
        buildConfig:     { tool: 'Vite', config: 'vite.config.js' },
        entryFile:       'src/main.jsx',
      },
      static: {
        platform:        'web',
        variant:         'static',
        framework:       'Vanilla HTML/CSS/JS',
        ui:              'Custom CSS',
        routing:         'Multi-page / hash routing',
        backend:         'Optional Express server',
        dependencies:    [],
        devDependencies: [],
        buildConfig:     { tool: 'none', config: null },
        entryFile:       'index.html',
      },
    },
  },

  mobile: {
    default: 'expo',
    variants: {
      expo: {
        platform:        'mobile',
        variant:         'expo',
        framework:       'Expo (React Native)',
        ui:              'React Native + Expo components',
        routing:         'Expo Router (file-based)',
        backend:         'REST API / tRPC',
        dependencies:    ['expo', 'react-native', 'expo-router', '@react-navigation/native'],
        devDependencies: ['@types/react-native', 'typescript'],
        buildConfig:     { tool: 'Expo', config: 'app.json' },
        entryFile:       'app/(tabs)/index.tsx',
      },
      react_native_cli: {
        platform:        'mobile',
        variant:         'react_native_cli',
        framework:       'React Native CLI',
        ui:              'React Native core components',
        routing:         'React Navigation v6',
        backend:         'REST API',
        dependencies:    ['react-native', '@react-navigation/native', '@react-navigation/stack'],
        devDependencies: ['@types/react-native', 'typescript', 'metro-config'],
        buildConfig:     { tool: 'Metro', config: 'metro.config.js' },
        entryFile:       'index.js',
      },
    },
  },

  desktop: {
    default: 'electron',
    variants: {
      electron: {
        platform:        'desktop',
        variant:         'electron',
        framework:       'Electron + React',
        ui:              'React + CSS',
        routing:         'React Router (memory/hash)',
        backend:         'Electron main process (Node.js)',
        dependencies:    ['electron', 'react', 'react-dom'],
        devDependencies: ['electron-builder', 'vite', '@vitejs/plugin-react', 'concurrently'],
        buildConfig:     { tool: 'Electron Builder', config: 'electron-builder.yml' },
        entryFile:       'src/main/index.js',
      },
      tauri: {
        platform:        'desktop',
        variant:         'tauri',
        framework:       'Tauri + React',
        ui:              'React + Tailwind CSS',
        routing:         'React Router v6',
        backend:         'Tauri Rust commands',
        dependencies:    ['react', 'react-dom', '@tauri-apps/api'],
        devDependencies: ['@tauri-apps/cli', 'vite', '@vitejs/plugin-react'],
        buildConfig:     { tool: 'Tauri', config: 'tauri.conf.json' },
        entryFile:       'src/main.jsx',
      },
    },
  },

  backend: {
    default: 'express',
    variants: {
      express: {
        platform:        'backend',
        variant:         'express',
        framework:       'Node.js + Express',
        ui:              'none',
        routing:         'Express Router',
        backend:         'Express middleware stack',
        dependencies:    ['express', 'cors', 'dotenv', 'helmet'],
        devDependencies: ['nodemon', 'jest', 'supertest'],
        buildConfig:     { tool: 'Node.js', config: 'package.json' },
        entryFile:       'src/server.js',
      },
      fastify: {
        platform:        'backend',
        variant:         'fastify',
        framework:       'Node.js + Fastify',
        ui:              'none',
        routing:         'Fastify plugin routes',
        backend:         'Fastify ecosystem',
        dependencies:    ['fastify', '@fastify/cors', 'dotenv'],
        devDependencies: ['nodemon', 'jest'],
        buildConfig:     { tool: 'Node.js', config: 'package.json' },
        entryFile:       'src/app.js',
      },
    },
  },
};

// ── Stack refinement keywords ─────────────────────────────────────────────────

const VARIANT_SIGNALS = {
  // Web
  'vite_react':       /\b(vite|react[_\s-]?only|spa|single[_\s-]?page[_\s-]?app)\b/i,
  'nextjs':           /\b(next\.?js|nextjs|ssr|server[_\s-]?side|app[_\s-]?router|vercel)\b/i,
  'static':           /\b(vanilla|plain[_\s-]?html|no[_\s-]?framework|pure[_\s-]?js|landing[_\s-]?page|simple[_\s-]?website)\b/i,
  // Mobile
  'expo':             /\b(expo|managed[_\s-]?workflow|eas[_\s-]?build)\b/i,
  'react_native_cli': /\b(react[_\s-]?native[_\s-]?cli|bare[_\s-]?workflow|native[_\s-]?module)\b/i,
  // Desktop
  'electron':         /\b(electron|chromium[_\s-]?desktop)\b/i,
  'tauri':            /\b(tauri|rust[_\s-]?backend)\b/i,
  // Backend
  'fastify':          /\b(fastify|fast[_\s-]?api)\b/i,
  'express':          /\b(express|expressjs|rest[_\s-]?api|node[_\s-]?server)\b/i,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Select the best platform stack for a given platform and prompt.
 *
 * @param {import('./types').PlatformType} platform
 * @param {string} [prompt]
 * @returns {import('./types').PlatformStack}
 */
function selectStack(platform, prompt) {
  const platformEntry = PLATFORM_STACKS[platform];
  if (!platformEntry) {
    return PLATFORM_STACKS.web.variants.nextjs; // safe fallback
  }

  const prompt_ = prompt || '';

  // Try to find a matching variant based on prompt keywords
  for (const [variantId, rx] of Object.entries(VARIANT_SIGNALS)) {
    const variantDef = platformEntry.variants[variantId];
    if (variantDef && rx.test(prompt_)) {
      return { ...variantDef };
    }
  }

  // Return default variant
  const defaultVariant = platformEntry.default;
  return { ...platformEntry.variants[defaultVariant] };
}

/**
 * List all available stacks for a platform.
 * @param {import('./types').PlatformType} platform
 * @returns {import('./types').PlatformStack[]}
 */
function listStacksForPlatform(platform) {
  const entry = PLATFORM_STACKS[platform];
  if (!entry) return [];
  return Object.values(entry.variants).map(v => ({ ...v }));
}

/**
 * Get a specific stack by variant ID.
 * @param {import('./types').PlatformType} platform
 * @param {string} variantId
 * @returns {import('./types').PlatformStack|null}
 */
function getStack(platform, variantId) {
  return PLATFORM_STACKS[platform]?.variants[variantId]
    ? { ...PLATFORM_STACKS[platform].variants[variantId] }
    : null;
}

module.exports = { selectStack, listStacksForPlatform, getStack, PLATFORM_STACKS };
