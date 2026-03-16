'use strict';

/**
 * Authentication Section Regenerator
 *
 * Spec for auth-related regeneration: login/signup flows, JWT/session setup,
 * role guards, protected routes, middleware.
 *
 * IMPORTANT: Never creates fake auth (hardcoded credentials, client-only state).
 * Always scaffolds real server-side auth or honest placeholder mode.
 */

/**
 * @param {import('./types').RegenerationPlan} plan
 * @param {Object} [context]
 * @param {Object.<string,string>} [context.existingFiles]
 * @param {string} [context.userPrompt]
 * @param {Object} [context.intentMemory]
 * @returns {import('./types').SectionRegenerationSpec}
 */
function regenerateAuthSection(plan, context = {}) {
  const { existingFiles = {}, userPrompt = '', intentMemory = {} } = context;

  const needsRoles    = /role|permission|admin|guard/i.test(userPrompt);
  const needsOAuth    = /oauth|google|github|social/i.test(userPrompt);
  const needsReset    = /reset.*password|forgot.*password/i.test(userPrompt);
  const isRemoval     = plan.changeDetection.action === 'remove';

  const existingAuthFiles = Object.keys(existingFiles).filter(p =>
    /auth|login|signup|session|jwt|passport/i.test(p),
  );

  const filesToCreate = [];
  if (existingAuthFiles.length === 0 && !isRemoval) {
    filesToCreate.push({ path: 'server/middleware/authenticate.js', description: 'JWT/session auth middleware' });
    filesToCreate.push({ path: 'server/routes/auth.js', description: 'Auth API routes (login, signup, logout)' });
    filesToCreate.push({ path: 'client/pages/Login.jsx', description: 'Login page' });
    filesToCreate.push({ path: 'client/pages/Signup.jsx', description: 'Signup / register page' });
  }
  if (needsReset && !isRemoval) {
    filesToCreate.push({ path: 'server/routes/reset-password.js', description: 'Password reset routes' });
    filesToCreate.push({ path: 'client/pages/ForgotPassword.jsx', description: 'Forgot password page' });
  }
  if (needsRoles && !isRemoval) {
    filesToCreate.push({ path: 'server/middleware/requireAdmin.js', description: 'Admin role guard middleware' });
  }

  const generationHints = [
    'Use server-side auth — never store auth state only in client memory',
    'Hash passwords with bcryptjs — never store plain text',
    'Use environment variable for JWT_SECRET — never hardcode secrets',
    'Return structured { user, token } from login endpoint',
    'Protect all sensitive routes with authenticate middleware',
  ];

  if (needsOAuth)  generationHints.push('Scaffold OAuth flow with redirect + callback routes');
  if (needsRoles)  generationHints.push('Add role field to user model and requireAdmin middleware');
  if (isRemoval)   generationHints.push('Remove auth middleware from all routes but preserve route files');

  const filesToPatch = existingAuthFiles.map(p => ({
    path: p,
    description: isRemoval ? 'Remove auth logic and guards' : 'Update auth implementation',
    operation: isRemoval ? 'patch' : 'replace',
  }));

  return {
    sectionType:       'auth',
    filesToCreate,
    filesToPatch,
    envVarsNeeded:     isRemoval ? [] : ['JWT_SECRET', 'SESSION_SECRET'],
    dependenciesNeeded: isRemoval ? [] : ['jsonwebtoken', 'bcryptjs'],
    generationHints,
    validationHints: [
      'Verify all protected routes apply authenticate middleware',
      'Verify login route returns token and user object',
      'Check for hardcoded credentials — none allowed',
      'Ensure role guards are applied to admin routes',
    ],
    repairHints: [
      'Re-apply authenticate middleware if removed from protected routes',
      'Fix missing bcrypt.compare on login handler',
      'Add missing JWT_SECRET check at startup',
    ],
    placeholderMode:  false,
    authenticityNote: 'Auth must use server-side validation. Client-only auth state is fake and will be flagged.',
  };
}

module.exports = { regenerateAuthSection };
