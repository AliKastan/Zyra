/* Zyra — projects.js — Dashboard for all user projects */

// ── Auth-aware API fetch ───────────────────────────────────────────────────────
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
  if (res.status === 401) { window.location.replace('/login'); throw new Error('Session expired'); }
  const data = await res.json();
  if (!res.ok) { const e = new Error(data.error || `HTTP ${res.status}`); e.httpStatus = res.status; throw e; }
  return data;
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── State ─────────────────────────────────────────────────────────────────────
let _allProjects   = [];
let _activeFilter  = 'all';
let _pendingDelete = null; // slug

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a human-readable name for a project. */
function getDisplayName(p) {
  if (p.displayName) return p.displayName;
  // Humanize slug: "my-cool-game" → "My Cool Game"
  return (p.slug || '')
    .split('-')
    .map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : '')
    .join(' ') || 'Untitled';
}

/** Deterministic gradient from slug string. */
function getThumbStyle(slug, gameType) {
  let hash = 0;
  for (let i = 0; i < (slug || '').length; i++) {
    hash = Math.imul(31, hash) + (slug || '').charCodeAt(i) | 0;
  }
  const palettes = [
    ['#0f1729', '#1a2744'],   // midnight blue
    ['#0f1f14', '#1a3520'],   // deep forest
    ['#1a0f20', '#2e1545'],   // violet dusk
    ['#1f0f0f', '#3a1818'],   // ember
    ['#0f1f1a', '#153830'],   // teal deep
    ['#1a1500', '#332900'],   // amber dark
    ['#0f0f1a', '#1a1a30'],   // space indigo
    ['#1a0f15', '#30152a'],   // rose dusk
  ];
  const idx = Math.abs(hash) % palettes.length;
  const [c1, c2] = palettes[idx];
  return `background: linear-gradient(145deg, ${c1}, ${c2});`;
}

/** Relative time: "2h ago", "3 days ago", etc. */
function relTime(dateStr) {
  if (!dateStr) return '';
  const ms  = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60)   return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60)   return `${min}m ago`;
  const hr  = Math.floor(min / 60);
  if (hr  < 24)   return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7)    return `${day}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderGrid() {
  const grid    = document.getElementById('projects-grid');
  const loading = document.getElementById('projects-loading');
  const empty   = document.getElementById('projects-empty');
  const count   = document.getElementById('projects-count');
  if (!grid) return;

  const filtered = _activeFilter === 'all'
    ? _allProjects
    : _allProjects.filter(p => (p.gameType || '2d') === _activeFilter);

  loading.style.display = 'none';

  if (filtered.length === 0) {
    grid.style.display  = 'none';
    empty.classList.add('projects-empty--visible');
    count.textContent   = '';
    return;
  }

  empty.classList.remove('projects-empty--visible');
  grid.style.display    = 'grid';
  count.textContent     = `${filtered.length} project${filtered.length !== 1 ? 's' : ''}`;

  grid.innerHTML = filtered.map(p => buildCard(p)).join('');

  // Wire card clicks
  grid.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-action-btn')) return; // handled separately
      if (e.target.closest('.card-name-input')) return;
      const slug = card.dataset.slug;
      if (slug) openProject(slug);
    });
  });

  // Wire delete buttons
  grid.querySelectorAll('.card-action-btn--danger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      _pendingDelete = btn.closest('.project-card')?.dataset.slug || null;
      if (_pendingDelete) showDeleteOverlay();
    });
  });

  // Wire rename buttons
  grid.querySelectorAll('.card-action-btn--rename').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.project-card');
      if (card) startRename(card);
    });
  });
}

function buildCard(p) {
  const name     = escHtml(getDisplayName(p));
  const slug     = escHtml(p.slug || '');
  const gameType = p.gameType || '2d';
  const status   = p.status || 'ready';
  const timeStr  = escHtml(relTime(p.updatedAt || p.createdAt));
  const typeBadgeClass = gameType === '3d' ? 'card-type-badge--3d' : 'card-type-badge--2d';
  const typeLabel      = gameType === '3d' ? '3D' : '2D';
  const thumbStyle     = getThumbStyle(p.slug, gameType);
  const initial        = (p.slug || 'G').charAt(0).toUpperCase();

  let statusDotClass = 'card-status-dot--ready';
  if (status === 'error')      statusDotClass = 'card-status-dot--error';
  else if (status === 'draft') statusDotClass = 'card-status-dot--draft';
  else if (status === 'generating') statusDotClass = 'card-status-dot--generating';

  return `
<div class="project-card" data-slug="${slug}">
  <div class="card-thumb" style="${thumbStyle}">
    <div class="card-thumb-grid"></div>
    <span class="card-thumb-initial">${escHtml(initial)}</span>
    <span class="card-type-badge ${typeBadgeClass}">${typeLabel}</span>
    <span class="card-status-dot ${statusDotClass}" title="${escHtml(status)}"></span>
  </div>
  <div class="card-actions">
    <button class="card-action-btn card-action-btn--rename" title="Rename" type="button">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    </button>
    <button class="card-action-btn card-action-btn--danger" title="Delete" type="button">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
    </button>
  </div>
  <div class="card-info">
    <div class="card-name" id="card-name-${slug}">${name}</div>
    <div class="card-meta">
      <span class="card-time">${timeStr}</span>
    </div>
  </div>
</div>`;
}

// ── Project actions ───────────────────────────────────────────────────────────

function openProject(slug) {
  window.location.href = `/app?project=${encodeURIComponent(slug)}`;
}

function startRename(card) {
  const slug    = card.dataset.slug;
  const nameEl  = card.querySelector('.card-name');
  if (!nameEl || !slug) return;

  const current = nameEl.textContent.trim();
  const input   = document.createElement('input');
  input.className   = 'card-name-input';
  input.value       = current;
  input.maxLength   = 80;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  const commit = async () => {
    const newName = input.value.trim() || current;
    const nameNode = document.createElement('div');
    nameNode.className = 'card-name';
    nameNode.id        = `card-name-${slug}`;
    nameNode.textContent = newName;
    input.replaceWith(nameNode);
    if (newName !== current) {
      // Update locally
      const p = _allProjects.find(x => x.slug === slug);
      if (p) p.displayName = newName;
      // Persist
      apiFetch(`/api/projects/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        body: JSON.stringify({ displayName: newName }),
      }).catch(() => {});
    }
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = current; input.blur(); }
  });
}

// ── Delete flow ───────────────────────────────────────────────────────────────

function showDeleteOverlay() {
  const overlay = document.getElementById('delete-overlay');
  if (overlay) overlay.classList.add('projects-delete-overlay--visible');
}

function hideDeleteOverlay() {
  const overlay = document.getElementById('delete-overlay');
  if (overlay) overlay.classList.remove('projects-delete-overlay--visible');
  _pendingDelete = null;
}

async function executeDelete() {
  const slug = _pendingDelete;
  hideDeleteOverlay();
  if (!slug) return;

  try {
    await apiFetch(`/api/projects/${encodeURIComponent(slug)}`, { method: 'DELETE' });
    _allProjects = _allProjects.filter(p => p.slug !== slug);
    renderGrid();
  } catch (e) {
    console.error('Delete failed:', e.message);
  }
}

// ── Filter ────────────────────────────────────────────────────────────────────

document.getElementById('filter-bar')?.addEventListener('click', (e) => {
  const chip = e.target.closest('.filter-chip');
  if (!chip) return;
  _activeFilter = chip.dataset.filter || 'all';
  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('filter-chip--active', c === chip);
  });
  renderGrid();
});

// ── New project ───────────────────────────────────────────────────────────────

function goNewProject() {
  window.location.href = '/app?new=true';
}

document.getElementById('btn-new-project')?.addEventListener('click', goNewProject);
document.getElementById('btn-new-project-empty')?.addEventListener('click', goNewProject);

// ── Delete dialog buttons ─────────────────────────────────────────────────────

document.getElementById('delete-cancel')?.addEventListener('click', hideDeleteOverlay);
document.getElementById('delete-confirm')?.addEventListener('click', executeDelete);
document.getElementById('delete-overlay')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('delete-overlay')) hideDeleteOverlay();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideDeleteOverlay();
});

// ── Load projects ─────────────────────────────────────────────────────────────

async function loadProjects() {
  try {
    const data = await apiFetch('/api/projects');
    _allProjects = Array.isArray(data.projects) ? data.projects : [];
    // Sort by most recent activity
    _allProjects.sort((a, b) => {
      const at = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bt = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bt - at;
    });
    renderGrid();
  } catch (e) {
    const loading = document.getElementById('projects-loading');
    if (loading) loading.innerHTML = `<div style="color:var(--danger)">Failed to load projects: ${escHtml(e.message)}</div>`;
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────

loadProjects();
