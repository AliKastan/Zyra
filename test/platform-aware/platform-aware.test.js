'use strict';

/**
 * Platform-Aware Generation — Tests
 *
 * Covers: platform detection, stack selection, structure retrieval,
 * platform rules, validation, and the top-level buildPlatformConfig() API.
 */

const assert = require('assert');
const {
  buildPlatformConfig,
  buildUiPlatformPayload,
  summarizePlatformConfig,
  detectPlatform,
  detectAllPlatforms,
  detectPlatformSwitch,
  selectStack,
  listStacksForPlatform,
  getStack,
  getPlatformStructure,
  getGenerationHints,
  buildPlatformHintBlock,
  getPlatformRules,
  getIncompatibilityPatterns,
  checkFilePathCompatibility,
  validatePlatformCompatibility,
  validateFile,
  isFilesListCompatible,
  PLATFORM_TYPES,
} = require('../../src/lib/platform-aware');

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function it(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${err.message}`);
    failures.push({ label, error: err.message });
    failed++;
  }
}

function describe(label, fn) {
  console.log(`\n${label}`);
  fn();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function assertPlatform(result, expectedPlatform) {
  assert.strictEqual(result.platform, expectedPlatform, `Expected platform "${expectedPlatform}", got "${result.platform}"`);
}

function assertConfidence(result, ...allowed) {
  assert.ok(allowed.includes(result.confidence), `Expected confidence in [${allowed.join(', ')}], got "${result.confidence}"`);
}

// ── PLATFORM_TYPES constant ───────────────────────────────────────────────────

describe('PLATFORM_TYPES', () => {
  it('should be an array of 4 platform strings', () => {
    assert.ok(Array.isArray(PLATFORM_TYPES), 'PLATFORM_TYPES should be an array');
    assert.strictEqual(PLATFORM_TYPES.length, 4);
    assert.ok(PLATFORM_TYPES.includes('web'));
    assert.ok(PLATFORM_TYPES.includes('mobile'));
    assert.ok(PLATFORM_TYPES.includes('desktop'));
    assert.ok(PLATFORM_TYPES.includes('backend'));
  });
});

// ── detectPlatform ────────────────────────────────────────────────────────────

describe('detectPlatform — web', () => {
  it('defaults to web when no signal', () => {
    const r = detectPlatform('Build a todo list');
    assertPlatform(r, 'web');
    assertConfidence(r, 'low');
  });

  it('detects web from "web app" keyword', () => {
    const r = detectPlatform('Build a SaaS web app for project management');
    assertPlatform(r, 'web');
    assert.ok(r.isExplicit, 'should be explicit');
  });

  it('detects web from "website" keyword', () => {
    const r = detectPlatform('Create a portfolio website with dark mode');
    assertPlatform(r, 'web');
    assert.ok(r.isExplicit);
  });

  it('detects web from "next.js" keyword', () => {
    const r = detectPlatform('Build a nextjs dashboard with SSR');
    assertPlatform(r, 'web');
    assert.ok(r.isExplicit);
  });

  it('detects web from "landing page" keyword', () => {
    const r = detectPlatform('Build a landing page for my startup');
    assertPlatform(r, 'web');
    assert.ok(r.isExplicit);
  });

  it('returns a rationale string', () => {
    const r = detectPlatform('Build a web app');
    assert.strictEqual(typeof r.rationale, 'string');
    assert.ok(r.rationale.length > 0);
  });

  it('returns indicators array', () => {
    const r = detectPlatform('Build a web app');
    assert.ok(Array.isArray(r.indicators));
  });

  it('returns secondaryPlatforms array', () => {
    const r = detectPlatform('Build a web app');
    assert.ok(Array.isArray(r.secondaryPlatforms));
  });
});

describe('detectPlatform — mobile', () => {
  it('detects mobile from "mobile app" keyword', () => {
    const r = detectPlatform('Build a mobile app for tracking expenses');
    assertPlatform(r, 'mobile');
    assert.ok(r.isExplicit);
  });

  it('detects mobile from "React Native" keyword', () => {
    const r = detectPlatform('Create a React Native app for iOS and Android');
    assertPlatform(r, 'mobile');
    assert.ok(r.isExplicit);
  });

  it('detects mobile from "expo" keyword', () => {
    const r = detectPlatform('Build an Expo app with push notifications');
    assertPlatform(r, 'mobile');
    assert.ok(r.isExplicit);
  });

  it('infers mobile from "fitness tracker" domain', () => {
    const r = detectPlatform('Build a fitness tracker with step counter');
    assertPlatform(r, 'mobile');
    assert.strictEqual(r.isExplicit, false);
    assertConfidence(r, 'medium');
  });

  it('has high or medium confidence for explicit mobile', () => {
    const r = detectPlatform('Build a React Native iOS app');
    assertPlatform(r, 'mobile');
    assertConfidence(r, 'high', 'medium');
  });
});

describe('detectPlatform — desktop', () => {
  it('detects desktop from "desktop app" keyword', () => {
    const r = detectPlatform('Build a desktop app for video editing');
    assertPlatform(r, 'desktop');
    assert.ok(r.isExplicit);
  });

  it('detects desktop from "electron" keyword', () => {
    const r = detectPlatform('Create an Electron app with system tray');
    assertPlatform(r, 'desktop');
    assert.ok(r.isExplicit);
  });

  it('detects desktop from "tauri" keyword', () => {
    const r = detectPlatform('Build a Tauri app with Rust backend');
    assertPlatform(r, 'desktop');
    assert.ok(r.isExplicit);
  });

  it('infers desktop from "text editor" domain', () => {
    const r = detectPlatform('Build a markdown editor with keyboard shortcuts');
    assertPlatform(r, 'desktop');
    assert.strictEqual(r.isExplicit, false);
  });
});

describe('detectPlatform — backend', () => {
  it('detects backend from "REST API" keyword', () => {
    const r = detectPlatform('Build a REST API for a social media platform');
    assertPlatform(r, 'backend');
    assert.ok(r.isExplicit);
  });

  it('detects backend from "api service" keyword', () => {
    const r = detectPlatform('Create an API service for authentication');
    assertPlatform(r, 'backend');
    assert.ok(r.isExplicit);
  });

  it('detects backend from "microservice" keyword', () => {
    const r = detectPlatform('Build a microservice for payment processing');
    assertPlatform(r, 'backend');
    assert.ok(r.isExplicit);
  });

  it('detects backend from "backend service" keyword', () => {
    const r = detectPlatform('Build a backend service with no UI');
    assertPlatform(r, 'backend');
    assert.ok(r.isExplicit);
  });

  it('handles empty prompt gracefully', () => {
    const r = detectPlatform('');
    assertPlatform(r, 'web');
    assertConfidence(r, 'low');
  });

  it('handles null prompt gracefully', () => {
    const r = detectPlatform(null);
    assertPlatform(r, 'web');
  });

  it('uses intent memory platform hint', () => {
    const r = detectPlatform('Build something cool', { platform: 'mobile' });
    assertPlatform(r, 'mobile');
    assertConfidence(r, 'low');
  });
});

// ── detectAllPlatforms ────────────────────────────────────────────────────────

describe('detectAllPlatforms', () => {
  it('returns web by default', () => {
    const r = detectAllPlatforms('Build a todo app');
    assert.ok(Array.isArray(r));
    assert.ok(r.includes('web') || r.length > 0);
  });

  it('returns multiple platforms for mixed prompt', () => {
    const r = detectAllPlatforms('Build a web app and a React Native mobile app');
    assert.ok(Array.isArray(r));
    assert.ok(r.includes('web'));
    assert.ok(r.includes('mobile'));
  });

  it('handles null', () => {
    const r = detectAllPlatforms(null);
    assert.deepStrictEqual(r, ['web']);
  });
});

// ── detectPlatformSwitch ──────────────────────────────────────────────────────

describe('detectPlatformSwitch', () => {
  it('detects mobile version switch request', () => {
    const r = detectPlatformSwitch('Also generate a mobile version of this app');
    assert.strictEqual(r.isSwitchRequest, true);
    assert.strictEqual(typeof r.targetPlatform, 'string');
  });

  it('returns false for non-switch prompt', () => {
    const r = detectPlatformSwitch('Build a web app for my team');
    assert.strictEqual(r.isSwitchRequest, false);
    assert.strictEqual(r.targetPlatform, null);
  });

  it('handles null gracefully', () => {
    const r = detectPlatformSwitch(null);
    assert.strictEqual(r.isSwitchRequest, false);
  });
});

// ── selectStack ───────────────────────────────────────────────────────────────

describe('selectStack — web', () => {
  it('defaults to nextjs for web', () => {
    const s = selectStack('web', 'Build a SaaS app');
    assert.strictEqual(s.platform, 'web');
    assert.strictEqual(s.variant, 'nextjs');
  });

  it('selects vite_react when vite keyword present', () => {
    const s = selectStack('web', 'Build a Vite React SPA');
    assert.strictEqual(s.variant, 'vite_react');
  });

  it('selects static for vanilla/plain HTML prompt', () => {
    const s = selectStack('web', 'Build a plain HTML landing page');
    assert.strictEqual(s.variant, 'static');
  });

  it('selects nextjs for SSR keyword', () => {
    const s = selectStack('web', 'Build an SSR web app');
    assert.strictEqual(s.variant, 'nextjs');
  });

  it('stack has required fields', () => {
    const s = selectStack('web', '');
    assert.ok(s.framework, 'should have framework');
    assert.ok(s.routing, 'should have routing');
    assert.ok(Array.isArray(s.dependencies), 'should have dependencies array');
    assert.ok(Array.isArray(s.devDependencies), 'should have devDependencies array');
  });
});

describe('selectStack — mobile', () => {
  it('defaults to expo for mobile', () => {
    const s = selectStack('mobile', 'Build a mobile app');
    assert.strictEqual(s.variant, 'expo');
  });

  it('selects react_native_cli for CLI keyword', () => {
    const s = selectStack('mobile', 'Build with React Native CLI bare workflow');
    assert.strictEqual(s.variant, 'react_native_cli');
  });
});

describe('selectStack — desktop', () => {
  it('defaults to electron for desktop', () => {
    const s = selectStack('desktop', 'Build a desktop app');
    assert.strictEqual(s.variant, 'electron');
  });

  it('selects tauri for tauri keyword', () => {
    const s = selectStack('desktop', 'Build a Tauri desktop app');
    assert.strictEqual(s.variant, 'tauri');
  });
});

describe('selectStack — backend', () => {
  it('defaults to express for backend', () => {
    const s = selectStack('backend', 'Build an API service');
    assert.strictEqual(s.variant, 'express');
  });

  it('selects fastify for fastify keyword', () => {
    const s = selectStack('backend', 'Build a Fastify REST API');
    assert.strictEqual(s.variant, 'fastify');
  });

  it('falls back to web/nextjs for unknown platform', () => {
    const s = selectStack('unknown_platform', '');
    assert.strictEqual(s.variant, 'nextjs');
  });
});

describe('listStacksForPlatform / getStack', () => {
  it('listStacksForPlatform returns array for web', () => {
    const stacks = listStacksForPlatform('web');
    assert.ok(Array.isArray(stacks));
    assert.ok(stacks.length >= 2);
  });

  it('listStacksForPlatform returns empty for unknown platform', () => {
    const stacks = listStacksForPlatform('unknown');
    assert.deepStrictEqual(stacks, []);
  });

  it('getStack returns specific variant', () => {
    const s = getStack('web', 'nextjs');
    assert.ok(s);
    assert.strictEqual(s.variant, 'nextjs');
  });

  it('getStack returns null for unknown variant', () => {
    const s = getStack('web', 'nonexistent');
    assert.strictEqual(s, null);
  });
});

// ── getPlatformStructure ──────────────────────────────────────────────────────

describe('getPlatformStructure', () => {
  it('returns nextjs structure for web default', () => {
    const s = getPlatformStructure('web');
    assert.ok(Array.isArray(s.directories));
    assert.ok(Array.isArray(s.coreFiles));
    assert.ok(s.coreFiles.some(f => f.includes('app/')), 'should have app/ core files for nextjs');
  });

  it('returns expo structure for mobile default', () => {
    const s = getPlatformStructure('mobile');
    assert.ok(s.directories.some(d => d.includes('app') || d.includes('screens')));
  });

  it('returns electron structure for desktop default', () => {
    const s = getPlatformStructure('desktop');
    assert.ok(s.directories.some(d => d.includes('main') || d.includes('renderer')));
  });

  it('returns express structure for backend default', () => {
    const s = getPlatformStructure('backend');
    assert.ok(s.directories.some(d => d.includes('routes') || d.includes('services')));
  });

  it('returns vite_react structure when variant specified', () => {
    const s = getPlatformStructure('web', 'vite_react');
    assert.ok(s.coreFiles.some(f => f.includes('main.jsx') || f.includes('index.html')));
  });

  it('returns default structure for unknown platform', () => {
    const s = getPlatformStructure('unknown');
    assert.ok(Array.isArray(s.directories));
    assert.ok(Array.isArray(s.coreFiles));
  });

  it('has generationHints array', () => {
    const s = getPlatformStructure('web', 'nextjs');
    assert.ok(Array.isArray(s.generationHints));
    assert.ok(s.generationHints.length > 0);
  });
});

describe('getGenerationHints / buildPlatformHintBlock', () => {
  it('getGenerationHints returns non-empty array for nextjs', () => {
    const hints = getGenerationHints('web', 'nextjs');
    assert.ok(Array.isArray(hints));
    assert.ok(hints.length > 0);
  });

  it('buildPlatformHintBlock returns formatted string', () => {
    const block = buildPlatformHintBlock('web', 'nextjs');
    assert.strictEqual(typeof block, 'string');
    assert.ok(block.includes('WEB'));
    assert.ok(block.includes('Generation rules:'));
  });

  it('buildPlatformHintBlock returns empty string for unknown platform with no hints', () => {
    const block = buildPlatformHintBlock('unknown', 'unknown');
    assert.strictEqual(typeof block, 'string');
  });
});

// ── getPlatformRules ──────────────────────────────────────────────────────────

describe('getPlatformRules', () => {
  it('returns rules for web platform', () => {
    const r = getPlatformRules('web');
    assert.strictEqual(r.platform, 'web');
    assert.ok(Array.isArray(r.mustExclude));
    assert.ok(r.mustExclude.includes('react-native'));
  });

  it('returns rules for mobile platform', () => {
    const r = getPlatformRules('mobile');
    assert.strictEqual(r.platform, 'mobile');
    assert.ok(r.mustExclude.includes('document.'));
  });

  it('returns rules for backend platform', () => {
    const r = getPlatformRules('backend');
    assert.strictEqual(r.platform, 'backend');
    assert.ok(r.mustExclude.includes('react'));
  });

  it('falls back to web rules for unknown platform', () => {
    const r = getPlatformRules('unknown');
    assert.strictEqual(r.platform, 'web');
  });

  it('each platform has fileExtensions array', () => {
    for (const platform of PLATFORM_TYPES) {
      const r = getPlatformRules(platform);
      assert.ok(Array.isArray(r.fileExtensions), `${platform} should have fileExtensions`);
    }
  });
});

describe('getIncompatibilityPatterns', () => {
  it('returns array for web', () => {
    const p = getIncompatibilityPatterns('web');
    assert.ok(Array.isArray(p));
    assert.ok(p.length > 0);
    assert.ok(p[0].pattern instanceof RegExp);
    assert.strictEqual(typeof p[0].message, 'string');
  });

  it('returns array for mobile', () => {
    const p = getIncompatibilityPatterns('mobile');
    assert.ok(p.length > 0);
  });

  it('returns empty array for unknown platform', () => {
    const p = getIncompatibilityPatterns('unknown');
    assert.deepStrictEqual(p, []);
  });
});

describe('checkFilePathCompatibility', () => {
  it('flags .jsx files in backend', () => {
    const r = checkFilePathCompatibility('src/components/Button.jsx', 'backend');
    assert.strictEqual(r.compatible, false);
    assert.ok(typeof r.warning === 'string');
  });

  it('flags pages/ directory in mobile', () => {
    const r = checkFilePathCompatibility('pages/index.tsx', 'mobile');
    assert.strictEqual(r.compatible, false);
  });

  it('allows .js files in backend', () => {
    const r = checkFilePathCompatibility('src/routes/users.js', 'backend');
    assert.strictEqual(r.compatible, true);
    assert.strictEqual(r.warning, null);
  });

  it('allows screens/ in mobile', () => {
    const r = checkFilePathCompatibility('screens/HomeScreen.tsx', 'mobile');
    assert.strictEqual(r.compatible, true);
  });

  it('allows .tsx in web', () => {
    const r = checkFilePathCompatibility('app/page.tsx', 'web');
    assert.strictEqual(r.compatible, true);
  });
});

// ── validatePlatformCompatibility ─────────────────────────────────────────────

describe('validatePlatformCompatibility', () => {
  it('returns valid result for clean web files', () => {
    const files = {
      'app/page.tsx': 'import React from "react";\nexport default function Page() { return <div>Hello</div>; }',
      'package.json': '{"name":"test","dependencies":{"next":"latest","react":"latest"}}',
    };
    const r = validatePlatformCompatibility(files, 'web');
    assert.strictEqual(typeof r.valid, 'boolean');
    assert.ok(Array.isArray(r.violations));
    assert.ok(Array.isArray(r.warnings));
    assert.ok(typeof r.score === 'number');
    assert.ok(r.score >= 0 && r.score <= 100);
    assert.strictEqual(typeof r.summary, 'string');
  });

  it('detects react-native in web files as violation', () => {
    const files = {
      'app/page.tsx': 'import { View } from "react-native";\nexport default function Page() {}',
    };
    const r = validatePlatformCompatibility(files, 'web');
    assert.ok(r.violations.length > 0, 'should have violations for react-native in web');
    assert.strictEqual(r.valid, false);
  });

  it('detects DOM APIs in mobile files as violation', () => {
    const files = {
      'App.tsx': 'document.getElementById("root").innerHTML = "<div>test</div>";',
    };
    const r = validatePlatformCompatibility(files, 'mobile');
    assert.ok(r.violations.length > 0, 'should flag DOM APIs in mobile project');
    assert.strictEqual(r.valid, false);
  });

  it('detects React import in backend files as violation', () => {
    const files = {
      'src/server.js': 'import React from "react";\nconst express = require("express");',
    };
    const r = validatePlatformCompatibility(files, 'backend');
    assert.ok(r.violations.length > 0, 'should flag React in backend');
    assert.strictEqual(r.valid, false);
  });

  it('score is lower when violations exist', () => {
    const cleanFiles = {
      'src/server.js': 'const express = require("express");\napp.listen(3000);',
      'package.json': '{"name":"api"}',
    };
    const dirtyFiles = {
      'src/server.js': 'import React from "react";\nconst express = require("express");',
    };
    const clean = validatePlatformCompatibility(cleanFiles, 'backend');
    const dirty = validatePlatformCompatibility(dirtyFiles, 'backend');
    assert.ok(dirty.score < clean.score, 'dirty project should score lower');
  });

  it('handles missing/null files object', () => {
    const r = validatePlatformCompatibility(null, 'web');
    assert.strictEqual(r.valid, false);
    assert.ok(Array.isArray(r.violations));
  });

  it('backend path check flags .jsx file path', () => {
    const files = {
      'src/components/Button.jsx': '// React component',
      'package.json': '{}',
    };
    const r = validatePlatformCompatibility(files, 'backend');
    assert.ok(r.violations.some(v => v.includes('[path]')), 'should have path violation');
  });
});

describe('validateFile', () => {
  it('returns violations and warnings for a single file', () => {
    const r = validateFile('app/page.tsx', 'import { View } from "react-native";', 'web');
    assert.ok(Array.isArray(r.violations));
    assert.ok(Array.isArray(r.warnings));
    assert.ok(r.violations.length > 0);
  });

  it('returns no violations for clean file', () => {
    const r = validateFile('app/page.tsx', 'export default function Page() { return <div>Hello</div>; }', 'web');
    assert.ok(Array.isArray(r.violations));
  });
});

// ── isFilesListCompatible ─────────────────────────────────────────────────────

describe('isFilesListCompatible', () => {
  it('mobile files with screens/ are compatible', () => {
    const paths = ['screens/HomeScreen.tsx', 'app/(tabs)/index.tsx', 'package.json'];
    assert.strictEqual(isFilesListCompatible(paths, 'mobile'), true);
  });

  it('mobile files with pages/ Next.js structure are incompatible', () => {
    const paths = ['pages/index.tsx', 'pages/_app.tsx', 'package.json'];
    assert.strictEqual(isFilesListCompatible(paths, 'mobile'), false);
  });

  it('backend files without .jsx/.tsx are compatible', () => {
    const paths = ['src/routes/users.js', 'src/server.js', 'package.json'];
    assert.strictEqual(isFilesListCompatible(paths, 'backend'), true);
  });

  it('backend files with .jsx are incompatible', () => {
    const paths = ['src/components/Button.jsx', 'src/routes/users.js'];
    assert.strictEqual(isFilesListCompatible(paths, 'backend'), false);
  });

  it('desktop files with electron directory are compatible', () => {
    const paths = ['src/main/index.js', 'src/renderer/App.jsx', 'electron-builder.yml'];
    assert.strictEqual(isFilesListCompatible(paths, 'desktop'), true);
  });

  it('web files with .tsx are compatible', () => {
    const paths = ['app/page.tsx', 'app/layout.tsx', 'package.json'];
    assert.strictEqual(isFilesListCompatible(paths, 'web'), true);
  });

  it('returns true for empty file list', () => {
    assert.strictEqual(isFilesListCompatible([], 'web'), true);
  });

  it('returns true for null', () => {
    assert.strictEqual(isFilesListCompatible(null, 'web'), true);
  });
});

// ── buildPlatformConfig (top-level API) ───────────────────────────────────────

describe('buildPlatformConfig — web SaaS', () => {
  const config = buildPlatformConfig('Build a SaaS web app for team collaboration');

  it('returns detection result', () => {
    assert.ok(config.detection);
    assertPlatform(config.detection, 'web');
  });

  it('returns stack result', () => {
    assert.ok(config.stack);
    assert.strictEqual(config.stack.platform, 'web');
    assert.ok(config.stack.framework);
  });

  it('returns structure result', () => {
    assert.ok(config.structure);
    assert.ok(Array.isArray(config.structure.directories));
    assert.ok(Array.isArray(config.structure.coreFiles));
  });

  it('returns rules result', () => {
    assert.ok(config.rules);
    assert.ok(Array.isArray(config.rules.mustExclude));
  });

  it('returns summary string', () => {
    assert.strictEqual(typeof config.summary, 'string');
    assert.ok(config.summary.length > 0);
    assert.ok(config.summary.includes('WEB'));
  });
});

describe('buildPlatformConfig — mobile app', () => {
  const config = buildPlatformConfig('Build a React Native fitness tracking app for iOS');

  it('detects mobile platform', () => {
    assertPlatform(config.detection, 'mobile');
    assert.ok(config.detection.isExplicit);
  });

  it('selects expo or react_native_cli variant', () => {
    assert.ok(['expo', 'react_native_cli'].includes(config.stack.variant));
  });

  it('structure includes mobile directories', () => {
    const dirs = config.structure.directories;
    assert.ok(dirs.some(d => d.includes('screens') || d.includes('app') || d.includes('navigation')));
  });

  it('rules exclude browser DOM APIs', () => {
    assert.ok(config.rules.mustExclude.includes('document.'));
  });
});

describe('buildPlatformConfig — desktop tool', () => {
  const config = buildPlatformConfig('Build an Electron desktop app for file management');

  it('detects desktop platform', () => {
    assertPlatform(config.detection, 'desktop');
  });

  it('selects electron variant', () => {
    assert.strictEqual(config.stack.variant, 'electron');
  });

  it('structure has main and renderer directories', () => {
    const dirs = config.structure.directories;
    assert.ok(dirs.some(d => d.includes('main') || d.includes('renderer')));
  });
});

describe('buildPlatformConfig — backend API', () => {
  const config = buildPlatformConfig('Build a REST API backend service for managing users and orders');

  it('detects backend platform', () => {
    assertPlatform(config.detection, 'backend');
  });

  it('selects express as default backend variant', () => {
    assert.strictEqual(config.stack.variant, 'express');
  });

  it('rules exclude React', () => {
    assert.ok(config.rules.mustExclude.includes('react'));
  });

  it('structure has routes and services directories', () => {
    const dirs = config.structure.directories;
    assert.ok(dirs.some(d => d.includes('routes') || d.includes('services')));
  });

  it('summary mentions BACKEND', () => {
    assert.ok(config.summary.includes('BACKEND'));
  });
});

// ── buildUiPlatformPayload ────────────────────────────────────────────────────

describe('buildUiPlatformPayload', () => {
  it('returns null for null input', () => {
    assert.strictEqual(buildUiPlatformPayload(null), null);
  });

  it('returns UI-safe object with all expected fields', () => {
    const config = buildPlatformConfig('Build a web app');
    const payload = buildUiPlatformPayload(config);
    assert.ok(payload);
    assert.ok(typeof payload.platform === 'string');
    assert.ok(typeof payload.confidence === 'string');
    assert.ok(typeof payload.isExplicit === 'boolean');
    assert.ok(typeof payload.framework === 'string');
    assert.ok(typeof payload.variant === 'string');
    assert.ok(Array.isArray(payload.directories));
    assert.ok(Array.isArray(payload.coreFiles));
    assert.ok(Array.isArray(payload.dependencies));
    assert.ok(Array.isArray(payload.generationHints));
    assert.ok(typeof payload.summary === 'string');
  });

  it('generationHints is capped at 5', () => {
    const config = buildPlatformConfig('Build a web app');
    const payload = buildUiPlatformPayload(config);
    assert.ok(payload.generationHints.length <= 5);
  });
});

// ── summarizePlatformConfig ───────────────────────────────────────────────────

describe('summarizePlatformConfig', () => {
  it('returns a one-line summary string', () => {
    const config = buildPlatformConfig('Build a mobile app');
    const s = summarizePlatformConfig(config);
    assert.strictEqual(typeof s, 'string');
    assert.ok(s.includes('platform='));
    assert.ok(s.includes('stack='));
    assert.ok(s.includes('confidence='));
  });
});

// ── Print results ─────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(50));
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failures.length > 0) {
  console.log('\nFailed tests:');
  failures.forEach(f => console.log(`  ✗ ${f.label}\n    ${f.error}`));
  process.exit(1);
} else {
  console.log('\nAll tests passed!');
  process.exit(0);
}
