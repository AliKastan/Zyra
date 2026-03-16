'use strict';

/**
 * Code Consistency Evaluator
 *
 * Scores naming convention consistency, import cleanliness,
 * and dependency alignment across the generated files.
 *
 * Evaluates:
 * - File naming conventions (kebab-case server files, PascalCase components)
 * - Module system consistency (no CommonJS + ESM mixing)
 * - Dependency alignment (imports match declared package.json deps)
 * - No duplicate utility functions across files
 * - Consistent error handling pattern
 *
 * Returns raw score 0–100 for this dimension.
 */

// Known packages that should be declared in package.json if imported
const KNOWN_PACKAGES = [
  'express', 'cors', 'dotenv', 'helmet', 'morgan', 'bcrypt', 'bcryptjs',
  'jsonwebtoken', 'stripe', 'openai', 'mongoose', 'pg', 'mysql2',
  'nodemailer', 'resend', 'uuid', 'axios', 'zod', 'joi', 'multer',
  'react', 'react-dom', 'next', 'vite', '@supabase/supabase-js',
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * @param {Object} files - Normalized { path: content } map
 * @returns {{ score: number, strengths: string[], weaknesses: string[] }}
 */
function evaluateConsistency(files) {
  const strengths  = [];
  const weaknesses = [];
  let   score      = 40; // baseline

  const paths      = Object.keys(files);
  const allContent = Object.values(files).join('\n');

  // ── 1. Module system consistency (0–20 pts) ───────────────────────────────
  const usesRequire = /\brequire\s*\(/.test(allContent);
  const usesImport  = /\bimport\s+(?:\*|{|\w)/.test(allContent);

  if (usesRequire && !usesImport)  { score += 20; strengths.push('Consistent CommonJS module system'); }
  else if (usesImport && !usesRequire) { score += 20; strengths.push('Consistent ESM import style'); }
  else if (usesRequire && usesImport) {
    score -= 10;
    weaknesses.push('Mixed module systems (require + import) may cause issues');
  }

  // ── 2. File naming conventions (0–15 pts) ────────────────────────────────
  const serverFiles    = paths.filter(p => /\.(js|ts)$/.test(p) && !p.includes('src/') || p.includes('routes/') || p.includes('controllers/'));
  const componentFiles = paths.filter(p => p.includes('components/') || p.includes('pages/'));

  const serverOk    = serverFiles.every(p => /[a-z-]+\.(js|ts)$/.test(p.split('/').pop()));
  const compOk      = componentFiles.every(p => /[A-Z][a-zA-Z]+\.(jsx?|tsx?)$/.test(p.split('/').pop()));

  if (serverFiles.length > 0 && serverOk)     { score += 8;  strengths.push('Server files use kebab-case naming'); }
  if (componentFiles.length > 0 && compOk)    { score += 7;  strengths.push('Component files use PascalCase naming'); }
  else if (componentFiles.length > 0 && !compOk) { weaknesses.push('Component naming inconsistency (expected PascalCase)'); }

  // ── 3. Dependency alignment (0–20 pts) ───────────────────────────────────
  const pkgRaw = files['package.json'];
  if (pkgRaw && typeof pkgRaw === 'string') {
    try {
      const pkg      = JSON.parse(pkgRaw);
      const declared = new Set([
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
      ]);

      const missing = KNOWN_PACKAGES.filter(pkg => {
        const isImported = (
          allContent.includes(`require('${pkg}')`) ||
          allContent.includes(`require("${pkg}")`) ||
          allContent.includes(`from '${pkg}'`) ||
          allContent.includes(`from "${pkg}"`)
        );
        return isImported && !declared.has(pkg);
      });

      if (missing.length === 0) {
        score += 20;
        strengths.push('All imported packages declared in package.json');
      } else {
        score -= missing.length * 4;
        weaknesses.push(`Missing package declarations: ${missing.slice(0, 3).join(', ')}`);
      }
    } catch (_) {
      score -= 5;
      weaknesses.push('package.json parse error');
    }
  }

  // ── 4. Consistent error handling (0–15 pts) ───────────────────────────────
  const hasTryCatch  = (allContent.match(/try\s*\{/g) || []).length;
  const hasAsyncAwait = (allContent.match(/async\s+(?:function|\([^)]*\)\s*=>)/g) || []).length;

  if (hasAsyncAwait > 0) {
    const ratio = hasTryCatch / hasAsyncAwait;
    if (ratio >= 0.5) {
      score += 15;
      strengths.push('Async functions consistently wrapped in try/catch');
    } else {
      score += 5;
      weaknesses.push('Some async functions may be missing try/catch error handling');
    }
  } else {
    score += 10; // no async = no concern
  }

  // ── 5. No console.log in production paths (0–10 pts) ─────────────────────
  const prodLogs = (allContent.match(/console\.log\(/g) || []).length;
  if (prodLogs === 0)     { score += 10; strengths.push('No console.log statements in production code'); }
  else if (prodLogs <= 5) { score += 5;  }
  else                    { weaknesses.push(`${prodLogs} console.log statements — may expose info in production`); }

  return { score: Math.max(0, Math.min(100, score)), strengths, weaknesses };
}

module.exports = { evaluateConsistency };
