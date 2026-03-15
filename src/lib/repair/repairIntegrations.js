'use strict';

/**
 * INTEGRATIONS REPAIR
 *
 * Creates wrapper files for missing third-party integrations detected by the
 * validator. Each wrapper includes:
 *   - Proper require/init with env-var guard
 *   - 2–3 useful exported functions with TODO stubs
 *   - Graceful fallback when env vars are absent
 *
 * Only creates files when grounded by validator issues with willAutoRepair=true.
 *
 * @param {import('./types').RepairContext} ctx
 * @returns {import('./types').RepairIssueResult[]}
 */
function repairIntegrations(ctx) {
  const { fileMap, filePaths, issues, decisions } = ctx;
  /** @type {import('./types').RepairIssueResult[]} */
  const results = [];

  const integrationIssues = issues.filter(i => {
    const d = decisions.get(i.id);
    return d && d.willAutoRepair && i.id.startsWith('missing_integration_file:');
  });

  if (integrationIssues.length === 0) return results;

  for (const issue of integrationIssues) {
    const integrationName = issue.id.slice('missing_integration_file:'.length);
    const spec = INTEGRATION_SPECS[integrationName];
    if (!spec) continue;

    // Don't overwrite an existing file
    const targetPath = _resolveIntegrationPath(integrationName, filePaths);
    if (filePaths.has(targetPath)) continue;

    const content = spec.generate(targetPath);
    if (!content) continue;

    fileMap.set(targetPath, content);
    filePaths.add(targetPath);

    results.push({
      issueId:    issue.id,
      action:     'created_file',
      path:       targetPath,
      reason:     `Created ${targetPath} — ${spec.description}`,
      safety:     'conditional_auto_repair',
      confidence: 0.78,
    });
  }

  return results;
}

// ── Integration specs ─────────────────────────────────────────────────────────

/** @type {Record<string, { description: string, defaultFile: string, generate: (path: string) => string }>} */
const INTEGRATION_SPECS = {

  openai: {
    description: 'OpenAI API client wrapper',
    defaultFile: 'openai.js',
    generate: () => `'use strict';

const { OpenAI } = require('openai');

if (!process.env.OPENAI_API_KEY) {
  console.warn('[openai] OPENAI_API_KEY is not set — AI features will be unavailable');
}

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/**
 * Send a chat completion request.
 * @param {{ model?: string, messages: Array<{role: string, content: string}>, maxTokens?: number }} opts
 * @returns {Promise<string>}
 */
async function chat({ model = 'gpt-4o-mini', messages, maxTokens = 1000 }) {
  if (!client) throw new Error('OpenAI client not initialised — set OPENAI_API_KEY');
  const res = await client.chat.completions.create({
    model,
    messages,
    max_tokens: maxTokens,
  });
  return res.choices[0]?.message?.content || '';
}

/**
 * Generate a text embedding vector.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function embed(text) {
  if (!client) throw new Error('OpenAI client not initialised — set OPENAI_API_KEY');
  const res = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return res.data[0].embedding;
}

module.exports = { chat, embed };
`,
  },

  anthropic: {
    description: 'Anthropic Claude API client wrapper',
    defaultFile: 'anthropic.js',
    generate: () => `'use strict';

const Anthropic = require('@anthropic-ai/sdk');

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[anthropic] ANTHROPIC_API_KEY is not set — AI features will be unavailable');
}

const client = process.env.ANTHROPIC_API_KEY
  ? new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

/**
 * Send a message to Claude.
 * @param {{ system?: string, userMessage: string, model?: string, maxTokens?: number }} opts
 * @returns {Promise<string>}
 */
async function sendMessage({ system, userMessage, model = 'claude-haiku-4-5-20251001', maxTokens = 1024 }) {
  if (!client) throw new Error('Anthropic client not initialised — set ANTHROPIC_API_KEY');

  const msg = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system:     system || undefined,
    messages:   [{ role: 'user', content: userMessage }],
  });

  return msg.content[0]?.type === 'text' ? msg.content[0].text : '';
}

module.exports = { sendMessage };
`,
  },

  sendgrid: {
    description: 'SendGrid email wrapper',
    defaultFile: 'email.js',
    generate: () => `'use strict';

const sgMail = require('@sendgrid/mail');

if (!process.env.SENDGRID_API_KEY) {
  console.warn('[sendgrid] SENDGRID_API_KEY is not set — emails will be logged only');
} else {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@example.com';
const FROM_NAME  = process.env.FROM_NAME  || 'App';

/**
 * Send a transactional email.
 * @param {{ to: string, subject: string, text?: string, html?: string }} opts
 */
async function sendEmail({ to, subject, text, html }) {
  const msg = {
    to,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject,
    text:  text || '',
    html:  html || text || '',
  };

  if (!process.env.SENDGRID_API_KEY) {
    console.log('[email] Would send:', msg);
    return;
  }

  await sgMail.send(msg);
}

/**
 * Send a welcome email to a new user.
 * @param {{ to: string, name: string }} opts
 */
async function sendWelcomeEmail({ to, name }) {
  return sendEmail({
    to,
    subject: \`Welcome to \${FROM_NAME}!\`,
    html:    \`<p>Hi \${name},</p><p>Welcome! Your account is ready.</p>\`,
  });
}

/**
 * Send a password reset email.
 * @param {{ to: string, resetUrl: string }} opts
 */
async function sendPasswordReset({ to, resetUrl }) {
  return sendEmail({
    to,
    subject: 'Reset your password',
    html:    \`<p>Click <a href="\${resetUrl}">here</a> to reset your password. This link expires in 1 hour.</p>\`,
  });
}

module.exports = { sendEmail, sendWelcomeEmail, sendPasswordReset };
`,
  },

  twilio: {
    description: 'Twilio SMS/voice wrapper',
    defaultFile: 'sms.js',
    generate: () => `'use strict';

if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
  console.warn('[twilio] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set — SMS will be logged only');
}

const client = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
  ? require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER || '';

/**
 * Send an SMS message.
 * @param {{ to: string, body: string }} opts
 */
async function sendSms({ to, body }) {
  if (!client) {
    console.log('[sms] Would send to', to, ':', body);
    return;
  }
  return client.messages.create({ from: FROM_NUMBER, to, body });
}

module.exports = { sendSms };
`,
  },

  firebase: {
    description: 'Firebase Admin SDK wrapper',
    defaultFile: 'firebase.js',
    generate: () => `'use strict';

const admin = require('firebase-admin');

if (!process.env.FIREBASE_SERVICE_ACCOUNT && !process.env.FIREBASE_PROJECT_ID) {
  console.warn('[firebase] Firebase credentials not set — Firebase features unavailable');
}

let app;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else if (process.env.FIREBASE_PROJECT_ID) {
    app = admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
  }
} catch (err) {
  console.error('[firebase] Init failed:', err.message);
}

const db       = app ? admin.firestore() : null;
const authInst = app ? admin.auth()      : null;

/**
 * Get a Firestore document.
 * @param {string} collection
 * @param {string} docId
 */
async function getDoc(collection, docId) {
  if (!db) throw new Error('Firestore not initialised');
  const snap = await db.collection(collection).doc(docId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Set a Firestore document (merge by default).
 * @param {string} collection
 * @param {string} docId
 * @param {Object} data
 */
async function setDoc(collection, docId, data) {
  if (!db) throw new Error('Firestore not initialised');
  await db.collection(collection).doc(docId).set(data, { merge: true });
}

/**
 * Verify a Firebase ID token.
 * @param {string} token
 */
async function verifyIdToken(token) {
  if (!authInst) throw new Error('Firebase Auth not initialised');
  return authInst.verifyIdToken(token);
}

module.exports = { getDoc, setDoc, verifyIdToken };
`,
  },

  supabase: {
    description: 'Supabase client wrapper',
    defaultFile: 'supabase.js',
    generate: () => `'use strict';

const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.warn('[supabase] SUPABASE_URL / SUPABASE_ANON_KEY not set — Supabase features unavailable');
}

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  : null;

/**
 * Select rows from a table.
 * @param {string} table
 * @param {{ filters?: Object, limit?: number, orderBy?: string }} opts
 */
async function selectRows(table, { filters = {}, limit = 100, orderBy } = {}) {
  if (!supabase) throw new Error('Supabase client not initialised');
  let query = supabase.from(table).select('*').limit(limit);
  for (const [key, val] of Object.entries(filters)) query = query.eq(key, val);
  if (orderBy) query = query.order(orderBy);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Insert a row into a table.
 * @param {string} table
 * @param {Object} row
 */
async function insertRow(table, row) {
  if (!supabase) throw new Error('Supabase client not initialised');
  const { data, error } = await supabase.from(table).insert(row).select().single();
  if (error) throw error;
  return data;
}

/**
 * Update rows in a table by filter.
 * @param {string} table
 * @param {Object} filter   e.g. { id: 'abc' }
 * @param {Object} updates
 */
async function updateRow(table, filter, updates) {
  if (!supabase) throw new Error('Supabase client not initialised');
  let query = supabase.from(table).update(updates);
  for (const [key, val] of Object.entries(filter)) query = query.eq(key, val);
  const { data, error } = await query.select();
  if (error) throw error;
  return data;
}

module.exports = { supabase, selectRows, insertRow, updateRow };
`,
  },

};

// ── Path resolution ────────────────────────────────────────────────────────────

function _resolveIntegrationPath(name, filePaths) {
  const spec = INTEGRATION_SPECS[name];
  if (!spec) return `${name}.js`;

  // Check if project uses a src/ layout
  const usesSrc = [...filePaths].some(p => p.startsWith('src/'));
  const base = spec.defaultFile;
  return usesSrc ? `src/${base}` : base;
}

module.exports = { repairIntegrations };
