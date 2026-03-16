'use strict';

/**
 * Fake Integration Detector
 *
 * Detects integration UI or function calls that are not backed by real
 * API connections: email sending that console.logs, AI chat with static
 * responses, push notifications without a provider, etc.
 */

// Integration catalog: { name, uiSignals, backendSignals, envVars, fakeSignals }
const INTEGRATIONS = [
  {
    name:           'Email (SendGrid / Resend / Nodemailer)',
    category:       'email',
    uiSignals:      [/send\s*email|email.*form|contact.*form|newsletter/i],
    backendSignals: [/sendgrid|resend|nodemailer|sgMail|transporter\.sendMail/],
    envVars:        ['SENDGRID_API_KEY', 'RESEND_API_KEY', 'SMTP_HOST', 'EMAIL_FROM'],
    fakeSignals:    [/console\.log.*email|alert.*email sent|setEmailSent\s*\(\s*true/i],
  },
  {
    name:           'OpenAI / AI chat',
    category:       'openai',
    uiSignals:      [/ai\s*chat|chatbot|ask\s*ai|generate.*ai|gpt/i],
    backendSignals: [/openai|OpenAI\(|client\.chat\.completions|anthropic/],
    envVars:        ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'],
    fakeSignals:    [/hardcoded.*response|fakeResponse|mockAI|static.*reply|setTimeout.*resolve.*['"`]/i],
  },
  {
    name:           'Push Notifications',
    category:       'push',
    uiSignals:      [/push.*notification|notify\s*user|send.*notification/i],
    backendSignals: [/firebase-admin|web-push|apn|fcm|expo-server-sdk/],
    envVars:        ['FCM_SERVER_KEY', 'VAPID_PUBLIC_KEY', 'FIREBASE_SERVER_KEY'],
    fakeSignals:    [/console\.log.*notif|alert.*notif|setNotified\s*\(\s*true/i],
  },
  {
    name:           'SMS (Twilio)',
    category:       'sms',
    uiSignals:      [/send\s*sms|text\s*message|phone.*verify|sms/i],
    backendSignals: [/twilio|client\.messages\.create/],
    envVars:        ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
    fakeSignals:    [/console\.log.*sms|fakeSms|smsSent\s*=\s*true/i],
  },
  {
    name:           'File Upload (Cloudinary / S3)',
    category:       'storage',
    uiSignals:      [/upload.*file|file.*upload|image.*upload/i],
    backendSignals: [/cloudinary|multer|s3\.upload|@aws-sdk\/client-s3/],
    envVars:        ['CLOUDINARY_URL', 'AWS_S3_BUCKET', 'AWS_ACCESS_KEY_ID'],
    fakeSignals:    [/fakeUpload|setUploaded\s*\(\s*true|URL\.createObjectURL/i],
  },
];

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * @param {Object} files - Normalized file map { path: content }
 * @returns {import('./types').AuthenticityIssue[]}
 */
function checkFakeIntegrations(files) {
  const issues      = [];
  const allContent  = Object.values(files).join('\n');

  const backendContent = Object.entries(files)
    .filter(([p]) => _isBackendFile(p))
    .map(([, c]) => c).join('\n');

  const envContent = Object.entries(files)
    .filter(([p]) => p.endsWith('.env.example') || p.endsWith('.env'))
    .map(([, c]) => c).join('\n');

  for (const integration of INTEGRATIONS) {
    // Check if the project UI implies this integration
    const uiImplied = integration.uiSignals.some(re => re.test(allContent));
    if (!uiImplied) continue;

    // Check if real backend connection exists
    const hasBackend = integration.backendSignals.some(re => re.test(backendContent));
    const hasEnvVar  = integration.envVars.some(v => allContent.includes(v));

    // Check if fake pattern is present
    const hasFakeSignal = integration.fakeSignals.some(re => re.test(allContent));

    if (!hasBackend && !hasEnvVar) {
      if (hasFakeSignal) {
        // Actively simulating (console.log, setEmailSent) — fake, not just unconfigured
        issues.push({
          id:       `fake-integration-${integration.category}-stub`,
          category: 'fake_integration',
          severity: 'critical',
          message:  `${integration.name} handler simulates success (console.log / setState) with no backend implementation.`,
          fix:      `Replace the stub with a real ${integration.name} backend call. Add ${integration.envVars[0]} to .env.example.`,
          pattern:  integration.fakeSignals.map(r => r.source).join(' | '),
        });
      } else {
        // Unconfigured but not actively faking — acceptable placeholder
        issues.push({
          id:       `fake-integration-${integration.category}-no-backend`,
          category: 'fake_integration',
          severity: 'high',
          message:  `Project implies ${integration.name} functionality but has no backend integration or env var configured.`,
          fix:      `Install and configure the ${integration.name} SDK. Add ${integration.envVars[0]} to .env.example.`,
          pattern:  `${integration.name} UI present, no backend`,
        });
      }
    } else if (hasFakeSignal) {
      // Has backend/env but still using a fake signal — also a problem
      issues.push({
        id:       `fake-integration-${integration.category}-stub`,
        category: 'fake_integration',
        severity: 'high',
        message:  `${integration.name} handler uses console.log, alert, or setState to simulate a successful integration call.`,
        fix:      `Replace the stub with a real ${integration.name} API call in the backend.`,
        pattern:  integration.fakeSignals.map(r => r.source).join(' | '),
      });
    }
  }

  // ── File-level: functions that resolve/return static strings as "AI" ──
  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue;
    if (/\.(test|spec)\.[jt]sx?$/.test(path)) continue;

    // Detect patterns like: return "This is a response from AI" (fake AI)
    if (
      /(?:aiResponse|chatResponse|generateResponse|getAIResponse)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?:=>)?\s*\{\s*return\s*['"`]/.test(content)
    ) {
      issues.push({
        id:       `fake-integration-static-ai-response-${_slug(path)}`,
        category: 'fake_integration',
        severity: 'critical',
        message:  `${path} returns a hardcoded string as an "AI response" — this is a fake integration.`,
        fix:      'Call the real OpenAI/Anthropic API from a backend endpoint and return the actual model response.',
        file:     path,
        pattern:  "return 'This is a response from AI'",
      });
    }
  }

  return _dedup(issues);
}

// ── Private helpers ──────────────────────────────────────────────────────────

function _isBackendFile(path) {
  if (/\.(test|spec)\.[jt]sx?$/.test(path)) return false;
  return (
    path.endsWith('server.js') || path.endsWith('server.ts') ||
    path.endsWith('app.js')    || path.endsWith('app.ts') ||
    path.includes('routes/')   || path.includes('controllers/') ||
    path.includes('services/') || path.endsWith('src/index.js')
  );
}

function _dedup(issues) {
  const seen = new Set();
  return issues.filter(i => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
}

function _slug(str) {
  return str.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').slice(0, 40);
}

module.exports = { checkFakeIntegrations };
