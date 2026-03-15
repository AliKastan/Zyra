'use strict';

/**
 * Selects and configures which generation passes to run based on complexity tier and blueprint.
 *
 * Rules:
 *   - scaffold_html + css_design_system + javascript_core always run
 *   - admin_ops: runs if hasAdmin, or roleCount >= 3, or admin pages exist in blueprint
 *   - billing_integrations: runs if hasPayments, or integrationCount >= 3, or hasAI
 *   - polish_deployment: runs if tier is 'advanced' or 'production_heavy'
 */

/** @type {Record<string, import('./types').PassTokenBudgets>} */
const TOKEN_BUDGETS = {
  simple:           { scaffold_html: 8000,  css_design_system: 6000,  javascript_core: 8000,  admin_ops: 0,     billing_integrations: 0,    polish_deployment: 0    },
  medium:           { scaffold_html: 12000, css_design_system: 8000,  javascript_core: 12000, admin_ops: 6000,  billing_integrations: 0,    polish_deployment: 0    },
  advanced:         { scaffold_html: 14000, css_design_system: 10000, javascript_core: 16000, admin_ops: 8000,  billing_integrations: 6000, polish_deployment: 4000 },
  production_heavy: { scaffold_html: 16000, css_design_system: 12000, javascript_core: 20000, admin_ops: 10000, billing_integrations: 8000, polish_deployment: 6000 },
};

/**
 * @param {import('../../../generation/types').AppBlueprint} blueprint
 * @param {import('../../complexity/types').AppComplexityReport|null} complexityReport
 * @returns {import('./types').MultiPassPlan}
 */
function selectPasses(blueprint, complexityReport) {
  const tier    = complexityReport?.complexityTier || 'medium';
  const signals = complexityReport?.signals || {};
  const budgets = TOKEN_BUDGETS[tier] || TOKEN_BUDGETS.medium;
  const rationale = [];

  // ── Always-on passes ──
  const passes = [
    { name: 'scaffold_html',     label: 'HTML scaffold',    tokenBudget: budgets.scaffold_html,     conditional: false, enabled: true },
    { name: 'css_design_system', label: 'CSS design system', tokenBudget: budgets.css_design_system, conditional: false, enabled: true },
    { name: 'javascript_core',   label: 'JavaScript core',  tokenBudget: budgets.javascript_core,   conditional: false, enabled: true },
  ];
  rationale.push(`Base passes (HTML + CSS + JS) always run`);

  // ── Admin/Ops pass ──
  const adminPages = (blueprint.fileList || []).some(f => f.toLowerCase().includes('admin'));
  const needsAdmin = signals.hasAdmin || (signals.roleCount || 0) >= 3 || adminPages;
  const adminEnabled = needsAdmin && budgets.admin_ops > 0;
  passes.push({ name: 'admin_ops', label: 'Admin & operations', tokenBudget: budgets.admin_ops, conditional: true, enabled: adminEnabled });
  if (adminEnabled) rationale.push(`Admin/ops pass: ${signals.hasAdmin ? 'admin dashboard required' : signals.roleCount >= 3 ? `${signals.roleCount} roles detected` : 'admin pages in blueprint'}`);

  // ── Billing/Integrations pass ──
  const needsBilling = signals.hasPayments || (signals.integrationCount || 0) >= 3 || signals.hasAI;
  const billingEnabled = needsBilling && budgets.billing_integrations > 0;
  passes.push({ name: 'billing_integrations', label: 'Billing & integrations', tokenBudget: budgets.billing_integrations, conditional: true, enabled: billingEnabled });
  if (billingEnabled) rationale.push(`Billing/integrations pass: ${[signals.hasPayments && 'payments required', signals.hasAI && 'AI integration required', (signals.integrationCount || 0) >= 3 && `${signals.integrationCount} integrations required`].filter(Boolean).join(', ')}`);

  // ── Polish/Deployment pass ──
  const polishEnabled = (tier === 'advanced' || tier === 'production_heavy') && budgets.polish_deployment > 0;
  passes.push({ name: 'polish_deployment', label: 'Polish & deployment', tokenBudget: budgets.polish_deployment, conditional: true, enabled: polishEnabled });
  if (polishEnabled) rationale.push(`Polish/deployment pass: ${tier} tier requires deployment documentation`);

  const activePasses = passes.filter(p => p.enabled);
  const totalEstimatedTokens = activePasses.reduce((sum, p) => sum + p.tokenBudget, 0);

  return {
    passes: activePasses,
    tier,
    totalEstimatedTokens,
    rationale,
  };
}

module.exports = { selectPasses, TOKEN_BUDGETS };
