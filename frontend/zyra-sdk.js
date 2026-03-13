/**
 * ZyraApp SDK  ·  v1.0
 *
 * Client-side SDK loaded by generated apps.
 * Provides zero-config auth + data persistence backed by Zyra's managed backend.
 *
 * Usage:
 *   const app = new ZyraApp('__ZYRA_PROJECT_ID__');
 *   await app.init();
 *   app.onAuth(user => { /* user is null or { id, email } *\/ });
 *
 *   await app.signUp(email, password)        // → { user, error }
 *   await app.signIn(email, password)        // → { user, error }
 *   await app.signOut()
 *   app.currentUser                          // null | { id, email }
 *
 *   // CRUD — all return { data, error }
 *   await app.from('todos').getAll()
 *   await app.from('todos').getAll({ completed: 'false' })  // string filter values
 *   await app.from('todos').create({ title: 'Buy groceries', completed: false })
 *   await app.from('todos').update(id, { completed: true })
 *   await app.from('todos').delete(id)
 */

(function (global) {
  'use strict';

  const BASE = '/api/backend';
  const STORAGE_PREFIX = '_zyra_';

  // ── Internal helpers ────────────────────────────────────────────────────────

  function storageKey(projectId) {
    return STORAGE_PREFIX + projectId;
  }

  function loadSession(projectId) {
    try {
      const raw = localStorage.getItem(storageKey(projectId));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function saveSession(projectId, session) {
    try { localStorage.setItem(storageKey(projectId), JSON.stringify(session)); } catch {}
  }

  function clearSession(projectId) {
    try { localStorage.removeItem(storageKey(projectId)); } catch {}
  }

  async function apiRequest(method, path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    try {
      const res = await fetch(BASE + path, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({ data: null, error: 'Invalid server response' }));
      return json; // always { data, error }
    } catch (e) {
      return { data: null, error: e.message || 'Network error' };
    }
  }

  // ── Collection query builder ────────────────────────────────────────────────

  class Collection {
    constructor(app, name) {
      this._app  = app;
      this._name = name;
    }

    /**
     * Get all rows, with optional filters.
     * Filter values must be strings: { completed: 'true' } or { status: 'active' }
     */
    async getAll(filters) {
      let path = `/data/${this._app._projectId}/${this._name}`;
      if (filters && Object.keys(filters).length > 0) {
        path += '?' + new URLSearchParams(
          Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, String(v)]))
        ).toString();
      }
      return apiRequest('GET', path, undefined, this._app._token);
    }

    /** Insert a new row. Returns { data: row, error }. */
    async create(payload) {
      return apiRequest('POST', `/data/${this._app._projectId}/${this._name}`, payload, this._app._token);
    }

    /** Update a row by ID (partial merge). Returns { data: row, error }. */
    async update(id, payload) {
      return apiRequest('PUT', `/data/${this._app._projectId}/${this._name}/${id}`, payload, this._app._token);
    }

    /** Delete a row by ID. Returns { data: { deleted: true }, error }. */
    async delete(id) {
      return apiRequest('DELETE', `/data/${this._app._projectId}/${this._name}/${id}`, undefined, this._app._token);
    }
  }

  // ── ZyraApp ─────────────────────────────────────────────────────────────────

  class ZyraApp {
    constructor(projectId) {
      if (!projectId || projectId === '__ZYRA_PROJECT_ID__') {
        console.warn('[ZyraApp] No project ID was injected. Backend calls will fail.');
      }
      this._projectId  = projectId;
      this._token      = null;
      this.currentUser = null;
      this._authCbs    = [];
    }

    /**
     * Must be called before any other method.
     * Provisions the project backend (idempotent) and restores any saved session.
     * Returns a promise that resolves when initialization is complete.
     */
    async init() {
      // Provision backend (idempotent — safe on every load)
      await apiRequest('POST', `/provision/${this._projectId}`);

      // Restore saved session
      const session = loadSession(this._projectId);
      if (session?.token && session?.user) {
        this._token      = session.token;
        this.currentUser = session.user;
        this._notifyAuth(session.user);
      } else {
        this._notifyAuth(null);
      }
    }

    /**
     * Register a callback that fires immediately with the current user
     * (null if not signed in), then on every auth state change.
     */
    onAuth(callback) {
      if (typeof callback !== 'function') return;
      this._authCbs.push(callback);
      // Fire immediately with current state
      try { callback(this.currentUser); } catch {}
    }

    /**
     * Create a new account.
     * @returns {{ user: object|null, error: string|null }}
     */
    async signUp(email, password) {
      const res = await apiRequest(
        'POST',
        `/auth/signup/${this._projectId}`,
        { email, password }
      );
      if (res.error) return { user: null, error: res.error };
      this._setSession(res.data);
      return { user: this.currentUser, error: null };
    }

    /**
     * Sign in with email + password.
     * @returns {{ user: object|null, error: string|null }}
     */
    async signIn(email, password) {
      const res = await apiRequest(
        'POST',
        `/auth/signin/${this._projectId}`,
        { email, password }
      );
      if (res.error) return { user: null, error: res.error };
      this._setSession(res.data);
      return { user: this.currentUser, error: null };
    }

    /** Sign out and clear the local session. */
    async signOut() {
      clearSession(this._projectId);
      this._token      = null;
      this.currentUser = null;
      this._notifyAuth(null);
      // Notify server (fire-and-forget; JWT is stateless so not strictly required)
      apiRequest('POST', `/auth/signout/${this._projectId}`).catch(() => {});
    }

    /**
     * Returns a Collection query builder for data operations.
     * @param {string} collectionName — e.g. 'todos', 'posts', 'messages'
     */
    from(collectionName) {
      return new Collection(this, collectionName);
    }

    // ── Private ────────────────────────────────────────────────────────────────

    _setSession(data) {
      this._token      = data.token;
      this.currentUser = data.user;
      saveSession(this._projectId, { token: data.token, user: data.user });
      this._notifyAuth(data.user);
    }

    _notifyAuth(user) {
      for (const cb of this._authCbs) {
        try { cb(user); } catch {}
      }
    }
  }

  // Expose globally
  global.ZyraApp = ZyraApp;

})(typeof window !== 'undefined' ? window : global);
