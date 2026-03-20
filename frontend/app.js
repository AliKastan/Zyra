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

/** Updates the header project name breadcrumb. */
function _updateHeaderProject(name) {
  const el = document.getElementById('header-project-name');
  if (!el) return;
  el.textContent = name || '';
  el.style.display = name ? 'inline' : 'none';
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
  // Reset edit mode when switching conversations
  _editModeActive = false;
  _edNodeId = null;
  _undoStack = [];
  if (editModeBtn) editModeBtn.classList.toggle('hidden', !currentSlug);
  if (editModeBtn) editModeBtn.classList.remove('edit-mode-btn--active');
  if (editToolbar) editToolbar.style.display = 'none';
  if (editBanner)  editBanner.classList.add('hidden');
  if (previewIframe) previewIframe.classList.remove('preview-edit-active');
  // Reset button label/icon back to Edit state
  const iconEl  = $('edit-mode-icon');
  const labelEl = $('edit-mode-label');
  if (iconEl)  iconEl.innerHTML   = _PENCIL_SVG;
  if (labelEl) labelEl.textContent = 'Edit';
  // Show/hide scope bar based on whether this conversation has a project
  if (scopeBar) scopeBar.classList.toggle('hidden', !currentSlug);
  // Reset scope to auto when switching conversations
  currentScope = 'auto';
  if (scopeChips) scopeChips.forEach(c => c.classList.toggle('scope-chip--active', c.dataset.scope === 'auto'));

  renderAllMessages();
  renderHistory();
  updateDeployButton(currentSlug);
  _updateHeaderProject(conv.projectSlug ? conv.title : '');

  if (currentSlug) {
    loadCodeFileList(currentSlug);
    // Always route through initiatePreview so the server can auto-restore missing files.
    // For static projects the preview service responds immediately (sub-100ms).
    initiatePreview(currentSlug);
    // Fire-and-forget: record that user opened this project + fetch overrides
    apiFetch(`/api/projects/${encodeURIComponent(currentSlug)}/open`, { method: 'POST' }).catch(() => {});
    apiFetch(`/api/projects/${encodeURIComponent(currentSlug)}`).then((data) => {
      if (data.visualOverrides && typeof data.visualOverrides === 'object') {
        _visualOverrides[currentSlug] = data.visualOverrides;
      }
    }).catch(() => {});
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

// ── Delete conversation ───────────────────────────────────────────────────────

let _pendingDeleteConvId = null;

function confirmDeleteConversation(convId) {
  _pendingDeleteConvId = convId;
  $('delete-confirm-overlay').classList.remove('hidden');
}

function closeDeleteConfirm() {
  _pendingDeleteConvId = null;
  $('delete-confirm-overlay').classList.add('hidden');
}

async function executeDeleteConversation() {
  const convId = _pendingDeleteConvId;
  closeDeleteConfirm();
  if (!convId) return;

  const conv = conversations.find(c => c.id === convId);
  if (!conv) return;

  // Delete project files from server if this conv has a project
  if (conv.projectSlug) {
    try { await apiFetch(`/api/projects/${conv.projectSlug}`, { method: 'DELETE' }); } catch (_) {}
  }

  // Remove from conversations array
  conversations = conversations.filter(c => c.id !== convId);
  saveAllData();

  // If the deleted conv was active, reset UI
  if (convId === activeConvId) {
    stopPolling();
    stopPreviewPoll();
    activeConvId = null; // clear so switchToConversation won't skip
    currentSlug = null;
    currentPreviewUrl = null;
    currentJobId = null;
    if (conversations.length > 0) {
      switchToConversation(conversations[0].id);
    } else {
      createNewConversation();
      renderAllMessages();
      renderHistory();
      setPreviewState('empty');
      previewUrlBar.style.display = 'none';
      updateDeployButton(null);
    }
  } else {
    renderHistory();
  }
}


function generateTitle(msgs) {
  const firstUser = msgs.find(m => m.type === 'user' && m.text);
  if (!firstUser) return 'Untitled project';
  const words = firstUser.text.trim().split(/\s+/);
  if (words.length <= 7) return firstUser.text.trim();
  return words.slice(0, 7).join(' ') + '...';
}

// ── State ─────────────────────────────────────────────────────────────────────
let currentMode              = '2d';
let _privateBeta             = false; // set from /api/health on init
let currentJobId             = null;
let pollInterval             = null;
let activeMessageId          = null;   // ID of the currently-generating assistant message
let _lastGenerationPrompt    = null;   // stored so Retry can re-submit after a generation failure
let generationTimer     = null;   // setInterval handle for live elapsed timer
let generationStartMs   = null;   // Date.now() when generation started

// Preview
let currentSlug         = null;
let currentPreviewUrl   = null;
let previewPollInterval = null;
let currentDevice       = 'mobile';
let currentTab          = 'preview';
let currentScope        = 'auto'; // 'auto' | 'ui' | 'logic' | 'component' | 'page'

// Visual edit
let _editModeActive  = false;
let _edNodeId        = null;   // data-zyra-id of currently selected element (set by ZYRA_ELEMENT_SELECTED)
let _visualOverrides = {};     // { [slug]: { [nodeId]: { styles:{}, text:'' } } }
let _viSaveTimer     = null;
let _undoStack       = [];     // [{ type:'style'|'text', nodeId, prop?, prevValue?, prevText? }]
const _PENCIL_SVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const _PLAY_SVG   = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;

// ── Generation timer helpers ──────────────────────────────────────────────────
function formatElapsedMs(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${String(rem).padStart(2, '0')}s`;
}

function startGenerationTimer(msgId) {
  stopGenerationTimer();
  generationStartMs = Date.now();
  generationTimer = setInterval(() => {
    const el = document.getElementById(`msg-timer-${msgId}`);
    if (el) el.textContent = formatElapsedMs(Date.now() - generationStartMs);
  }, 1000);
}

function stopGenerationTimer() {
  if (generationTimer) { clearInterval(generationTimer); generationTimer = null; }
}

function finalElapsed() {
  if (!generationStartMs) return null;
  return formatElapsedMs(Date.now() - generationStartMs);
}

// ── Job states ────────────────────────────────────────────────────────────────
const ACTIVE_STATES   = new Set(['queued', 'planning', 'coding', 'reviewing', 'finalizing']);
const TERMINAL_STATES = new Set(['completed', 'complete', 'failed', 'cancelled', 'timed_out']);

function isActive(s)   { return ACTIVE_STATES.has(s); }
function isTerminal(s) { return TERMINAL_STATES.has(s); }

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const promptInput     = $('prompt-input');
const charCount       = $('char-count');
const generateBtn     = $('generate-btn');
const promptError     = $('prompt-error');
const modeBar         = $('mode-bar');
const scopeBar        = $('scope-bar');
const scopeChips      = scopeBar ? scopeBar.querySelectorAll('.scope-chip') : [];
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
const retryPreviewBtn       = $('retry-preview-btn');
const regenerateProjectBtn  = $('regenerate-project-btn');
// fix-my-app-btn is wired in the Fix My Game section below

// Code
const codeArea     = $('code-area');
const codeFileList = $('code-file-list');
const codeText     = $('code-text');
const codeFileName = $('code-file-name');

// Visual edit
const editModeBtn   = $('edit-mode-btn');
const editToolbar   = $('edit-toolbar');
const editBanner    = $('zyra-edit-banner');
const editBannerClose = $('zyra-edit-banner-close');

// ── Logo → Projects navigation ────────────────────────────────────────────────
// Intercepts the logo link click so we can guard against in-progress generation.
// If no job is running, standard link navigation takes over (no JS reload needed).
document.getElementById('brand-logo-link')?.addEventListener('click', (e) => {
  if (!currentJobId) return; // let href handle it
  e.preventDefault();
  if (window.confirm('A generation is in progress. Leave and go to Projects?')) {
    window.location.href = '/projects';
  }
});

// ── Health ────────────────────────────────────────────────────────────────────
async function checkHealth() {
  try {
    const h = await apiFetch('/api/health');
    if (typeof h.privateBeta === 'boolean') _privateBeta = h.privateBeta;
  } catch (_) {}
}

// ── Mode selection ────────────────────────────────────────────────────────────
modeBar.addEventListener('change', (e) => {
  const radio = e.target.closest('input[type="radio"]');
  if (!radio) return;
  currentMode = radio.dataset.mode;
});

// ── Scope chip click handler ──────────────────────────────────────────────────
scopeChips.forEach(chip => {
  chip.addEventListener('click', () => {
    currentScope = chip.dataset.scope || 'auto';
    scopeChips.forEach(c => c.classList.toggle('scope-chip--active', c === chip));
  });
});

// ── Prompt input ──────────────────────────────────────────────────────────────
const MAX_CHARS = 3000;

promptInput.addEventListener('input', () => {
  const len = promptInput.value.length;
  charCount.textContent = `${len} / ${MAX_CHARS}`;
  charCount.className = 'char-count' +
    (len >= MAX_CHARS ? ' at-limit' : len > MAX_CHARS * 0.9 ? ' near-limit' : '');
});

promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    generateBtn.click();
  }
  // Shift+Enter: default behaviour (new line) — no handler needed
});

function classifyLocally(prompt) {
  const text  = prompt.toLowerCase().trim();
  const chars = prompt.length;
  const words = text.split(/\s+/).length;
  // Signals that make a game harder/more complex to generate
  const complex = [
    'multiplayer','multi-player','online multiplayer','mmo','mmorpg','pvp','co-op',
    'matchmaking','lobby','server','backend','real-time multiplayer','cloud save',
    'open world','sandbox','gta','procedurally generated','rpg','100 players',
    '3d game','3d engine','unity','unreal','godot','physics engine',
    'authentication','user accounts','login system','supabase','database','sql','payments',
    'ai enemies','pathfinding','navmesh','procedural generation',
  ];
  // Signals that indicate a simpler, faster game
  const simple = [
    'tap','clicker','idle','hypercasual','hyper casual','simple','basic','minimal','casual',
    'one-tap','one tap','reaction','reflex','avoid obstacles','dodge','collect coins',
    'score as high','survive as long','endless tap',
  ];
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
    // Save pending prompt to sessionStorage — OAuth causes a full page reload
    // so in-memory _pendingPrompt would be lost without this.
    if (_pendingPrompt) sessionStorage.setItem('zyra_pending_prompt', _pendingPrompt);
    const { error } = await window._zyraAuth._sb.auth.signInWithOAuth({
      provider: 'google',
      // Must point to /app (not /) — /app loads auth.js which processes the OAuth callback.
      // Pointing to / served landing.html which has no Supabase client, breaking the session.
      options: { redirectTo: window.location.origin + '/app' },
    });
    if (error) throw error;
  } catch (err) {
    $('auth-google-btn').disabled = false;
    $('auth-modal-error').textContent = friendlyAuthError(err.message);
  }
});

// (Inline sidebar auth removed — guests click through to /login)

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
    // Restore pending prompt that may have been saved before a Google OAuth redirect
    // (OAuth causes a full page reload, so in-memory _pendingPrompt is lost).
    if (!_pendingPrompt) {
      const saved = sessionStorage.getItem('zyra_pending_prompt');
      if (saved) { _pendingPrompt = saved; sessionStorage.removeItem('zyra_pending_prompt'); }
    }
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
  const sidebarAuth  = $('sidebar-auth');
  const sidebarInput = $('sidebar-input');
  if (user) {
    setupAccountMenu(user);
    if (sidebarAuth)  sidebarAuth.classList.add('hidden');
    if (sidebarInput) sidebarInput.classList.remove('hidden');
  } else {
    const btn = $('account-avatar-btn');
    if (btn) btn.classList.add('hidden');
    if (sidebarAuth)  sidebarAuth.classList.remove('hidden');
    if (sidebarInput) sidebarInput.classList.add('hidden');
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

// ── Generate ──────────────────────────────────────────────────────────────────
generateBtn.addEventListener('click', () => handlePromptSubmit());

async function handlePromptSubmit(prefill) {
  const prompt = (prefill || promptInput.value).trim();
  promptError.textContent = '';

  if (!prompt) { promptError.textContent = 'Please describe what you want to build.'; return; }
  if (prompt.length > MAX_CHARS) { promptError.textContent = 'Prompt is too long.'; return; }

  // Auth gate — skipped in private beta mode (access-code gate is sufficient)
  if (!_privateBeta && !window._zyraAuth?.getToken()) {
    _pendingPrompt = prompt;
    openAuthModal('Sign in to generate your app.');
    return;
  }
  console.debug('[GEN] submit_clicked mode=' + currentMode + ' privateBeta=' + _privateBeta);

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
  startGenerationTimer(asstMsgId);

  // Clear input
  promptInput.value = '';
  promptInput.dispatchEvent(new Event('input'));

  setPreviewState('loading', 'Generating your app...', '');

  try {
    console.debug('[GEN] api_request_started endpoint=/api/generate mode=' + currentMode);
    const data = await apiFetch('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt, mode: currentMode }),
    });
    console.debug('[GEN] api_request_succeeded jobId=' + data.jobId);
    currentJobId = data.jobId;
    _lastGenerationPrompt = prompt;
    startPolling(currentJobId);
  } catch (err) {
    // "Already in progress" — cancel the stuck job then auto-retry
    if (err.code === 'JOB_IN_PROGRESS' || err.message?.toLowerCase().includes('already in progress')) {
      try {
        updateLoadingMessage('Cancelling previous job...', '');
        await cancelAnyActiveJob();
        await new Promise(r => setTimeout(r, 1500));
        updateLoadingMessage('Retrying...', '');
        const data = await apiFetch('/api/generate', {
          method: 'POST',
          body: JSON.stringify({ prompt, mode: currentMode }),
        });
        currentJobId = data.jobId;
        _lastGenerationPrompt = prompt;
        startPolling(currentJobId);
        return;
      } catch (retryErr) {
        stopGenerationTimer();
        setGenerating(false);
        updateMessage(asstMsgId, { status: 'failed', error: retryErr.message });
        setPreviewState('error', 'Generation failed', retryErr.message);
        activeMessageId = null;
        return;
      }
    }
    // Quota/billing block from server — show clean message, keep workspace usable
    if (err.code === 'CREDITS_EXHAUSTED' || err.httpStatus === 402) {
      console.warn('[GEN] client_received_failure step=billing_gate code=' + err.code + ' status=' + err.httpStatus);
      stopGenerationTimer();
      setGenerating(false);
      const billingMsg = err.message || 'Generation limit reached.';
      updateMessage(asstMsgId, { status: 'failed', error: billingMsg });
      showToast(billingMsg, 'warning');
      setPreviewState('empty');
      activeMessageId = null;
      return;
    }

    stopGenerationTimer();
    setGenerating(false);
    updateMessage(asstMsgId, { status: 'failed', error: err.message });
    setPreviewState('error', 'Generation failed', err.message);
    activeMessageId = null;
  }
}

// Loads the dev fallback game template into the preview iframe.
// Called when real generation fails — keeps the preview panel usable for testing.
function _loadDevFallback(mode) {
  const fallbackMode = (mode === '3d') ? '3d' : '2d';
  if (previewIframe) {
    previewIframe.src = `/api/preview/dev-fallback/${fallbackMode}`;
    setPreviewState('frame');
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
    editScope: currentScope !== 'auto' ? currentScope : null,
    timestamp: Date.now(),
  });
  startGenerationTimer(asstMsgId);

  // Clear input
  promptInput.value = '';
  promptInput.dispatchEvent(new Event('input'));

  const scopeLabel = { ui: 'UI only', logic: 'Logic only', component: 'Component', page: 'Page' }[currentScope] || '';
  setPreviewState('loading', scopeLabel ? `Updating ${scopeLabel}...` : 'Applying changes...', '');

  try {
    const data = await apiFetch(`/api/edit/${encodeURIComponent(projectSlug)}`, {
      method: 'POST',
      body: JSON.stringify({ prompt, mode: currentMode, scope: currentScope !== 'auto' ? currentScope : null }),
    });
    currentJobId = data.jobId;
    startPolling(currentJobId);
  } catch (err) {
    // "Already in progress" — cancel the stuck job then auto-retry
    if (err.code === 'JOB_IN_PROGRESS' || err.message?.toLowerCase().includes('already in progress')) {
      try {
        updateLoadingMessage('Cancelling previous job...', '');
        await cancelAnyActiveJob();
        await new Promise(r => setTimeout(r, 1000));
        updateLoadingMessage('Retrying edit...', '');
        const data = await apiFetch(`/api/edit/${encodeURIComponent(projectSlug)}`, {
          method: 'POST',
          body: JSON.stringify({ prompt, mode: currentMode, scope: currentScope !== 'auto' ? currentScope : null }),
        });
        currentJobId = data.jobId;
        startPolling(currentJobId);
        return;
      } catch (retryErr) {
        stopGenerationTimer();
        setGenerating(false);
        updateMessage(asstMsgId, { status: 'failed', error: retryErr.message });
        const isExpired = retryErr.expired || retryErr.message?.toLowerCase().includes('not found');
        setPreviewState('error', 'Edit failed', retryErr.message, { showRegenerate: isExpired });
        activeMessageId = null;
        return;
      }
    }
    stopGenerationTimer();
    setGenerating(false);
    updateMessage(asstMsgId, { status: 'failed', error: err.message });
    const isExpired = err.expired || err.message.toLowerCase().includes('not found');
    setPreviewState('error', 'Edit failed', err.message, { showRegenerate: isExpired });
    activeMessageId = null;
  }
}

function setGenerating(on) {
  generateBtn.disabled = on;
  generateBtn.classList.toggle('sending', on);
}

// ── Cancel stuck job helper ───────────────────────────────────────────────────
// Finds any in-progress job via the jobs list and cancels it.
// Used when "already in progress" blocks a new generation or edit.
async function cancelAnyActiveJob() {
  // If we already know the job ID, cancel it directly
  if (currentJobId) {
    try { await apiFetch(`/api/jobs/${currentJobId}/cancel`, { method: 'POST' }); } catch (_) {}
    currentJobId = null;
    return;
  }
  // Otherwise fetch the jobs list and cancel any active one
  try {
    const { jobs } = await apiFetch('/api/jobs');
    const activeStatuses = new Set(['queued', 'planning', 'coding', 'reviewing', 'finalizing']);
    const stuck = (jobs || []).find(j => activeStatuses.has(j.status));
    if (stuck) {
      await apiFetch(`/api/jobs/${stuck.id}/cancel`, { method: 'POST' });
    }
  } catch (_) {}
}

// ── Polling ───────────────────────────────────────────────────────────────────
function startPolling(jobId) {
  stopPolling();
  pollInterval = setInterval(() => pollJob(jobId), 1000);
  pollJob(jobId);
}
function stopPolling() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

async function pollJob(jobId) {
  try {
    const { job } = await apiFetch(`/api/jobs/${jobId}`);
    _pollFailCount = 0; // reset on successful poll

    // Live stage updates inside the generating message
    if (isActive(job.status) && activeMessageId) {
      updateGeneratingMsg(activeMessageId, job);
      // Mirror in preview loading area
      updateLoadingMessage('Generating...', '');
    }

    if (isTerminal(job.status)) {
      stopPolling();
      setGenerating(false);
      const clientElapsed = finalElapsed();
      stopGenerationTimer();

      const msgId = activeMessageId;
      activeMessageId = null;

      if (job.status === 'completed' || job.status === 'complete') {
        const slug = job.projectSlug;
        updateMessage(msgId, {
          status: 'completed',
          text: buildSuccessText(job),
          slug,
          filesWritten: job.filesWritten || [],
          duration: clientElapsed || job.duration,
          isEdit: job.isEdit || false,
        });

        if (slug) {
          currentSlug = slug;
          // Show scope bar when a project is active
          if (scopeBar) scopeBar.classList.toggle('hidden', !currentSlug);
          updateDeployButton(slug);
          loadCodeFileList(slug);

          if (job.isEdit) {
            // Reset scope to "Full edit" after edit completion
            currentScope = 'auto';
            if (scopeChips) scopeChips.forEach(c => c.classList.toggle('scope-chip--active', c.dataset.scope === 'auto'));
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
        const errMsg = job.error || 'An unexpected error occurred.';
        updateMessage(msgId, { status: job.status, error: errMsg });
        const isCancelled = job.status === 'cancelled';
        const isExpired = errMsg.toLowerCase().includes('not found') || errMsg.toLowerCase().includes('expired');
        const errorTitle = isCancelled ? 'Cancelled' : job.isEdit ? 'Edit failed' : 'Generation failed';

        console.warn('[GEN] client_received_failure step=job_poll status=' + job.status + ' error=' + errMsg);
        setPreviewState('error', errorTitle,
          isCancelled ? '' : (errMsg || 'Generation could not complete. Please try again.'),
          { showRegenerate: isExpired });
      }
    }
  } catch (err) {
    // Network error or server restart — track consecutive failures
    _pollFailCount = (_pollFailCount || 0) + 1;
    if (_pollFailCount >= 4 && activeMessageId) {
      // Server may have restarted — show a recovery prompt
      const msgId = activeMessageId;
      stopPolling();
      setGenerating(false);
      stopGenerationTimer();
      activeMessageId = null;
      updateMessage(msgId, {
        status: 'failed',
        error: 'Lost connection to the server. The server may have restarted.',
      });
      setPreviewState('error', 'Connection lost', 'Server may have restarted. Check your generation below.');
    }
  }
}

let _pollFailCount = 0;

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

  const existing = convThread.querySelector(`[data-msg-id="${id}"]`);
  const fresh = buildMsgEl(msg);
  if (existing && fresh) existing.replaceWith(fresh);
  scrollToBottom();
}

// Live updates for the generating message — targeted DOM edits, no full re-render
function updateGeneratingMsg(id, job) {
  const stageEl  = $(`msg-stage-${id}`);
  const logEl    = $(`msg-log-${id}`);

  const stageText = job.isEdit
    ? { queued: 'Loading project...', loading: 'Loading files...', coding: 'Applying changes...', finalizing: 'Saving...' }
    : { queued: 'Starting...', planning: 'Planning...', coding: 'Writing code...', reviewing: 'Reviewing...', finalizing: 'Saving...' };

  // During coding: show live per-file streaming progress ("Building app.js (2/8)")
  // Falls back to latest log entry, then generic stage text.
  let labelText = stageText[job.status] || (job.isEdit ? 'Modifying...' : 'Generating...');
  if (job.status === 'coding' && job.progress) {
    const { filesComplete, currentFile, filesTotal } = job.progress;
    if (currentFile) {
      const fileName = currentFile.split('/').pop();
      const counter  = filesTotal > 0 ? ` (${filesComplete + 1}/${filesTotal})` : '';
      labelText = `Writing ${fileName}${counter}`;
    } else if (filesComplete > 0) {
      const counter = filesTotal > 0 ? ` (${filesComplete}/${filesTotal})` : '';
      labelText = `Files written${counter}...`;
    }
  } else if (job.logs?.length && (job.status === 'coding' || job.status === 'loading')) {
    const lastLog = job.logs[job.logs.length - 1]?.message;
    if (lastLog) labelText = lastLog;
  }
  if (stageEl) stageEl.textContent = labelText;

  // Update file progress bar if present
  const progressEl = $(`msg-progress-${id}`);
  if (progressEl && job.status === 'coding' && job.progress?.filesTotal > 0) {
    const pct = Math.round((job.progress.filesComplete / job.progress.filesTotal) * 100);
    progressEl.style.width = `${pct}%`;
    progressEl.style.opacity = '1';
  } else if (progressEl) {
    progressEl.style.opacity = '0';
  }

  // Update stage progress dots
  const stagesEl = $(`msg-stages-${id}`);
  if (stagesEl) {
    const allStages = job.isEdit ? ['loading', 'coding', 'finalizing'] : ['planning', 'coding', 'reviewing', 'finalizing'];
    const currentIdx = allStages.indexOf(job.status);
    stagesEl.querySelectorAll('.msg-stage-pip').forEach((dot) => {
      const s = dot.dataset.stage;
      const i = allStages.indexOf(s);
      dot.classList.toggle('done',   i < currentIdx);
      dot.classList.toggle('active', i === currentIdx);
    });
  }

  // Show last 3 log entries
  if (logEl && job.logs?.length) {
    const recent = job.logs.slice(-3);
    logEl.innerHTML = recent
      .map(l => `<div class="msg-log-entry">${escHtml(l.message || '')}</div>`)
      .join('');
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
    const isEdit = msg.isEdit || false;
    const stagePips = isEdit
      ? ['loading', 'coding', 'finalizing'].map(s =>
          `<span class="msg-stage-pip" data-stage="${s}">${{loading:'Load',coding:'Edit',finalizing:'Save'}[s]}</span>`).join('<span class="msg-stage-sep">›</span>')
      : ['planning', 'coding', 'reviewing', 'finalizing'].map(s =>
          `<span class="msg-stage-pip" data-stage="${s}">${{planning:'Plan',coding:'Code',reviewing:'Review',finalizing:'Save'}[s]}</span>`).join('<span class="msg-stage-sep">›</span>');
    bodyHtml = `
      <div class="msg-stages" id="msg-stages-${msg.id}">${stagePips}</div>
      <div class="msg-generating">
        <span class="msg-spinner"></span>
        <span class="msg-stage-label" id="msg-stage-${msg.id}">Starting...</span>
        <span class="msg-timer" id="msg-timer-${msg.id}">0s</span>
        <button class="msg-cancel-btn" data-job-id="${escAttr(currentJobId || '')}">Cancel</button>
      </div>
      <div class="msg-progress-track"><div class="msg-progress-bar" id="msg-progress-${msg.id}"></div></div>
      <div class="msg-log-stream" id="msg-log-${msg.id}"></div>`;

  } else if (msg.status === 'completed') {
    const fc = msg.filesWritten?.length || 0;
    bodyHtml = `
      <p class="msg-text">${escHtml(msg.text || '')}</p>
      <div class="msg-meta">${fc} file${fc !== 1 ? 's' : ''} · ${escHtml(msg.duration || '—')} · ${escHtml(msg.mode === 'balanced' ? 'standard' : msg.mode || 'standard')}</div>
      <div class="msg-actions">
        <button class="msg-btn" data-action="preview" data-slug="${escAttr(msg.slug || '')}">Open preview</button>
        <button class="msg-btn msg-btn--ghost" data-action="code" data-slug="${escAttr(msg.slug || '')}">View code</button>
        <button class="msg-btn msg-btn--ghost" data-action="download" data-slug="${escAttr(msg.slug || '')}">Download ZIP</button>
        <button class="msg-btn msg-btn--ghost" data-action="regen" data-prompt="${escAttr(msg.userPrompt || '')}">Regenerate</button>
      </div>`;

  } else if (msg.status === 'failed' || msg.status === 'interrupted') {
    const hint = getErrorHint(msg.error);
    bodyHtml = `
      <div class="msg-error-card">
        <div class="msg-error-title">${msg.isEdit ? 'Edit failed' : 'Generation failed'}</div>
        <p class="msg-error-detail">${escHtml(msg.error || 'An unexpected error occurred.')}</p>
        ${hint ? `<p class="msg-error-hint">${escHtml(hint)}</p>` : ''}
      </div>
      <div class="msg-actions">
        <button class="msg-btn" data-action="regen" data-prompt="${escAttr(msg.userPrompt || '')}">Try again</button>
      </div>`;

  } else if (msg.status === 'cancelled') {
    bodyHtml = `<p class="msg-text msg-text--muted">Cancelled.</p>`;

  } else if (msg.status === 'timed_out') {
    const hint = 'Simplify your prompt or try again — complex requests sometimes take longer.';
    bodyHtml = `
      <div class="msg-error-card">
        <div class="msg-error-title">Generation timed out</div>
        <p class="msg-error-hint">${escHtml(hint)}</p>
      </div>
      <div class="msg-actions">
        <button class="msg-btn" data-action="regen" data-prompt="${escAttr(msg.userPrompt || '')}">Try again</button>
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

// Returns an actionable hint string based on the error message content.
function getErrorHint(errorMsg) {
  const msg = (errorMsg || '').toLowerCase();
  if (msg.includes('specialized for mobile game') || msg.includes('not_a_game'))
    return 'Describe your idea as a playable game — e.g. "a runner game where you dodge obstacles" or "an idle tycoon about a coffee shop".';
  if (msg.includes('api key') || msg.includes('unauthorized') || msg.includes('authentication'))
    return 'Check that your API key is configured correctly in your environment.';
  if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('took too long'))
    return 'Simplify your prompt and try again — shorter prompts generate faster.';
  if (msg.includes('parse') || msg.includes('format') || msg.includes('unexpected'))
    return 'The AI returned an unexpected format. This usually resolves on retry.';
  if (msg.includes('too long') || msg.includes('words') || msg.includes('chars'))
    return 'Try shortening your prompt or breaking it into smaller requests.';
  if (msg.includes('connection') || msg.includes('server') || msg.includes('restart'))
    return 'The server may have restarted. Your generation did not complete — try again.';
  if (msg.includes('disk') || msg.includes('write') || msg.includes('space'))
    return 'A server storage issue occurred. Contact support if this persists.';
  return 'This is usually temporary. You can try again.';
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
  if (action === 'download' && slug) {
    const a = document.createElement('a');
    a.href = `/api/download/${encodeURIComponent(slug)}`;
    a.download = `${slug}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showHandoffPanel(slug);
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
    item.querySelector('.history-delete-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDeleteConversation(convId);
    });
  });
}

function buildHistoryItemHtml(conv) {
  const time = formatRelTime(conv.updatedAt);
  const isActive = conv.id === activeConvId;

  // Derive status badge from conversation state
  let badge = '';
  if (conv.projectSlug) {
    badge = `<span class="history-badge history-badge--ready">Generated</span>`;
  }

  return `<div class="history-item${isActive ? ' history-item--active' : ''}" data-conv-id="${escAttr(conv.id)}">
    <button class="history-item-btn" type="button">
      <span class="history-item-title">${escHtml(conv.title || 'Untitled project')}</span>
      <span class="history-item-meta">${badge}<span class="history-item-time">${escHtml(time)}</span></span>
    </button>
    <div class="history-item-actions">
      <button class="history-star-btn${conv.starred ? ' history-star-btn--active' : ''}" type="button" title="${conv.starred ? 'Unstar' : 'Star'}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="${conv.starred ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      </button>
      <button class="history-delete-btn" type="button" title="Delete project">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>
    </div>
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
  // Reset scope to auto and hide the scope bar when starting a new project
  currentScope = 'auto';
  if (scopeBar) scopeBar.classList.add('hidden');
  if (scopeChips) scopeChips.forEach(c => c.classList.toggle('scope-chip--active', c.dataset.scope === 'auto'));
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
async function initiatePreview(slug, _retryCount) {
  const retry = _retryCount || 0;
  setPreviewState('loading', retry > 0 ? 'Retrying...' : 'Loading preview...', '');
  stopPreviewPoll();
  try {
    const data = await apiFetch(`/api/preview/start/${slug}`, { method: 'POST' });
    const preview = data.preview;
    // If files were restored from backup, show a brief message
    if (data._restored) updateLoadingMessage('Project restored — starting preview...', '');
    if (preview.status === 'ready') {
      activatePreview(preview);
    } else if (preview.status === 'error') {
      if (retry < 1) {
        setTimeout(() => initiatePreview(slug, retry + 1), 1500);
      } else {
        // Before showing error — attempt auto-debug repair
        triggerPreviewFailureDebug(slug, preview.error || 'The preview could not be started.');
      }
    } else {
      pollPreviewUntilReady(slug, preview.status);
    }
  } catch (err) {
    if (err.expired || (err.message && err.message.toLowerCase().includes('not found'))) {
      setPreviewState('error', 'Preview unavailable',
        'The preview could not be restored. Your project files may still be saved — try View Code or Download.',
        { showRegenerate: true, showFileFallback: true, slug });
    } else if (retry < 1) {
      setTimeout(() => initiatePreview(slug, retry + 1), 2000);
    } else {
      // Before showing error — attempt auto-debug repair
      triggerPreviewFailureDebug(slug, err.message || 'Could not connect to preview server.');
    }
  }
}

async function triggerPreviewFailureDebug(slug, errorMsg) {
  if (!slug || _runtimeFixPending) {
    setPreviewState('error', 'Preview failed', errorMsg || 'Could not start preview.');
    return;
  }
  _runtimeFixPending = true;
  _runtimeFixCooldown = Date.now() + 60_000;

  updateLoadingMessage('Zyra is repairing...', 'Preview failed — attempting auto-fix');

  try {
    const { jobId } = await apiFetch(`/api/debug/${encodeURIComponent(slug)}/auto`, {
      method: 'POST',
      body: JSON.stringify({
        consoleErrors:  [{ message: String(errorMsg).slice(0, 300), level: 'error', source: 'preview' }],
        previewState:   'error',
        trigger:        'preview_fail',
        mode:           'balanced',
      }),
    });

    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      if (attempts > 20) {
        clearInterval(poll);
        _runtimeFixPending = false;
        setPreviewState('error', 'Preview failed', errorMsg || 'Could not start preview.');
        return;
      }
      try {
        const { job } = await apiFetch(`/api/debug/${encodeURIComponent(slug)}/session/${jobId}`);
        if (job.status === 'completed') {
          clearInterval(poll);
          _runtimeFixPending = false;
          if (job.autoApplied) {
            showToast('Fixed automatically', 'success');
            setTimeout(() => initiatePreview(slug, 0), 500);
          } else {
            setPreviewState('error', 'Preview failed', errorMsg || 'Could not start preview.');
          }
        } else if (['failed', 'cancelled', 'timed_out'].includes(job.status)) {
          clearInterval(poll);
          _runtimeFixPending = false;
          setPreviewState('error', 'Preview failed', errorMsg || 'Could not start preview.');
        }
      } catch (_) {
        clearInterval(poll);
        _runtimeFixPending = false;
        setPreviewState('error', 'Preview failed', errorMsg || 'Could not start preview.');
      }
    }, 2500);
  } catch (_) {
    _runtimeFixPending = false;
    setPreviewState('error', 'Preview failed', errorMsg || 'Could not start preview.');
  }
}

function pollPreviewUntilReady(slug, initialStatus) {
  const msgs = { installing: 'Installing dependencies...', starting: 'Starting server...' };
  updateLoadingMessage(msgs[initialStatus] || 'Starting...', '');
  let pollErrors = 0;
  previewPollInterval = setInterval(async () => {
    try {
      const preview = await apiFetch(`/api/preview/status/${slug}`);
      pollErrors = 0;
      if (preview.status === 'ready') { stopPreviewPoll(); activatePreview(preview); }
      else if (preview.status === 'error') {
        stopPreviewPoll();
        setPreviewState('error', 'Preview failed', preview.error || 'Server failed to start.');
      }
      else updateLoadingMessage(msgs[preview.status] || 'Loading...', '');
    } catch (_) {
      pollErrors++;
      if (pollErrors >= 5) { stopPreviewPoll(); setPreviewState('error', 'Preview failed', 'Lost connection to preview server.'); }
    }
  }, 1500);
}

function activatePreview(preview) {
  currentPreviewUrl = preview.url;

  // Save previewUrl to active conversation
  const conv = getActiveConv();
  if (conv) { conv.previewUrl = preview.url; saveAllData(); }

  const fullUrl = preview.url.startsWith('/') ? window.location.origin + preview.url : preview.url;

  // Show loading while iframe fetches content
  setPreviewState('loading', 'Loading preview...', '');
  if (currentTab !== 'preview') switchTab('preview');
  previewUrlBar.style.display = '';
  browserUrlDisplay.textContent = fullUrl.replace(/^https?:\/\//, '');
  previewUrlText.textContent = fullUrl.replace(/^https?:\/\//, '');

  // Show edit mode button and reset to Play state (new preview = fresh play mode)
  if (editModeBtn) editModeBtn.classList.remove('hidden');
  if (_editModeActive) {
    // If edit mode was on before this load, turn it off so game plays normally
    _setEditMode(false);
  }

  // Fade iframe in on load
  previewIframe.style.opacity = '0';
  previewIframe.src = fullUrl;

  const onLoad = () => {
    setPreviewState('frame');
    previewIframe.style.transition = 'opacity 0.35s ease';
    previewIframe.style.opacity = '1';
    previewIframe.removeEventListener('load', onLoad);
    previewIframe.removeEventListener('error', onError);
    // Always inject the edit bridge so it's ready when the user activates edit mode
    _injectEditScript();
  };
  const onError = () => {
    // iframe error events are rare for same-origin; just show the frame anyway
    setPreviewState('frame');
    previewIframe.style.opacity = '1';
    previewIframe.removeEventListener('load', onLoad);
    previewIframe.removeEventListener('error', onError);
    _injectEditScript();
  };
  previewIframe.addEventListener('load', onLoad);
  previewIframe.addEventListener('error', onError);

  // Fallback: show frame after 8s regardless
  setTimeout(() => {
    if (stateLoading && !stateLoading.classList.contains('hidden')) {
      setPreviewState('frame');
      previewIframe.style.opacity = '1';
    }
  }, 8000);
}

function stopPreviewPoll() {
  if (previewPollInterval) { clearInterval(previewPollInterval); previewPollInterval = null; }
}

function setPreviewState(state, title, sub, opts = {}) {
  [stateEmpty, stateLoading, stateFrame, stateError].forEach((el) => el.classList.add('hidden'));
  if (state === 'empty')   stateEmpty.classList.remove('hidden');
  if (state === 'loading') { stateLoading.classList.remove('hidden'); updateLoadingMessage(title || 'Loading...', sub || ''); }
  if (state === 'frame')   stateFrame.classList.remove('hidden');
  if (state === 'error')   {
    stateError.classList.remove('hidden');
    const t = $('preview-error-title'); const m = $('preview-error-msg');
    if (t) t.textContent = title || 'Error';
    if (m) m.textContent = sub || '';
    // Show regenerate button only when files are gone / expired
    const showRegen = opts.showRegenerate || false;
    regenerateProjectBtn.classList.toggle('hidden', !showRegen);
    // Show file-fallback buttons (View Code + Download) when project may still have stored files
    const showFallback = opts.showFileFallback || false;
    const viewCodeFallbackBtn = $('view-code-fallback-btn');
    const downloadFallbackBtn = $('download-fallback-btn');
    if (viewCodeFallbackBtn) viewCodeFallbackBtn.classList.toggle('hidden', !showFallback);
    if (downloadFallbackBtn) downloadFallbackBtn.classList.toggle('hidden', !showFallback);
    // Wire fallback buttons if slug provided
    if (showFallback && opts.slug) {
      if (viewCodeFallbackBtn) {
        viewCodeFallbackBtn.onclick = () => {
          switchTab('code');
          loadCodeFileListWithFallback(opts.slug);
        };
      }
      if (downloadFallbackBtn) {
        downloadFallbackBtn.onclick = () => {
          const a = document.createElement('a');
          a.href = `/api/download/${encodeURIComponent(opts.slug)}`;
          a.download = `${opts.slug}.zip`;
          a.click();
        };
      }
    }
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

// ── Visual Edit Mode ──────────────────────────────────────────────────────────
//
// Architecture: zyra-edit.js (running inside the iframe) handles ALL selection,
// hover highlighting, inline text editing, and the in-iframe selection bounding
// box. This parent-side code only:
//   1. Toggles edit mode via postMessage to the iframe
//   2. Receives ZYRA_ELEMENT_SELECTED and shows/positions the floating toolbar
//   3. Applies style changes directly to the iframe DOM (same-origin)
//   4. Persists overrides per project
//
// NO parent-side overlay intercepts pointer events.

// ── Iframe scale (accounts for CSS transform on device-wrapper) ───────────────
function _edIframeScale() {
  if (!previewIframe) return { sx: 1, sy: 1 };
  const r  = previewIframe.getBoundingClientRect();
  const sx = previewIframe.offsetWidth  > 0 ? r.width  / previewIframe.offsetWidth  : 1;
  const sy = previewIframe.offsetHeight > 0 ? r.height / previewIframe.offsetHeight : 1;
  return { sx, sy };
}

// Convert an iframe-viewport rect to .preview-main-relative coordinates
function _edIframeRectToMain(rect) {
  const ir  = previewIframe.getBoundingClientRect();
  const pmr = document.querySelector('.preview-main').getBoundingClientRect();
  const { sx, sy } = _edIframeScale();
  return {
    left:   ir.left - pmr.left + rect.left   * sx,
    top:    ir.top  - pmr.top  + rect.top    * sy,
    width:  rect.width  * sx,
    height: rect.height * sy,
  };
}

// ── Inject zyra-edit.js into the preview iframe ───────────────────────────────
// Called on iframe load (always eager) so the bridge is ready when edit mode activates.
function _injectEditScript() {
  if (!previewIframe) return;
  try {
    const doc = previewIframe.contentDocument;
    if (!doc || !doc.body) return;
    if (doc.getElementById('zyra-edit-script')) return; // already present
    const s = doc.createElement('script');
    s.id  = 'zyra-edit-script';
    s.src = '/zyra-edit.js';
    doc.body.appendChild(s);
  } catch (_) {
    // Cross-origin guard — shouldn't happen for /preview/* which is same-origin
  }
}

// ── Floating toolbar positioning ──────────────────────────────────────────────
function _edPositionToolbar(mainRect) {
  if (!editToolbar) return;
  const pm  = document.querySelector('.preview-main');
  const pmW = pm ? pm.offsetWidth  : 600;
  const pmH = pm ? pm.offsetHeight : 600;
  const tbH = editToolbar.offsetHeight || 44;
  const tbW = editToolbar.scrollWidth  || 560;

  let top  = mainRect.top - tbH - 10;
  let left = mainRect.left;
  if (top < 8) top = mainRect.top + mainRect.height + 10;
  top  = Math.max(8, Math.min(top,  pmH - tbH - 8));
  left = Math.max(8, Math.min(left, pmW - tbW - 8));

  editToolbar.style.left    = left + 'px';
  editToolbar.style.top     = top  + 'px';
  editToolbar.style.display = 'flex';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _edRgbToHex(css) {
  if (!css || css === 'transparent' || css === 'rgba(0, 0, 0, 0)') return '#000000';
  if (/^#/.test(css)) return css.slice(0, 7);
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '#000000';
  return '#' + [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('');
}
function _edParsePx(v) { return v ? Math.round(parseFloat(v)) || '' : ''; }

// ── Populate toolbar from node info ──────────────────────────────────────────
function _edPopulateToolbar(info) {
  if (!editToolbar || !info) return;
  const s  = info.styles || {};
  const tf = $('etb-text-field');

  const etText = $('etb-text');
  if (etText) {
    const editable      = !!info.isTextNode;
    etText.disabled     = !editable;
    etText.value        = editable ? (info.textContent || '') : '';
    etText.placeholder  = editable ? 'text content' : '(has child elements)';
    if (tf) tf.style.opacity = editable ? '1' : '0.35';
  }

  const etFF = $('etb-font-family'); if (etFF) etFF.value = s.fontFamily || '';
  const etFS = $('etb-font-size');   if (etFS) etFS.value = _edParsePx(s.fontSize);

  const etBold   = $('etb-bold');
  const etItalic = $('etb-italic');
  if (etBold)   etBold.classList.toggle('etb-toggle-btn--on',   parseInt(s.fontWeight) >= 600);
  if (etItalic) etItalic.classList.toggle('etb-toggle-btn--on', s.fontStyle === 'italic');

  const etColor = $('etb-text-color'); if (etColor) etColor.value = _edRgbToHex(s.color);
  const etBg    = $('etb-bg-color');
  const bgHex   = _edRgbToHex(s.backgroundColor);
  if (etBg) etBg.value = bgHex;
  const bgSw = $('etb-bg-swatch'); if (bgSw) bgSw.style.background = bgHex;

  const etW = $('etb-width');   if (etW) etW.value = _edParsePx(s.width);
  const etH = $('etb-height');  if (etH) etH.value = _edParsePx(s.height);
  const etR = $('etb-radius');  if (etR) etR.value = _edParsePx(s.borderRadius);
  const etO = $('etb-opacity'); if (etO) etO.value = Math.round(parseFloat(s.opacity || 1) * 100);
}

// ── Apply a style override — direct DOM + store ───────────────────────────────
function _edApplyStyle(prop, value) {
  if (!_edNodeId || !currentSlug) return;
  const doc = previewIframe && previewIframe.contentDocument;
  if (!doc) return;
  const el = doc.querySelector(`[data-zyra-id="${_edNodeId}"]`);
  if (!el) return;

  // Record previous value for undo
  const prevValue = el.style[prop] || '';
  _undoStack.push({ type: 'style', nodeId: _edNodeId, prop, prevValue });
  if (_undoStack.length > 60) _undoStack.shift();

  // Direct DOM — instant visual feedback, no postMessage round-trip needed
  try { el.style[prop] = value; } catch (_) {}

  // Tell zyra-edit.js to refresh its in-iframe selection box (size may change)
  try { previewIframe.contentWindow.__zyraEdit.repositionSel(); } catch (_) {}

  // Persist
  if (!_visualOverrides[currentSlug]) _visualOverrides[currentSlug] = {};
  const slug = _visualOverrides[currentSlug];
  if (!slug[_edNodeId]) slug[_edNodeId] = {};
  if (!slug[_edNodeId].styles) slug[_edNodeId].styles = {};
  slug[_edNodeId].styles[prop] = value;
  _edSaveDebounced();
}

// Apply a text change from the toolbar text input
function _edApplyText(text) {
  if (!_edNodeId || !currentSlug) return;
  const doc = previewIframe && previewIframe.contentDocument;
  if (!doc) return;
  const el = doc.querySelector(`[data-zyra-id="${_edNodeId}"]`);
  if (!el) return;

  // Record previous text for undo
  const prevText = el.textContent || '';
  _undoStack.push({ type: 'text', nodeId: _edNodeId, prevText });
  if (_undoStack.length > 60) _undoStack.shift();

  if (el.childNodes.length <= 1) el.textContent = text;

  if (!_visualOverrides[currentSlug]) _visualOverrides[currentSlug] = {};
  if (!_visualOverrides[currentSlug][_edNodeId]) _visualOverrides[currentSlug][_edNodeId] = {};
  _visualOverrides[currentSlug][_edNodeId].text = text;
  _edSaveDebounced();
}

function _edSaveDebounced() {
  if (_viSaveTimer) clearTimeout(_viSaveTimer);
  _viSaveTimer = setTimeout(() => {
    if (!currentSlug) return;
    apiFetch(`/api/projects/${encodeURIComponent(currentSlug)}`, {
      method: 'PATCH',
      body: JSON.stringify({ visualOverrides: _visualOverrides[currentSlug] || {} }),
    }).catch(() => {});
  }, 800);
}

// ── Edit mode toggle ──────────────────────────────────────────────────────────
function _setEditMode(active) {
  _editModeActive = active;
  if (editModeBtn) editModeBtn.classList.toggle('edit-mode-btn--active', active);

  // Update button icon and label to reflect current mode
  const iconEl  = $('edit-mode-icon');
  const labelEl = $('edit-mode-label');
  if (iconEl)  iconEl.innerHTML  = active ? _PLAY_SVG  : _PENCIL_SVG;
  if (labelEl) labelEl.textContent = active ? 'Play' : 'Edit';

  // Cyan glow on iframe when edit mode is on
  if (previewIframe) previewIframe.classList.toggle('preview-edit-active', active);

  // Show / hide the edit mode banner
  if (editBanner) editBanner.classList.toggle('hidden', !active);

  // Ensure the edit bridge is loaded in the iframe
  if (active) _injectEditScript();

  // Tell iframe to activate/deactivate its own event interceptors
  try {
    if (previewIframe && previewIframe.contentWindow) {
      previewIframe.contentWindow.postMessage({ type: 'ZYRA_EDIT_MODE', enabled: active }, '*');
    }
  } catch (_) {}

  if (!active) {
    _edNodeId = null;
    _undoStack = [];
    if (editToolbar) editToolbar.style.display = 'none';
  }
}

// ── Toolbar control wiring ────────────────────────────────────────────────────
function _etbOn(id, ev, fn) { const el = $(id); if (el) el.addEventListener(ev, fn); }

_etbOn('etb-text',        'input',  () => _edApplyText($('etb-text').value));
_etbOn('etb-font-family', 'change', () => _edApplyStyle('fontFamily',     $('etb-font-family').value));
_etbOn('etb-font-size',   'change', () => { const v = $('etb-font-size').value;  if (v) _edApplyStyle('fontSize', v + 'px'); });
_etbOn('etb-bold',        'click',  () => {
  const btn = $('etb-bold'); btn.classList.toggle('etb-toggle-btn--on');
  _edApplyStyle('fontWeight', btn.classList.contains('etb-toggle-btn--on') ? '700' : '400');
});
_etbOn('etb-italic',      'click',  () => {
  const btn = $('etb-italic'); btn.classList.toggle('etb-toggle-btn--on');
  _edApplyStyle('fontStyle',  btn.classList.contains('etb-toggle-btn--on') ? 'italic' : 'normal');
});
_etbOn('etb-text-color',  'input',  () => _edApplyStyle('color',           $('etb-text-color').value));
_etbOn('etb-bg-color',    'input',  () => {
  const v = $('etb-bg-color').value;
  const sw = $('etb-bg-swatch'); if (sw) sw.style.background = v;
  _edApplyStyle('backgroundColor', v);
});
_etbOn('etb-width',       'change', () => { const v = $('etb-width').value;   if (v) _edApplyStyle('width',        v + 'px'); });
_etbOn('etb-height',      'change', () => { const v = $('etb-height').value;  if (v) _edApplyStyle('height',       v + 'px'); });
_etbOn('etb-radius',      'change', () => { const v = $('etb-radius').value;  if (v !== '') _edApplyStyle('borderRadius', v + 'px'); });
_etbOn('etb-opacity',     'input',  () => {
  const v = $('etb-opacity').value;
  if (v !== '') _edApplyStyle('opacity', (parseFloat(v) / 100).toFixed(2));
});
_etbOn('etb-close', 'click', () => {
  // Tell iframe to deselect; toolbar will hide via ZYRA_ELEMENT_DESELECTED
  try { previewIframe.contentWindow.postMessage({ type: 'ZYRA_DESELECT' }, '*'); } catch (_) {}
  _edNodeId = null;
  if (editToolbar) editToolbar.style.display = 'none';
});

if (editModeBtn) editModeBtn.addEventListener('click', () => _setEditMode(!_editModeActive));

// Banner dismiss
if (editBannerClose) editBannerClose.addEventListener('click', () => {
  if (editBanner) editBanner.classList.add('hidden');
});

// Keyboard shortcuts (only when not typing in an input)
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;

  // Esc: exit edit mode when nothing is selected in iframe
  if (e.key === 'Escape' && _editModeActive && !_edNodeId) {
    _setEditMode(false);
    return;
  }

  // E key: toggle edit mode (only when a project is loaded and not typing)
  if ((e.key === 'e' || e.key === 'E') && !isTyping && !e.ctrlKey && !e.metaKey) {
    if (currentSlug && editModeBtn && !editModeBtn.classList.contains('hidden')) {
      _setEditMode(!_editModeActive);
    }
    return;
  }

  // Ctrl+Z / Cmd+Z: undo last visual change (only in edit mode)
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && _editModeActive) {
    e.preventDefault();
    const entry = _undoStack.pop();
    if (!entry || !previewIframe) return;
    const doc = previewIframe.contentDocument;
    if (!doc) return;
    const el = doc.querySelector(`[data-zyra-id="${entry.nodeId}"]`);
    if (!el) return;

    if (entry.type === 'style') {
      try { el.style[entry.prop] = entry.prevValue; } catch (_) {}
      // Sync override store
      const ov = _visualOverrides[currentSlug]?.[entry.nodeId]?.styles;
      if (ov) ov[entry.prop] = entry.prevValue;
    } else if (entry.type === 'text') {
      if (el.childNodes.length <= 1) el.textContent = entry.prevText;
      if (_visualOverrides[currentSlug]?.[entry.nodeId]) {
        _visualOverrides[currentSlug][entry.nodeId].text = entry.prevText;
      }
      // Keep toolbar text input in sync if this node is still selected
      if (_edNodeId === entry.nodeId) {
        const etText = $('etb-text');
        if (etText) etText.value = entry.prevText || '';
      }
    }

    try { previewIframe.contentWindow.__zyraEdit.repositionSel(); } catch (_) {}
    _edSaveDebounced();
  }
});

// ── postMessage from iframe ───────────────────────────────────────────────────
window.addEventListener('message', (e) => {
  const msg = e.data;
  if (!msg || !msg.type) return;

  // Bridge booted — re-send edit mode state + saved overrides
  if (msg.type === 'ZYRA_EDIT_READY') {
    if (_editModeActive) {
      try { previewIframe.contentWindow.postMessage({ type: 'ZYRA_EDIT_MODE', enabled: true }, '*'); } catch (_) {}
    }
    if (currentSlug && _visualOverrides[currentSlug]) {
      try {
        previewIframe.contentWindow.postMessage({
          type:      'ZYRA_LOAD_OVERRIDES',
          overrides: _visualOverrides[currentSlug],
        }, '*');
      } catch (_) {}
    }
  }

  // User clicked an element inside iframe → show + position toolbar
  if (msg.type === 'ZYRA_ELEMENT_SELECTED') {
    _edNodeId = msg.nodeId;
    if (msg.info)  _edPopulateToolbar(msg.info);
    if (msg.rect)  _edPositionToolbar(_edIframeRectToMain(msg.rect));
  }

  // User deselected (clicked empty area or pressed Esc)
  if (msg.type === 'ZYRA_ELEMENT_DESELECTED') {
    _edNodeId = null;
    if (editToolbar) editToolbar.style.display = 'none';
  }

  // Inline text edit was committed — persist the text override
  if (msg.type === 'ZYRA_TEXT_COMMITTED' && msg.saved && msg.nodeId) {
    if (!_visualOverrides[currentSlug]) _visualOverrides[currentSlug] = {};
    if (!_visualOverrides[currentSlug][msg.nodeId]) _visualOverrides[currentSlug][msg.nodeId] = {};
    _visualOverrides[currentSlug][msg.nodeId].text = msg.text;
    _edSaveDebounced();
    // Keep toolbar text input in sync
    const etText = $('etb-text');
    if (etText && _edNodeId === msg.nodeId) etText.value = msg.text || '';
  }

  // Iframe asks parent to exit edit mode (Esc pressed when nothing is selected)
  if (msg.type === 'ZYRA_REQUEST_EXIT_EDIT_MODE') _setEditMode(false);

  // ZYRA_RUNTIME_ERROR handled by its own listener below
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
  if (currentSlug) {
    // Preview failure — re-initiate the preview
    initiatePreview(currentSlug);
  } else if (_lastGenerationPrompt) {
    // Generation failure (no project yet) — re-submit the last prompt
    startGeneration(_lastGenerationPrompt);
  }
});

regenerateProjectBtn.addEventListener('click', () => {
  const originalPrompt = getOriginalProjectPrompt();
  if (originalPrompt) {
    // Reset project slug so it generates fresh instead of editing
    const conv = getActiveConv();
    if (conv) { conv.projectSlug = null; conv.previewUrl = null; saveAllData(); }
    currentSlug = null;
    currentPreviewUrl = null;
    updateDeployButton(null);
    startGeneration(originalPrompt);
  }
});

function getOriginalProjectPrompt() {
  // Find the first non-edit assistant message with a userPrompt
  const firstGen = messages.find(m => m.type === 'assistant' && !m.isEdit && m.userPrompt);
  return firstGen?.userPrompt || null;
}

// ── Download & Handoff ────────────────────────────────────────────────────────
const downloadBtn  = $('download-btn');
const handoffPanel = $('handoff-panel');

function updateDownloadButton(slug) {
  if (slug) {
    downloadBtn.classList.remove('hidden');
    $('fix-my-app-btn')?.classList.remove('hidden');
  } else {
    downloadBtn.classList.add('hidden');
    $('fix-my-app-btn')?.classList.add('hidden');
    closeHandoffPanel();
  }
}

// Alias so existing callers still work
function updateDeployButton(slug) { updateDownloadButton(slug); }

function closeHandoffPanel() {
  if (handoffPanel) handoffPanel.classList.add('hidden');
}

function showHandoffPanel(slug) {
  if (!handoffPanel) return;
  const cmdEl = $('handoff-cmd');
  if (cmdEl) cmdEl.textContent = `unzip ${slug}.zip && open ${slug}/index.html`;
  handoffPanel.classList.remove('hidden');
}

downloadBtn.addEventListener('click', async () => {
  if (!currentSlug) return;
  // Trigger browser download by navigating to the ZIP endpoint
  const a = document.createElement('a');
  a.href = `/api/download/${encodeURIComponent(currentSlug)}`;
  a.download = `${currentSlug}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showHandoffPanel(currentSlug);
});

$('handoff-copy-btn')?.addEventListener('click', () => {
  const cmdEl = $('handoff-cmd');
  if (!cmdEl) return;
  navigator.clipboard.writeText(cmdEl.textContent).catch(() => {});
  const btn = $('handoff-copy-btn');
  if (btn) {
    btn.title = 'Copied!';
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    setTimeout(() => {
      btn.title = 'Copy command';
      btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    }, 2000);
  }
});

$('handoff-close-btn')?.addEventListener('click', closeHandoffPanel);

// ── Code view ─────────────────────────────────────────────────────────────────

/**
 * Loads the code file list with automatic fallback to stored-file backup.
 * Delegates to loadCodeFileList which already has the full fallback logic.
 */
async function loadCodeFileListWithFallback(slug) {
  return loadCodeFileList(slug);
}

function renderAndWireCodeFileList(slug, nodes) {
  const fileCount = countFiles(nodes);
  if (!fileCount) { codeFileList.innerHTML = '<div class="empty-state">No files.</div>'; return; }

  const titleEl = codeFileList.closest('.code-file-sidebar')?.querySelector('.code-sidebar-title');
  if (titleEl) titleEl.textContent = `Files (${fileCount})`;

  codeFileList.innerHTML = renderFileTree(nodes, slug, 0);

  codeFileList.querySelectorAll('.code-file-item').forEach((item) => {
    item.addEventListener('click', () => {
      codeFileList.querySelectorAll('.code-file-item').forEach((i) => i.classList.remove('active'));
      item.classList.add('active');
      loadFileContent(item.dataset.slug, item.dataset.path);
    });
  });

  codeFileList.querySelectorAll('.code-dir-item').forEach((dir) => {
    dir.addEventListener('click', () => {
      const key = dir.dataset.dirKey;
      const children = codeFileList.querySelector(`.code-dir-children[data-dir-key="${key}"]`);
      if (!children) return;
      const collapsed = children.classList.toggle('collapsed');
      dir.classList.toggle('collapsed', collapsed);
    });
  });

  const firstFile = codeFileList.querySelector('.code-file-item');
  if (firstFile) firstFile.click();
}

async function loadCodeFileList(slug) {
  codeFileList.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    const data = await apiFetch(`/api/projects/${slug}/files`);
    const nodes = data.files || [];
    renderAndWireCodeFileList(slug, nodes);
  } catch (err) {
    // Backend auto-restores from backup; if this still fails, try stored-files fallback
    try {
      const data = await apiFetch(`/api/projects/${slug}/stored-files`);
      const files = data.files || [];
      if (!files.length) { codeFileList.innerHTML = '<div class="empty-state">No files.</div>'; return; }

      window._storedFileContents = window._storedFileContents || {};
      for (const f of files) window._storedFileContents[`${slug}/${f.path}`] = f.content;

      const nodes = files.map(f => ({ type: 'file', path: f.path }));
      const titleEl = codeFileList.closest('.code-file-sidebar')?.querySelector('.code-sidebar-title');
      if (titleEl) titleEl.textContent = `Files (${files.length}) — from backup`;

      codeFileList.innerHTML = renderFileTree(nodes, slug, 0);
      codeFileList.querySelectorAll('.code-file-item').forEach((item) => {
        item.addEventListener('click', () => {
          codeFileList.querySelectorAll('.code-file-item').forEach((i) => i.classList.remove('active'));
          item.classList.add('active');
          const key = `${item.dataset.slug}/${item.dataset.path}`;
          const content = window._storedFileContents?.[key];
          if (content !== undefined) {
            codeFileName.textContent = item.dataset.path;
            codeText.textContent = content;
          } else {
            loadFileContent(item.dataset.slug, item.dataset.path);
          }
        });
      });
      const first = codeFileList.querySelector('.code-file-item');
      if (first) first.click();
    } catch (_) {
      codeFileList.innerHTML = `<div class="empty-state">${escHtml(err.message)}</div>`;
    }
  }
}

function countFiles(nodes) {
  let n = 0;
  for (const node of (nodes || [])) {
    if (node.type === 'file') n++;
    else if (node.children) n += countFiles(node.children);
  }
  return n;
}

function getFileIcon(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const icons = {
    html: '<span class="fi fi-html">H</span>',
    css:  '<span class="fi fi-css">C</span>',
    js:   '<span class="fi fi-js">J</span>',
    ts:   '<span class="fi fi-ts">T</span>',
    json: '<span class="fi fi-json">{}</span>',
    sql:  '<span class="fi fi-sql">S</span>',
    md:   '<span class="fi fi-md">M</span>',
    svg:  '<span class="fi fi-svg">V</span>',
    jsx:  '<span class="fi fi-js">J</span>',
    tsx:  '<span class="fi fi-ts">T</span>',
    txt:  '<span class="fi fi-txt">T</span>',
  };
  return icons[ext] || '<span class="fi fi-default">F</span>';
}

function renderFileTree(nodes, slug, depth) {
  if (!nodes || !nodes.length) return '';
  const indent = depth * 12; // px per level
  let html = '';

  for (const node of nodes) {
    if (node.type === 'dir') {
      const dirName = node.path.split('/').pop() || node.path;
      const key = escAttr(node.path);
      html += `<div class="code-dir-item" data-dir-key="${key}" style="padding-left:calc(0.5rem + ${indent}px)">
        <span class="dir-arrow">▶</span>
        <span class="dir-icon">◻</span>
        <span class="dir-name">${escHtml(dirName)}/</span>
      </div>
      <div class="code-dir-children" data-dir-key="${key}">
        ${renderFileTree(node.children || [], slug, depth + 1)}
      </div>`;
    } else {
      const filename = node.path.split('/').pop() || node.path;
      html += `<div class="code-file-item" data-slug="${escAttr(slug)}" data-path="${escAttr(node.path)}" style="padding-left:calc(0.5rem + ${indent}px)">
        ${getFileIcon(filename)}
        <span class="file-name">${escHtml(filename)}</span>
      </div>`;
    }
  }
  return html;
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
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.expired  = data.expired  || false;
    err.code     = data.code     || null;
    err.hint     = data.hint     || null;
    err.httpStatus = res.status;
    throw err;
  }
  return data;
}

function escHtml(s)  { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s)  { return String(s).replace(/"/g,'&quot;'); }

// ── Fix My Game ───────────────────────────────────────────────────────────────

const debugOverlay  = $('debug-overlay');   // reuse existing modal shell
const debugBody     = $('debug-modal-body');

const fixState = { jobId: null, slug: null, pollInterval: null };

$('fix-my-app-btn')?.addEventListener('click', () => {
  if (!currentSlug) return;
  fixState.slug  = currentSlug;
  fixState.jobId = null;
  openFixModal();
});

$('debug-modal-close')?.addEventListener('click', closeFixModal);
debugOverlay?.addEventListener('click', (e) => { if (e.target === debugOverlay) closeFixModal(); });

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (debugOverlay && !debugOverlay.classList.contains('hidden')) closeFixModal();
    if (!$('delete-confirm-overlay').classList.contains('hidden')) closeDeleteConfirm();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    const anyOpen = (debugOverlay && !debugOverlay.classList.contains('hidden')) ||
                    !$('delete-confirm-overlay').classList.contains('hidden') ||
                    !authModalOverlay.classList.contains('hidden');
    if (!anyOpen) { e.preventDefault(); newChatBtn.click(); }
  }
});

function openFixModal() {
  if (debugOverlay) debugOverlay.classList.remove('hidden');
  renderFixIdle();
}
function closeFixModal() {
  stopFixPoll();
  if (debugOverlay) debugOverlay.classList.add('hidden');
}
function stopFixPoll() {
  if (fixState.pollInterval) { clearInterval(fixState.pollInterval); fixState.pollInterval = null; }
}

// ── Idle: description input + start ──────────────────────────────────────────

function renderFixIdle() {
  debugBody.innerHTML = `
    <p class="debug-modal-intro">Zyra will scan your game code, detect all issues — broken game loop, missing touch controls, empty functions, bad state transitions — and apply targeted fixes automatically.</p>
    <textarea class="debug-desc-input" id="fix-desc" rows="3" maxlength="600"
      placeholder="Optional: describe what's broken — e.g. game doesn't start, controls don't respond, game over never triggers..."></textarea>
    <div class="debug-actions" style="margin-top:14px;">
      <button class="debug-action-btn debug-action-btn--primary" id="fix-start-btn" type="button">Analyze &amp; Fix</button>
      <button class="debug-action-btn" id="fix-cancel-btn" type="button">Cancel</button>
    </div>
  `;
  $('fix-start-btn').addEventListener('click', startFixGame);
  $('fix-cancel-btn').addEventListener('click', closeFixModal);
  setTimeout(() => $('fix-desc')?.focus(), 50);
}

// ── Running: step progress ────────────────────────────────────────────────────

const FIX_STEPS = [
  { stage: 'loading',    label: 'Loading game files' },
  { stage: 'analyzing',  label: 'Detecting issues' },
  { stage: 'coding',     label: 'Applying fixes' },
  { stage: 'finalizing', label: 'Saving changes' },
];

function renderFixRunning(stage) {
  const stageOrder = ['loading', 'analyzing', 'coding', 'finalizing'];
  const activeIdx  = Math.max(0, stageOrder.indexOf(stage));

  const stepsHtml = FIX_STEPS.map(({ label }, i) => {
    let icon;
    if (i < activeIdx)       icon = `<span class="debug-step-check">&#10003;</span>`;
    else if (i === activeIdx) icon = `<span class="debug-step-spinner"></span>`;
    else                     icon = `<span class="debug-step-wait">&#9679;</span>`;
    const cls = i < activeIdx ? 'debug-step--done' : i === activeIdx ? 'debug-step--active' : '';
    return `<div class="debug-step ${cls}"><div class="debug-step-icon">${icon}</div><span>${escHtml(label)}</span></div>`;
  }).join('');

  debugBody.innerHTML = `
    <div class="debug-running-header">
      <span class="debug-mode-label">Fix My Game</span>
      <span class="debug-running-sub">Analyzing and fixing your game...</span>
    </div>
    <div class="debug-steps">${stepsHtml}</div>
  `;
}

// ── Done ─────────────────────────────────────────────────────────────────────

function renderFixDone(filesWritten = []) {
  const fileList = filesWritten.length
    ? `<div class="debug-affected-files" style="margin-top:10px;"><strong>Updated:</strong> ${filesWritten.map(f => `<span class="debug-file-tag">${escHtml(f)}</span>`).join('')}</div>`
    : '';
  debugBody.innerHTML = `
    <div class="debug-applied-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4a7c3f" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      Fix applied — preview refreshed.
    </div>
    ${fileList}
    <div class="debug-actions" style="margin-top:16px;">
      <button class="debug-action-btn debug-action-btn--primary" id="fix-done-btn" type="button">Done</button>
    </div>
  `;
  $('fix-done-btn')?.addEventListener('click', closeFixModal);
}

// ── Error ─────────────────────────────────────────────────────────────────────

function renderFixError(msg) {
  debugBody.innerHTML = `
    <div class="debug-error-state">
      <div class="debug-error-icon">!</div>
      <p>${escHtml(msg || 'Fix failed. Please try again.')}</p>
      <div class="debug-actions" style="margin-top:12px;">
        <button class="debug-action-btn debug-action-btn--primary" id="fix-retry-btn" type="button">Try Again</button>
        <button class="debug-action-btn" id="fix-close-btn" type="button">Close</button>
      </div>
    </div>
  `;
  $('fix-retry-btn')?.addEventListener('click', renderFixIdle);
  $('fix-close-btn')?.addEventListener('click', closeFixModal);
}

// ── Start ─────────────────────────────────────────────────────────────────────

async function startFixGame() {
  const desc = ($('fix-desc')?.value || '').trim();
  const slug = fixState.slug;
  if (!slug) return;

  renderFixRunning('loading');

  try {
    const data = await apiFetch(`/api/fix/${encodeURIComponent(slug)}`, {
      method: 'POST',
      body:   JSON.stringify({ description: desc, mode: currentMode }),
    });
    fixState.jobId = data.jobId;
    pollFixJob();
  } catch (err) {
    renderFixError(err.message);
  }
}

// ── Poll ──────────────────────────────────────────────────────────────────────

function pollFixJob() {
  stopFixPoll();
  fixState.pollInterval = setInterval(async () => {
    try {
      const { job } = await apiFetch(`/api/jobs/${fixState.jobId}`);

      if (!['completed', 'failed', 'cancelled', 'interrupted'].includes(job.status)) {
        renderFixRunning(job.stage || 'coding');
        return;
      }

      stopFixPoll();

      if (job.status === 'completed') {
        renderFixDone(job.filesWritten || []);
        // Refresh preview iframe
        if (previewIframe && previewIframe.src) {
          const src = previewIframe.src;
          previewIframe.src = '';
          setTimeout(() => { previewIframe.src = src; }, 400);
        }
      } else {
        renderFixError(job.error || 'Fix failed. Please try again.');
      }
    } catch (_) {}
  }, 1500);
}

// ── Legacy stub (kept so any remaining dead references don't throw) ───────────
function renderDebugError(message) { renderFixError(message); }
function closeDebugModal() { closeFixModal(); }

// ── ORIGINAL SECTION REMOVED ─────────────────────────────────────────────────
// The multi-mode debug system (standard/heal/incident/visual) has been replaced
// by the focused Fix My Game pipeline above. The /api/fix/:slug endpoint runs
// validateGamePlayability + validateGeneratedCode, builds a targeted fix prompt,
// and routes through editService (same job polling, file writing, metadata).


// ── Init ──────────────────────────────────────────────────────────────────────
// Account avatar button starts hidden — shown once session resolves
const _avatarBtn = $('account-avatar-btn');
if (_avatarBtn) _avatarBtn.classList.add('hidden');

loadAllData();

// ── URL param: open a specific project ────────────────────────────────────────
(function applyUrlParams() {
  const params      = new URLSearchParams(window.location.search);
  const projectSlug = params.get('project');
  const isNew       = params.get('new');

  if (projectSlug) {
    // Find an existing conversation linked to this project
    const existing = conversations.find(c => c.projectSlug === projectSlug);
    if (existing) {
      activeConvId = existing.id;
      messages     = existing.messages;
    } else {
      // Project exists on server but not in local storage — create a thin shell
      const humanName = projectSlug.split('-')
        .map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : '').join(' ');
      const conv = {
        id: uid(), title: humanName, messages: [],
        createdAt: Date.now(), updatedAt: Date.now(),
        starred: false, projectSlug, previewUrl: null, _titled: true,
      };
      conversations.unshift(conv);
      activeConvId = conv.id;
      messages     = conv.messages;
      saveAllData();
      // Fetch real display name from server and update title
      apiFetch(`/api/projects/${encodeURIComponent(projectSlug)}`).then(data => {
        if (data.displayName) { conv.title = data.displayName; saveAllData(); renderHistory(); }
        _updateHeaderProject(conv.title);
      }).catch(() => {});
    }
  } else if (isNew) {
    createNewConversation();
  }

  // Clean the URL so refreshing doesn't re-run this
  if (projectSlug || isNew) {
    window.history.replaceState({}, '', '/app');
  }
})();

renderAllMessages();
renderHistory();
checkHealth();
setInterval(checkHealth, 30_000);
setPreviewState('empty');

// Delete confirm dialog
$('delete-confirm-cancel')?.addEventListener('click', closeDeleteConfirm);
$('delete-confirm-ok')?.addEventListener('click', executeDeleteConversation);
$('delete-confirm-overlay')?.addEventListener('click', (e) => {
  if (e.target === $('delete-confirm-overlay')) closeDeleteConfirm();
});

// ── Toast notifications ───────────────────────────────────────────────────────

const toastEl = $('zyra-toast');
let _toastTimer = null;

function showToast(message, type = 'warning') {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.className = `zyra-toast zyra-toast--${type}`;
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 4000);
}

// ── Runtime error catching from preview iframe ────────────────────────────────

let _runtimeFixCooldown = 0;   // timestamp — no auto-fix until after this
let _runtimeFixPending  = false;
let _runtimeErrTimer    = null;

function isBreakingError(msg) {
  if (!msg) return false;
  const m = msg.toLowerCase();
  // Significant JS runtime errors worth auto-fixing
  return (
    m.includes('is not defined') ||
    m.includes('cannot read prop') ||
    m.includes('cannot read properties') ||
    m.includes('is not a function') ||
    m.includes('unexpected token') ||
    m.includes('syntaxerror') ||
    m.includes('referenceerror') ||
    m.includes('typeerror')
  );
}

function canAutoFix() {
  if (!currentSlug) return false;
  if (currentJobId) return false;
  if (_runtimeFixPending) return false;
  if (Date.now() < _runtimeFixCooldown) return false;
  return true;
}

async function triggerRuntimeAutoFix(errors) {
  if (!canAutoFix()) return;
  _runtimeFixPending = true;
  _runtimeFixCooldown = Date.now() + 45_000; // 45s cooldown

  // Show subtle "analyzing" state in preview — don't disrupt user
  const loadingEl = $('state-loading');
  const frameEl   = $('state-frame');
  updateLoadingMessage('Zyra is analyzing...', 'Detected an issue — attempting self-repair');
  if (loadingEl) loadingEl.classList.remove('hidden');
  if (frameEl)   frameEl.classList.add('hidden');

  const errorList = Array.isArray(errors) ? errors : [{ message: String(errors), level: 'error' }];

  try {
    const { jobId } = await apiFetch(`/api/debug/${encodeURIComponent(currentSlug)}/auto`, {
      method: 'POST',
      body: JSON.stringify({
        consoleErrors: errorList.slice(0, 10),
        previewState:  'runtime_error',
        trigger:       'runtime',
        mode:          'balanced',
      }),
    });

    // Poll for completion
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      if (attempts > 30) {
        clearInterval(poll);
        _runtimeFixPending = false;
        // restore preview as-is
        if (loadingEl) loadingEl.classList.add('hidden');
        if (frameEl)   frameEl.classList.remove('hidden');
        return;
      }
      try {
        const { job } = await apiFetch(`/api/debug/${encodeURIComponent(currentSlug)}/session/${jobId}`);
        if (job.status === 'completed') {
          clearInterval(poll);
          _runtimeFixPending = false;
          if (job.autoApplied) {
            // Reload the preview with the fix applied
            showToast('Fixed automatically', 'success');
            if (previewIframe && previewIframe.src) {
              const src = previewIframe.src;
              previewIframe.src = '';
              setTimeout(() => {
                previewIframe.src = src;
                setPreviewState('frame');
              }, 300);
            } else {
              initiatePreview(currentSlug);
            }
          } else {
            // No patch was applied — restore iframe
            if (loadingEl) loadingEl.classList.add('hidden');
            if (frameEl)   frameEl.classList.remove('hidden');
          }
        } else if (['failed', 'cancelled', 'timed_out'].includes(job.status)) {
          clearInterval(poll);
          _runtimeFixPending = false;
          if (loadingEl) loadingEl.classList.add('hidden');
          if (frameEl)   frameEl.classList.remove('hidden');
        }
      } catch (_) { clearInterval(poll); _runtimeFixPending = false; }
    }, 2000);
  } catch (_) {
    _runtimeFixPending = false;
    if (loadingEl) loadingEl.classList.add('hidden');
    if (frameEl)   frameEl.classList.remove('hidden');
  }
}

window.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'ZYRA_RUNTIME_ERROR') return;

  // New batched format: { type, errors: [...] }
  // Legacy format: { type, error: { message } }
  const errors = Array.isArray(event.data.errors)
    ? event.data.errors
    : event.data.error
      ? [{ message: (event.data.error.message || ''), level: 'error' }]
      : [];

  const breaking = errors.filter(e => isBreakingError(e.message));
  if (breaking.length === 0) return;

  if (_runtimeErrTimer) clearTimeout(_runtimeErrTimer);
  _runtimeErrTimer = setTimeout(() => {
    triggerRuntimeAutoFix(breaking);
  }, 2500);
});

// ── Mobile layout ─────────────────────────────────────────────────────────────

const studioBody        = document.querySelector('.studio-body');
const mobileTabBuild    = $('mobile-tab-build');
const mobileTabPreview  = $('mobile-tab-preview');

function isMobile() {
  return window.innerWidth <= 768;
}

function setMobilePanel(panel) {
  if (!studioBody) return;
  studioBody.classList.remove('mobile-build', 'mobile-preview');
  studioBody.classList.add(panel === 'preview' ? 'mobile-preview' : 'mobile-build');

  if (mobileTabBuild)   mobileTabBuild.classList.toggle('mobile-nav-btn--active',   panel !== 'preview');
  if (mobileTabPreview) mobileTabPreview.classList.toggle('mobile-nav-btn--active', panel === 'preview');
}

function initMobileLayout() {
  if (!studioBody) return;
  // Default: show build panel
  studioBody.classList.add('mobile-build');
}

if (mobileTabBuild) {
  mobileTabBuild.addEventListener('click', () => setMobilePanel('build'));
}

if (mobileTabPreview) {
  mobileTabPreview.addEventListener('click', () => setMobilePanel('preview'));
}

// Auto-switch to preview on mobile when generation completes
const _mobilePreviewObserver = new MutationObserver(() => {
  if (stateFrame && !stateFrame.classList.contains('hidden') && isMobile()) {
    setMobilePanel('preview');
    if (mobileTabPreview) mobileTabPreview.dataset.hasPreview = 'true';
  }
});
if (stateFrame) _mobilePreviewObserver.observe(stateFrame, { attributes: true, attributeFilter: ['class'] });

// Init on load and on resize
initMobileLayout();
window.addEventListener('resize', () => {
  if (!isMobile()) {
    // Reset — desktop layout doesn't need mobile classes
    if (studioBody) studioBody.classList.remove('mobile-build', 'mobile-preview');
  } else {
    // Re-apply current mobile state
    if (!studioBody.classList.contains('mobile-preview') && !studioBody.classList.contains('mobile-build')) {
      initMobileLayout();
    }
  }
});

// ── Virtual gamepad ───────────────────────────────────────────────────────────

const virtualPad       = $('virtual-pad');
const vpadToggleBtn    = $('vpad-toggle-btn');
let   vpadVisible      = false;

function showVpad(show) {
  vpadVisible = show;
  if (virtualPad)    virtualPad.classList.toggle('hidden', !show);
  if (vpadToggleBtn) vpadToggleBtn.classList.toggle('vpad-on', show);
}

if (vpadToggleBtn) {
  vpadToggleBtn.addEventListener('click', () => showVpad(!vpadVisible));
}

// Dispatch keyboard events into the preview iframe
function dispatchKeyToIframe(key, code, type) {
  const iframe = $('preview-iframe');
  if (!iframe) return;
  try {
    const win = iframe.contentWindow;
    if (!win) return;
    const evt = new KeyboardEvent(type, {
      key, code,
      bubbles: true,
      cancelable: true,
      keyCode: key === 'ArrowUp' ? 38 : key === 'ArrowDown' ? 40 : key === 'ArrowLeft' ? 37 : key === 'ArrowRight' ? 39 : key === ' ' ? 32 : key === 'Enter' ? 13 : key === 'Escape' ? 27 : 0,
      which:   key === 'ArrowUp' ? 38 : key === 'ArrowDown' ? 40 : key === 'ArrowLeft' ? 37 : key === 'ArrowRight' ? 39 : key === ' ' ? 32 : key === 'Enter' ? 13 : key === 'Escape' ? 27 : 0,
    });
    // Try dispatching to the focused element first, then document
    const target = win.document.activeElement || win.document.body || win.document;
    target.dispatchEvent(evt);
    if (target !== win.document) win.document.dispatchEvent(evt);
  } catch (e) {
    // Cross-origin — silently fail
  }
}

// Wire up virtual pad buttons with press/release for proper keydown+keyup
if (virtualPad) {
  virtualPad.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.vpad-btn');
    if (!btn) return;
    e.preventDefault();
    const key  = btn.dataset.key;
    const code = btn.dataset.code;
    if (!key) return;
    btn.classList.add('vpad-pressed');
    dispatchKeyToIframe(key, code, 'keydown');

    // Auto-repeat while held
    let repeatTimer = setInterval(() => dispatchKeyToIframe(key, code, 'keydown'), 80);

    const release = () => {
      btn.classList.remove('vpad-pressed');
      clearInterval(repeatTimer);
      dispatchKeyToIframe(key, code, 'keyup');
      window.removeEventListener('pointerup',     release);
      window.removeEventListener('pointercancel', release);
    };
    window.addEventListener('pointerup',     release, { once: true });
    window.addEventListener('pointercancel', release, { once: true });
  });
}

// Show vpad toggle button whenever there's an active preview
const _vpadPreviewObserver = new MutationObserver(() => {
  const sf = $('state-frame');
  if (!sf) return;
  const hasPreview = !sf.classList.contains('hidden');
  if (vpadToggleBtn) vpadToggleBtn.classList.toggle('hidden', !hasPreview);
  if (!hasPreview) showVpad(false);
});
if (stateFrame) _vpadPreviewObserver.observe(stateFrame, { attributes: true, attributeFilter: ['class'] });
