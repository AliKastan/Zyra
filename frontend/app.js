/* Zyra — app.js */

// ── Multi-conversation storage ────────────────────────────────────────────────
const CONVS_KEY = 'zyra_convs_v2';
const OLD_CONV_KEY = 'zyra_conv_v1';

// Conversation shape:
// { id, title, messages[], createdAt, updatedAt, starred, projectSlug, previewUrl, _titled }

let conversations = [];  // array of conversation objects
let activeConvId  = null;
let messages      = [];  // reference to active conv's messages array

function getActiveConv() {
  return conversations.find(c => c.id === activeConvId) || null;
}

function loadAllData() {
  try {
    const raw = localStorage.getItem(CONVS_KEY);
    if (raw) conversations = JSON.parse(raw);
  } catch (_) { conversations = []; }

  // Migrate old single-conversation data if no conversations exist yet
  if (conversations.length === 0) {
    migrateOldData();
  }

  // Mark any still-generating messages as interrupted
  conversations.forEach(conv => {
    conv.messages.forEach(m => {
      if (m.type === 'assistant' && m.status === 'generating') {
        m.status = 'interrupted';
      }
    });
  });

  // Set active conversation to most recent
  if (conversations.length > 0) {
    activeConvId = conversations[0].id;
    messages = conversations[0].messages;
  } else {
    createNewConversation();
  }

  saveAllData();
}

function saveAllData() {
  try { localStorage.setItem(CONVS_KEY, JSON.stringify(conversations)); } catch (_) {}
}

function migrateOldData() {
  try {
    const raw = localStorage.getItem(OLD_CONV_KEY);
    if (!raw) return;
    const oldMsgs = JSON.parse(raw);
    if (!Array.isArray(oldMsgs) || oldMsgs.length === 0) return;
    const conv = {
      id: uid(),
      title: generateTitle(oldMsgs),
      messages: oldMsgs,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      starred: false,
      projectSlug: null,
      previewUrl: null,
      _titled: true,
    };
    // Find slug from completed messages
    const completed = oldMsgs.find(m => m.type === 'assistant' && m.status === 'completed' && m.slug);
    if (completed) conv.projectSlug = completed.slug;
    conversations.unshift(conv);
  } catch (_) {}
}

function createNewConversation() {
  // If the current conversation is already empty, just reset it in place
  const current = getActiveConv();
  if (current && current.messages.length === 0) {
    current.title = 'New project';
    current._titled = false;
    current.projectSlug = null;
    current.previewUrl = null;
    current.updatedAt = Date.now();
    saveAllData();
    return current;
  }
  const conv = {
    id: uid(),
    title: 'New project',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    starred: false,
    projectSlug: null,
    previewUrl: null,
    _titled: false,
  };
  conversations.unshift(conv);
  activeConvId = conv.id;
  messages = conv.messages;
  return conv;
}

function switchToConversation(convId) {
  const conv = conversations.find(c => c.id === convId);
  if (!conv || convId === activeConvId) return;

  stopPolling();
  stopPreviewPoll();
  setGenerating(false);
  activeMessageId = null;
  currentJobId    = null;

  activeConvId = convId;
  messages = conv.messages;

  currentSlug       = conv.projectSlug || null;
  currentPreviewUrl = conv.previewUrl  || null;

  renderAllMessages();
  renderHistory();
  updateEditingBanner();
  updateDeployButton(currentSlug);

  if (currentSlug && currentPreviewUrl) {
    activatePreview({ url: currentPreviewUrl });
    loadCodeFileList(currentSlug);
  } else if (currentSlug) {
    loadCodeFileList(currentSlug);
    initiatePreview(currentSlug);
  } else {
    setPreviewState('empty');
    previewUrlBar.style.display = 'none';
  }
}

function toggleStar(convId) {
  const conv = conversations.find(c => c.id === convId);
  if (!conv) return;
  conv.starred = !conv.starred;
  saveAllData();
  renderHistory();
}

function generateTitle(msgs) {
  const firstUser = msgs.find(m => m.type === 'user' && m.text);
  if (!firstUser) return 'Untitled project';
  const words = firstUser.text.trim().split(/\s+/);
  if (words.length <= 7) return firstUser.text.trim();
  return words.slice(0, 7).join(' ') + '...';
}

// ── State ─────────────────────────────────────────────────────────────────────
let currentMode         = 'balanced';
let currentJobId        = null;
let pollInterval        = null;
let activeMessageId     = null;   // ID of the currently-generating assistant message

// Preview
let currentSlug         = null;
let currentPreviewUrl   = null;
let previewPollInterval = null;
let currentDevice       = 'desktop';
let currentTab          = 'preview';

// ── Job states ────────────────────────────────────────────────────────────────
const ACTIVE_STATES   = new Set(['queued', 'planning', 'coding', 'reviewing', 'finalizing']);
const TERMINAL_STATES = new Set(['completed', 'complete', 'failed', 'cancelled', 'timed_out']);

function isActive(s)   { return ACTIVE_STATES.has(s); }
function isTerminal(s) { return TERMINAL_STATES.has(s); }

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const promptInput     = $('prompt-input');
const charCount       = $('char-count');
const complexityBadge = $('complexity-badge');
const generateBtn     = $('generate-btn');
const promptError     = $('prompt-error');
const modeBar         = $('mode-bar');
const convThread      = $('conv-thread');
const convWelcome     = $('conv-welcome');
const newChatBtn      = $('new-chat-btn');

// Preview
const previewUrlBar      = $('preview-url-bar');
const previewUrlText     = $('preview-url-text');
const previewContentArea = $('preview-content-area');
const stateEmpty         = $('state-empty');
const stateLoading       = $('state-loading');
const stateFrame         = $('state-frame');
const stateError         = $('state-error');
const previewIframe      = $('preview-iframe');
const deviceWrapper      = $('device-wrapper');
const browserUrlDisplay  = $('browser-url-display');
const refreshPreviewBtn  = $('refresh-preview-btn');
const openTabBtn         = $('open-tab-btn');
const retryPreviewBtn    = $('retry-preview-btn');

// Code
const codeArea     = $('code-area');
const codeFileList = $('code-file-list');
const codeText     = $('code-text');
const codeFileName = $('code-file-name');

// ── Health ────────────────────────────────────────────────────────────────────
async function checkHealth() {
  try { await apiFetch('/api/health'); } catch (_) {}
}

// ── Mode selection ────────────────────────────────────────────────────────────
modeBar.addEventListener('click', (e) => {
  const btn = e.target.closest('.mode-btn');
  if (!btn) return;
  currentMode = btn.dataset.mode;
  modeBar.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('mode-btn--active'));
  btn.classList.add('mode-btn--active');
});

// ── Prompt input ──────────────────────────────────────────────────────────────
const MAX_CHARS = 3000;

promptInput.addEventListener('input', () => {
  const len = promptInput.value.length;
  charCount.textContent = `${len} / ${MAX_CHARS}`;
  charCount.className = 'char-count' +
    (len >= MAX_CHARS ? ' at-limit' : len > MAX_CHARS * 0.9 ? ' near-limit' : '');
  updateComplexityBadge(promptInput.value);
});

promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    generateBtn.click();
  }
});

function updateComplexityBadge(text) {
  if (!text.trim()) {
    complexityBadge.textContent = '—';
    complexityBadge.className = 'complexity-badge complexity-unknown';
    return;
  }
  const c = classifyLocally(text);
  const labels = { simple: 'Simple', medium: 'Medium', complex: 'Complex' };
  const est    = { simple: '~30s',   medium: '~2 min', complex: '~5 min' };
  complexityBadge.textContent = `${labels[c.level]} · ${est[c.level]}`;
  complexityBadge.className = `complexity-badge complexity-${c.level}`;
}

function classifyLocally(prompt) {
  const text  = prompt.toLowerCase().trim();
  const chars = prompt.length;
  const words = text.split(/\s+/).length;
  const complex = ['full-stack','fullstack','auth','authentication','login','register','database','db','sql','postgres','mongodb','prisma','payment','stripe','billing','subscription','saas','crm','erp','admin panel','role','permissions','multi-user','user management','real-time','websocket','notifications','email','oauth','jwt','session','backend api','rest api','graphql','microservice'];
  const simple  = ['landing page','landing','portfolio','personal site','resume site','todo','task list','calculator','counter','timer','stopwatch','simple form','contact form','quiz','survey','simple','basic','minimal','static site','single page','one page','static','brochure','homepage'];
  let score = 0;
  if (chars > 300)  score += 1;
  if (chars > 800)  score += 1;
  if (chars > 1500) score += 2;
  if (words > 50)   score += 1;
  if (words > 150)  score += 2;
  complex.forEach((kw) => { if (text.includes(kw)) score += 2; });
  simple.forEach((kw)  => { if (text.includes(kw)) score -= 2; });
  score = Math.max(0, score);
  if (score <= 1) return { level: 'simple'  };
  if (score <= 5) return { level: 'medium'  };
  return              { level: 'complex' };
}

// Example chips
document.querySelectorAll('.example-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    promptInput.value = chip.dataset.prompt;
    promptInput.dispatchEvent(new Event('input'));
    promptInput.focus();
  });
});

// ── Auth modal ────────────────────────────────────────────────────────────────
const authModalOverlay = $('auth-modal-overlay');
let _pendingPrompt = null;   // prompt queued while waiting for sign-in

function openAuthModal(tagline) {
  if (tagline) $('auth-modal-tagline').textContent = tagline;
  authModalOverlay.classList.remove('hidden');
  setTimeout(() => authModalOverlay.classList.add('auth-modal-visible'), 10);
  $('auth-email').focus();
}

function closeAuthModal() {
  authModalOverlay.classList.remove('auth-modal-visible');
  authModalOverlay.addEventListener('transitionend', () => authModalOverlay.classList.add('hidden'), { once: true });
  $('auth-modal-error').textContent = '';
  _pendingPrompt = null;
}

$('auth-modal-close').addEventListener('click', closeAuthModal);
authModalOverlay.addEventListener('click', (e) => { if (e.target === authModalOverlay) closeAuthModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAuthModal(); });

// Tab switching
let authModalMode = 'signin';
$('auth-tab-signin').addEventListener('click', () => {
  authModalMode = 'signin';
  $('auth-tab-signin').classList.add('auth-tab--active');
  $('auth-tab-signup').classList.remove('auth-tab--active');
  $('auth-submit-btn').textContent = 'Sign in';
  $('auth-password').autocomplete = 'current-password';
  $('auth-modal-error').textContent = '';
});
$('auth-tab-signup').addEventListener('click', () => {
  authModalMode = 'signup';
  $('auth-tab-signup').classList.add('auth-tab--active');
  $('auth-tab-signin').classList.remove('auth-tab--active');
  $('auth-submit-btn').textContent = 'Create account';
  $('auth-password').autocomplete = 'new-password';
  $('auth-modal-error').textContent = '';
});

// Form submit
$('auth-modal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = $('auth-email').value.trim();
  const password = $('auth-password').value;
  const submitBtn = $('auth-submit-btn');
  $('auth-modal-error').textContent = '';

  if (!email || !password) { $('auth-modal-error').textContent = 'Please enter your email and password.'; return; }

  submitBtn.disabled = true;
  submitBtn.textContent = authModalMode === 'signup' ? 'Creating account...' : 'Signing in...';

  try {
    const sb = window._zyraAuth._sb;
    let result;
    if (authModalMode === 'signup') {
      result = await sb.auth.signUp({ email, password });
      if (!result.error && result.data.user && !result.data.session) {
        $('auth-modal-error').textContent = 'Check your email to confirm your account, then sign in.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create account';
        return;
      }
    } else {
      result = await sb.auth.signInWithPassword({ email, password });
    }
    if (result.error) throw result.error;
    // onAuthStateChange in auth.js will fire; we listen below
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.textContent = authModalMode === 'signup' ? 'Create account' : 'Sign in';
    $('auth-modal-error').textContent = friendlyAuthError(err.message);
  }
});

// Google OAuth
$('auth-google-btn').addEventListener('click', async () => {
  $('auth-google-btn').disabled = true;
  $('auth-modal-error').textContent = '';
  try {
    const { error } = await window._zyraAuth._sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/' },
    });
    if (error) throw error;
  } catch (err) {
    $('auth-google-btn').disabled = false;
    $('auth-modal-error').textContent = friendlyAuthError(err.message);
  }
});

function friendlyAuthError(msg) {
  if (!msg) return 'Something went wrong. Please try again.';
  if (msg.includes('Invalid login credentials')) return 'Incorrect email or password.';
  if (msg.includes('Email not confirmed'))       return 'Please confirm your email before signing in.';
  if (msg.includes('already registered'))        return 'An account with this email already exists.';
  if (msg.includes('Password should'))           return 'Password must be at least 6 characters.';
  if (msg.includes('rate limit'))                return 'Too many attempts. Please wait a moment.';
  return msg;
}

// When auth state changes to signed-in, close modal and resume pending prompt
document.addEventListener('zyra:auth-changed', (e) => {
  const { event, user } = e.detail || {};
  updateAccountMenu(user);
  if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && user) {
    closeAuthModal();
    if (_pendingPrompt) {
      const p = _pendingPrompt;
      _pendingPrompt = null;
      handlePromptSubmit(p);
    }
  }
});

// When initial session resolves, update account menu
document.addEventListener('zyra:auth-ready', (e) => {
  updateAccountMenu(e.detail?.user || null);
});

function setupAccountMenu(user) {
  const btn      = $('account-avatar-btn');
  const dropdown = $('account-dropdown');
  const img      = $('avatar-img');
  const initials = $('avatar-initials');
  if (!btn || !dropdown) return;

  const photoUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  if (photoUrl) {
    img.src = photoUrl;
    img.classList.remove('hidden');
    initials.classList.add('hidden');
  } else {
    const letter = (user?.user_metadata?.full_name?.[0] || user?.email?.[0] || 'Z').toUpperCase();
    initials.textContent = letter;
    img.classList.add('hidden');
    initials.classList.remove('hidden');
  }

  const nameEl  = $('dropdown-user-name');
  const emailEl = $('dropdown-user-email');
  if (nameEl)  nameEl.textContent  = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Account';
  if (emailEl) emailEl.textContent = user?.email || '';

  btn.classList.remove('hidden');

  // Attach toggle listener only once
  if (!btn._menuBound) {
    btn._menuBound = true;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('hidden');
    });
    document.addEventListener('click', () => dropdown.classList.add('hidden'));
    $('dropdown-signout')?.addEventListener('click', () => {
      dropdown.classList.add('hidden');
      window._zyraAuth?.signOut?.();
    });
  }
}

function updateAccountMenu(user) {
  if (user) {
    setupAccountMenu(user);
  } else {
    const btn = $('account-avatar-btn');
    if (btn) btn.classList.add('hidden');
  }
}

// ── Intent classification (client-side) ───────────────────────────────────────

const NEW_PROJECT_PATTERNS = [
  /\b(create|build|make|generate|develop|write|code)\b.{0,50}\b(app|application|game|website|site|tool|dashboard|platform|program)\b/i,
  /\b(new|another|fresh|different|separate)\b.{0,30}\b(app|project|game|website|page|tool|site)\b/i,
  /\b(tetris|pacman|pac-man|chess|checkers|snake|pong|flappy|asteroids|minesweeper|sudoku|2048|breakout|space invaders)\b/i,
  /\b(landing page|portfolio site|todo app|task manager|weather app|quiz app|note.?taking app|expense tracker|recipe app|music player|chat app)\b/i,
  /\b(start over|from scratch|completely new|brand new|whole new|restart|build from)\b/i,
];

function classifyIntent(prompt, activeProjectSlug) {
  if (!activeProjectSlug) return 'NEW_PROJECT_REQUEST';
  const text = prompt.trim();
  for (const pattern of NEW_PROJECT_PATTERNS) {
    if (pattern.test(text)) return 'NEW_PROJECT_REQUEST';
  }
  const isQuestion =
    /^(why|what|how|when|where|which|who|is |are |can |could |should |would |will )/i.test(text) &&
    text.length < 120 && !text.includes('\n');
  if (isQuestion) return 'QUESTION';
  // Bug fix check
  if (/\b(bug|broken|error|crash|doesn't work|not working|fails|fix|glitch|issue|problem)\b/i.test(text)) {
    return 'BUG_FIX_REQUEST';
  }
  return 'PROJECT_EDIT_REQUEST';
}

// ── Editing banner ────────────────────────────────────────────────────────────

const editingBanner      = $('editing-banner');
const editingProjectName = $('editing-project-name');

function updateEditingBanner() {
  const conv = getActiveConv();
  const slug = conv?.projectSlug;
  if (slug) {
    editingBanner.classList.remove('hidden');
    // Format slug nicely: "my-todo-app" → "my todo app"
    editingProjectName.textContent = slug.replace(/-/g, ' ');
  } else {
    editingBanner.classList.add('hidden');
  }
}

// ── Generate ──────────────────────────────────────────────────────────────────
generateBtn.addEventListener('click', () => handlePromptSubmit());

async function handlePromptSubmit(prefill) {
  const prompt = (prefill || promptInput.value).trim();
  promptError.textContent = '';

  if (!prompt) { promptError.textContent = 'Please describe what you want to build.'; return; }
  if (prompt.length > MAX_CHARS) { promptError.textContent = 'Prompt is too long.'; return; }

  // Auth gate
  if (!window._zyraAuth?.getToken()) {
    _pendingPrompt = prompt;
    openAuthModal('Sign in to generate your app.');
    return;
  }

  const activeConv   = getActiveConv();
  const activeSlug   = activeConv?.projectSlug || null;
  const intent       = classifyIntent(prompt, activeSlug);

  if ((intent === 'PROJECT_EDIT_REQUEST' || intent === 'CONTENT_CHANGE_REQUEST' || intent === 'BUG_FIX_REQUEST') && activeSlug) {
    return startEdit(prompt, activeSlug);
  }
  return startGeneration(prompt, prefill != null);
}

async function startGeneration(prompt, isPrefill = false) {
  if (isPrefill) promptInput.value = prompt;
  setGenerating(true);

  // Add user message
  const userMsgId = uid();
  addMessage({ id: userMsgId, type: 'user', text: prompt, timestamp: Date.now() });

  // Add generating assistant message
  const asstMsgId = uid();
  activeMessageId = asstMsgId;
  addMessage({
    id: asstMsgId,
    type: 'assistant',
    status: 'generating',
    userPrompt: prompt,
    mode: currentMode,
    timestamp: Date.now(),
  });

  // Clear input
  promptInput.value = '';
  promptInput.dispatchEvent(new Event('input'));

  setPreviewState('loading', 'Generating your app...', '');

  try {
    const data = await apiFetch('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt, mode: currentMode }),
    });
    currentJobId = data.jobId;
    startPolling(currentJobId);
  } catch (err) {
    setGenerating(false);
    updateMessage(asstMsgId, { status: 'failed', error: err.message });
    setPreviewState('error', 'Generation failed', err.message);
    activeMessageId = null;
  }
}

async function startEdit(prompt, projectSlug) {
  setGenerating(true);

  // Add user message
  const userMsgId = uid();
  addMessage({ id: userMsgId, type: 'user', text: prompt, timestamp: Date.now() });

  // Add generating assistant message (tagged as edit)
  const asstMsgId = uid();
  activeMessageId = asstMsgId;
  addMessage({
    id: asstMsgId,
    type: 'assistant',
    status: 'generating',
    userPrompt: prompt,
    mode: currentMode,
    isEdit: true,
    editSlug: projectSlug,
    timestamp: Date.now(),
  });

  // Clear input
  promptInput.value = '';
  promptInput.dispatchEvent(new Event('input'));

  setPreviewState('loading', 'Applying changes...', '');

  try {
    const data = await apiFetch(`/api/edit/${encodeURIComponent(projectSlug)}`, {
      method: 'POST',
      body: JSON.stringify({ prompt, mode: currentMode }),
    });
    currentJobId = data.jobId;
    startPolling(currentJobId);
  } catch (err) {
    setGenerating(false);
    updateMessage(asstMsgId, { status: 'failed', error: err.message });
    setPreviewState('error', 'Edit failed', err.message);
    activeMessageId = null;
  }
}

function setGenerating(on) {
  generateBtn.disabled = on;
  generateBtn.classList.toggle('sending', on);
}

// ── Polling ───────────────────────────────────────────────────────────────────
function startPolling(jobId) {
  stopPolling();
  pollInterval = setInterval(() => pollJob(jobId), 1800);
  pollJob(jobId);
}
function stopPolling() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

async function pollJob(jobId) {
  try {
    const { job } = await apiFetch(`/api/jobs/${jobId}`);

    // Live stage updates inside the generating message
    if (isActive(job.status) && activeMessageId) {
      updateGeneratingMsg(activeMessageId, job);
      // Mirror in preview loading area
      const stageText = {
        planning: 'Planning...', coding: 'Writing code...',
        reviewing: 'Reviewing...', finalizing: 'Finalizing...',
      };
      updateLoadingMessage(stageText[job.status] || 'Generating...', '');
    }

    if (isTerminal(job.status)) {
      stopPolling();
      setGenerating(false);

      const msgId = activeMessageId;
      activeMessageId = null;

      if (job.status === 'completed' || job.status === 'complete') {
        const slug = job.projectSlug;
        updateMessage(msgId, {
          status: 'completed',
          text: buildSuccessText(job),
          slug,
          filesWritten: job.filesWritten || [],
          duration: job.duration,
          isEdit: job.isEdit || false,
        });

        if (slug) {
          currentSlug = slug;
          updateDeployButton(slug);
          loadCodeFileList(slug);

          if (job.isEdit) {
            // Edit: refresh the existing preview iframe without re-initialising the server
            if (currentTab !== 'preview') switchTab('preview');
            if (previewIframe.src) {
              // Force reload by toggling src
              const src = previewIframe.src;
              previewIframe.src = '';
              setTimeout(() => { previewIframe.src = src; setPreviewState('frame'); }, 80);
            } else {
              initiatePreview(slug);
            }
          } else {
            initiatePreview(slug);
          }
        }
      } else {
        updateMessage(msgId, {
          status: job.status,
          error: job.error || 'An unexpected error occurred.',
        });
        setPreviewState('error',
          job.status === 'cancelled' ? 'Cancelled' : job.isEdit ? 'Edit failed' : 'Generation failed',
          job.error || ''
        );
      }
    }
  } catch (_) {}
}

function buildSuccessText(job) {
  if (job.isEdit) {
    const fc = job.filesWritten?.length || 0;
    return job.editSummary || `Updated ${fc} file${fc !== 1 ? 's' : ''}.`;
  }
  const summary = job.plan?.summary || '';
  const slug = (job.projectSlug || 'app').replace(/-/g, ' ');
  const fc = job.filesWritten?.length || 0;
  if (summary) return summary;
  return `Built your ${slug} — ${fc} file${fc !== 1 ? 's' : ''} ready to preview.`;
}

// ── Conversation rendering ────────────────────────────────────────────────────
function renderAllMessages() {
  // Remove existing message elements (keep convWelcome)
  Array.from(convThread.children).forEach((el) => {
    if (el.id !== 'conv-welcome') el.remove();
  });

  messages.forEach((m) => {
    const el = buildMsgEl(m);
    if (el) convThread.appendChild(el);
  });

  updateWelcomeVisibility();
  scrollToBottom();
}

function addMessage(msg) {
  messages.push(msg);

  const conv = getActiveConv();
  if (conv) {
    conv.updatedAt = Date.now();
    if (!conv._titled && msg.type === 'user' && msg.text) {
      conv.title = generateTitle([msg]);
      conv._titled = true;
      renderHistory();
    }
  }

  saveAllData();
  const el = buildMsgEl(msg);
  if (el) convThread.appendChild(el);
  updateWelcomeVisibility();
  scrollToBottom();
}

function updateMessage(id, updates) {
  const msg = messages.find((m) => m.id === id);
  if (!msg) return;
  Object.assign(msg, updates);

  const conv = getActiveConv();
  if (conv && updates.slug) {
    conv.projectSlug = updates.slug;
  }

  saveAllData();
  updateEditingBanner();

  const existing = convThread.querySelector(`[data-msg-id="${id}"]`);
  const fresh = buildMsgEl(msg);
  if (existing && fresh) existing.replaceWith(fresh);
  scrollToBottom();
}

// Live updates for the generating message — targeted DOM edits, no full re-render
function updateGeneratingMsg(id, job) {
  const stageEl = $(`msg-stage-${id}`);
  const logEl   = $(`msg-log-${id}`);

  const stageText = job.isEdit
    ? { queued: 'Loading project...', loading: 'Loading files...', coding: 'Applying changes...', finalizing: 'Saving...' }
    : { queued: 'Starting...', planning: 'Planning...', coding: 'Writing code...', reviewing: 'Reviewing...', finalizing: 'Finalizing...' };
  if (stageEl) stageEl.textContent = stageText[job.status] || (job.isEdit ? 'Modifying...' : 'Generating...');

  if (logEl && job.logs?.length) {
    const last = job.logs[job.logs.length - 1];
    if (last?.message) logEl.textContent = last.message;
  }
}

// Avatar SVG constant
const AVATAR_SVG = `<img class="msg-avatar-svg" src="logo-symbol.svg" height="26" alt="Zyra" />`;

function buildMsgEl(msg) {
  if (msg.type === 'user')      return buildUserEl(msg);
  if (msg.type === 'assistant') return buildAssistantEl(msg);
  return null;
}

function buildUserEl(msg) {
  const el = document.createElement('div');
  el.className = 'msg msg--user';
  el.dataset.msgId = msg.id;
  el.innerHTML = `<div class="msg-bubble msg-bubble--user">${escHtml(msg.text)}</div>`;
  return el;
}

function buildAssistantEl(msg) {
  const el = document.createElement('div');
  el.className = 'msg msg--assistant';
  el.dataset.msgId = msg.id;

  let bodyHtml = '';

  if (msg.status === 'generating') {
    bodyHtml = `
      <div class="msg-generating">
        <span class="msg-spinner"></span>
        <span class="msg-stage-label" id="msg-stage-${msg.id}">Starting...</span>
        <button class="msg-cancel-btn" data-job-id="${escAttr(currentJobId || '')}">Cancel</button>
      </div>
      <div class="msg-log-line" id="msg-log-${msg.id}"></div>`;

  } else if (msg.status === 'completed') {
    const fc = msg.filesWritten?.length || 0;
    bodyHtml = `
      <p class="msg-text">${escHtml(msg.text || '')}</p>
      <div class="msg-meta">${fc} file${fc !== 1 ? 's' : ''} · ${escHtml(msg.duration || '—')} · ${escHtml(msg.mode || 'standard')}</div>
      <div class="msg-actions">
        <button class="msg-btn" data-action="preview" data-slug="${escAttr(msg.slug || '')}">Open preview</button>
        <button class="msg-btn msg-btn--ghost" data-action="code" data-slug="${escAttr(msg.slug || '')}">View code</button>
        <button class="msg-btn msg-btn--ghost" data-action="regen" data-prompt="${escAttr(msg.userPrompt || '')}">Regenerate</button>
      </div>`;

  } else if (msg.status === 'failed' || msg.status === 'interrupted') {
    bodyHtml = `
      <p class="msg-text msg-text--error">${escHtml(msg.error || 'Generation failed.')}</p>
      <div class="msg-actions">
        <button class="msg-btn msg-btn--ghost" data-action="regen" data-prompt="${escAttr(msg.userPrompt || '')}">Try again</button>
      </div>`;

  } else if (msg.status === 'cancelled') {
    bodyHtml = `<p class="msg-text msg-text--muted">Generation cancelled.</p>`;

  } else if (msg.status === 'timed_out') {
    bodyHtml = `
      <p class="msg-text msg-text--error">Generation timed out.</p>
      <div class="msg-actions">
        <button class="msg-btn msg-btn--ghost" data-action="regen" data-prompt="${escAttr(msg.userPrompt || '')}">Try again</button>
      </div>`;
  }

  el.innerHTML = `<div class="msg-avatar">${AVATAR_SVG}</div><div class="msg-body">${bodyHtml}</div>`;

  // Wire up action buttons
  el.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => handleMsgAction(btn));
  });

  // Wire cancel button
  const cancelBtn = el.querySelector('.msg-cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      const jobId = cancelBtn.dataset.jobId;
      if (!jobId) return;
      cancelBtn.disabled = true;
      cancelBtn.textContent = 'Cancelling...';
      try { await apiFetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' }); } catch (_) {}
    });
  }

  return el;
}

function handleMsgAction(btn) {
  const action = btn.dataset.action;
  const slug   = btn.dataset.slug;
  const prompt = btn.dataset.prompt;

  if (action === 'preview' && slug) {
    currentSlug = slug;
    if (currentTab !== 'preview') switchTab('preview');
    initiatePreview(slug);
  }
  if (action === 'code' && slug) {
    currentSlug = slug;
    loadCodeFileList(slug);
    switchTab('code');
  }
  if (action === 'regen' && prompt) {
    handlePromptSubmit(prompt);
  }
}

// ── History rendering ─────────────────────────────────────────────────────────
function renderHistory() {
  const starredSection = $('history-starred-section');
  const starredList    = $('history-starred-list');
  const recentList     = $('history-recent-list');
  const divider        = $('current-chat-divider');

  const past    = conversations.filter(c => c.id !== activeConvId && c.messages.length > 0);
  const starred = past.filter(c => c.starred);
  const recent  = past.filter(c => !c.starred).slice(0, 20);

  // Starred section
  if (starred.length > 0) {
    starredSection.classList.remove('hidden');
    starredList.innerHTML = starred.map(buildHistoryItemHtml).join('');
  } else {
    starredSection.classList.add('hidden');
    if (starredList) starredList.innerHTML = '';
  }

  // Recent section
  recentList.innerHTML = recent.length > 0
    ? recent.map(buildHistoryItemHtml).join('')
    : '<div class="history-empty">No past projects yet.</div>';

  // Show divider only when there is history
  if (divider) divider.classList.toggle('hidden', past.length === 0);

  // Wire up clicks
  document.querySelectorAll('.history-item').forEach(item => {
    const convId = item.dataset.convId;
    item.querySelector('.history-item-btn')?.addEventListener('click', () => switchToConversation(convId));
    item.querySelector('.history-star-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleStar(convId);
    });
  });
}

function buildHistoryItemHtml(conv) {
  const time = formatRelTime(conv.updatedAt);
  const isActive = conv.id === activeConvId;
  return `<div class="history-item${isActive ? ' history-item--active' : ''}" data-conv-id="${escAttr(conv.id)}">
    <button class="history-item-btn" type="button">
      <span class="history-item-title">${escHtml(conv.title || 'Untitled project')}</span>
      <span class="history-item-time">${escHtml(time)}</span>
    </button>
    <button class="history-star-btn${conv.starred ? ' history-star-btn--active' : ''}" type="button" title="${conv.starred ? 'Unstar' : 'Star'}">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="${conv.starred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    </button>
  </div>`;
}

function formatRelTime(ts) {
  if (!ts) return '';
  const diff  = Date.now() - ts;
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Welcome / empty state ─────────────────────────────────────────────────────
function updateWelcomeVisibility() {
  const hasMessages = messages.length > 0;
  convWelcome.style.display = hasMessages ? 'none' : '';
}

function scrollToBottom() {
  convThread.scrollTop = convThread.scrollHeight;
}

// ── New project ───────────────────────────────────────────────────────────────
newChatBtn.addEventListener('click', () => {
  stopPolling();
  stopPreviewPoll();
  setGenerating(false);
  activeMessageId = null;
  currentJobId    = null;
  currentSlug     = null;
  currentPreviewUrl = null;
  updateDeployButton(null);

  createNewConversation();
  renderAllMessages();
  renderHistory();
  setPreviewState('empty');
  previewUrlBar.style.display = 'none';
  promptInput.value = '';
  promptInput.dispatchEvent(new Event('input'));
  promptInput.focus();
});

// ── Preview orchestration ─────────────────────────────────────────────────────
async function initiatePreview(slug) {
  setPreviewState('loading', 'Starting preview...', '');
  stopPreviewPoll();
  try {
    const data = await apiFetch(`/api/preview/start/${slug}`, { method: 'POST' });
    const preview = data.preview;
    if (preview.status === 'ready') {
      activatePreview(preview);
    } else if (preview.status === 'error') {
      setPreviewState('error', 'Preview failed', preview.error || '');
    } else {
      pollPreviewUntilReady(slug, preview.status);
    }
  } catch (err) {
    setPreviewState('error', 'Preview failed', err.message);
  }
}

function pollPreviewUntilReady(slug, initialStatus) {
  const msgs = { installing: 'Installing dependencies...', starting: 'Starting server...' };
  updateLoadingMessage(msgs[initialStatus] || 'Starting...', '');
  previewPollInterval = setInterval(async () => {
    try {
      const preview = await apiFetch(`/api/preview/status/${slug}`);
      if (preview.status === 'ready') { stopPreviewPoll(); activatePreview(preview); }
      else if (preview.status === 'error') { stopPreviewPoll(); setPreviewState('error', 'Preview failed', preview.error || ''); }
      else updateLoadingMessage(msgs[preview.status] || 'Loading...', '');
    } catch (_) {}
  }, 1500);
}

function activatePreview(preview) {
  currentPreviewUrl = preview.url;

  // Save previewUrl to active conversation
  const conv = getActiveConv();
  if (conv) { conv.previewUrl = preview.url; saveAllData(); }

  const fullUrl = preview.url.startsWith('/') ? window.location.origin + preview.url : preview.url;
  previewIframe.src = fullUrl;
  browserUrlDisplay.textContent = fullUrl.replace(/^https?:\/\//, '');
  previewUrlText.textContent = fullUrl.replace(/^https?:\/\//, '');
  previewUrlBar.style.display = '';
  if (currentTab !== 'preview') switchTab('preview');
  setPreviewState('frame');
}

function stopPreviewPoll() {
  if (previewPollInterval) { clearInterval(previewPollInterval); previewPollInterval = null; }
}

function setPreviewState(state, title, sub) {
  [stateEmpty, stateLoading, stateFrame, stateError].forEach((el) => el.classList.add('hidden'));
  if (state === 'empty')   stateEmpty.classList.remove('hidden');
  if (state === 'loading') { stateLoading.classList.remove('hidden'); updateLoadingMessage(title || 'Loading...', sub || ''); }
  if (state === 'frame')   stateFrame.classList.remove('hidden');
  if (state === 'error')   {
    stateError.classList.remove('hidden');
    const t = $('preview-error-title'); const m = $('preview-error-msg');
    if (t) t.textContent = title || 'Error';
    if (m) m.textContent = sub || '';
  }
}

function updateLoadingMessage(msg, sub) {
  const lm = $('loading-message'); const ls = $('loading-sub');
  if (lm) lm.textContent = msg;
  if (ls && sub !== undefined) ls.textContent = sub;
}

// ── Tab switching ─────────────────────────────────────────────────────────────
$('tab-preview').addEventListener('click', () => switchTab('preview'));
$('tab-code').addEventListener('click', () => switchTab('code'));

function switchTab(tab) {
  currentTab = tab;
  previewContentArea.classList.toggle('hidden', tab !== 'preview');
  codeArea.classList.toggle('hidden', tab === 'preview');
  $('tab-preview').classList.toggle('tab-btn--active', tab === 'preview');
  $('tab-code').classList.toggle('tab-btn--active', tab === 'code');
}

// ── Device switching ──────────────────────────────────────────────────────────
$('device-btns').addEventListener('click', (e) => {
  const btn = e.target.closest('.device-btn');
  if (!btn) return;
  currentDevice = btn.dataset.device;
  document.querySelectorAll('.device-btn').forEach((b) => b.classList.remove('device-btn--active'));
  btn.classList.add('device-btn--active');
  deviceWrapper.dataset.device = currentDevice;
});

// ── Preview controls ──────────────────────────────────────────────────────────
refreshPreviewBtn.addEventListener('click', () => {
  if (previewIframe.src) previewIframe.src = previewIframe.src;
});
openTabBtn.addEventListener('click', () => {
  if (!currentPreviewUrl) return;
  const url = currentPreviewUrl.startsWith('/') ? window.location.origin + currentPreviewUrl : currentPreviewUrl;
  window.open(url, '_blank');
});
retryPreviewBtn.addEventListener('click', () => {
  if (currentSlug) initiatePreview(currentSlug);
});

// ── Deploy ────────────────────────────────────────────────────────────────────
const deployBtn            = $('deploy-btn');
const deployPanel          = $('deploy-panel');
const deployStateDeploying = $('deploy-state-deploying');
const deployStateSuccess   = $('deploy-state-success');
const deployStateError     = $('deploy-state-error');

let deployPollInterval = null;
let currentDeploySlug  = null;

function updateDeployButton(slug) {
  if (slug) {
    deployBtn.classList.remove('hidden');
  } else {
    deployBtn.classList.add('hidden');
    closeDeployPanel();
  }
}

function closeDeployPanel() {
  stopDeployPoll();
  deployPanel.classList.add('hidden');
  [deployStateDeploying, deployStateSuccess, deployStateError].forEach(el => el.classList.add('hidden'));
}

function setDeployState(state, opts = {}) {
  deployPanel.classList.remove('hidden');
  [deployStateDeploying, deployStateSuccess, deployStateError].forEach(el => el.classList.add('hidden'));

  if (state === 'deploying') {
    deployStateDeploying.classList.remove('hidden');
    const msgEl = $('deploy-progress-msg');
    if (msgEl) msgEl.textContent = opts.message || 'Deploying to Vercel...';

  } else if (state === 'success') {
    deployStateSuccess.classList.remove('hidden');
    const urlEl = $('deploy-live-url');
    if (urlEl && opts.url) {
      urlEl.href = opts.url;
      urlEl.textContent = opts.url.replace(/^https?:\/\//, '');
    }

  } else if (state === 'error') {
    deployStateError.classList.remove('hidden');
    const errEl = $('deploy-error-msg');
    if (errEl) errEl.textContent = opts.error || 'Deployment failed.';
  }
}

deployBtn.addEventListener('click', () => {
  if (!currentSlug) return;
  handleDeploy(currentSlug);
});

$('deploy-retry-btn')?.addEventListener('click', () => {
  if (currentDeploySlug) handleDeploy(currentDeploySlug);
});

$('deploy-again-btn')?.addEventListener('click', () => {
  if (currentDeploySlug) handleDeploy(currentDeploySlug);
});

$('deploy-copy-btn')?.addEventListener('click', () => {
  const urlEl = $('deploy-live-url');
  if (urlEl?.href && urlEl.href !== location.href) {
    navigator.clipboard.writeText(urlEl.href).catch(() => {});
    const btn = $('deploy-copy-btn');
    if (btn) { btn.title = 'Copied!'; setTimeout(() => { btn.title = 'Copy URL'; }, 2000); }
  }
});

async function handleDeploy(slug) {
  if (!slug) return;
  currentDeploySlug = slug;

  deployBtn.disabled = true;
  setDeployState('deploying', { message: 'Validating project...' });

  try {
    const { deployment } = await apiFetch(`/api/deploy/${encodeURIComponent(slug)}`, {
      method: 'POST',
    });

    if (deployment.status === 'ready') {
      setDeployState('success', { url: deployment.deploymentUrl });
      deployBtn.disabled = false;
      return;
    }

    if (deployment.status === 'error') {
      setDeployState('error', { error: deployment.error || 'Deployment failed.' });
      deployBtn.disabled = false;
      return;
    }

    // Deployment is in progress — start polling
    setDeployState('deploying', { message: 'Deploying to Vercel...' });
    pollDeployStatus(slug);

  } catch (err) {
    setDeployState('error', { error: err.message });
    deployBtn.disabled = false;
  }
}

function pollDeployStatus(slug) {
  stopDeployPoll();
  deployPollInterval = setInterval(async () => {
    try {
      const { deployment } = await apiFetch(`/api/deploy/${encodeURIComponent(slug)}/status`);
      const stageMessages = {
        queued:    'Queued for deployment...',
        deploying: 'Deploying to Vercel...',
        building:  'Building project...',
      };

      if (deployment.status === 'ready') {
        stopDeployPoll();
        setDeployState('success', { url: deployment.deploymentUrl });
        deployBtn.disabled = false;

      } else if (deployment.status === 'error' || deployment.status === 'cancelled') {
        stopDeployPoll();
        setDeployState('error', { error: deployment.error || 'Deployment failed.' });
        deployBtn.disabled = false;

      } else {
        setDeployState('deploying', { message: stageMessages[deployment.status] || 'Deploying...' });
      }
    } catch (_) {}
  }, 3000);
}

function stopDeployPoll() {
  if (deployPollInterval) { clearInterval(deployPollInterval); deployPollInterval = null; }
}

// ── Code view ─────────────────────────────────────────────────────────────────
async function loadCodeFileList(slug) {
  codeFileList.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    const data = await apiFetch(`/api/projects/${slug}/files`);
    const files = flattenFiles(data.files || []);
    if (!files.length) { codeFileList.innerHTML = '<div class="empty-state">No files.</div>'; return; }
    codeFileList.innerHTML = files.map((f) =>
      `<div class="code-file-item" data-slug="${escAttr(slug)}" data-path="${escAttr(f.path)}">${escHtml(f.path)}</div>`
    ).join('');
    codeFileList.querySelectorAll('.code-file-item').forEach((item) => {
      item.addEventListener('click', () => {
        codeFileList.querySelectorAll('.code-file-item').forEach((i) => i.classList.remove('active'));
        item.classList.add('active');
        loadFileContent(item.dataset.slug, item.dataset.path);
      });
    });
  } catch (err) {
    codeFileList.innerHTML = `<div class="empty-state">${escHtml(err.message)}</div>`;
  }
}

function flattenFiles(nodes) {
  const result = [];
  (nodes || []).forEach((n) => {
    if (n.type === 'file') result.push({ path: n.path });
    else if (n.children) result.push(...flattenFiles(n.children));
  });
  return result;
}

async function loadFileContent(slug, filePath) {
  codeFileName.textContent = filePath;
  codeText.textContent = 'Loading...';
  try {
    const data = await apiFetch(`/api/preview/file/${encodeURIComponent(slug)}/${filePath}`);
    codeText.textContent = data.content;
  } catch (err) {
    codeText.textContent = `Error: ${err.message}`;
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function apiFetch(path, opts = {}) {
  const token = window._zyraAuth?.getToken?.() || '';
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
    ...opts,
  });
  if (res.status === 401) {
    window.location.replace('/login');
    throw new Error('Session expired');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function escHtml(s)  { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s)  { return String(s).replace(/"/g,'&quot;'); }

// ── Init ──────────────────────────────────────────────────────────────────────
// Account avatar button starts hidden — shown once session resolves
const _avatarBtn = $('account-avatar-btn');
if (_avatarBtn) _avatarBtn.classList.add('hidden');

loadAllData();
renderAllMessages();
renderHistory();
updateEditingBanner();
checkHealth();
setInterval(checkHealth, 30_000);
setPreviewState('empty');
