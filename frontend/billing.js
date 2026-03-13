/* billing.js — Zyra billing page */

const SUPABASE_URL = 'https://ymjeysnubuehjoghkkmv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_qvy0Ppcn7_JRFMUXaS343w_1IDZjDf2';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    tagline: 'Get started with AI app generation at no cost.',
    features: [
      '1,000 credits / month',
      '3 projects max',
      'Standard generation speed',
    ],
    missing: ['Deploy to Vercel', 'Priority support', 'Premium models'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 20,
    popular: true,
    tagline: 'Serious builders who ship fast.',
    features: [
      '20,000 credits / month',
      'Unlimited projects',
      'Deploy to Vercel',
      'Premium models',
      'Priority support',
    ],
    missing: [],
  },
  {
    id: 'max',
    name: 'Max',
    price: 50,
    tagline: 'Power users and teams who need the most.',
    features: [
      '60,000 credits / month',
      'Unlimited projects',
      'Deploy to Vercel',
      'Premium models',
      'Priority support',
      'Advanced debug tools',
    ],
    missing: [],
  },
];

let currentPlan = 'free';
let currentStatus = 'free';
let session = null;

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function init() {
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    window.location.replace('/login');
    return;
  }
  session = data.session;

  const user = session.user;
  document.getElementById('header-user').textContent = user.email || '';

  // Render plans immediately — never depend on billing API for this
  renderPlans('free');
  document.getElementById('page-content').style.display = '';

  // Load usage + subscription async; update UI if available, fail silently
  try {
    const [usageData, subData] = await Promise.all([
      apiFetch('/api/billing/usage').catch(() => null),
      apiFetch('/api/billing/subscription').catch(() => null),
    ]);

    if (usageData) renderUsage(usageData);
    if (subData)   renderSubscription(subData);

    // Re-render plans now that we know the active plan
    renderPlans(currentPlan);
    showAlert(usageData, subData);
  } catch (err) {
    // Billing API unavailable — plans are already visible, nothing to do
    console.warn('Billing data unavailable:', err.message);
  }
}

// ── Render helpers ────────────────────────────────────────────────────────────

function renderUsage(data) {
  if (!data || data.configured === false) return;
  const used     = data.creditsUsed    ?? 0;
  const included = data.creditsIncluded ?? 0;
  const pct      = included > 0 ? Math.min(100, (used / included) * 100) : 0;

  document.getElementById('credits-used').textContent     = used.toLocaleString();
  document.getElementById('credits-included').textContent = included.toLocaleString();

  const bar = document.getElementById('usage-progress');
  bar.style.width = pct.toFixed(1) + '%';
  if (pct >= 90) bar.classList.add('critical');
  else if (pct >= 70) bar.classList.add('warning');

  const start = data.periodStart ? new Date(data.periodStart).toLocaleDateString() : '';
  const end   = data.periodEnd   ? new Date(data.periodEnd).toLocaleDateString()   : '';
  if (start && end) {
    document.getElementById('usage-note').textContent = `Period: ${start} — ${end}`;
  }
}

function renderSubscription(data) {
  // Backend returns flat: { plan, status, periodEnd, ... } — no .subscription wrapper
  if (!data || data.configured === false) return;

  currentPlan   = data.plan   || 'free';
  currentStatus = data.status || 'free';

  if (currentPlan === 'free' && currentStatus === 'free') return;

  const card = document.getElementById('subscription-card');
  card.style.display = '';

  const dot  = document.getElementById('status-dot');
  const text = document.getElementById('status-text');

  dot.className = 'status-dot ' + currentStatus;

  const STATUS_LABELS = {
    active:     'Active',
    trialing:   'Trialing',
    past_due:   'Past due — update payment method',
    canceled:   'Canceled',
    incomplete: 'Incomplete',
    free:       'Free',
  };

  const planLabel = PLANS.find(p => p.id === currentPlan)?.name || currentPlan;
  text.innerHTML = `<strong>${planLabel}</strong> — ${STATUS_LABELS[currentStatus] || currentStatus}`;

  if (data.periodEnd) {
    const end = new Date(data.periodEnd).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
    const cancelMsg = data.cancelAtPeriodEnd ? ' — cancels at period end' : '';
    document.getElementById('period-text').textContent = `Renews ${end}${cancelMsg}`;
  }
}

function renderPlans(activePlan) {
  const grid = document.getElementById('plans-grid');
  grid.innerHTML = PLANS.map(plan => {
    const isCurrent = plan.id === activePlan;
    const popularClass = plan.popular ? ' popular' : '';
    const currentClass = isCurrent ? ' current' : '';

    const featureItems = plan.features.map(f => `<li>${f}</li>`).join('');
    const missingItems = plan.missing.map(f => `<li class="dim">${f}</li>`).join('');

    let btnHtml;
    if (isCurrent) {
      btnHtml = `<button class="btn-plan current-plan" disabled>Current plan</button>`;
    } else if (plan.price === 0) {
      btnHtml = `<button class="btn-plan secondary" onclick="downgradeFree()">Downgrade to Free</button>`;
    } else {
      btnHtml = `<button class="btn-plan primary" onclick="checkout('${plan.id}')">Upgrade to ${plan.name}</button>`;
    }

    const priceHtml = plan.price === 0
      ? `<div class="plan-price">$0<span>/mo</span></div>`
      : `<div class="plan-price">$${plan.price}<span>/mo</span></div>`;

    return `
      <div class="plan-card${popularClass}${currentClass}">
        <div class="plan-name">${plan.name}</div>
        ${priceHtml}
        <div class="plan-tagline">${plan.tagline}</div>
        <ul class="plan-features">
          ${featureItems}
          ${missingItems}
        </ul>
        ${btnHtml}
      </div>
    `;
  }).join('');
}

function showAlert(usageData, subData) {
  if (!subData || subData.configured === false) return;
  const alertEl = document.getElementById('billing-alert');
  const pct = usageData ? ((usageData.creditsUsed || 0) / (usageData.creditsIncluded || 1)) * 100 : 0;

  let alertHtml = '';

  if (subData.status === 'past_due') {
    alertHtml = `<div class="alert error">Payment failed — please update your payment method to keep your subscription active.</div>`;
  } else if (subData.cancelAtPeriodEnd) {
    const end = subData.periodEnd ? new Date(subData.periodEnd).toLocaleDateString() : '';
    alertHtml = `<div class="alert warning">Your subscription is set to cancel on ${end}. Reactivate anytime in the customer portal.</div>`;
  } else if (pct >= 90) {
    alertHtml = `<div class="alert warning">You have used ${Math.round(pct)}% of your credits this period. Consider upgrading to avoid interruption.</div>`;
  }

  if (alertHtml) {
    alertEl.innerHTML = alertHtml;
    alertEl.style.display = '';
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function checkout(planId) {
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = 'Redirecting...';

  try {
    const data = await apiFetch('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan: planId }),
    });
    if (data?.url) {
      window.location.href = data.url;
    } else {
      throw new Error('No checkout URL returned');
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Upgrade';
    alert('Could not start checkout: ' + err.message);
  }
}

async function openPortal() {
  const btn = document.getElementById('portal-btn');
  btn.disabled = true;
  btn.textContent = 'Opening...';

  try {
    const data = await apiFetch('/api/billing/portal', { method: 'POST' });
    if (data?.url) {
      window.location.href = data.url;
    } else {
      throw new Error('No portal URL returned');
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Manage subscription';
    alert('Could not open customer portal: ' + err.message);
  }
}

function downgradeFree() {
  openPortal();
}

// ── Utilities ─────────────────────────────────────────────────────────────────

async function apiFetch(url, opts = {}) {
  const token = session?.access_token;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });

  if (res.status === 401) {
    window.location.replace('/login');
    throw new Error('Unauthorized');
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();
