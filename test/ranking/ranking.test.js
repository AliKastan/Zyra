'use strict';

/**
 * Generation Ranking Layer — Test Suite
 *
 * Tests all major ranking scenarios including:
 * - Candidate with fake backend → penalised
 * - Candidate missing scripts → lower readiness
 * - Candidate missing routes → lower completeness
 * - Candidate missing env vars → lower readiness
 * - Best candidate correctly selected
 */

const {
  rankCandidates,
  evaluateCandidate,
  calculateRankingScore,
  rankSingleCandidate,
  selectBestCandidate,
  summarizeRanking,
  buildUiRankingPayload,
  scoreCandidate,
  evaluateArchitecture,
  evaluateBackend,
  evaluateCompleteness,
  evaluateReadiness,
  evaluateUx,
  evaluateDesign,
  evaluateConsistency,
} = require('../../src/lib/ranking');

// ── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function describe(label, fn) { console.log(`\n  ${label}`); fn(); }

function it(label, fn) {
  try {
    fn();
    console.log(`    ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`    ✗ ${label}\n      ${err.message}`);
    failed++;
    failures.push({ label, error: err.message });
  }
}

function assert(cond, msg)    { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, b, m) { if (a !== b) throw new Error(m || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function assertGt(a, b, m)    { if (a <= b) throw new Error(m || `Expected ${a} > ${b}`); }
function assertLt(a, b, m)    { if (a >= b) throw new Error(m || `Expected ${a} < ${b}`); }
function assertRange(v, lo, hi, m) { assert(v >= lo && v <= hi, m || `Expected ${v} in [${lo}, ${hi}]`); }

// ── Fixture builders ─────────────────────────────────────────────────────────

function makeAuthenticCandidate(id = 'candidate_a') {
  return {
    candidateId: id,
    files: {
      'package.json': JSON.stringify({
        scripts: { start: 'node server.js', dev: 'nodemon server.js', build: 'npm run build' },
        dependencies: { express: '^4.18.3', jsonwebtoken: '^9.0.0', mongoose: '^7.0.0' },
      }),
      '.env.example': 'PORT=3000\nJWT_SECRET=your-secret\nMONGODB_URI=mongodb://localhost/mydb',
      'server.js': `
        const express = require('express');
        const app = express();
        const PORT = process.env.PORT || 3000;
        app.use(express.json());
        app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));
        app.use('/api/users', require('./routes/users'));
        app.listen(PORT, () => console.log('Server on port', PORT));
      `,
      'routes/users.js': `
        const express = require('express');
        const router  = express.Router();
        const User    = require('../models/User');
        const { authenticate } = require('../middleware/authenticate');
        router.get('/', authenticate, async (req, res) => {
          try {
            const users = await User.find();
            res.json(users);
          } catch (err) { next(err); }
        });
        module.exports = router;
      `,
      'models/User.js': `
        const mongoose = require('mongoose');
        const UserSchema = new mongoose.Schema({ name: String, email: String });
        module.exports = mongoose.model('User', UserSchema);
      `,
      'middleware/authenticate.js': `
        const jwt = require('jsonwebtoken');
        function authenticate(req, res, next) {
          const token = req.headers.authorization?.split(' ')[1];
          if (!token) return res.status(401).json({ error: 'Unauthorized' });
          req.user = jwt.verify(token, process.env.JWT_SECRET);
          next();
        }
        module.exports = { authenticate };
      `,
      'src/components/UserList.jsx': `
        import React, { useEffect, useState } from 'react';
        export default function UserList() {
          const [users, setUsers] = useState([]);
          const [isLoading, setIsLoading] = useState(true);
          const [error, setError] = useState(null);
          useEffect(() => {
            fetch('/api/users')
              .then(r => r.json())
              .then(data => { setUsers(data); setIsLoading(false); })
              .catch(err => { setError(err.message); setIsLoading(false); });
          }, []);
          if (isLoading) return <div className="skeleton">Loading...</div>;
          if (error)     return <div className="error">{error}</div>;
          if (users.length === 0) return <div className="empty">No users found.</div>;
          return <ul>{users.map(u => <li key={u._id}>{u.name}</li>)}</ul>;
        }
      `,
      'src/styles/globals.css': `
        :root {
          --primary: #566B48;
          --bg: #F6F3EF;
          --text: #1C1610;
          --surface: #FFFFFF;
        }
        body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); }
        @media (max-width: 768px) { body { padding: 1rem; } }
        .skeleton { display: flex; background: var(--surface); }
        .error    { color: red; }
        .empty    { color: var(--text-muted); }
      `,
    },
    authenticityReport: {
      status: 'authentic_backend',
      fakeBackendIssues: [],
      placeholderFeatures: [],
    },
    readinessReport: {
      status: 'ready',
      score: { total: 88, runtime: 90, deployment: 85, env: 90, security: 85, integrations: 85, build: 90 },
    },
    validationReport: { score: 85, criticalIssues: [], warnings: [] },
    preventionReport: { preventedIssues: [], unresolvedRisks: [], warnings: [] },
  };
}

function makeFakeBackendCandidate(id = 'candidate_b') {
  return {
    candidateId: id,
    files: {
      'package.json': JSON.stringify({
        scripts: { start: 'node server.js' },
        dependencies: { express: '^4.18.3' },
      }),
      'server.js': `
        const express = require('express');
        const app = express();
        let users = [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ];
        app.get('/api/users', (req, res) => res.json(users));
        app.post('/api/login', (req, res) => {
          if (req.body.username === 'admin' && req.body.password === 'password') {
            res.json({ success: true, token: 'fake-token-123' });
          } else {
            res.status(401).json({ error: 'Invalid' });
          }
        });
        app.listen(3000);
      `,
      'src/App.jsx': `
        function handleLogin() {
          setIsLoggedIn(true);
          localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Admin' }));
        }
        export default function App() {
          return <button onClick={handleLogin}>Login</button>;
        }
      `,
    },
    authenticityReport: {
      status: 'fake_backend_detected',
      fakeBackendIssues: [
        { severity: 'critical', message: 'Hardcoded credentials in login handler', category: 'fake_auth' },
        { severity: 'critical', message: 'In-memory array used as fake database', category: 'fake_db' },
      ],
      placeholderFeatures: [],
    },
    validationReport: { score: 50, criticalIssues: [{ message: 'Hardcoded credentials' }], warnings: [] },
  };
}

function makeMissingScriptsCandidate(id = 'candidate_c') {
  return {
    candidateId: id,
    files: {
      'package.json': JSON.stringify({
        // No scripts at all!
        dependencies: { express: '^4.18.3' },
      }),
      'server.js': `
        const express = require('express');
        const app = express();
        app.get('/api/health', (req, res) => res.json({ ok: true }));
        app.listen(process.env.PORT || 3000);
      `,
    },
    readinessReport: {
      status: 'ready_with_setup_required',
      score: { total: 52, runtime: 40, deployment: 60, env: 55, security: 60, integrations: 60, build: 45 },
    },
  };
}

function makeMissingRoutesCandidate(id = 'candidate_d') {
  return {
    candidateId: id,
    files: {
      'package.json': JSON.stringify({ scripts: { start: 'node server.js' }, dependencies: { express: '^4.18.3' } }),
      'server.js': `
        const express = require('express');
        const app = express();
        // No routes defined — just a bare server
        app.listen(process.env.PORT || 3000);
      `,
      'src/App.jsx': `
        // Frontend calls /api/users but no such route exists in server
        fetch('/api/users').then(r => r.json());
        fetch('/api/products').then(r => r.json());
      `,
    },
    validationReport: { score: 30, criticalIssues: [{ message: 'Missing API routes' }, { message: 'Missing /api/products' }], warnings: [] },
  };
}

// ── Scenario 1: Authentic candidate scores highest ────────────────────────────

describe('Scenario 1 — Authentic backend candidate scores highest overall', () => {
  const authentic = makeAuthenticCandidate('candidate_a');
  const fakeBack  = makeFakeBackendCandidate('candidate_b');

  const result = rankCandidates({ candidates: [authentic, fakeBack] });

  it('authentic candidate wins', () => assertEqual(result.bestCandidateId, 'candidate_a'));
  it('authentic has higher total score than fake', () => {
    assertGt(result.scores['candidate_a'].total, result.scores['candidate_b'].total,
      `a=${result.scores['candidate_a'].total} b=${result.scores['candidate_b'].total}`);
  });
  it('result has correct candidateCount', () => assertEqual(result.candidateCount, 2));
  it('result has multiCandidate=true', () => assert(result.multiCandidate === true));
  it('result exposes files from winner', () => assert(typeof result.files === 'object'));
  it('result has summary string', () => assert(typeof result.summary === 'string' && result.summary.length > 10));
  it('result has rankedAt timestamp', () => assert(typeof result.rankedAt === 'string'));
});

// ── Scenario 2: Candidate with fake backend is penalised ─────────────────────

describe('Scenario 2 — Fake backend candidate receives low backend dimension score', () => {
  const fakeCandidate = makeFakeBackendCandidate();
  const evaluation    = evaluateCandidate(fakeCandidate);

  it('backend score is below 50', () => assertLt(evaluation.dimensionScores.backend, 50,
    `backend score: ${evaluation.dimensionScores.backend}`));
  it('has weaknesses about fake backend', () => {
    assert(evaluation.weaknesses.some(w => /fake|hardcoded|in-memory|stub/i.test(w)),
      `weaknesses: ${evaluation.weaknesses.join(', ')}`);
  });
  it('total score is below 70', () => assertLt(evaluation.total, 70,
    `total: ${evaluation.total}`));
});

// ── Scenario 3: Missing scripts candidate has lower readiness ─────────────────

describe('Scenario 3 — Missing scripts candidate has lower readiness score', () => {
  const noScripts = makeMissingScriptsCandidate();
  const authentic = makeAuthenticCandidate();

  const noScoreEval = evaluateCandidate(noScripts);
  const authEval    = evaluateCandidate(authentic);

  it('readiness score is lower for no-scripts candidate', () => {
    assertLt(noScoreEval.dimensionScores.readiness, authEval.dimensionScores.readiness,
      `no-scripts readiness=${noScoreEval.dimensionScores.readiness} auth readiness=${authEval.dimensionScores.readiness}`);
  });
  it('readiness report score reflected when present', () => {
    // noScripts has readinessReport.score.total=52, should reflect in dimension score
    assertRange(noScoreEval.dimensionScores.readiness, 30, 70,
      `readiness: ${noScoreEval.dimensionScores.readiness}`);
  });
});

// ── Scenario 4: Missing routes candidate has lower completeness ───────────────

describe('Scenario 4 — Missing routes candidate has lower completeness score', () => {
  const noRoutes  = makeMissingRoutesCandidate();
  const authentic = makeAuthenticCandidate();

  const noRoutesEval = evaluateCandidate(noRoutes);
  const authEval     = evaluateCandidate(authentic);

  it('completeness score is lower for no-routes candidate', () => {
    assertLt(noRoutesEval.dimensionScores.completeness, authEval.dimensionScores.completeness,
      `no-routes=${noRoutesEval.dimensionScores.completeness} auth=${authEval.dimensionScores.completeness}`);
  });
  it('total score is lower', () => {
    assertLt(noRoutesEval.total, authEval.total,
      `no-routes total=${noRoutesEval.total} auth total=${authEval.total}`);
  });
});

// ── Scenario 5: Best candidate selected from 3 ───────────────────────────────

describe('Scenario 5 — Best candidate correctly selected from 3 candidates', () => {
  const candidates = [
    makeMissingScriptsCandidate('candidate_a'),
    makeFakeBackendCandidate('candidate_b'),
    makeAuthenticCandidate('candidate_c'),
  ];

  const result = rankCandidates({ candidates });

  it('authentic candidate wins from 3', () => assertEqual(result.bestCandidateId, 'candidate_c'));
  it('all 3 candidates scored', () => assertEqual(Object.keys(result.scores).length, 3));
  it('candidateCount is 3', () => assertEqual(result.candidateCount, 3));
  it('winner has highest score', () => {
    const winnerScore = result.scores['candidate_c'].total;
    const others = ['candidate_a', 'candidate_b'].map(id => result.scores[id].total);
    assert(others.every(s => winnerScore >= s), `winner=${winnerScore} others=${others}`);
  });
  it('rankings reasons present for winner', () => {
    assert(Array.isArray(result.rankingReasons['candidate_c']));
    assert(result.rankingReasons['candidate_c'].length > 0);
  });
});

// ── Scenario 6: Single-candidate mode ────────────────────────────────────────

describe('Scenario 6 — Single-candidate mode returns score + wraps in ranking result', () => {
  const single = makeAuthenticCandidate('candidate_a');
  const result = rankSingleCandidate(single);

  it('bestCandidateId is candidate_a', () => assertEqual(result.bestCandidateId, 'candidate_a'));
  it('candidateCount is 1', () => assertEqual(result.candidateCount, 1));
  it('multiCandidate is false', () => assert(result.multiCandidate === false));
  it('score is between 0 and 100', () => assertRange(result.scores['candidate_a'].total, 0, 100));
  it('winner files are propagated', () => assert(typeof result.files === 'object'));
  it('winner readinessReport is propagated', () => assert(result.readinessReport !== undefined));
  it('winner authenticityReport is propagated', () => assert(result.authenticityReport !== undefined));
});

// ── Scenario 7: Architecture evaluation ──────────────────────────────────────

describe('Scenario 7 — Architecture evaluator rewards separation of concerns', () => {
  const wellStructured = {
    'package.json':         '{}',
    '.env.example':         'PORT=3000',
    'server.js':            'app.listen(process.env.PORT)',
    'routes/users.js':      'router.get("/", ...)',
    'controllers/user.js':  'module.exports = { getUsers }',
    'models/User.js':       'mongoose.model("User", schema)',
    'services/userService.js': 'async function getUsers() {}',
    'src/components/App.jsx': 'export default function App() {}',
  };

  const poorlyStructured = {
    'package.json': '{}',
    'app.js':       'const users = []; app.get("/", (req, res) => res.json(users));',
  };

  const well = evaluateArchitecture(wellStructured);
  const poor = evaluateArchitecture(poorlyStructured);

  it('well-structured scores higher than poorly-structured', () => assertGt(well.score, poor.score));
  it('well-structured has strengths', () => assert(well.strengths.length > 0));
  it('poorly-structured has weaknesses', () => assert(poor.weaknesses.length > 0));
});

// ── Scenario 8: UX evaluation ─────────────────────────────────────────────────

describe('Scenario 8 — UX evaluator scores loading/error/empty states', () => {
  const withStates = {
    'src/UserList.jsx': `
      const [isLoading, setIsLoading] = useState(true);
      const [error, setError] = useState(null);
      if (isLoading) return <Skeleton />;
      if (error) return <div className="error">{error}</div>;
      if (users.length === 0) return <div className="empty">No results found.</div>;
    `,
  };

  const withoutStates = {
    'src/UserList.jsx': `
      return <ul>{users.map(u => <li key={u.id}>{u.name}</li>)}</ul>;
    `,
  };

  const withResult    = evaluateUx(withStates);
  const withoutResult = evaluateUx(withoutStates);

  it('with-states scores higher', () => assertGt(withResult.score, withoutResult.score));
  it('with-states has loading state strength', () => {
    assert(withResult.strengths.some(s => /loading/i.test(s)));
  });
  it('with-states has error state strength', () => {
    assert(withResult.strengths.some(s => /error/i.test(s)));
  });
  it('with-states has empty state strength', () => {
    assert(withResult.strengths.some(s => /empty/i.test(s)));
  });
});

// ── Scenario 9: Design evaluation ────────────────────────────────────────────

describe('Scenario 9 — Design evaluator rewards CSS custom properties and responsive layout', () => {
  const goodDesign = {
    'styles/globals.css': `
      :root { --primary: #566B48; --bg: #F6F3EF; --text: #1C1610; }
      body { font-size: clamp(1rem, 2vw, 1.25rem); display: flex; }
      @media (max-width: 768px) { body { flex-direction: column; } }
    `,
    'src/components/Button.jsx': 'export function Button() {}',
    'src/components/Card.jsx': 'export function Card() {}',
    'src/components/Modal.jsx': 'export function Modal() {}',
    'src/components/Header.jsx': 'export function Header() {}',
    'src/components/Footer.jsx': 'export function Footer() {}',
  };

  const poorDesign = {
    'styles/main.css': 'body { color: #333; font-size: 16px; }',
  };

  const good = evaluateDesign(goodDesign);
  const poor = evaluateDesign(poorDesign);

  it('good design scores higher', () => assertGt(good.score, poor.score));
  it('good design has CSS vars strength', () => {
    assert(good.strengths.some(s => /css.*propert|design token/i.test(s)));
  });
  it('poor design has missing CSS vars weakness', () => {
    assert(poor.weaknesses.some(w => /css.*propert|custom propert/i.test(w)));
  });
});

// ── Scenario 10: Readiness evaluation with readiness report ──────────────────

describe('Scenario 10 — Readiness evaluator consumes readinessReport score', () => {
  const highReadiness = {
    candidateId: 'test',
    files: {},
    readinessReport: { status: 'ready', score: { total: 92, runtime: 90, deployment: 95, env: 88, security: 95, integrations: 90, build: 90 } },
  };

  const lowReadiness = {
    candidateId: 'test',
    files: {},
    readinessReport: { status: 'not_ready', score: { total: 35, runtime: 30, deployment: 40, env: 35, security: 40, integrations: 40, build: 30 } },
  };

  const highResult = evaluateReadiness({}, highReadiness.readinessReport);
  const lowResult  = evaluateReadiness({}, lowReadiness.readinessReport);

  it('high readiness report produces higher score', () => assertGt(highResult.score, lowResult.score));
  it('high readiness score reflects report total', () => {
    // When readinessReport present, returns its total directly
    assertEqual(highResult.score, 92);
  });
  it('low readiness has weaknesses', () => assert(lowResult.weaknesses.length > 0));
});

// ── Scenario 11: Completeness evaluation with validation report ───────────────

describe('Scenario 11 — Completeness evaluator consumes validationReport score', () => {
  const highVal = { score: 90, criticalIssues: [], warnings: [] };
  const lowVal  = { score: 30, criticalIssues: [{ message: 'Missing routes' }, { message: 'Broken import' }], warnings: [] };

  const files = { 'server.js': 'const express = require("express");' };

  const high = evaluateCompleteness(files, highVal, null, null);
  const low  = evaluateCompleteness(files, lowVal,  null, null);

  it('high validation score gives higher completeness', () => assertGt(high.score, low.score));
  it('low validation score with critical issues has weaknesses', () => {
    assert(low.weaknesses.some(w => /critical|validation/i.test(w)));
  });
});

// ── Scenario 12: summarizeRanking ─────────────────────────────────────────────

describe('Scenario 12 — summarizeRanking returns informative string', () => {
  const result = rankCandidates({
    candidates: [makeAuthenticCandidate('candidate_a'), makeFakeBackendCandidate('candidate_b')],
  });
  const summary = summarizeRanking(result);

  it('summary is a string', () => assert(typeof summary === 'string'));
  it('summary mentions winner', () => assert(summary.includes('candidate_a')));
  it('summary mentions candidateCount', () => assert(summary.includes('candidates=2')));
});

// ── Scenario 13: buildUiRankingPayload ────────────────────────────────────────

describe('Scenario 13 — buildUiRankingPayload returns UI-safe object', () => {
  const result  = rankSingleCandidate(makeAuthenticCandidate());
  const payload = buildUiRankingPayload(result);

  it('has bestCandidateId', ()    => assert('bestCandidateId' in payload));
  it('has candidateCount', ()     => assert('candidateCount'  in payload));
  it('has multiCandidate', ()     => assert('multiCandidate'  in payload));
  it('has scores map', ()         => assert(typeof payload.scores === 'object'));
  it('has bestScore 0–100', ()    => assertRange(payload.bestScore, 0, 100));
  it('has bestReasons array', ()  => assert(Array.isArray(payload.bestReasons)));
  it('has summary string', ()     => assert(typeof payload.summary === 'string'));
});

// ── Scenario 14: Score breakdown completeness ─────────────────────────────────

describe('Scenario 14 — scoreCandidate returns all 7 dimensions', () => {
  const ev = scoreCandidate(makeAuthenticCandidate());

  it('has architecture dimension', () => assert('architecture'  in ev.dimensionScores));
  it('has backend dimension',      () => assert('backend'       in ev.dimensionScores));
  it('has completeness dimension', () => assert('completeness'  in ev.dimensionScores));
  it('has readiness dimension',    () => assert('readiness'     in ev.dimensionScores));
  it('has ux dimension',           () => assert('ux'            in ev.dimensionScores));
  it('has design dimension',       () => assert('design'        in ev.dimensionScores));
  it('has consistency dimension',  () => assert('consistency'   in ev.dimensionScores));
  it('all dimensions 0–100', () => {
    for (const [dim, val] of Object.entries(ev.dimensionScores)) {
      assertRange(val, 0, 100, `${dim}=${val}`);
    }
  });
  it('total is 0–100', () => assertRange(ev.total, 0, 100));
  it('has strengths array', ()  => assert(Array.isArray(ev.strengths)));
  it('has weaknesses array', () => assert(Array.isArray(ev.weaknesses)));
  it('has reasons array', ()    => assert(Array.isArray(ev.reasons)));
});

// ── Scenario 15: calculateRankingScore convenience helper ──────────────────────

describe('Scenario 15 — calculateRankingScore returns a number', () => {
  it('authentic candidate returns > 60', () => {
    const score = calculateRankingScore(makeAuthenticCandidate());
    assertGt(score, 60, `score: ${score}`);
  });
  it('fake backend candidate returns lower score', () => {
    const fakeScore = calculateRankingScore(makeFakeBackendCandidate());
    const authScore = calculateRankingScore(makeAuthenticCandidate());
    assertLt(fakeScore, authScore, `fake=${fakeScore} auth=${authScore}`);
  });
});

// ── Results ───────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(50));
if (failed === 0) {
  console.log(`  All ${passed} tests passed.`);
} else {
  console.log(`  ${passed} passed, ${failed} failed.`);
  for (const f of failures) console.log(`  ✗ ${f.label}: ${f.error}`);
  process.exitCode = 1;
}
console.log('─'.repeat(50) + '\n');
