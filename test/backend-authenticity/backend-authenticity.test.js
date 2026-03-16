'use strict';

/**
 * Backend Authenticity Checker — Test Suite
 *
 * Tests all major fake-backend detection scenarios.
 */

const {
  checkBackendAuthenticity,
  checkFakeApi,
  checkFakeAuth,
  checkFakeDb,
  checkFakeBilling,
  checkFakeIntegrations,
  checkFakeDashboard,
  checkFakeAdmin,
  summarizeAuthenticity,
  buildUiAuthenticityPayload,
  detectFakeBackendPatterns,
  getBlockedFeatures,
  getPlaceholderFeatures,
  isBackendAuthentic,
} = require('../../src/lib/backend-authenticity');

// ── Minimal inline test harness ──────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function describe(label, fn) {
  console.log(`\n  ${label}`);
  fn();
}

function it(label, fn) {
  try {
    fn();
    console.log(`    ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`    ✗ ${label}`);
    console.error(`      ${err.message}`);
    failed++;
    failures.push({ label, error: err.message });
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertContains(arr, pred, msg) {
  if (!arr.some(pred)) throw new Error(msg || 'Array does not contain expected element');
}

// ── Scenario 1: Fake API route (frontend calls missing backend route) ─────────

describe('Scenario 1 — Fake API route (frontend calls unimplemented endpoint)', () => {
  const files = {
    'src/components/UserList.jsx': `
      import React, { useEffect, useState } from 'react';
      export default function UserList() {
        const [users, setUsers] = useState([]);
        useEffect(() => {
          fetch('/api/users').then(r => r.json()).then(setUsers);
        }, []);
        return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>;
      }
    `,
    'src/index.js': `
      const express = require('express');
      const app = express();
      app.get('/api/health', (req, res) => res.json({ ok: true }));
      app.listen(process.env.PORT || 3000);
    `,
  };

  const report = checkBackendAuthenticity({ files });

  it('detects status fake_backend_detected', () => {
    assertEqual(report.status, 'fake_backend_detected');
  });

  it('detects missing /api/users route', () => {
    assertContains(
      report.fakeBackendIssues,
      i => i.category === 'fake_api' && i.message.includes('/api/users'),
      'Expected fake_api issue for /api/users',
    );
  });

  it('fakeBackendIssues is non-empty', () => {
    assert(report.fakeBackendIssues.length > 0);
  });
});

// ── Scenario 2: Fake Stripe UI (billing without backend) ─────────────────────

describe('Scenario 2 — Fake Stripe UI (billing without real Stripe backend)', () => {
  const files = {
    'src/components/Pricing.jsx': `
      export default function Pricing() {
        const handlePayment = () => {
          setIsPaid(true);
          console.log('payment successful');
        };
        return (
          <div>
            <h2>Pro Plan — $29/month</h2>
            <button onClick={handlePayment}>Subscribe Now</button>
          </div>
        );
      }
    `,
    'src/index.js': `
      const express = require('express');
      const app = express();
      app.get('/api/health', (req, res) => res.json({ ok: true }));
      app.listen(process.env.PORT || 3000);
    `,
  };

  const report = checkBackendAuthenticity({ files });

  it('detects fake billing status', () => {
    assertEqual(report.status, 'fake_backend_detected');
  });

  it('detects fake payment handler (setIsPaid + console.log)', () => {
    assertContains(
      report.fakeBackendIssues,
      i => i.category === 'fake_billing',
      'Expected fake_billing issue',
    );
  });

  it('has fix recommendation for billing', () => {
    const billingIssue = report.fakeBackendIssues.find(i => i.category === 'fake_billing');
    assert(billingIssue?.fix?.length > 10, 'Expected a fix recommendation');
  });
});

// ── Scenario 3: Fake login page (client-only auth state) ─────────────────────

describe('Scenario 3 — Fake login page (auth state set without server call)', () => {
  const files = {
    'src/pages/Login.jsx': `
      export default function Login() {
        const handleLogin = (e) => {
          e.preventDefault();
          setIsLoggedIn(true);
          localStorage.setItem('user', JSON.stringify({ id: 1, name: 'John' }));
        };
        return (
          <form onSubmit={handleLogin}>
            <input name="email" />
            <input name="password" type="password" />
            <button type="submit">Login</button>
          </form>
        );
      }
    `,
    'routes/auth.js': `
      const express = require('express');
      const router = express.Router();
      router.get('/health', (req, res) => res.json({ ok: true }));
      module.exports = router;
    `,
  };

  const report = checkBackendAuthenticity({ files });

  it('detects fake_backend_detected status', () => {
    assertEqual(report.status, 'fake_backend_detected');
  });

  it('detects client-only auth state setting', () => {
    assertContains(
      report.fakeBackendIssues,
      i => i.category === 'fake_auth' && (
        i.id.includes('client-only-state') || i.id.includes('localstorage-inject')
      ),
      'Expected fake_auth client-only-state or localstorage-inject issue',
    );
  });
});

// ── Scenario 4: Dashboard with static metrics ─────────────────────────────────

describe('Scenario 4 — Dashboard with hardcoded static metrics', () => {
  const files = {
    'src/pages/Dashboard.jsx': `
      export default function Dashboard() {
        const stats = {
          users: 1247,
          revenue: 45600,
          orders: 392,
          conversionRate: 3.8,
        };
        return (
          <div className="dashboard">
            <h1>Dashboard</h1>
            <div className="metrics">
              <div>Total Users: {stats.users}</div>
              <div>Revenue: {stats.revenue}</div>
            </div>
          </div>
        );
      }
    `,
  };

  const report = checkBackendAuthenticity({ files });

  it('detects hardcoded stats object', () => {
    assertContains(
      report.fakeBackendIssues,
      i => i.category === 'fake_dashboard',
      'Expected fake_dashboard issue',
    );
  });

  it('fake dashboard issue has critical or high severity', () => {
    const dashIssue = report.fakeBackendIssues.find(i => i.category === 'fake_dashboard');
    assert(
      dashIssue?.severity === 'critical' || dashIssue?.severity === 'high',
      `Expected critical/high, got ${dashIssue?.severity}`,
    );
  });
});

// ── Scenario 5: Admin panel without guards ────────────────────────────────────

describe('Scenario 5 — Admin panel without auth guards', () => {
  const files = {
    'src/pages/Admin.jsx': `
      export default function Admin() {
        const deleteUser = (id) => {
          fetch('/api/admin/users/' + id, { method: 'DELETE' });
        };
        return (
          <div>
            <h1>Admin Panel</h1>
            <button onClick={() => deleteUser(1)}>Delete User</button>
          </div>
        );
      }
    `,
    'routes/admin.js': `
      const express = require('express');
      const router = express.Router();
      router.delete('/admin/users/:id', async (req, res) => {
        res.json({ success: true });
      });
      module.exports = router;
    `,
  };

  const report = checkBackendAuthenticity({ files });

  it('detects admin panel without role check', () => {
    assertContains(
      report.fakeBackendIssues,
      i => i.category === 'fake_admin',
      'Expected fake_admin issue',
    );
  });

  it('admin issue has critical or high severity', () => {
    const adminIssue = report.fakeBackendIssues.find(i => i.category === 'fake_admin');
    assert(
      adminIssue?.severity === 'critical' || adminIssue?.severity === 'high',
      `Expected critical/high, got ${adminIssue?.severity}`,
    );
  });
});

// ── Scenario 6: Integration UI without backend (email) ───────────────────────

describe('Scenario 6 — Email integration UI without backend provider', () => {
  const files = {
    'src/components/ContactForm.jsx': `
      export default function ContactForm() {
        const sendEmail = async (e) => {
          e.preventDefault();
          console.log('sending email...');
          setEmailSent(true);
        };
        return (
          <form onSubmit={sendEmail}>
            <input name="subject" />
            <textarea name="message" />
            <button type="submit">Send Email</button>
          </form>
        );
      }
    `,
    'server.js': `
      const express = require('express');
      const app = express();
      app.get('/api/health', (req, res) => res.json({ ok: true }));
      app.listen(process.env.PORT || 3000);
    `,
  };

  const report = checkBackendAuthenticity({ files });

  it('detects fake or missing email integration', () => {
    assertContains(
      report.fakeBackendIssues,
      i => i.category === 'fake_integration',
      'Expected fake_integration issue for email',
    );
  });
});

// ── Scenario 7: In-memory database ───────────────────────────────────────────

describe('Scenario 7 — In-memory array used as fake database', () => {
  const files = {
    'routes/users.js': `
      const express = require('express');
      const router = express.Router();
      let users = [
        { id: 1, name: 'Alice', email: 'alice@example.com' },
        { id: 2, name: 'Bob',   email: 'bob@example.com' },
      ];
      router.get('/', (req, res) => res.json(users));
      router.post('/', (req, res) => {
        const user = { id: Date.now(), ...req.body };
        users.push(user);
        res.json(user);
      });
      router.delete('/:id', (req, res) => {
        users = users.filter(u => u.id !== parseInt(req.params.id));
        res.json({ ok: true });
      });
      module.exports = router;
    `,
  };

  const report = checkBackendAuthenticity({ files });

  it('detects fake_db in-memory array', () => {
    assertContains(
      report.fakeBackendIssues,
      i => i.category === 'fake_db',
      'Expected fake_db issue',
    );
  });

  it('fake_db issue is critical severity', () => {
    const dbIssue = report.fakeBackendIssues.find(i => i.category === 'fake_db');
    assert(
      dbIssue?.severity === 'critical' || dbIssue?.severity === 'high',
      `Expected critical/high, got ${dbIssue?.severity}`,
    );
  });
});

// ── Scenario 8: Authentic backend (no fake patterns) ─────────────────────────

describe('Scenario 8 — Authentic backend (all patterns real)', () => {
  const files = {
    'server.js': `
      const express = require('express');
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      const app = express();
      app.use(express.json());
      app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));
      app.get('/api/users', authenticate, async (req, res) => {
        try {
          const users = await prisma.user.findMany();
          res.json(users);
        } catch (err) { next(err); }
      });
      app.listen(process.env.PORT || 3000);
    `,
    'middleware/authenticate.js': `
      const jwt = require('jsonwebtoken');
      function authenticate(req, res, next) {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token' });
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
      }
      module.exports = authenticate;
    `,
    '.env.example': `
      PORT=3000
      DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
      JWT_SECRET=your-secret-here
    `,
  };

  const report = checkBackendAuthenticity({ files });

  it('returns authentic_backend status', () => {
    assert(
      report.status === 'authentic_backend' || report.status === 'placeholder_only',
      `Expected authentic_backend or placeholder_only, got "${report.status}". Issues: ${JSON.stringify(report.fakeBackendIssues.map(i => i.id))}`,
    );
  });

  it('has zero or few fake backend issues', () => {
    const critical = report.fakeBackendIssues.filter(i => i.severity === 'critical' || i.severity === 'high');
    assert(critical.length === 0, `Expected 0 critical/high issues, got ${critical.length}: ${critical.map(i => i.id).join(', ')}`);
  });

  it('isBackendAuthentic returns true', () => {
    assert(isBackendAuthentic(report) === true);
  });
});

// ── Scenario 9: Placeholder-only (billing placeholder, no fake) ───────────────

describe('Scenario 9 — Billing placeholder (Stripe UI without backend = placeholder)', () => {
  const files = {
    'src/components/Pricing.jsx': `
      export default function Pricing() {
        return (
          <div>
            <h2>Pro Plan — $29/month</h2>
            <p>Stripe billing requires configuration.</p>
            <button disabled>Coming Soon</button>
          </div>
        );
      }
    `,
    'server.js': `
      const express = require('express');
      const app = express();
      app.get('/api/health', (req, res) => res.json({ ok: true }));
      app.listen(process.env.PORT || 3000);
    `,
  };

  const report = checkBackendAuthenticity({ files });

  it('does not detect critical fake billing when no payment handler exists', () => {
    const critical = report.fakeBackendIssues.filter(i =>
      i.category === 'fake_billing' && (i.severity === 'critical' || i.severity === 'high'),
    );
    // A disabled "Coming Soon" button is not a fake payment handler
    assert(critical.length === 0, `Expected 0 critical billing issues, got: ${critical.map(i => i.id).join(', ')}`);
  });
});

// ── Scenario 10: Hardcoded JWT secret ────────────────────────────────────────

describe('Scenario 10 — Hardcoded JWT secret', () => {
  const files = {
    'routes/auth.js': `
      const jwt = require('jsonwebtoken');
      const express = require('express');
      const router = express.Router();
      router.post('/login', (req, res) => {
        const token = jwt.sign({ userId: 1 }, 'my-super-secret-key-123');
        res.json({ token });
      });
      module.exports = router;
    `,
  };

  const issues = checkFakeAuth(files);

  it('detects hardcoded JWT secret', () => {
    assertContains(
      issues,
      i => i.category === 'fake_auth' && i.id.includes('jwt-hardcoded-secret'),
      'Expected fake_auth jwt-hardcoded-secret issue',
    );
  });

  it('hardcoded JWT secret has critical severity', () => {
    const jwtIssue = issues.find(i => i.id.includes('jwt-hardcoded-secret'));
    assertEqual(jwtIssue?.severity, 'critical');
  });
});

// ── Scenario 11: Static project (no backend checks needed) ───────────────────

describe('Scenario 11 — Static HTML project (backend checks skipped)', () => {
  const files = {
    'index.html': `<!DOCTYPE html><html><body><h1>My Landing Page</h1></body></html>`,
    'styles.css': `body { margin: 0; font-family: sans-serif; }`,
    'app.js':     `document.querySelector('h1').textContent = 'Hello';`,
  };

  const report = checkBackendAuthenticity({ files });

  it('returns authentic_backend for static project', () => {
    assertEqual(report.status, 'authentic_backend');
  });

  it('has zero fake backend issues', () => {
    assertEqual(report.fakeBackendIssues.length, 0);
  });
});

// ── Scenario 12: Math.random() dashboard data ─────────────────────────────────

describe('Scenario 12 — Dashboard with Math.random() chart data', () => {
  const files = {
    'src/pages/Analytics.jsx': `
      export default function Analytics() {
        const chartData = {
          labels: ['Jan', 'Feb', 'Mar', 'Apr'],
          datasets: [{
            label: 'Revenue',
            data: [
              Math.random() * 10000,
              Math.random() * 10000,
              Math.random() * 10000,
              Math.random() * 10000,
            ],
          }],
        };
        return <div className="analytics"><Chart data={chartData} /></div>;
      }
    `,
  };

  const issues = checkFakeDashboard(files);

  it('detects Math.random() used for chart metrics', () => {
    assertContains(
      issues,
      i => i.category === 'fake_dashboard' && i.id.includes('random-data'),
      'Expected fake_dashboard random-data issue',
    );
  });
});

// ── summarizeAuthenticity ─────────────────────────────────────────────────────

describe('summarizeAuthenticity', () => {
  const files = {
    'routes/users.js': `
      let users = [{ id: 1, name: 'Alice' }];
      router.get('/', (req, res) => res.json(users));
    `,
  };

  const report = checkBackendAuthenticity({ files });
  const summary = summarizeAuthenticity(report);

  it('returns a non-empty string', () => {
    assert(typeof summary === 'string' && summary.length > 10);
  });

  it('contains status field', () => {
    assert(summary.includes('status='));
  });

  it('contains fakeIssues count', () => {
    assert(summary.includes('fakeIssues='));
  });
});

// ── buildUiAuthenticityPayload ────────────────────────────────────────────────

describe('buildUiAuthenticityPayload', () => {
  const report = checkBackendAuthenticity({
    files: {
      'routes/users.js': `let users = [{ id: 1 }]; router.get('/', (req, res) => res.json(users));`,
    },
  });

  const payload = buildUiAuthenticityPayload(report);

  it('returns expected UI shape', () => {
    assert('status'             in payload);
    assert('fakeIssueCount'     in payload);
    assert('placeholderCount'   in payload);
    assert('blockedCount'       in payload);
    assert('criticalIssues'     in payload);
    assert('placeholderFeatures' in payload);
    assert('summary'            in payload);
  });

  it('criticalIssues is an array', () => {
    assert(Array.isArray(payload.criticalIssues));
  });
});

// ── Helper functions ──────────────────────────────────────────────────────────

describe('Helper functions', () => {
  const files = {
    'src/components/Pricing.jsx': `
      function handlePayment() { setIsPaid(true); }
      return <button onClick={handlePayment}>Pay $29/month</button>;
    `,
    'server.js': `
      const express = require('express');
      const app = express();
      app.get('/api/health', (req, res) => res.json({ ok: true }));
      app.listen(process.env.PORT || 3000);
    `,
  };

  const report = checkBackendAuthenticity({ files });

  it('detectFakeBackendPatterns returns array of issues', () => {
    const patterns = detectFakeBackendPatterns({ files });
    assert(Array.isArray(patterns));
  });

  it('getBlockedFeatures returns array', () => {
    assert(Array.isArray(getBlockedFeatures(report)));
  });

  it('getPlaceholderFeatures returns array', () => {
    assert(Array.isArray(getPlaceholderFeatures(report)));
  });

  it('report has summary string', () => {
    assert(typeof report.summary === 'string' && report.summary.length > 0);
  });

  it('report has generatedAt timestamp', () => {
    assert(typeof report.generatedAt === 'string');
  });
});

// ── Results ───────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(50));
if (failed === 0) {
  console.log(`  All ${passed} tests passed.`);
} else {
  console.log(`  ${passed} passed, ${failed} failed.`);
  for (const f of failures) {
    console.log(`  ✗ ${f.label}: ${f.error}`);
  }
  process.exitCode = 1;
}
console.log('─'.repeat(50) + '\n');
