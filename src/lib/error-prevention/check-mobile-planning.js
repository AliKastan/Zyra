'use strict';

/**
 * Mobile Planning Checks
 *
 * Ensures Expo/React Native apps have essential structural planning:
 * - navigation shell
 * - app config (app.json)
 * - mobile-safe storage assumptions
 * - screen structure
 */

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {import('./types').PreventionInput} input
 * @returns {import('./types').PreventionIssue[]}
 */
function checkMobilePlanning(input) {
  const { intent = {}, product = {}, stack = {}, blueprint = {}, complexityReport = null } = input;

  const issues = [];
  const allText  = _buildAllText(intent, product, blueprint, stack);
  const signals  = complexityReport?.signals || {};
  const fileList = _getFileList(stack, blueprint);
  const appType  = (intent.appType || '').toLowerCase();

  const isMobile = (
    appType === 'mobile' ||
    signals.hasMobile ||
    /\b(expo|react.native|mobile.app|ios|android|react native|app store|play store|native app)\b/.test(allText)
  );

  if (!isMobile) return issues;

  // ── Navigation structure ──────────────────────────────────────────────────
  const hasNavigation = (
    allText.includes('navigation') ||
    allText.includes('navigator') ||
    allText.includes('@react-navigation') ||
    fileList.some(f => /nav|navigation|screen|stack|tab/i.test(f))
  );

  if (!hasNavigation) {
    issues.push({
      id: 'mobile-missing-navigation-shell',
      category: 'mobile_navigation',
      severity: 'high',
      action: 'generation_hint_added',
      reason: 'Mobile apps require a navigation structure. Without it, screens cannot be connected and the app cannot be used.',
      fix: 'Plan a navigation setup using @react-navigation/native with Stack or Tab navigator',
    });
  }

  // ── App.json / Expo config ────────────────────────────────────────────────
  const hasAppConfig = fileList.some(f =>
    f === 'app.json' || f.endsWith('/app.json') || f.endsWith('app.config.js'),
  );

  if (!hasAppConfig) {
    issues.push({
      id: 'mobile-missing-app-config',
      category: 'stack_coherence',
      severity: 'high',
      action: 'safe_default_injected',
      reason: 'Expo requires app.json for all builds. Missing this file will cause Expo build failure.',
      fix: 'Add app.json to planned files with name, slug, version, and sdkVersion fields',
    });
  }

  // ── Screen files planned ──────────────────────────────────────────────────
  const hasScreens = fileList.some(f =>
    /screen|screens/i.test(f) ||
    f.endsWith('Screen.js') || f.endsWith('Screen.tsx'),
  );

  const hasPages = (product.pages || []).length > 0;

  if (!hasScreens && hasPages) {
    issues.push({
      id: 'mobile-missing-screen-files',
      category: 'mobile_navigation',
      severity: 'medium',
      action: 'generation_hint_added',
      reason: `App has ${(product.pages || []).length} pages planned but no screen files in the file map.`,
      fix: 'Add screen files (e.g. screens/HomeScreen.js) for each planned page',
    });
  }

  // ── Mobile-safe storage ───────────────────────────────────────────────────
  const usesLocalStorage = allText.includes('localstorage');
  if (usesLocalStorage) {
    issues.push({
      id: 'mobile-unsafe-localstorage',
      category: 'stack_coherence',
      severity: 'high',
      action: 'generation_hint_added',
      reason: 'localStorage is not available in React Native. Using it will cause a runtime crash on mobile.',
      fix: 'Use AsyncStorage (@react-native-async-storage/async-storage) instead of localStorage',
    });
  }

  // ── expo-router vs React Navigation ──────────────────────────────────────
  const usesExpoRouter = allText.includes('expo-router') || fileList.some(f => f.startsWith('app/') || f.includes('/app/'));
  if (!usesExpoRouter && !hasNavigation) {
    issues.push({
      id: 'mobile-no-navigation-library-mentioned',
      category: 'mobile_navigation',
      severity: 'medium',
      action: 'warning_only',
      reason: 'No navigation library (expo-router or @react-navigation) is mentioned in the plan.',
      fix: 'Explicitly plan either expo-router or @react-navigation/native',
    });
  }

  return issues;
}

// ── Private helpers ─────────────────────────────────────────────────────────

function _getFileList(stack, blueprint) {
  return [...new Set([...(stack?.files || []), ...(blueprint?.fileList || [])])];
}

function _buildAllText(intent, product, blueprint, stack) {
  return [
    intent.appType || '',
    (intent.features || []).map(f => `${f.name} ${f.description || ''}`).join(' '),
    product.summary || '',
    (product.pages || []).map(p => p.name || p).join(' '),
    blueprint.designNotes || '',
    (blueprint._designSpec?.generationHints || []).join(' '),
    (stack?.files || []).join(' '),
    (stack?.tech ? JSON.stringify(stack.tech) : ''),
  ].join(' ').toLowerCase();
}

module.exports = { checkMobilePlanning };
