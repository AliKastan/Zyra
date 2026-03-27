/**
 * Zyra Game Engine v1.0
 * A complete, config-driven 2D game engine.
 * Claude API outputs JSON config; this engine does ALL the rendering/logic.
 * Supports: tap, dodge, shooter, runner, puzzle, platformer, snake, breakout, catcher, physics
 */
(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════
  // UTILITY HELPERS
  // ═══════════════════════════════════════════════════════════════════

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
  function randInt(lo, hi) { return Math.floor(rand(lo, hi + 1)); }
  function dist(x1, y1, x2, y2) { var dx = x1 - x2, dy = y1 - y2; return Math.sqrt(dx * dx + dy * dy); }
  function hexToRgb(hex) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return { r: r, g: g, b: b };
  }
  function rgba(hex, a) { var c = hexToRgb(hex); return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')'; }
  function lighten(hex, amt) {
    var c = hexToRgb(hex);
    c.r = Math.min(255, c.r + amt); c.g = Math.min(255, c.g + amt); c.b = Math.min(255, c.b + amt);
    return 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
  }

  // ═══════════════════════════════════════════════════════════════════
  // ZYRA PRO AUDIO ENGINE
  // ═══════════════════════════════════════════════════════════════════

  var ZyraAudio = {
    ctx: null,
    masterGain: null,
    enabled: true,
    initialized: false,

    init: function () {
      if (this.initialized) return;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.ctx.destination);
        this.initialized = true;
      } catch (e) { this.enabled = false; }
    },

    resume: function () {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    toggle: function () {
      this.enabled = !this.enabled;
      if (this.masterGain) this.masterGain.gain.value = this.enabled ? 0.5 : 0;
      return this.enabled;
    },

    // Core: play multiple oscillator layers
    play: function (layers) {
      if (!this.ctx || !this.enabled) return;
      this.resume();
      var now = this.ctx.currentTime;
      var self = this;
      layers.forEach(function (L) {
        try {
          var osc = self.ctx.createOscillator();
          var gain = self.ctx.createGain();
          var t = now + (L.delay || 0);
          var dur = L.duration || 0.2;
          var vol = L.volume || 0.3;
          var attack = L.attack || 0.01;
          var decay = L.decay || dur;
          osc.type = L.type || 'sine';
          osc.frequency.setValueAtTime(L.freq || 440, t);
          if (L.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, L.slide), t + dur);
          if (L.detune) osc.detune.setValueAtTime(L.detune, t);
          gain.gain.setValueAtTime(0.001, t);
          gain.gain.linearRampToValueAtTime(vol, t + attack);
          gain.gain.exponentialRampToValueAtTime(0.001, t + decay);
          if (L.filter) {
            var flt = self.ctx.createBiquadFilter();
            flt.type = L.filter.type || 'lowpass';
            flt.frequency.setValueAtTime(L.filter.freq || 2000, t);
            flt.Q.setValueAtTime(L.filter.Q || 1, t);
            if (L.filter.sweep) flt.frequency.exponentialRampToValueAtTime(L.filter.sweep, t + dur);
            osc.connect(flt); flt.connect(gain);
          } else {
            osc.connect(gain);
          }
          if (L.pan && self.ctx.createStereoPanner) {
            var pan = self.ctx.createStereoPanner();
            pan.pan.value = L.pan;
            gain.connect(pan); pan.connect(self.masterGain);
          } else {
            gain.connect(self.masterGain);
          }
          osc.start(t); osc.stop(t + dur + 0.05);
        } catch (e) {}
      });
    },

    // Noise generator for explosions, impacts, whooshes
    noise: function (duration, volume, filterFreq, filterType, decay) {
      if (!this.ctx || !this.enabled) return;
      this.resume();
      try {
        var now = this.ctx.currentTime;
        var dur = duration || 0.3;
        var bufSz = this.ctx.sampleRate * dur;
        var buf = this.ctx.createBuffer(1, bufSz, this.ctx.sampleRate);
        var data = buf.getChannelData(0);
        for (var i = 0; i < bufSz; i++) data[i] = Math.random() * 2 - 1;
        var src = this.ctx.createBufferSource();
        src.buffer = buf;
        var gain = this.ctx.createGain();
        gain.gain.setValueAtTime(volume || 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (decay || dur));
        var flt = this.ctx.createBiquadFilter();
        flt.type = filterType || 'lowpass';
        flt.frequency.setValueAtTime(filterFreq || 3000, now);
        src.connect(flt); flt.connect(gain); gain.connect(this.masterGain);
        src.start(now); src.stop(now + dur);
      } catch (e) {}
    },

    // ─── PRE-BUILT SOUND EFFECTS ───

    sfxTap: function () {
      this.play([
        { type: 'sine', freq: 1200, duration: 0.06, volume: 0.12, decay: 0.06 },
        { type: 'sine', freq: 1800, duration: 0.04, volume: 0.06, delay: 0.02, decay: 0.04 }
      ]);
    },
    sfxClick: function () {
      this.play([
        { type: 'sine', freq: 800, duration: 0.08, volume: 0.15, decay: 0.08 },
        { type: 'triangle', freq: 1600, duration: 0.05, volume: 0.08, delay: 0.01, decay: 0.05 }
      ]);
    },
    sfxCoin: function () {
      this.play([
        { type: 'sine', freq: 987, duration: 0.08, volume: 0.2, decay: 0.1 },
        { type: 'sine', freq: 1318, duration: 0.12, volume: 0.2, delay: 0.06, decay: 0.15 },
        { type: 'sine', freq: 1568, duration: 0.06, volume: 0.1, delay: 0.12, decay: 0.1 }
      ]);
    },
    sfxScore: function () {
      this.play([
        { type: 'sine', freq: 660, duration: 0.1, volume: 0.2, decay: 0.12 },
        { type: 'sine', freq: 880, duration: 0.12, volume: 0.2, delay: 0.08, decay: 0.15 },
        { type: 'triangle', freq: 1320, duration: 0.06, volume: 0.08, delay: 0.08, decay: 0.08 }
      ]);
    },
    sfxBigScore: function () {
      this.play([
        { type: 'sine', freq: 523, duration: 0.1, volume: 0.2, decay: 0.12 },
        { type: 'sine', freq: 659, duration: 0.1, volume: 0.2, delay: 0.08, decay: 0.12 },
        { type: 'sine', freq: 784, duration: 0.1, volume: 0.2, delay: 0.16, decay: 0.12 },
        { type: 'sine', freq: 1047, duration: 0.2, volume: 0.25, delay: 0.24, decay: 0.25 },
        { type: 'triangle', freq: 1568, duration: 0.08, volume: 0.08, delay: 0.24, decay: 0.1 }
      ]);
    },
    sfxCombo: function (count) {
      var f = 400 + Math.min(count || 0, 10) * 60;
      this.play([
        { type: 'sine', freq: f, duration: 0.08, volume: 0.2, slide: f * 1.5, decay: 0.1 },
        { type: 'triangle', freq: f * 1.5, duration: 0.06, volume: 0.1, delay: 0.04, decay: 0.08 }
      ]);
    },
    sfxHit: function () {
      this.play([
        { type: 'square', freq: 160, duration: 0.15, volume: 0.25, decay: 0.15, filter: { type: 'lowpass', freq: 800 } },
        { type: 'sawtooth', freq: 80, duration: 0.1, volume: 0.15, delay: 0.02, decay: 0.1 }
      ]);
      this.noise(0.08, 0.15, 1500, 'lowpass', 0.08);
    },
    sfxLoseLife: function () {
      this.play([
        { type: 'sine', freq: 500, duration: 0.15, volume: 0.25, slide: 200, decay: 0.2 },
        { type: 'sawtooth', freq: 250, duration: 0.2, volume: 0.15, delay: 0.1, slide: 100, decay: 0.25, filter: { type: 'lowpass', freq: 1000 } }
      ]);
    },
    sfxDestroy: function () {
      this.play([
        { type: 'square', freq: 300, duration: 0.1, volume: 0.2, slide: 100, decay: 0.12 },
        { type: 'sawtooth', freq: 200, duration: 0.15, volume: 0.15, delay: 0.03, slide: 50, decay: 0.15 }
      ]);
      this.noise(0.12, 0.2, 2000, 'lowpass', 0.12);
    },
    sfxExplosion: function () {
      this.play([
        { type: 'sawtooth', freq: 100, duration: 0.4, volume: 0.3, slide: 20, decay: 0.4, filter: { type: 'lowpass', freq: 600 } },
        { type: 'square', freq: 60, duration: 0.5, volume: 0.2, delay: 0.05, slide: 15, decay: 0.5 },
        { type: 'sine', freq: 40, duration: 0.3, volume: 0.15, delay: 0.1, decay: 0.3 }
      ]);
      this.noise(0.5, 0.35, 3000, 'lowpass', 0.5);
      this.noise(0.3, 0.15, 800, 'lowpass', 0.3);
    },
    sfxShoot: function () {
      this.play([
        { type: 'sine', freq: 1200, duration: 0.1, volume: 0.15, slide: 200, decay: 0.1 },
        { type: 'square', freq: 600, duration: 0.08, volume: 0.08, slide: 100, decay: 0.08, filter: { type: 'lowpass', freq: 4000, sweep: 500 } }
      ]);
    },
    sfxBounce: function () {
      this.play([
        { type: 'sine', freq: 400, duration: 0.08, volume: 0.2, slide: 600, decay: 0.1 },
        { type: 'triangle', freq: 800, duration: 0.04, volume: 0.08, delay: 0.01, decay: 0.05 }
      ]);
    },
    sfxPocket: function () {
      this.play([
        { type: 'sine', freq: 500, duration: 0.08, volume: 0.2, decay: 0.1 },
        { type: 'sine', freq: 700, duration: 0.1, volume: 0.2, delay: 0.06, decay: 0.12 },
        { type: 'sine', freq: 1000, duration: 0.15, volume: 0.15, delay: 0.14, decay: 0.18 }
      ]);
      this.noise(0.05, 0.08, 5000, 'highpass', 0.05);
    },
    sfxCueHit: function (power) {
      var vol = 0.15 + (power || 0.5) * 0.2;
      this.play([
        { type: 'triangle', freq: 800, duration: 0.04, volume: vol, decay: 0.05 },
        { type: 'sine', freq: 200, duration: 0.06, volume: vol * 0.5, delay: 0.01, decay: 0.06 }
      ]);
      this.noise(0.03, vol * 0.3, 6000, 'highpass', 0.03);
    },
    sfxJump: function () {
      this.play([
        { type: 'sine', freq: 300, duration: 0.15, volume: 0.2, slide: 800, decay: 0.15 },
        { type: 'triangle', freq: 150, duration: 0.08, volume: 0.1, slide: 400, decay: 0.08 }
      ]);
    },
    sfxLand: function () {
      this.play([
        { type: 'sine', freq: 250, duration: 0.08, volume: 0.15, slide: 120, decay: 0.08 },
        { type: 'square', freq: 80, duration: 0.05, volume: 0.1, decay: 0.05, filter: { type: 'lowpass', freq: 500 } }
      ]);
      this.noise(0.04, 0.1, 2000, 'lowpass', 0.04);
    },
    sfxSwipe: function () {
      this.noise(0.15, 0.12, 8000, 'bandpass', 0.15);
      this.play([
        { type: 'sine', freq: 300, duration: 0.12, volume: 0.06, slide: 1200, decay: 0.12, filter: { type: 'highpass', freq: 500 } }
      ]);
    },
    sfxPowerUp: function () {
      this.play([
        { type: 'sine', freq: 400, duration: 0.06, volume: 0.15, decay: 0.08 },
        { type: 'sine', freq: 600, duration: 0.06, volume: 0.15, delay: 0.05, decay: 0.08 },
        { type: 'sine', freq: 900, duration: 0.06, volume: 0.15, delay: 0.1, decay: 0.08 },
        { type: 'sine', freq: 1200, duration: 0.1, volume: 0.2, delay: 0.15, decay: 0.15 },
        { type: 'triangle', freq: 1800, duration: 0.08, volume: 0.08, delay: 0.15, decay: 0.1 }
      ]);
    },
    sfxShield: function () {
      this.play([
        { type: 'sine', freq: 300, duration: 0.2, volume: 0.15, slide: 600, decay: 0.25, filter: { type: 'lowpass', freq: 2000, sweep: 4000 } },
        { type: 'triangle', freq: 600, duration: 0.15, volume: 0.1, delay: 0.05, decay: 0.2 }
      ]);
    },
    sfxMatch: function (chain) {
      var f = 523 + (chain || 0) * 100;
      this.play([
        { type: 'sine', freq: f, duration: 0.08, volume: 0.2, decay: 0.1 },
        { type: 'sine', freq: f * 1.25, duration: 0.08, volume: 0.18, delay: 0.04, decay: 0.1 },
        { type: 'sine', freq: f * 1.5, duration: 0.1, volume: 0.15, delay: 0.08, decay: 0.12 },
        { type: 'triangle', freq: f * 2, duration: 0.06, volume: 0.06, delay: 0.08, decay: 0.08 }
      ]);
    },
    sfxInvalid: function () {
      this.play([
        { type: 'square', freq: 200, duration: 0.08, volume: 0.15, decay: 0.08, filter: { type: 'lowpass', freq: 800 } },
        { type: 'square', freq: 180, duration: 0.08, volume: 0.15, delay: 0.1, decay: 0.08, filter: { type: 'lowpass', freq: 800 } }
      ]);
    },
    sfxTick: function () {
      this.play([
        { type: 'sine', freq: 1000, duration: 0.06, volume: 0.2, decay: 0.08 },
        { type: 'sine', freq: 2000, duration: 0.03, volume: 0.06, delay: 0.01, decay: 0.04 }
      ]);
    },
    sfxGo: function () {
      this.play([
        { type: 'sine', freq: 523, duration: 0.08, volume: 0.2, decay: 0.1 },
        { type: 'sine', freq: 784, duration: 0.08, volume: 0.2, delay: 0.06, decay: 0.1 },
        { type: 'sine', freq: 1047, duration: 0.15, volume: 0.25, delay: 0.12, decay: 0.2 },
        { type: 'triangle', freq: 1568, duration: 0.1, volume: 0.1, delay: 0.12, decay: 0.12 }
      ]);
    },
    sfxGameOver: function () {
      this.play([
        { type: 'sine', freq: 440, duration: 0.25, volume: 0.2, decay: 0.3 },
        { type: 'sine', freq: 370, duration: 0.25, volume: 0.2, delay: 0.25, decay: 0.3 },
        { type: 'sine', freq: 311, duration: 0.25, volume: 0.2, delay: 0.5, decay: 0.3 },
        { type: 'sine', freq: 261, duration: 0.5, volume: 0.2, delay: 0.75, decay: 0.6 },
        { type: 'triangle', freq: 130, duration: 0.3, volume: 0.1, delay: 0.75, decay: 0.4 }
      ]);
    },
    sfxLevelComplete: function () {
      this.play([
        { type: 'sine', freq: 523, duration: 0.12, volume: 0.2, decay: 0.15 },
        { type: 'sine', freq: 659, duration: 0.12, volume: 0.2, delay: 0.1, decay: 0.15 },
        { type: 'sine', freq: 784, duration: 0.12, volume: 0.2, delay: 0.2, decay: 0.15 },
        { type: 'sine', freq: 1047, duration: 0.25, volume: 0.3, delay: 0.3, decay: 0.35 },
        { type: 'triangle', freq: 1568, duration: 0.15, volume: 0.1, delay: 0.3, decay: 0.2 },
        { type: 'sine', freq: 523, duration: 0.15, volume: 0.08, delay: 0.3, decay: 0.2, detune: 5 }
      ]);
    },
    sfxVictory: function () {
      this.play([
        { type: 'sine', freq: 523, duration: 0.1, volume: 0.2, decay: 0.12 },
        { type: 'sine', freq: 659, duration: 0.1, volume: 0.2, delay: 0.1, decay: 0.12 },
        { type: 'sine', freq: 784, duration: 0.1, volume: 0.2, delay: 0.2, decay: 0.12 },
        { type: 'sine', freq: 1047, duration: 0.15, volume: 0.25, delay: 0.3, decay: 0.2 },
        { type: 'sine', freq: 1047, duration: 0.4, volume: 0.2, delay: 0.5, decay: 0.5 },
        { type: 'sine', freq: 1318, duration: 0.4, volume: 0.15, delay: 0.5, decay: 0.5 },
        { type: 'sine', freq: 1568, duration: 0.5, volume: 0.2, delay: 0.5, decay: 0.6 },
        { type: 'triangle', freq: 2093, duration: 0.3, volume: 0.06, delay: 0.6, decay: 0.4 },
        { type: 'triangle', freq: 2637, duration: 0.2, volume: 0.04, delay: 0.7, decay: 0.3 }
      ]);
    },
    sfxBossAppear: function () {
      this.play([
        { type: 'sawtooth', freq: 80, duration: 0.8, volume: 0.2, slide: 40, decay: 0.8, filter: { type: 'lowpass', freq: 400, sweep: 200 } },
        { type: 'square', freq: 60, duration: 1.0, volume: 0.1, delay: 0.2, decay: 1.0, filter: { type: 'lowpass', freq: 300 } },
        { type: 'sine', freq: 200, duration: 0.6, volume: 0.1, delay: 0.4, slide: 100, decay: 0.6 }
      ]);
      this.noise(0.8, 0.1, 400, 'lowpass', 0.8);
    },
    sfxBossHit: function () {
      this.play([
        { type: 'square', freq: 200, duration: 0.12, volume: 0.25, slide: 80, decay: 0.15, filter: { type: 'lowpass', freq: 1000 } },
        { type: 'sawtooth', freq: 100, duration: 0.1, volume: 0.15, delay: 0.03, decay: 0.12 }
      ]);
      this.noise(0.1, 0.2, 2000, 'lowpass', 0.1);
    },
    sfxBossDefeat: function () {
      for (var i = 0; i < 6; i++) {
        var d = i * 0.15;
        this.play([
          { type: 'sawtooth', freq: 120 - i * 10, duration: 0.2, volume: 0.2, slide: 30, decay: 0.25, delay: d, filter: { type: 'lowpass', freq: 800 } },
          { type: 'square', freq: 80 - i * 5, duration: 0.15, volume: 0.1, delay: d + 0.05, decay: 0.15 }
        ]);
      }
      setTimeout(function () { ZyraAudio.sfxExplosion(); ZyraAudio.sfxVictory(); }, 900);
    },
    sfxTimerWarning: function () {
      this.play([
        { type: 'sine', freq: 880, duration: 0.06, volume: 0.15, decay: 0.08 },
        { type: 'sine', freq: 880, duration: 0.06, volume: 0.12, delay: 0.1, decay: 0.08 }
      ]);
    },
    sfxEat: function () {
      this.play([
        { type: 'sine', freq: 500, duration: 0.06, volume: 0.2, slide: 1000, decay: 0.08 },
        { type: 'triangle', freq: 1000, duration: 0.04, volume: 0.08, delay: 0.03, decay: 0.05 }
      ]);
    },
    sfxBrickBreak: function () {
      this.play([
        { type: 'square', freq: 300, duration: 0.06, volume: 0.2, slide: 150, decay: 0.08, filter: { type: 'lowpass', freq: 2000 } },
        { type: 'triangle', freq: 600, duration: 0.04, volume: 0.1, delay: 0.02, decay: 0.05 }
      ]);
      this.noise(0.04, 0.12, 4000, 'highpass', 0.04);
    },
    sfxPaddleHit: function () {
      this.play([
        { type: 'triangle', freq: 500, duration: 0.06, volume: 0.2, slide: 800, decay: 0.08 },
        { type: 'sine', freq: 200, duration: 0.04, volume: 0.1, decay: 0.04 }
      ]);
    },
    sfxNewHighScore: function () {
      var notes = [523, 659, 784, 1047, 784, 1047, 1318];
      for (var i = 0; i < notes.length; i++) {
        this.play([
          { type: 'sine', freq: notes[i], duration: 0.1, volume: 0.2, delay: i * 0.08, decay: 0.12 },
          { type: 'triangle', freq: notes[i] * 2, duration: 0.06, volume: 0.06, delay: i * 0.08, decay: 0.08 }
        ]);
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // ENGINE
  // ═══════════════════════════════════════════════════════════════════

  var ZyraEngine = {
    config: null,
    state: 'menu',
    canvas: null,
    ctx: null,
    score: 0,
    highScore: 0,
    level: 1,
    levelScore: 0,
    lives: 3,
    gameTime: 0,
    levelTime: 0,
    entities: [],
    particles: [],
    projectiles: [],
    enemyProjectiles: [],
    powerUps: [],
    activePowerUps: {},
    timers: {},
    touchActive: false,
    touchX: 0,
    touchY: 0,
    touchStartX: 0,
    touchStartY: 0,
    touchDX: 0,
    touchDY: 0,
    swipeDir: null,
    lastTimestamp: 0,
    animFrameId: null,
    comboCount: 0,
    comboTimer: 0,
    boss: null,
    bossPhase: 0,
    bossPatternTimer: 0,
    player: null,
    grid: null,
    gridCols: 0,
    gridRows: 0,
    selectedCell: null,
    animatingGrid: false,
    snake: null,
    snakeDir: null,
    snakeNextDir: null,
    snakeFood: null,
    snakeMoveTimer: 0,
    ball: null,
    paddle: null,
    bricks: [],
    runnerOffset: 0,
    runnerSpeed: 0,
    obstacles: [],
    platforms: [],
    coins: [],
    cameraY: 0,
    screenFlash: 0,
    screenShake: 0,
    destroyCount: 0,
    collectCount: 0,
    spawnTimer: 0,
    WIDTH: 0,
    HEIGHT: 0,
    dpr: 1,
    screens: {},

    // ─── INITIALIZATION ──────────────────────────────────────────────
    init: function (config) {
      var self = this;
      this.config = config;
      this.highScore = parseInt(localStorage.getItem('zyra_hs_' + config.id) || '0');
      this.dpr = Math.min(window.devicePixelRatio || 1, 3);

      // Measure dimensions — if iframe hasn't laid out yet, defer until it has
      this.WIDTH = Math.min(window.innerWidth || 360, 430);
      this.HEIGHT = window.innerHeight || 640;

      // Guard: if dimensions are too small (iframe not ready), wait and retry
      if (this.WIDTH < 50 || this.HEIGHT < 50) {
        var retries = 0;
        var waitForSize = setInterval(function () {
          retries++;
          self.WIDTH = Math.min(window.innerWidth || 360, 430);
          self.HEIGHT = window.innerHeight || 640;
          if (self.WIDTH >= 50 && self.HEIGHT >= 50) {
            clearInterval(waitForSize);
            self._finishInit();
          } else if (retries > 50) { // 2.5s max wait
            clearInterval(waitForSize);
            self.WIDTH = 360; self.HEIGHT = 640; // safe fallback
            self._finishInit();
          }
        }, 50);
        return;
      }
      this._finishInit();
    },

    _finishInit: function () {
      var self = this;
      this.createDOM();
      this.setupCanvas();
      this.setupInput();
      this.setupButtons();
      this.showScreen('menu');

      // Handle iframe/window resize — re-measure and re-setup canvas
      window.addEventListener('resize', function () {
        var newW = Math.min(window.innerWidth || 360, 430);
        var newH = window.innerHeight || 640;
        if (newW !== self.WIDTH || newH !== self.HEIGHT) {
          self.WIDTH = newW;
          self.HEIGHT = newH;
          if (self.wrap) self.wrap.style.width = newW + 'px';
          if (self.wrap) self.wrap.style.height = newH + 'px';
          self.setupCanvas();
        }
      });
    },

    // ─── DOM CREATION ────────────────────────────────────────────────
    createDOM: function () {
      var c = this.config;
      var self = this;
      document.body.innerHTML = '';
      document.body.style.cssText = 'margin:0;padding:0;overflow:hidden;background:' + c.theme.background +
        ';font-family:-apple-system,system-ui,sans-serif;user-select:none;-webkit-user-select:none;' +
        'touch-action:none;width:100%;height:100%;display:flex;justify-content:center;';

      var wrap = this.el('div', {
        style: 'position:relative;width:' + this.WIDTH + 'px;height:' + this.HEIGHT + 'px;overflow:hidden;'
      });
      document.body.appendChild(wrap);
      this.wrap = wrap;

      // ── MENU SCREEN ──
      this.screens.menu = this.el('div', {
        style: 'position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;' +
          'align-items:center;justify-content:center;background:linear-gradient(180deg,' +
          c.theme.background + ',' + (c.theme.backgroundAlt || c.theme.background) + ');z-index:10;'
      });
      this.soundBtn = this.el('button', {
        id: 'btn-sound', textContent: '\uD83D\uDD0A',
        style: 'position:absolute;top:12px;right:12px;width:44px;height:44px;border-radius:50%;' +
          'background:rgba(255,255,255,0.08);border:none;font-size:18px;cursor:pointer;z-index:20;'
      }, this.screens.menu);
      this.el('div', {
        textContent: c.title || 'ZYRA GAME',
        style: 'font-size:32px;font-weight:900;color:' + c.theme.primary +
          ';text-shadow:0 0 30px ' + rgba(c.theme.primary, 0.25) + ';margin-bottom:8px;text-align:center;padding:0 20px;'
      }, this.screens.menu);
      this.el('div', {
        textContent: c.subtitle || '',
        style: 'font-size:14px;color:rgba(255,255,255,0.4);margin-bottom:40px;'
      }, this.screens.menu);
      this.el('button', {
        id: 'btn-play', textContent: '\u25B6  PLAY',
        style: 'padding:16px 48px;border:none;border-radius:16px;font-size:20px;font-weight:800;cursor:pointer;' +
          'background:linear-gradient(135deg,' + c.theme.primary + ',' + c.theme.secondary + ');color:white;' +
          'box-shadow:0 4px 20px ' + rgba(c.theme.primary, 0.25) + ';min-height:44px;'
      }, this.screens.menu);
      this.el('button', {
        id: 'btn-howtoplay', textContent: 'HOW TO PLAY',
        style: 'padding:12px 32px;border:1px solid rgba(255,255,255,0.15);border-radius:12px;font-size:14px;' +
          'font-weight:600;cursor:pointer;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.7);' +
          'margin-top:14px;min-height:44px;'
      }, this.screens.menu);
      this.highScoreEl = this.el('div', {
        textContent: this.highScore > 0 ? 'BEST: ' + this.highScore : '',
        style: 'margin-top:28px;font-size:12px;color:rgba(255,255,255,0.25);letter-spacing:1px;'
      }, this.screens.menu);
      wrap.appendChild(this.screens.menu);

      // ── GAME SCREEN ──
      this.screens.game = this.el('div', {
        style: 'position:absolute;top:0;left:0;width:100%;height:100%;display:none;'
      });
      this.canvas = document.createElement('canvas');
      this.canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
      this.screens.game.appendChild(this.canvas);
      this.scoreEl = this.el('div', {
        style: 'position:absolute;top:14px;left:0;right:0;text-align:center;font-size:28px;font-weight:900;' +
          'color:white;text-shadow:0 2px 8px rgba(0,0,0,0.4);z-index:10;pointer-events:none;'
      }, this.screens.game);
      this.levelBar = this.el('div', {
        style: 'position:absolute;top:48px;left:0;right:0;text-align:center;font-size:11px;' +
          'color:rgba(255,255,255,0.5);z-index:10;pointer-events:none;letter-spacing:1px;'
      }, this.screens.game);
      this.progressBarC = this.el('div', {
        style: 'position:absolute;top:66px;left:20px;right:20px;height:3px;background:rgba(255,255,255,0.08);' +
          'border-radius:2px;overflow:hidden;z-index:10;'
      }, this.screens.game);
      this.progressBar = this.el('div', {
        style: 'height:100%;width:0%;background:linear-gradient(90deg,' + c.theme.primary + ',' +
          c.theme.secondary + ');border-radius:2px;transition:width 0.3s;'
      }, this.progressBarC);
      this.comboEl = this.el('div', {
        style: 'position:absolute;top:76px;left:0;right:0;text-align:center;font-size:16px;font-weight:900;' +
          'color:#FF6B6B;z-index:10;pointer-events:none;opacity:0;'
      }, this.screens.game);
      this.livesEl = this.el('div', {
        style: 'position:absolute;top:14px;left:14px;font-size:16px;z-index:10;pointer-events:none;'
      }, this.screens.game);
      this.timerEl = this.el('div', {
        style: 'position:absolute;top:14px;right:56px;font-size:14px;font-weight:800;color:white;z-index:10;' +
          'display:none;pointer-events:none;'
      }, this.screens.game);
      this.el('button', {
        id: 'btn-pause', textContent: '\u23F8',
        style: 'position:absolute;top:10px;right:10px;width:44px;height:44px;border-radius:50%;' +
          'background:rgba(0,0,0,0.3);border:none;color:white;font-size:18px;cursor:pointer;z-index:15;'
      }, this.screens.game);
      wrap.appendChild(this.screens.game);

      // Overlay screens
      this.screens.pause = this.overlay('pause', [
        { text: 'PAUSED', type: 'title' },
        { text: '\u25B6  RESUME', id: 'btn-resume', type: 'primary' },
        { text: '\u21BA  RESTART', id: 'btn-restart', type: 'secondary' },
        { text: '\u2715  QUIT', id: 'btn-menu', type: 'secondary' }
      ]);
      this.screens.gameover = this.overlay('gameover', [
        { text: 'GAME OVER', type: 'title', id: 'gameover-title' },
        { text: '', type: 'custom', id: 'gameover-content' },
        { text: '\u21BA  PLAY AGAIN', id: 'btn-retry', type: 'primary' },
        { text: 'MENU', id: 'btn-gomenu', type: 'secondary' }
      ]);
      this.screens.levelComplete = this.overlay('levelcomplete', [
        { text: 'LEVEL COMPLETE!', type: 'title', extra: 'color:#FFD700;text-shadow:0 0 20px rgba(255,215,0,0.3);' },
        { text: '', type: 'custom', id: 'levelcomplete-content' },
        { text: 'NEXT LEVEL \u2192', id: 'btn-nextlevel', type: 'primary' }
      ]);
      this.screens.tutorial = this.overlay('tutorial', [
        { text: 'HOW TO PLAY', type: 'title' },
        { text: c.tutorial || 'Tap to play!', type: 'body', id: 'tutorial-text', isHTML: true },
        { text: 'GOT IT!', id: 'btn-tutorial-ok', type: 'primary' }
      ]);
      this.screens.victory = this.overlay('victory', [
        { text: 'YOU WIN!', type: 'title', extra: 'color:#FFD700;font-size:32px;' },
        { text: '', type: 'custom', id: 'victory-content' },
        { text: '\u21BA  PLAY AGAIN', id: 'btn-victory-retry', type: 'primary' },
        { text: 'MENU', id: 'btn-victory-menu', type: 'secondary' }
      ]);
      this.screens.levelTransition = this.overlay('leveltransition', [
        { text: '', type: 'custom', id: 'leveltransition-content' }
      ]);
    },

    el: function (tag, props, parent) {
      var e = document.createElement(tag);
      if (props) {
        Object.keys(props).forEach(function (k) {
          if (k === 'style') e.style.cssText = props[k];
          else if (k === 'textContent') e.textContent = props[k];
          else if (k === 'innerHTML') e.innerHTML = props[k];
          else e.setAttribute(k, props[k]);
        });
      }
      if (parent) parent.appendChild(e);
      return e;
    },

    overlay: function (name, items) {
      var c = this.config;
      var s = this.el('div', {
        style: 'position:absolute;top:0;left:0;width:100%;height:100%;display:none;flex-direction:column;' +
          'align-items:center;justify-content:center;background:rgba(0,0,0,0.8);' +
          'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:30;gap:12px;'
      });
      items.forEach(function (it) {
        var e;
        if (it.type === 'title') {
          e = document.createElement('div');
          e.textContent = it.text;
          e.style.cssText = 'font-size:28px;font-weight:900;color:white;margin-bottom:16px;' + (it.extra || '');
        } else if (it.type === 'body') {
          e = document.createElement('div');
          if (it.isHTML) e.innerHTML = it.text; else e.textContent = it.text;
          e.style.cssText = 'font-size:15px;color:rgba(255,255,255,0.7);text-align:center;max-width:280px;line-height:1.6;';
        } else if (it.type === 'primary') {
          e = document.createElement('button');
          e.textContent = it.text;
          e.style.cssText = 'padding:14px 40px;border:none;border-radius:14px;font-size:17px;font-weight:700;' +
            'cursor:pointer;background:linear-gradient(135deg,' + c.theme.primary + ',' + c.theme.secondary +
            ');color:white;min-height:44px;box-shadow:0 4px 15px ' + rgba(c.theme.primary, 0.2) + ';';
        } else if (it.type === 'secondary') {
          e = document.createElement('button');
          e.textContent = it.text;
          e.style.cssText = 'padding:12px 32px;border:1px solid rgba(255,255,255,0.15);border-radius:12px;' +
            'font-size:14px;font-weight:600;cursor:pointer;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.7);min-height:44px;';
        } else if (it.type === 'custom') {
          e = document.createElement('div');
          e.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;';
        }
        if (it.id) e.id = it.id;
        s.appendChild(e);
      });
      this.wrap.appendChild(s);
      return s;
    },

    // ─── CANVAS SETUP ────────────────────────────────────────────────
    setupCanvas: function () {
      this.canvas.width = this.WIDTH * this.dpr;
      this.canvas.height = this.HEIGHT * this.dpr;
      this.ctx = this.canvas.getContext('2d');
      this.ctx.scale(this.dpr, this.dpr);
    },

    // ─── INPUT ───────────────────────────────────────────────────────
    setupInput: function () {
      var self = this;
      var wrap = this.wrap;

      function getPos(e) {
        var t = e.touches ? e.touches[0] : e;
        if (!t) return null;
        var r = wrap.getBoundingClientRect();
        return { x: t.clientX - r.left, y: t.clientY - r.top };
      }

      function onDown(e) {
        e.preventDefault();
        var p = getPos(e);
        if (!p) return;
        self.touchActive = true;
        self.touchX = p.x; self.touchY = p.y;
        self.touchStartX = p.x; self.touchStartY = p.y;
        self.touchDX = 0; self.touchDY = 0;
        self.swipeDir = null;
        ZyraAudio.init();
        if (self.state === 'playing') self.onTouchDown(p.x, p.y);
      }
      function onMove(e) {
        e.preventDefault();
        var p = getPos(e);
        if (!p) return;
        self.touchDX = p.x - self.touchX;
        self.touchDY = p.y - self.touchY;
        self.touchX = p.x; self.touchY = p.y;
        if (self.state === 'playing') self.onTouchMove(p.x, p.y);
      }
      function onUp(e) {
        e.preventDefault();
        var dx = self.touchX - self.touchStartX;
        var dy = self.touchY - self.touchStartY;
        var adx = Math.abs(dx), ady = Math.abs(dy);
        if (adx > 30 || ady > 30) {
          if (adx > ady) self.swipeDir = dx > 0 ? 'right' : 'left';
          else self.swipeDir = dy > 0 ? 'down' : 'up';
        }
        if (self.state === 'playing') self.onTouchUp(self.touchX, self.touchY);
        self.touchActive = false;
      }

      wrap.addEventListener('touchstart', onDown, { passive: false });
      wrap.addEventListener('touchmove', onMove, { passive: false });
      wrap.addEventListener('touchend', onUp, { passive: false });
      wrap.addEventListener('mousedown', onDown);
      wrap.addEventListener('mousemove', function (e) { if (self.touchActive) onMove(e); });
      wrap.addEventListener('mouseup', onUp);

      // Keyboard for desktop testing
      document.addEventListener('keydown', function (e) {
        if (self.state !== 'playing') return;
        if (e.key === 'ArrowLeft' || e.key === 'a') self.swipeDir = 'left';
        if (e.key === 'ArrowRight' || e.key === 'd') self.swipeDir = 'right';
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') { self.swipeDir = 'up'; self.keyJump = true; }
        if (e.key === 'ArrowDown' || e.key === 's') self.swipeDir = 'down';
        self.keyLeft = (e.key === 'ArrowLeft' || e.key === 'a');
        self.keyRight = (e.key === 'ArrowRight' || e.key === 'd');
      });
      document.addEventListener('keyup', function (e) {
        if (e.key === 'ArrowLeft' || e.key === 'a') self.keyLeft = false;
        if (e.key === 'ArrowRight' || e.key === 'd') self.keyRight = false;
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') self.keyJump = false;
      });
    },

    // ─── BUTTONS ─────────────────────────────────────────────────────
    setupButtons: function () {
      var self = this;
      function btn(id, fn) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', function (e) { e.stopPropagation(); ZyraAudio.sfxClick(); fn.call(self); });
      }
      btn('btn-play', function () { this.startGame(); });
      btn('btn-howtoplay', function () { this.showScreen('tutorial'); });
      btn('btn-tutorial-ok', function () { this.showScreen('menu'); });
      btn('btn-pause', function () { this.pauseGame(); });
      btn('btn-resume', function () { this.resumeGame(); });
      btn('btn-restart', function () { this.startGame(); });
      btn('btn-menu', function () { this.showScreen('menu'); this.stopLoop(); });
      btn('btn-retry', function () { this.startGame(); });
      btn('btn-gomenu', function () { this.showScreen('menu'); this.stopLoop(); });
      btn('btn-nextlevel', function () { this.nextLevel(); });
      btn('btn-victory-retry', function () { this.startGame(); });
      btn('btn-victory-menu', function () { this.showScreen('menu'); this.stopLoop(); });
      btn('btn-sound', function () {
        var on = ZyraAudio.toggle();
        this.soundBtn.textContent = on ? '\uD83D\uDD0A' : '\uD83D\uDD07';
      });
    },

    // ─── SCREEN MANAGEMENT ───────────────────────────────────────────
    showScreen: function (name) {
      var self = this;
      Object.keys(this.screens).forEach(function (k) {
        self.screens[k].style.display = 'none';
      });
      if (name === 'menu') {
        this.screens.menu.style.display = 'flex';
        this.highScoreEl.textContent = this.highScore > 0 ? 'BEST: ' + this.highScore : '';
      } else if (name === 'playing') {
        this.screens.game.style.display = 'block';
      } else {
        this.screens.game.style.display = 'block';
        if (this.screens[name]) this.screens[name].style.display = 'flex';
      }
      this.state = name === 'playing' ? 'playing' :
                   name === 'menu' ? 'menu' :
                   name === 'gameover' ? 'gameover' :
                   name === 'pause' ? 'paused' : name;
    },

    // ─── GAME START ──────────────────────────────────────────────────
    startGame: function () {
      this.score = 0;
      this.level = 1;
      this.levelScore = 0;
      this.lives = (this.config.settings && this.config.settings.lives) || 3;
      this.gameTime = 0;
      this.levelTime = 0;
      this.entities = [];
      this.particles = [];
      this.projectiles = [];
      this.enemyProjectiles = [];
      this.powerUps = [];
      this.activePowerUps = {};
      this.comboCount = 0;
      this.comboTimer = 0;
      this.destroyCount = 0;
      this.collectCount = 0;
      this.spawnTimer = 0;
      this.boss = null;
      this.bossPhase = 0;
      this.bossPatternTimer = 0;
      this.screenFlash = 0;
      this.screenShake = 0;
      this.ball = null;
      this.paddle = null;
      this.bricks = [];
      this.snake = null;
      this.grid = null;
      this.runnerOffset = 0;
      this.obstacles = [];
      this.platforms = [];
      this.coins = [];
      this.cameraY = 0;
      this.initLevel();
      this.showScreen('playing');
      this.startLoop();
    },

    // ─── LEVEL INIT ──────────────────────────────────────────────────
    initLevel: function () {
      var lvl = this.getLevelConfig();
      this.levelScore = 0;
      this.levelTime = 0;
      this.destroyCount = 0;
      this.collectCount = 0;
      this.spawnTimer = 0;
      this.entities = [];
      this.projectiles = [];
      this.enemyProjectiles = [];
      this.powerUps = [];
      this.boss = null;
      this.particles = [];

      var type = this.config.type;
      if (type === 'tap') this.initTap(lvl);
      else if (type === 'dodge') this.initDodge(lvl);
      else if (type === 'shooter') this.initShooter(lvl);
      else if (type === 'runner') this.initRunner(lvl);
      else if (type === 'puzzle') this.initPuzzle(lvl);
      else if (type === 'platformer') this.initPlatformer(lvl);
      else if (type === 'snake') this.initSnake(lvl);
      else if (type === 'breakout') this.initBreakout(lvl);
      else if (type === 'catcher') this.initCatcher(lvl);
      else if (type === 'physics') this.initPhysics(lvl);

      this.updateHUD();

      // Show level transition
      if (this.level > 1 || (lvl.newMechanic && this.level === 1)) {
        this.showLevelTransition(lvl);
      }
    },

    getLevelConfig: function () {
      var levels = this.config.levels || [];
      var idx = Math.min(this.level - 1, levels.length - 1);
      return levels[idx] || { name: 'Level ' + this.level, objective: { type: 'score', target: 100 }, spawnRate: 1500, speedMultiplier: 1 };
    },

    showLevelTransition: function (lvl) {
      var el = document.getElementById('leveltransition-content');
      if (!el) return;
      var c = this.config;
      el.innerHTML = '<div style="font-size:14px;color:rgba(255,255,255,0.4);letter-spacing:2px;">LEVEL ' + this.level + '</div>' +
        '<div style="font-size:28px;font-weight:900;color:' + c.theme.primary + ';margin:12px 0;">' + (lvl.name || '') + '</div>' +
        '<div style="font-size:14px;color:rgba(255,255,255,0.5);">' + (lvl.subtitle || '') + '</div>' +
        (lvl.newMechanic ? '<div style="font-size:13px;color:#FFD700;margin-top:12px;">NEW: ' +
          lvl.newMechanic.replace(/_/g, ' ').toUpperCase() + '</div>' : '');
      this.showScreen('levelTransition');
      ZyraAudio.sfxTick();
      var self = this;
      setTimeout(function () { ZyraAudio.sfxTick(); }, 700);
      setTimeout(function () { ZyraAudio.sfxGo(); }, 1400);
      setTimeout(function () {
        if (self.state === 'levelTransition') {
          self.showScreen('playing');
        }
      }, 2000);
    },

    // ─── LEVEL OBJECTIVE CHECK ───────────────────────────────────────
    checkObjective: function () {
      var lvl = this.getLevelConfig();
      var obj = lvl.objective || { type: 'score', target: 100 };
      var met = false;

      if (obj.type === 'score') met = this.levelScore >= obj.target;
      else if (obj.type === 'survive') met = this.levelTime >= obj.target;
      else if (obj.type === 'destroy') met = this.destroyCount >= obj.target;
      else if (obj.type === 'collect') met = this.collectCount >= obj.target;

      if (met) this.completeLevel();

      // Update progress bar
      var progress = 0;
      if (obj.type === 'score') progress = this.levelScore / obj.target;
      else if (obj.type === 'survive') progress = this.levelTime / obj.target;
      else if (obj.type === 'destroy') progress = this.destroyCount / obj.target;
      else if (obj.type === 'collect') progress = this.collectCount / obj.target;
      this.progressBar.style.width = Math.min(100, progress * 100) + '%';
    },

    completeLevel: function () {
      ZyraAudio.sfxLevelComplete();
      var levels = this.config.levels || [];
      if (this.level >= levels.length) {
        // Victory!
        this.victory();
        return;
      }
      var el = document.getElementById('levelcomplete-content');
      if (el) {
        el.innerHTML = '<div style="font-size:16px;color:rgba(255,255,255,0.6);">Score: ' + this.score + '</div>';
      }
      this.showScreen('levelComplete');
    },

    nextLevel: function () {
      this.level++;
      this.initLevel();
      this.showScreen('playing');
    },

    victory: function () {
      ZyraAudio.sfxVictory();
      this.saveHighScore();
      var el = document.getElementById('victory-content');
      if (el) {
        el.innerHTML = '<div style="font-size:20px;color:white;font-weight:700;">Final Score: ' + this.score + '</div>' +
          (this.score > this.highScore ? '<div style="font-size:14px;color:#FFD700;margin-top:8px;">NEW HIGH SCORE!</div>' : '');
      }
      this.showScreen('victory');
    },

    // ─── GAME OVER ───────────────────────────────────────────────────
    gameOver: function () {
      ZyraAudio.sfxGameOver();
      this.saveHighScore();
      this.screenFlash = 0.5;
      var el = document.getElementById('gameover-content');
      if (el) {
        el.innerHTML = '<div style="font-size:20px;color:white;font-weight:700;">Score: ' + this.score + '</div>' +
          '<div style="font-size:14px;color:rgba(255,255,255,0.4);margin-top:4px;">Level ' + this.level + '</div>' +
          (this.score > this.highScore ? '<div style="font-size:14px;color:#FFD700;margin-top:8px;">NEW HIGH SCORE!</div>' : '');
      }
      if (this.score > this.highScore) setTimeout(function () { ZyraAudio.sfxNewHighScore(); }, 800);
      this.showScreen('gameover');
    },

    loseLife: function () {
      this.lives--;
      ZyraAudio.sfxLoseLife();
      this.screenFlash = 0.3;
      this.screenShake = 0.3;
      if (this.lives <= 0) {
        this.gameOver();
      }
      this.updateHUD();
    },

    addScore: function (pts) {
      this.score += pts;
      this.levelScore += pts;
      this.comboCount++;
      this.comboTimer = 1.5;
      if (this.comboCount >= 5) ZyraAudio.sfxBigScore();
      else if (this.comboCount >= 3) ZyraAudio.sfxCombo(this.comboCount);
      this.updateHUD();
    },

    saveHighScore: function () {
      if (this.score > this.highScore) {
        this.highScore = this.score;
        localStorage.setItem('zyra_hs_' + this.config.id, String(this.highScore));
      }
    },

    updateHUD: function () {
      this.scoreEl.textContent = this.score;
      // Physics/billiards games don't use lives — show shot count or hide
      var type = this.config.type;
      if (type === 'physics') {
        // Billiards: show pocketed/total instead of hearts
        var active = this.physicsBodies ? this.physicsBodies.filter(function (b) { return b.active && b.type !== 'cue'; }).length : 0;
        var total = this.physicsBodies ? this.physicsBodies.filter(function (b) { return b.type !== 'cue'; }).length : 0;
        this.livesEl.textContent = '\uD83C\uDFB1 ' + (total - active) + '/' + total;
      } else if (this.lives > 10) {
        // Don't render 99 hearts — just show number
        this.livesEl.textContent = '\u2764\uFE0F ' + this.lives;
      } else {
        var hearts = '';
        for (var i = 0; i < this.lives; i++) hearts += '\u2764\uFE0F';
        this.livesEl.textContent = hearts;
      }
      var lvl = this.getLevelConfig();
      var obj = lvl.objective || {};
      var objText = '';
      if (obj.type === 'score') objText = 'SCORE ' + this.levelScore + '/' + obj.target;
      else if (obj.type === 'survive') objText = 'SURVIVE ' + Math.floor(this.levelTime) + '/' + obj.target + 's';
      else if (obj.type === 'destroy') objText = 'DESTROY ' + this.destroyCount + '/' + obj.target;
      else if (obj.type === 'collect') objText = 'COLLECT ' + this.collectCount + '/' + obj.target;
      this.levelBar.textContent = 'LVL ' + this.level + '  \u2022  ' + objText;

      // Timer
      if (lvl.timeLimit) {
        var remaining = Math.max(0, lvl.timeLimit - this.levelTime);
        this.timerEl.style.display = 'block';
        this.timerEl.textContent = Math.ceil(remaining) + 's';
        if (remaining < 10) {
          this.timerEl.style.color = '#FF6B6B';
          if (remaining > 0 && Math.abs(remaining - Math.round(remaining)) < 0.05) ZyraAudio.sfxTimerWarning();
        } else this.timerEl.style.color = 'white';
      } else {
        this.timerEl.style.display = 'none';
      }
    },

    pauseGame: function () {
      if (this.state === 'playing') {
        this.showScreen('pause');
        this.stopLoop();
      }
    },
    resumeGame: function () {
      this.showScreen('playing');
      this.startLoop();
    },

    // ─── GAME LOOP ───────────────────────────────────────────────────
    startLoop: function () {
      var self = this;
      this.lastTimestamp = 0;
      if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
      function loop(ts) {
        self.animFrameId = requestAnimationFrame(loop);
        if (!self.lastTimestamp) { self.lastTimestamp = ts; return; }
        var dt = Math.min((ts - self.lastTimestamp) / 1000, 0.05);
        self.lastTimestamp = ts;
        if (self.state === 'playing') {
          self.gameTime += dt;
          self.levelTime += dt;
          self.update(dt);
          self.checkObjective();

          // Time limit check
          var lvl = self.getLevelConfig();
          if (lvl.timeLimit && self.levelTime >= lvl.timeLimit) {
            self.gameOver();
          }
        }
        self.render();
      }
      this.animFrameId = requestAnimationFrame(loop);
    },
    stopLoop: function () {
      if (this.animFrameId) { cancelAnimationFrame(this.animFrameId); this.animFrameId = null; }
    },

    // ─── UPDATE (dispatches to game type) ────────────────────────────
    update: function (dt) {
      var type = this.config.type;
      if (type === 'tap') this.updateTap(dt);
      else if (type === 'dodge') this.updateDodge(dt);
      else if (type === 'shooter') this.updateShooter(dt);
      else if (type === 'runner') this.updateRunner(dt);
      else if (type === 'puzzle') this.updatePuzzle(dt);
      else if (type === 'platformer') this.updatePlatformer(dt);
      else if (type === 'snake') this.updateSnake(dt);
      else if (type === 'breakout') this.updateBreakout(dt);
      else if (type === 'catcher') this.updateCatcher(dt);
      else if (type === 'physics') this.updatePhysics(dt);

      // Update particles
      this.updateParticles(dt);

      // Combo timer
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.comboCount = 0;
        this.comboEl.style.opacity = this.comboCount >= 3 ? '1' : '0';
        this.comboEl.textContent = this.comboCount + 'x COMBO!';
      }

      // Screen effects
      if (this.screenFlash > 0) this.screenFlash -= dt * 2;
      if (this.screenShake > 0) this.screenShake -= dt * 2;

      // Power-up timers
      var self = this;
      Object.keys(this.activePowerUps).forEach(function (k) {
        self.activePowerUps[k] -= dt;
        if (self.activePowerUps[k] <= 0) delete self.activePowerUps[k];
      });

      // Boss update
      if (this.boss) this.updateBoss(dt);

      this.updateHUD();
    },

    // ─── RENDER ──────────────────────────────────────────────────────
    render: function () {
      var ctx = this.ctx;
      var W = this.WIDTH, H = this.HEIGHT;

      // Screen shake
      ctx.save();
      if (this.screenShake > 0) {
        ctx.translate(rand(-3, 3), rand(-3, 3));
      }

      // Background
      var lvl = this.getLevelConfig();
      var bg = (lvl && lvl.background) || this.config.theme.background;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Themed background decoration (stars, clouds, grid, etc.)
      this.drawBackground(ctx, W, H);

      // Game-type specific rendering
      var type = this.config.type;
      if (type === 'tap') this.renderTap(ctx);
      else if (type === 'dodge') this.renderDodge(ctx);
      else if (type === 'shooter') this.renderShooter(ctx);
      else if (type === 'runner') this.renderRunner(ctx);
      else if (type === 'puzzle') this.renderPuzzle(ctx);
      else if (type === 'platformer') this.renderPlatformer(ctx);
      else if (type === 'snake') this.renderSnake(ctx);
      else if (type === 'breakout') this.renderBreakout(ctx);
      else if (type === 'catcher') this.renderCatcher(ctx);
      else if (type === 'physics') this.renderPhysics(ctx);

      // Particles
      this.renderParticles(ctx);

      // Boss health bar
      if (this.boss && this.boss.active) {
        this.renderBossBar(ctx);
      }

      // Screen flash
      if (this.screenFlash > 0) {
        ctx.fillStyle = rgba('#FF0000', this.screenFlash);
        ctx.fillRect(0, 0, W, H);
      }

      // Power-up indicators
      this.renderPowerUpIndicators(ctx);

      ctx.restore();
    },

    // ═══════════════════════════════════════════════════════════════════
    // TAP GAME
    // ═══════════════════════════════════════════════════════════════════
    initTap: function (lvl) {
      // Nothing special needed — entities spawn during update
    },

    updateTap: function (dt) {
      var lvl = this.getLevelConfig();
      var spawnRate = (lvl.spawnRate || 1500) / 1000;
      var maxTargets = lvl.maxEnemies || 5;
      var speedMult = lvl.speedMultiplier || 1;

      this.spawnTimer += dt;
      if (this.spawnTimer >= spawnRate / speedMult && this.entities.length < maxTargets) {
        this.spawnTimer = 0;
        this.spawnTapTarget(lvl);
      }

      // Update targets
      var self = this;
      for (var i = this.entities.length - 1; i >= 0; i--) {
        var e = this.entities[i];
        e.life -= dt;
        if (e.life <= 0) {
          // Missed
          this.entities.splice(i, 1);
          this.loseLife();
        }
      }
    },

    spawnTapTarget: function (lvl) {
      var types = lvl.spawnTypes || ['basic'];
      var typeName = types[randInt(0, types.length - 1)];
      var et = (this.config.entityTypes && this.config.entityTypes[typeName]) || {};
      var radius = (et.width || 40) / 2;
      var margin = radius + 10;
      this.entities.push({
        type: typeName,
        x: rand(margin, this.WIDTH - margin),
        y: rand(100 + margin, this.HEIGHT - 100 - margin),
        radius: radius,
        color: et.color || this.config.theme.primary,
        emoji: et.emoji || null,
        life: (et.lifetime || 2.5),
        maxLife: (et.lifetime || 2.5),
        points: et.points || 10,
        shape: et.shape || 'circle'
      });
    },

    renderTap: function (ctx) {
      var self = this;
      this.entities.forEach(function (e) {
        var pct = e.life / e.maxLife;
        var r = e.radius * (0.5 + 0.5 * pct);
        ctx.globalAlpha = 0.3 + 0.7 * pct;

        // Glow
        ctx.beginPath();
        ctx.arc(e.x, e.y, r + 8, 0, Math.PI * 2);
        ctx.fillStyle = rgba(e.color, 0.15 * pct);
        ctx.fill();

        // Main entity — use emoji if available
        if (e.emoji) {
          ctx.font = Math.floor(r * 1.8) + 'px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(e.emoji, e.x, e.y);
        } else {
          ctx.beginPath();
          ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
          var grad = ctx.createRadialGradient(e.x - r * 0.3, e.y - r * 0.3, 0, e.x, e.y, r);
          grad.addColorStop(0, lighten(e.color, 40));
          grad.addColorStop(1, e.color);
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // Ring timer
        ctx.beginPath();
        ctx.arc(e.x, e.y, r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.globalAlpha = 1;
      });
    },

    onTouchDown_tap: function (x, y) {
      for (var i = this.entities.length - 1; i >= 0; i--) {
        var e = this.entities[i];
        var d = dist(x, y, e.x, e.y);
        if (d < e.radius + 15) { // generous hit area
          this.addScore(e.points * (this.comboCount >= 3 ? 2 : 1));
          this.spawnParticles(e.x, e.y, e.color, 10);
          ZyraAudio.sfxDestroy();
          this.entities.splice(i, 1);
          this.destroyCount++;
          return;
        }
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // DODGE GAME
    // ═══════════════════════════════════════════════════════════════════
    initDodge: function (lvl) {
      var s = this.config.settings || {};
      this.player = {
        x: this.WIDTH / 2,
        y: this.HEIGHT - 100,
        width: s.playerWidth || 36,
        height: s.playerHeight || 36,
        color: s.playerColor || this.config.theme.primary
      };
    },

    updateDodge: function (dt) {
      var lvl = this.getLevelConfig();
      var spawnRate = (lvl.spawnRate || 1200) / 1000;
      var speedMult = lvl.speedMultiplier || 1;
      var maxEnemies = lvl.maxEnemies || 8;

      this.spawnTimer += dt;
      if (this.spawnTimer >= spawnRate / speedMult && this.entities.length < maxEnemies) {
        this.spawnTimer = 0;
        this.spawnDodgeEntity(lvl);
      }

      var p = this.player;
      // Update entities
      for (var i = this.entities.length - 1; i >= 0; i--) {
        var e = this.entities[i];
        e.y += e.speed * speedMult * dt * 60;

        // Off screen
        if (e.y > this.HEIGHT + 50) {
          this.entities.splice(i, 1);
          if (e.isGood) {
            // Missed a collectible — no penalty
          }
          continue;
        }

        // Collision with player
        if (this.aabb(p, e)) {
          this.entities.splice(i, 1);
          if (e.isGood) {
            this.addScore(e.points);
            this.collectCount++;
            ZyraAudio.sfxCoin();
            this.spawnParticles(e.x + e.width / 2, e.y + e.height / 2, e.color, 6);
          } else {
            this.loseLife();
            this.spawnParticles(p.x + p.width / 2, p.y + p.height / 2, '#FF0000', 8);
          }
        }
      }

      // Score for surviving
      this.levelScore = Math.floor(this.levelTime * 10) + this.collectCount * 20;
      this.score = this.levelScore;
    },

    spawnDodgeEntity: function (lvl) {
      var types = lvl.spawnTypes || ['basic'];
      var typeName = types[randInt(0, types.length - 1)];
      var et = (this.config.entityTypes && this.config.entityTypes[typeName]) || {};

      var w = et.width || 30;
      var h = et.height || 30;
      var isGood = et.isGood || false;

      // 20% chance to spawn a coin instead
      if (!isGood && Math.random() < (lvl.powerUpChance || 0.1)) {
        isGood = true;
        typeName = 'coin';
      }

      this.entities.push({
        type: typeName,
        x: rand(10, this.WIDTH - w - 10),
        y: -h,
        width: w,
        height: h,
        speed: (et.speed || 3) * (lvl.speedMultiplier || 1),
        color: isGood ? '#FFD700' : (et.color || '#FF6B6B'),
        emoji: isGood ? '🪙' : (et.emoji || null),
        points: isGood ? 20 : (et.points || 0),
        isGood: isGood,
        shape: et.shape || 'rect'
      });
    },

    renderDodge: function (ctx) {
      var p = this.player;
      if (!p) return;

      // Draw player with emoji
      this.drawPlayer(ctx, p);

      // Draw shield if active
      if (this.activePowerUps.shield) {
        ctx.beginPath();
        ctx.arc(p.x + p.width / 2, p.y + p.height / 2, Math.max(p.width, p.height) * 0.8, 0, Math.PI * 2);
        ctx.strokeStyle = rgba('#00D4FF', 0.5);
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw entities with emoji
      var self = this;
      this.entities.forEach(function (e) {
        self.drawEntity(ctx, e.x, e.y, e.width, e.height, e.color, e.isGood ? 'circle' : e.shape, e.emoji);
      });
    },

    onTouchMove_dodge: function (x, y) {
      if (this.player) {
        this.player.x = clamp(x - this.player.width / 2, 0, this.WIDTH - this.player.width);
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // SHOOTER GAME
    // ═══════════════════════════════════════════════════════════════════
    initShooter: function (lvl) {
      var s = this.config.settings || {};
      this.player = {
        x: this.WIDTH / 2 - (s.playerWidth || 36) / 2,
        y: this.HEIGHT - 80,
        width: s.playerWidth || 36,
        height: s.playerHeight || 36,
        color: s.playerColor || this.config.theme.primary
      };
      this.fireTimer = 0;
    },

    updateShooter: function (dt) {
      var lvl = this.getLevelConfig();
      var s = this.config.settings || {};
      var fireRate = (this.activePowerUps.rapid ? (s.fireRate || 400) / 2 : (s.fireRate || 400)) / 1000;
      var projSpeed = s.projectileSpeed || 10;
      var speedMult = lvl.speedMultiplier || 1;
      var spawnRate = (lvl.spawnRate || 1500) / 1000;
      var maxEnemies = lvl.maxEnemies || 6;
      var p = this.player;

      // Auto-fire
      this.fireTimer += dt;
      if (this.fireTimer >= fireRate) {
        this.fireTimer = 0;
        if (this.activePowerUps.spread) {
          // Spread shot — 3 projectiles
          for (var a = -1; a <= 1; a++) {
            this.projectiles.push({
              x: p.x + p.width / 2 - 3,
              y: p.y,
              width: 6, height: 14,
              vx: a * 3,
              vy: -projSpeed,
              color: s.projectileColor || '#FFD700'
            });
          }
        } else {
          this.projectiles.push({
            x: p.x + p.width / 2 - 3,
            y: p.y,
            width: 6, height: 14,
            vx: 0,
            vy: -projSpeed,
            color: s.projectileColor || '#FFD700'
          });
        }
        ZyraAudio.sfxShoot();
      }

      // Spawn enemies
      this.spawnTimer += dt;
      if (this.spawnTimer >= spawnRate / speedMult && this.entities.length < maxEnemies && !this.boss) {
        this.spawnTimer = 0;
        this.spawnShooterEnemy(lvl);
      }

      // Update projectiles
      for (var i = this.projectiles.length - 1; i >= 0; i--) {
        var proj = this.projectiles[i];
        proj.x += proj.vx * dt * 60;
        proj.y += proj.vy * dt * 60;
        if (proj.y < -20 || proj.y > this.HEIGHT + 20 || proj.x < -20 || proj.x > this.WIDTH + 20) {
          this.projectiles.splice(i, 1);
        }
      }

      // Update enemy projectiles
      for (var i = this.enemyProjectiles.length - 1; i >= 0; i--) {
        var ep = this.enemyProjectiles[i];
        ep.x += ep.vx * dt * 60;
        ep.y += ep.vy * dt * 60;
        if (ep.y > this.HEIGHT + 20 || ep.y < -20) {
          this.enemyProjectiles.splice(i, 1);
          continue;
        }
        // Hit player
        if (this.aabb(p, ep)) {
          this.enemyProjectiles.splice(i, 1);
          if (this.activePowerUps.shield) {
            delete this.activePowerUps.shield;
          } else {
            this.loseLife();
            this.spawnParticles(p.x + p.width / 2, p.y + p.height / 2, '#FF0000', 8);
          }
        }
      }

      // Update enemies
      for (var i = this.entities.length - 1; i >= 0; i--) {
        var e = this.entities[i];
        e.y += e.speed * speedMult * dt * 60;
        if (e.vx) e.x += e.vx * dt * 60;

        // Bounce off walls
        if (e.x < 0 || e.x + e.width > this.WIDTH) {
          e.vx = -(e.vx || 0);
          e.x = clamp(e.x, 0, this.WIDTH - e.width);
        }

        // Enemy shoots
        if (e.shoots) {
          e.fireTimer = (e.fireTimer || 0) + dt * 1000;
          if (e.fireTimer >= (e.fireRate || 2000)) {
            e.fireTimer = 0;
            this.enemyProjectiles.push({
              x: e.x + e.width / 2 - 3,
              y: e.y + e.height,
              width: 6, height: 10,
              vx: 0, vy: 5,
              color: '#FF4757'
            });
          }
        }

        // Off screen bottom
        if (e.y > this.HEIGHT + 50) {
          this.entities.splice(i, 1);
          continue;
        }

        // Hit player
        if (this.aabb(p, e)) {
          this.entities.splice(i, 1);
          if (this.activePowerUps.shield) {
            delete this.activePowerUps.shield;
            this.spawnParticles(e.x + e.width / 2, e.y + e.height / 2, e.color, 6);
          } else {
            this.loseLife();
            this.spawnParticles(p.x + p.width / 2, p.y + p.height / 2, '#FF0000', 8);
          }
          continue;
        }

        // Check projectile hits
        for (var j = this.projectiles.length - 1; j >= 0; j--) {
          if (this.aabb(this.projectiles[j], e)) {
            this.projectiles.splice(j, 1);
            e.health = (e.health || 1) - 1;
            this.spawnParticles(e.x + e.width / 2, e.y + e.height / 2, e.color, 4);
            ZyraAudio.sfxHit();
            if (e.health <= 0) {
              this.addScore(e.points || 10);
              this.destroyCount++;
              this.spawnParticles(e.x + e.width / 2, e.y + e.height / 2, e.color, 10);
              this.entities.splice(i, 1);

              // Power-up drop chance
              if (Math.random() < (lvl.powerUpChance || 0.1)) {
                this.spawnPowerUp(e.x + e.width / 2, e.y + e.height / 2);
              }
            }
            break;
          }
        }
      }

      // Update power-ups
      for (var i = this.powerUps.length - 1; i >= 0; i--) {
        var pu = this.powerUps[i];
        pu.y += 2 * dt * 60;
        if (pu.y > this.HEIGHT + 20) { this.powerUps.splice(i, 1); continue; }
        if (this.aabb(p, pu)) {
          this.powerUps.splice(i, 1);
          this.activatePowerUp(pu.puType);
          ZyraAudio.sfxPowerUp();
          this.spawnParticles(pu.x + pu.width / 2, pu.y + pu.height / 2, pu.color, 8);
        }
      }

      // Boss projectile hits
      if (this.boss && this.boss.active) {
        for (var j = this.projectiles.length - 1; j >= 0; j--) {
          var proj = this.projectiles[j];
          if (proj.x >= this.boss.x && proj.x <= this.boss.x + this.boss.width &&
            proj.y >= this.boss.y && proj.y <= this.boss.y + this.boss.height) {
            this.projectiles.splice(j, 1);
            this.boss.health--;
            ZyraAudio.sfxBossHit();
            this.spawnParticles(proj.x, proj.y, this.boss.color, 4);
            if (this.boss.health <= 0) {
              this.spawnParticles(this.boss.x + this.boss.width / 2, this.boss.y + this.boss.height / 2, this.boss.color, 20);
              this.addScore(200);
              this.destroyCount++;
              this.boss.active = false;
              ZyraAudio.sfxBossDefeat();
            }
          }
        }
      }
    },

    spawnShooterEnemy: function (lvl) {
      var types = lvl.spawnTypes || ['basic'];
      var typeName = types[randInt(0, types.length - 1)];
      var et = (this.config.entityTypes && this.config.entityTypes[typeName]) || {};
      var w = et.width || 30, h = et.height || 30;
      this.entities.push({
        type: typeName,
        x: rand(10, this.WIDTH - w - 10),
        y: -h,
        width: w, height: h,
        speed: et.speed || 2,
        vx: (et.speed || 2) * (Math.random() > 0.5 ? 1 : -1) * 0.5,
        color: et.color || '#FF6B6B',
        emoji: et.emoji || null,
        health: et.health || 1,
        points: et.points || 10,
        shape: et.shape || 'rect',
        shoots: et.shoots || false,
        fireRate: et.fireRate || 2000,
        fireTimer: 0
      });
    },

    renderShooter: function (ctx) {
      var p = this.player;
      if (!p) return;

      // Draw player with emoji
      this.drawPlayer(ctx, p);

      // Shield
      if (this.activePowerUps.shield) {
        ctx.beginPath();
        ctx.arc(p.x + p.width / 2, p.y + p.height / 2, Math.max(p.width, p.height) * 0.8, 0, Math.PI * 2);
        ctx.strokeStyle = rgba('#00D4FF', 0.5);
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Projectiles
      var self = this;
      this.projectiles.forEach(function (proj) {
        ctx.fillStyle = proj.color;
        self.roundRect(ctx, proj.x, proj.y, proj.width, proj.height, 3);
        ctx.fill();
      });

      // Enemy projectiles
      this.enemyProjectiles.forEach(function (ep) {
        ctx.fillStyle = ep.color;
        self.roundRect(ctx, ep.x, ep.y, ep.width, ep.height, 3);
        ctx.fill();
      });

      // Enemies with emoji
      this.entities.forEach(function (e) {
        self.drawEntity(ctx, e.x, e.y, e.width, e.height, e.color, e.shape, e.emoji);
        // Health bar for multi-hp enemies
        if (e.health > 1) {
          var bw = e.width;
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(e.x, e.y - 6, bw, 3);
          var maxHp = ((self.config.entityTypes || {})[e.type] || {}).health || e.health;
          ctx.fillStyle = e.color;
          ctx.fillRect(e.x, e.y - 6, bw * (e.health / maxHp), 3);
        }
      });

      // Power-ups with emoji
      this.powerUps.forEach(function (pu) {
        if (pu.emoji) {
          ctx.font = (pu.width + 4) + 'px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(pu.emoji, pu.x + pu.width / 2, pu.y + pu.height / 2);
        } else {
          ctx.beginPath();
          ctx.arc(pu.x + pu.width / 2, pu.y + pu.height / 2, pu.width / 2, 0, Math.PI * 2);
          ctx.fillStyle = pu.color;
          ctx.fill();
          ctx.fillStyle = 'white';
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(pu.icon || '?', pu.x + pu.width / 2, pu.y + pu.height / 2);
        }
      });

      // Boss with emoji
      if (this.boss && this.boss.active) {
        var bossEmoji = (this.getLevelConfig().boss && this.getLevelConfig().boss.emoji) || null;
        self.drawEntity(ctx, self.boss.x, self.boss.y, self.boss.width, self.boss.height, self.boss.color, 'rect', bossEmoji);
      }
    },

    onTouchMove_shooter: function (x, y) {
      if (this.player) {
        this.player.x = clamp(x - this.player.width / 2, 0, this.WIDTH - this.player.width);
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // RUNNER GAME
    // ═══════════════════════════════════════════════════════════════════
    initRunner: function (lvl) {
      var s = this.config.settings || {};
      this.player = {
        x: 80,
        y: 0,
        width: s.playerWidth || 30,
        height: s.playerHeight || 40,
        color: s.playerColor || this.config.theme.primary,
        vy: 0,
        grounded: false
      };
      this.runnerOffset = 0;
      this.runnerSpeed = s.playerSpeed || 4;
      this.obstacles = [];
      this.coins = [];
      this.groundY = this.HEIGHT - 120;
      this.player.y = this.groundY - this.player.height;
      this.nextObstacle = 0;
      this.nextCoin = 0;
    },

    updateRunner: function (dt) {
      var lvl = this.getLevelConfig();
      var speedMult = lvl.speedMultiplier || 1;
      var speed = this.runnerSpeed * speedMult * dt * 60;
      this.runnerOffset += speed;

      var p = this.player;
      var gravity = 0.6;
      var jumpForce = -13;

      // Jump
      if (p.grounded && (this.touchActive || this.keyJump)) {
        p.vy = jumpForce;
        p.grounded = false;
        ZyraAudio.sfxJump();
      }

      // Apply gravity
      p.vy += gravity;
      p.y += p.vy;

      // Ground collision
      if (p.y + p.height >= this.groundY) {
        p.y = this.groundY - p.height;
        p.vy = 0;
        p.grounded = true;
      }

      // Platform collision
      if (p.vy > 0) {
        for (var i = 0; i < this.platforms.length; i++) {
          var pl = this.platforms[i];
          if (p.x + p.width > pl.x && p.x < pl.x + pl.width &&
            p.y + p.height >= pl.y && p.y + p.height <= pl.y + 15) {
            p.y = pl.y - p.height;
            p.vy = 0;
            p.grounded = true;
          }
        }
      }

      // Spawn obstacles
      this.nextObstacle -= speed;
      if (this.nextObstacle <= 0) {
        this.nextObstacle = rand(200, 400);
        var ow = rand(20, 40);
        var oh = rand(30, 60);
        this.obstacles.push({
          x: this.WIDTH + 10,
          y: this.groundY - oh,
          width: ow, height: oh,
          color: (this.config.entityTypes && this.config.entityTypes.basic && this.config.entityTypes.basic.color) || '#FF6B6B'
        });

        // Sometimes also add a platform
        if (Math.random() < 0.3) {
          this.platforms.push({
            x: this.WIDTH + rand(50, 150),
            y: this.groundY - rand(80, 160),
            width: rand(60, 120), height: 12,
            color: rgba(this.config.theme.primary, 0.6)
          });
        }
      }

      // Spawn coins
      this.nextCoin -= speed;
      if (this.nextCoin <= 0) {
        this.nextCoin = rand(150, 300);
        this.coins.push({
          x: this.WIDTH + 10,
          y: this.groundY - rand(50, 180),
          radius: 10,
          color: '#FFD700'
        });
      }

      // Move obstacles
      for (var i = this.obstacles.length - 1; i >= 0; i--) {
        this.obstacles[i].x -= speed;
        if (this.obstacles[i].x + this.obstacles[i].width < -10) {
          this.obstacles.splice(i, 1);
          continue;
        }
        if (this.aabb(p, this.obstacles[i])) {
          this.loseLife();
          this.obstacles.splice(i, 1);
          this.spawnParticles(p.x + p.width / 2, p.y + p.height / 2, '#FF0000', 8);
        }
      }

      // Move platforms
      for (var i = this.platforms.length - 1; i >= 0; i--) {
        this.platforms[i].x -= speed;
        if (this.platforms[i].x + this.platforms[i].width < -10) {
          this.platforms.splice(i, 1);
        }
      }

      // Move coins
      for (var i = this.coins.length - 1; i >= 0; i--) {
        this.coins[i].x -= speed;
        if (this.coins[i].x < -20) { this.coins.splice(i, 1); continue; }
        if (dist(p.x + p.width / 2, p.y + p.height / 2, this.coins[i].x, this.coins[i].y) < this.coins[i].radius + 15) {
          this.coins.splice(i, 1);
          this.addScore(10);
          this.collectCount++;
          ZyraAudio.sfxCoin();
        }
      }

      // Distance-based scoring
      this.levelScore = Math.floor(this.runnerOffset / 10);
      this.score = this.levelScore;
    },

    renderRunner: function (ctx) {
      var p = this.player;
      if (!p) return;

      // Ground
      ctx.fillStyle = rgba(this.config.theme.primary, 0.15);
      ctx.fillRect(0, this.groundY, this.WIDTH, this.HEIGHT - this.groundY);
      ctx.fillStyle = rgba(this.config.theme.primary, 0.3);
      ctx.fillRect(0, this.groundY, this.WIDTH, 2);

      // Platforms
      var self = this;
      this.platforms.forEach(function (pl) {
        ctx.fillStyle = pl.color;
        self.roundRect(ctx, pl.x, pl.y, pl.width, pl.height, 4);
        ctx.fill();
      });

      // Obstacles with emoji
      var obstacleEmoji = (this.config.entityTypes && this.config.entityTypes.basic && this.config.entityTypes.basic.emoji) || null;
      this.obstacles.forEach(function (o) {
        self.drawEntity(ctx, o.x, o.y, o.width, o.height, o.color, 'rect', obstacleEmoji);
      });

      // Coins
      this.coins.forEach(function (c) {
        ctx.font = (c.radius * 2) + 'px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🪙', c.x, c.y);
      });

      // Player with emoji
      this.drawPlayer(ctx, p);
    },

    // ═══════════════════════════════════════════════════════════════════
    // PUZZLE GAME (Match-3)
    // ═══════════════════════════════════════════════════════════════════
    initPuzzle: function (lvl) {
      var s = this.config.settings || {};
      this.gridCols = s.cols || 6;
      this.gridRows = s.rows || 8;
      this.puzzleColors = (this.config.entityTypes && Object.values(this.config.entityTypes).map(function (et) { return et.color; })) ||
        ['#FF6B6B', '#4ECDC4', '#FFD93D', '#6C5CE7', '#A8E6CF', '#FF8B94'];
      this.puzzleCellSize = Math.min((this.WIDTH - 20) / this.gridCols, (this.HEIGHT - 200) / this.gridRows);
      this.puzzleOffsetX = (this.WIDTH - this.gridCols * this.puzzleCellSize) / 2;
      this.puzzleOffsetY = 100;
      this.selectedCell = null;
      this.animatingGrid = false;
      this.grid = [];
      for (var r = 0; r < this.gridRows; r++) {
        this.grid[r] = [];
        for (var c = 0; c < this.gridCols; c++) {
          this.grid[r][c] = { color: randInt(0, this.puzzleColors.length - 1), scale: 1, offsetY: 0 };
        }
      }
      // Remove initial matches
      this.removeInitialMatches();
    },

    removeInitialMatches: function () {
      var changed = true;
      while (changed) {
        changed = false;
        for (var r = 0; r < this.gridRows; r++) {
          for (var c = 0; c < this.gridCols; c++) {
            var col = this.grid[r][c].color;
            // Check horizontal
            if (c >= 2 && this.grid[r][c - 1].color === col && this.grid[r][c - 2].color === col) {
              this.grid[r][c].color = (col + 1 + randInt(0, this.puzzleColors.length - 2)) % this.puzzleColors.length;
              changed = true;
            }
            // Check vertical
            if (r >= 2 && this.grid[r - 1][c].color === col && this.grid[r - 2][c].color === col) {
              this.grid[r][c].color = (col + 1 + randInt(0, this.puzzleColors.length - 2)) % this.puzzleColors.length;
              changed = true;
            }
          }
        }
      }
    },

    updatePuzzle: function (dt) {
      // Animate falling tiles
      if (this.animatingGrid) {
        var done = true;
        for (var r = 0; r < this.gridRows; r++) {
          for (var c = 0; c < this.gridCols; c++) {
            var cell = this.grid[r][c];
            if (cell.offsetY > 0.1) {
              cell.offsetY *= 0.8;
              done = false;
            } else {
              cell.offsetY = 0;
            }
            if (cell.scale < 0.99) {
              cell.scale += (1 - cell.scale) * 0.15;
              done = false;
            } else {
              cell.scale = 1;
            }
          }
        }
        if (done) {
          this.animatingGrid = false;
          // Check for new matches after cascade
          this.checkPuzzleMatches();
        }
      }
    },

    onTouchDown_puzzle: function (x, y) {
      if (this.animatingGrid) return;
      var col = Math.floor((x - this.puzzleOffsetX) / this.puzzleCellSize);
      var row = Math.floor((y - this.puzzleOffsetY) / this.puzzleCellSize);
      if (col < 0 || col >= this.gridCols || row < 0 || row >= this.gridRows) return;

      if (this.selectedCell) {
        var sr = this.selectedCell.r, sc = this.selectedCell.c;
        // Check if adjacent
        var dr = Math.abs(row - sr), dc = Math.abs(col - sc);
        if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
          // Swap
          var tmp = this.grid[sr][sc].color;
          this.grid[sr][sc].color = this.grid[row][col].color;
          this.grid[row][col].color = tmp;

          // Check if swap creates match
          if (!this.hasMatches()) {
            // Swap back — no match
            this.grid[row][col].color = this.grid[sr][sc].color;
            this.grid[sr][sc].color = tmp;
            ZyraAudio.sfxInvalid();
          } else {
            ZyraAudio.sfxTap();
            this.checkPuzzleMatches();
          }
        }
        this.selectedCell = null;
      } else {
        this.selectedCell = { r: row, c: col };
      }
    },

    hasMatches: function () {
      for (var r = 0; r < this.gridRows; r++) {
        for (var c = 0; c < this.gridCols - 2; c++) {
          if (this.grid[r][c].color >= 0 && this.grid[r][c].color === this.grid[r][c + 1].color && this.grid[r][c].color === this.grid[r][c + 2].color)
            return true;
        }
      }
      for (var c = 0; c < this.gridCols; c++) {
        for (var r = 0; r < this.gridRows - 2; r++) {
          if (this.grid[r][c].color >= 0 && this.grid[r][c].color === this.grid[r + 1][c].color && this.grid[r][c].color === this.grid[r + 2][c].color)
            return true;
        }
      }
      return false;
    },

    checkPuzzleMatches: function () {
      var matched = [];
      // Horizontal
      for (var r = 0; r < this.gridRows; r++) {
        for (var c = 0; c < this.gridCols - 2; c++) {
          if (this.grid[r][c].color >= 0 && this.grid[r][c].color === this.grid[r][c + 1].color && this.grid[r][c].color === this.grid[r][c + 2].color) {
            var len = 3;
            while (c + len < this.gridCols && this.grid[r][c + len].color === this.grid[r][c].color) len++;
            for (var k = 0; k < len; k++) matched.push({ r: r, c: c + k });
            c += len - 1;
          }
        }
      }
      // Vertical
      for (var c = 0; c < this.gridCols; c++) {
        for (var r = 0; r < this.gridRows - 2; r++) {
          if (this.grid[r][c].color >= 0 && this.grid[r][c].color === this.grid[r + 1][c].color && this.grid[r][c].color === this.grid[r + 2][c].color) {
            var len = 3;
            while (r + len < this.gridRows && this.grid[r + len][c].color === this.grid[r][c].color) len++;
            for (var k = 0; k < len; k++) matched.push({ r: r + k, c: c });
            r += len - 1;
          }
        }
      }

      if (matched.length === 0) return;

      // Remove duplicates
      var seen = {};
      var unique = matched.filter(function (m) {
        var key = m.r + ',' + m.c;
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      });

      // Clear matched cells
      var self = this;
      unique.forEach(function (m) {
        var cell = self.grid[m.r][m.c];
        var cx = self.puzzleOffsetX + m.c * self.puzzleCellSize + self.puzzleCellSize / 2;
        var cy = self.puzzleOffsetY + m.r * self.puzzleCellSize + self.puzzleCellSize / 2;
        self.spawnParticles(cx, cy, self.puzzleColors[cell.color] || '#fff', 4);
        cell.color = -1;
        cell.scale = 0;
      });

      this.addScore(unique.length * 10);
      this.destroyCount += unique.length;
      ZyraAudio.sfxMatch();

      // Drop tiles down
      for (var c = 0; c < this.gridCols; c++) {
        var writeRow = this.gridRows - 1;
        for (var r = this.gridRows - 1; r >= 0; r--) {
          if (this.grid[r][c].color >= 0) {
            if (writeRow !== r) {
              this.grid[writeRow][c].color = this.grid[r][c].color;
              this.grid[writeRow][c].offsetY = -(writeRow - r) * this.puzzleCellSize;
              this.grid[r][c].color = -1;
            }
            writeRow--;
          }
        }
        // Fill top with new tiles
        for (var r = writeRow; r >= 0; r--) {
          this.grid[r][c].color = randInt(0, this.puzzleColors.length - 1);
          this.grid[r][c].scale = 0.5;
          this.grid[r][c].offsetY = -(writeRow - r + 1) * this.puzzleCellSize;
        }
      }

      this.animatingGrid = true;
    },

    renderPuzzle: function (ctx) {
      var self = this;
      var cs = this.puzzleCellSize;
      var pad = 3;

      for (var r = 0; r < this.gridRows; r++) {
        for (var c = 0; c < this.gridCols; c++) {
          var cell = this.grid[r][c];
          if (cell.color < 0) continue;
          var x = this.puzzleOffsetX + c * cs;
          var y = this.puzzleOffsetY + r * cs + (cell.offsetY || 0);
          var s = cell.scale || 1;
          var w = (cs - pad * 2) * s;
          var cx = x + cs / 2;
          var cy = y + cs / 2;

          ctx.fillStyle = this.puzzleColors[cell.color] || '#888';
          this.roundRect(ctx, cx - w / 2, cy - w / 2, w, w, 6);
          ctx.fill();

          // Selected highlight
          if (this.selectedCell && this.selectedCell.r === r && this.selectedCell.c === c) {
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 3;
            this.roundRect(ctx, cx - w / 2 - 2, cy - w / 2 - 2, w + 4, w + 4, 8);
            ctx.stroke();
          }
        }
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // SNAKE GAME
    // ═══════════════════════════════════════════════════════════════════
    initSnake: function (lvl) {
      var s = this.config.settings || {};
      this.snakeCellSize = s.cellSize || 20;
      this.snakeCols = Math.floor(this.WIDTH / this.snakeCellSize);
      this.snakeRows = Math.floor((this.HEIGHT - 100) / this.snakeCellSize);
      this.snakeOffsetY = 80;
      var midC = Math.floor(this.snakeCols / 2);
      var midR = Math.floor(this.snakeRows / 2);
      this.snake = [
        { c: midC, r: midR },
        { c: midC - 1, r: midR },
        { c: midC - 2, r: midR }
      ];
      this.snakeDir = 'right';
      this.snakeNextDir = 'right';
      this.snakeMoveTimer = 0;
      this.snakeMoveInterval = s.moveInterval || 0.15;
      this.snakeFood = null;
      this.spawnSnakeFood();
    },

    spawnSnakeFood: function () {
      var occupied = {};
      this.snake.forEach(function (s) { occupied[s.c + ',' + s.r] = true; });
      var attempts = 0;
      do {
        this.snakeFood = { c: randInt(0, this.snakeCols - 1), r: randInt(0, this.snakeRows - 1) };
        attempts++;
      } while (occupied[this.snakeFood.c + ',' + this.snakeFood.r] && attempts < 100);
    },

    updateSnake: function (dt) {
      // Handle swipe direction changes
      if (this.swipeDir) {
        var d = this.swipeDir;
        if (d === 'up' && this.snakeDir !== 'down') this.snakeNextDir = 'up';
        else if (d === 'down' && this.snakeDir !== 'up') this.snakeNextDir = 'down';
        else if (d === 'left' && this.snakeDir !== 'right') this.snakeNextDir = 'left';
        else if (d === 'right' && this.snakeDir !== 'left') this.snakeNextDir = 'right';
        this.swipeDir = null;
      }

      var lvl = this.getLevelConfig();
      var speedMult = lvl.speedMultiplier || 1;
      var interval = this.snakeMoveInterval / speedMult;
      // Speed up with length
      interval = Math.max(0.05, interval - this.snake.length * 0.002);

      this.snakeMoveTimer += dt;
      if (this.snakeMoveTimer < interval) return;
      this.snakeMoveTimer = 0;

      this.snakeDir = this.snakeNextDir;
      var head = this.snake[0];
      var nc = head.c, nr = head.r;
      if (this.snakeDir === 'up') nr--;
      else if (this.snakeDir === 'down') nr++;
      else if (this.snakeDir === 'left') nc--;
      else if (this.snakeDir === 'right') nc++;

      // Wall collision
      if (nc < 0 || nc >= this.snakeCols || nr < 0 || nr >= this.snakeRows) {
        this.gameOver();
        return;
      }

      // Self collision
      for (var i = 0; i < this.snake.length; i++) {
        if (this.snake[i].c === nc && this.snake[i].r === nr) {
          this.gameOver();
          return;
        }
      }

      this.snake.unshift({ c: nc, r: nr });

      // Food collision
      if (this.snakeFood && nc === this.snakeFood.c && nr === this.snakeFood.r) {
        this.addScore(10);
        this.collectCount++;
        ZyraAudio.sfxEat();
        var fx = this.snakeFood.c * this.snakeCellSize + this.snakeCellSize / 2;
        var fy = this.snakeOffsetY + this.snakeFood.r * this.snakeCellSize + this.snakeCellSize / 2;
        this.spawnParticles(fx, fy, '#FFD700', 6);
        this.spawnSnakeFood();
        // Don't remove tail — snake grows
      } else {
        this.snake.pop();
      }

      // Survival scoring
      this.levelScore = this.collectCount * 10;
      this.score = this.levelScore;
    },

    renderSnake: function (ctx) {
      var cs = this.snakeCellSize;
      var oy = this.snakeOffsetY;
      var self = this;
      var primary = this.config.theme.primary;

      // Grid background
      ctx.fillStyle = rgba(primary, 0.03);
      ctx.fillRect(0, oy, this.snakeCols * cs, this.snakeRows * cs);

      // Grid lines
      ctx.strokeStyle = rgba(primary, 0.06);
      ctx.lineWidth = 0.5;
      for (var c = 0; c <= this.snakeCols; c++) {
        ctx.beginPath();
        ctx.moveTo(c * cs, oy);
        ctx.lineTo(c * cs, oy + this.snakeRows * cs);
        ctx.stroke();
      }
      for (var r = 0; r <= this.snakeRows; r++) {
        ctx.beginPath();
        ctx.moveTo(0, oy + r * cs);
        ctx.lineTo(this.snakeCols * cs, oy + r * cs);
        ctx.stroke();
      }

      // Snake body
      this.snake.forEach(function (seg, i) {
        var alpha = 1 - (i / self.snake.length) * 0.5;
        ctx.fillStyle = rgba(primary, alpha);
        self.roundRect(ctx, seg.c * cs + 1, oy + seg.r * cs + 1, cs - 2, cs - 2, i === 0 ? 6 : 4);
        ctx.fill();
      });

      // Food
      if (this.snakeFood) {
        ctx.beginPath();
        ctx.arc(this.snakeFood.c * cs + cs / 2, oy + this.snakeFood.r * cs + cs / 2, cs / 2 - 2, 0, Math.PI * 2);
        ctx.fillStyle = '#FF6B6B';
        ctx.fill();
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // BREAKOUT GAME
    // ═══════════════════════════════════════════════════════════════════
    initBreakout: function (lvl) {
      var s = this.config.settings || {};
      this.paddle = {
        x: this.WIDTH / 2 - 40,
        y: this.HEIGHT - 60,
        width: s.paddleWidth || 80,
        height: s.paddleHeight || 14,
        color: s.paddleColor || this.config.theme.primary
      };
      this.ball = {
        x: this.WIDTH / 2,
        y: this.HEIGHT - 80,
        radius: s.ballRadius || 8,
        vx: 3 * (Math.random() > 0.5 ? 1 : -1),
        vy: -5,
        color: s.ballColor || '#FFD700',
        speed: s.ballSpeed || 5
      };
      this.bricks = [];
      this.setupBricks(lvl);
    },

    setupBricks: function (lvl) {
      var s = this.config.settings || {};
      var cols = s.brickCols || 8;
      var rows = s.brickRows || 5;
      var brickW = (this.WIDTH - 20) / cols;
      var brickH = 20;
      var startY = 100;
      var colors = (this.config.entityTypes && Object.values(this.config.entityTypes).map(function (et) { return et.color; })) ||
        ['#FF6B6B', '#FBBF24', '#4ECDC4', '#6C5CE7', '#A8E6CF'];

      rows = Math.min(rows + (this.level - 1), 8);

      this.bricks = [];
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var hp = r < 2 ? Math.min(this.level, 3) : 1;
          this.bricks.push({
            x: 10 + c * brickW + 1,
            y: startY + r * (brickH + 3),
            width: brickW - 2,
            height: brickH,
            health: hp,
            maxHealth: hp,
            color: colors[r % colors.length]
          });
        }
      }
    },

    updateBreakout: function (dt) {
      var b = this.ball;
      if (!b) return;
      var lvl = this.getLevelConfig();
      var speedMult = lvl.speedMultiplier || 1;

      b.x += b.vx * speedMult * dt * 60;
      b.y += b.vy * speedMult * dt * 60;

      // Wall bounce
      if (b.x - b.radius < 0) { b.x = b.radius; b.vx = Math.abs(b.vx); }
      if (b.x + b.radius > this.WIDTH) { b.x = this.WIDTH - b.radius; b.vx = -Math.abs(b.vx); }
      if (b.y - b.radius < 0) { b.y = b.radius; b.vy = Math.abs(b.vy); }

      // Bottom — lose life
      if (b.y + b.radius > this.HEIGHT) {
        this.loseLife();
        if (this.lives > 0) {
          b.x = this.paddle.x + this.paddle.width / 2;
          b.y = this.paddle.y - 20;
          b.vx = 3 * (Math.random() > 0.5 ? 1 : -1);
          b.vy = -b.speed;
        }
        return;
      }

      // Paddle bounce
      var p = this.paddle;
      if (b.vy > 0 && b.y + b.radius >= p.y && b.y + b.radius <= p.y + p.height + 5 &&
        b.x >= p.x && b.x <= p.x + p.width) {
        b.vy = -Math.abs(b.vy);
        // Angle based on hit position
        var hitPos = (b.x - p.x) / p.width - 0.5; // -0.5 to 0.5
        b.vx = hitPos * b.speed * 2;
        b.y = p.y - b.radius;
        ZyraAudio.sfxPaddleHit();
      }

      // Brick collision
      for (var i = this.bricks.length - 1; i >= 0; i--) {
        var br = this.bricks[i];
        if (b.x + b.radius > br.x && b.x - b.radius < br.x + br.width &&
          b.y + b.radius > br.y && b.y - b.radius < br.y + br.height) {

          // Determine bounce direction
          var overlapLeft = (b.x + b.radius) - br.x;
          var overlapRight = (br.x + br.width) - (b.x - b.radius);
          var overlapTop = (b.y + b.radius) - br.y;
          var overlapBottom = (br.y + br.height) - (b.y - b.radius);
          var minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
          if (minOverlap === overlapLeft || minOverlap === overlapRight) b.vx = -b.vx;
          else b.vy = -b.vy;

          br.health--;
          ZyraAudio.sfxBrickBreak();
          if (br.health <= 0) {
            this.spawnParticles(br.x + br.width / 2, br.y + br.height / 2, br.color, 6);
            this.addScore(10 * br.maxHealth);
            this.destroyCount++;
            this.bricks.splice(i, 1);

            // Power-up drop
            if (Math.random() < (lvl.powerUpChance || 0.1)) {
              this.spawnPowerUp(br.x + br.width / 2, br.y + br.height / 2);
            }
          }
          break;
        }
      }

      // Win condition: all bricks destroyed
      if (this.bricks.length === 0) {
        this.completeLevel();
      }

      // Update power-ups
      for (var i = this.powerUps.length - 1; i >= 0; i--) {
        var pu = this.powerUps[i];
        pu.y += 2 * dt * 60;
        if (pu.y > this.HEIGHT + 20) { this.powerUps.splice(i, 1); continue; }
        if (pu.x >= p.x && pu.x <= p.x + p.width && pu.y + 12 >= p.y && pu.y <= p.y + p.height) {
          this.powerUps.splice(i, 1);
          this.activatePowerUp(pu.puType);
          ZyraAudio.sfxPowerUp();
        }
      }
    },

    renderBreakout: function (ctx) {
      var self = this;
      // Bricks
      this.bricks.forEach(function (br) {
        var alpha = br.health / br.maxHealth;
        ctx.fillStyle = rgba(br.color, 0.4 + 0.6 * alpha);
        self.roundRect(ctx, br.x, br.y, br.width, br.height, 4);
        ctx.fill();
      });

      // Paddle
      var p = this.paddle;
      if (p) {
        ctx.fillStyle = p.color;
        self.roundRect(ctx, p.x, p.y, p.width, p.height, 7);
        ctx.fill();
      }

      // Ball
      var b = this.ball;
      if (b) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.fill();
        // Glow
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius + 4, 0, Math.PI * 2);
        ctx.fillStyle = rgba(b.color, 0.2);
        ctx.fill();
      }

      // Power-ups
      this.powerUps.forEach(function (pu) {
        ctx.beginPath();
        ctx.arc(pu.x, pu.y, 12, 0, Math.PI * 2);
        ctx.fillStyle = pu.color;
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pu.icon || '?', pu.x, pu.y);
      });
    },

    onTouchMove_breakout: function (x, y) {
      if (this.paddle) {
        this.paddle.x = clamp(x - this.paddle.width / 2, 0, this.WIDTH - this.paddle.width);
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // CATCHER GAME
    // ═══════════════════════════════════════════════════════════════════
    initCatcher: function (lvl) {
      var s = this.config.settings || {};
      this.player = {
        x: this.WIDTH / 2 - (s.playerWidth || 50) / 2,
        y: this.HEIGHT - 80,
        width: s.playerWidth || 50,
        height: s.playerHeight || 40,
        color: s.playerColor || this.config.theme.primary
      };
    },

    updateCatcher: function (dt) {
      var lvl = this.getLevelConfig();
      var spawnRate = (lvl.spawnRate || 1200) / 1000;
      var speedMult = lvl.speedMultiplier || 1;
      var maxItems = lvl.maxEnemies || 8;

      this.spawnTimer += dt;
      if (this.spawnTimer >= spawnRate / speedMult && this.entities.length < maxItems) {
        this.spawnTimer = 0;
        this.spawnCatcherItem(lvl);
      }

      var p = this.player;
      for (var i = this.entities.length - 1; i >= 0; i--) {
        var e = this.entities[i];
        e.y += e.speed * speedMult * dt * 60;
        // Slight sway
        e.x += Math.sin(e.y * 0.02 + e.phase) * 0.5;

        if (e.y > this.HEIGHT + 30) {
          this.entities.splice(i, 1);
          if (e.isGood) {
            // Missed good item
          }
          continue;
        }

        // Catch detection (generous)
        if (e.y + e.height > p.y && e.y < p.y + p.height &&
          e.x + e.width > p.x && e.x < p.x + p.width) {
          this.entities.splice(i, 1);
          if (e.isGood) {
            this.addScore(e.points);
            this.collectCount++;
            ZyraAudio.sfxCoin();
            this.spawnParticles(e.x + e.width / 2, e.y + e.height / 2, e.color, 6);
          } else {
            this.loseLife();
            this.spawnParticles(p.x + p.width / 2, p.y, '#FF0000', 6);
          }
        }
      }
    },

    spawnCatcherItem: function (lvl) {
      var types = lvl.spawnTypes || ['good', 'bad'];
      var typeName = types[randInt(0, types.length - 1)];
      var et = (this.config.entityTypes && this.config.entityTypes[typeName]) || {};
      var isGood = et.isGood !== undefined ? et.isGood : (typeName !== 'bad');
      var w = et.width || 28;

      this.entities.push({
        type: typeName,
        x: rand(10, this.WIDTH - w - 10),
        y: -30,
        width: w,
        height: et.height || 28,
        speed: et.speed || 3,
        color: et.color || (isGood ? '#FFD700' : '#FF4757'),
        emoji: et.emoji || null,
        points: et.points || 10,
        isGood: isGood,
        shape: et.shape || 'circle',
        phase: Math.random() * Math.PI * 2
      });
    },

    renderCatcher: function (ctx) {
      var p = this.player;
      if (!p) return;

      // Basket/character with emoji
      this.drawPlayer(ctx, p);

      var self = this;
      this.entities.forEach(function (e) {
        self.drawEntity(ctx, e.x, e.y, e.width, e.height, e.color, e.shape, e.emoji);
      });
    },

    onTouchMove_catcher: function (x, y) {
      if (this.player) {
        this.player.x = clamp(x - this.player.width / 2, 0, this.WIDTH - this.player.width);
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // PLATFORMER GAME
    // ═══════════════════════════════════════════════════════════════════
    initPlatformer: function (lvl) {
      var s = this.config.settings || {};
      this.player = {
        x: 50,
        y: this.HEIGHT - 150,
        width: s.playerWidth || 28,
        height: s.playerHeight || 36,
        color: s.playerColor || this.config.theme.primary,
        vx: 0,
        vy: 0,
        grounded: false,
        facingRight: true
      };
      this.cameraY = 0;
      this.platforms = [];
      this.coins = [];
      this.obstacles = [];
      this.platformerGroundY = this.HEIGHT - 80;

      // Generate initial platforms
      this.generatePlatformerLevel();
    },

    generatePlatformerLevel: function () {
      this.platforms = [];
      this.coins = [];
      this.obstacles = [];

      // Ground
      this.platforms.push({
        x: 0, y: this.platformerGroundY,
        width: this.WIDTH, height: 20,
        color: rgba(this.config.theme.primary, 0.3),
        isGround: true
      });

      // Generate platforms upward
      var y = this.platformerGroundY - 100;
      var totalPlatforms = 15 + this.level * 5;
      for (var i = 0; i < totalPlatforms; i++) {
        var pw = rand(60, 120);
        var px = rand(0, this.WIDTH - pw);
        this.platforms.push({
          x: px, y: y,
          width: pw, height: 12,
          color: rgba(this.config.theme.primary, 0.5)
        });

        // Coins on platforms
        if (Math.random() < 0.6) {
          this.coins.push({
            x: px + pw / 2,
            y: y - 25,
            radius: 8,
            color: '#FFD700'
          });
        }

        // Obstacles on some platforms
        if (Math.random() < 0.2 && i > 2) {
          this.obstacles.push({
            x: px + rand(5, pw - 25),
            y: y - 20,
            width: 20, height: 20,
            color: '#FF6B6B'
          });
        }

        y -= rand(60, 100);
      }

      // Goal at top
      this.platformerGoalY = y + 50;
      this.coins.push({
        x: this.WIDTH / 2,
        y: y + 30,
        radius: 15,
        color: '#FFD700',
        isGoal: true
      });
    },

    updatePlatformer: function (dt) {
      var p = this.player;
      var gravity = 0.5;
      var moveSpeed = 4;
      var jumpForce = -11;

      // Horizontal movement
      p.vx = 0;
      if (this.touchActive) {
        if (this.touchX < this.WIDTH / 2) { p.vx = -moveSpeed; p.facingRight = false; }
        else { p.vx = moveSpeed; p.facingRight = true; }
      }
      if (this.keyLeft) { p.vx = -moveSpeed; p.facingRight = false; }
      if (this.keyRight) { p.vx = moveSpeed; p.facingRight = true; }

      // Jump on swipe up
      if (p.grounded && (this.swipeDir === 'up' || this.keyJump)) {
        p.vy = jumpForce;
        p.grounded = false;
        ZyraAudio.sfxJump();
      }
      this.swipeDir = null;

      // Physics
      p.vy += gravity;
      p.x += p.vx;
      p.y += p.vy;

      // Wrap horizontally
      if (p.x + p.width < 0) p.x = this.WIDTH;
      if (p.x > this.WIDTH) p.x = -p.width;

      // Platform collision
      p.grounded = false;
      for (var i = 0; i < this.platforms.length; i++) {
        var pl = this.platforms[i];
        if (p.vy >= 0 && p.x + p.width > pl.x && p.x < pl.x + pl.width &&
          p.y + p.height >= pl.y && p.y + p.height <= pl.y + 15) {
          p.y = pl.y - p.height;
          p.vy = 0;
          p.grounded = true;
        }
      }

      // Fall death
      if (p.y > this.cameraY + this.HEIGHT + 100) {
        this.loseLife();
        if (this.lives > 0) {
          p.x = 50;
          p.y = this.platformerGroundY - p.height;
          p.vy = 0;
          this.cameraY = 0;
        }
        return;
      }

      // Camera follows player upward
      var targetCam = p.y - this.HEIGHT * 0.4;
      if (targetCam < this.cameraY) {
        this.cameraY = lerp(this.cameraY, targetCam, 0.1);
      }

      // Coin collection
      for (var i = this.coins.length - 1; i >= 0; i--) {
        var c = this.coins[i];
        if (dist(p.x + p.width / 2, p.y + p.height / 2, c.x, c.y) < c.radius + 15) {
          if (c.isGoal) {
            this.completeLevel();
            return;
          }
          this.coins.splice(i, 1);
          this.addScore(10);
          this.collectCount++;
          ZyraAudio.sfxCoin();
          this.spawnParticles(c.x, c.y, c.color, 6);
        }
      }

      // Obstacle collision
      for (var i = this.obstacles.length - 1; i >= 0; i--) {
        var o = this.obstacles[i];
        if (this.aabb(p, o)) {
          this.loseLife();
          this.spawnParticles(p.x + p.width / 2, p.y + p.height / 2, '#FF0000', 8);
          this.obstacles.splice(i, 1);
          break;
        }
      }
    },

    renderPlatformer: function (ctx) {
      var p = this.player;
      if (!p) return;
      var self = this;
      var camY = this.cameraY;

      ctx.save();
      ctx.translate(0, -camY);

      // Platforms
      this.platforms.forEach(function (pl) {
        ctx.fillStyle = pl.color;
        self.roundRect(ctx, pl.x, pl.y, pl.width, pl.height, pl.isGround ? 0 : 4);
        ctx.fill();
      });

      // Coins with emoji
      this.coins.forEach(function (c) {
        if (c.isGoal) {
          ctx.font = (c.radius * 2.5) + 'px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🏆', c.x, c.y);
        } else {
          ctx.font = (c.radius * 2) + 'px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🪙', c.x, c.y);
        }
      });

      // Obstacles with emoji
      var obstEmoji = (self.config.entityTypes && self.config.entityTypes.basic && self.config.entityTypes.basic.emoji) || null;
      this.obstacles.forEach(function (o) {
        self.drawEntity(ctx, o.x, o.y, o.width, o.height, o.color, 'rect', obstEmoji);
      });

      // Player with emoji
      this.drawPlayer(ctx, p);

      ctx.restore();
    },

    // ═══════════════════════════════════════════════════════════════════
    // PHYSICS GAME (simple built-in physics, no planck dependency)
    // ═══════════════════════════════════════════════════════════════════
    initPhysics: function (lvl) {
      var s = this.config.settings || {};
      this.physicsMode = this.config.physicsMode || 'topdown';
      this.physicsBodies = [];
      this.physicsGravity = s.gravity || { x: 0, y: this.physicsMode === 'topdown' ? 0 : 500 };
      this.physicsDamping = s.linearDamping || (this.physicsMode === 'topdown' ? 1.5 : 0.01);
      this.aimLine = null;

      if (this.physicsMode === 'topdown') {
        this.initBilliards(s);
      } else if (this.physicsMode === 'launch') {
        this.initLauncher(s);
      } else {
        this.initBounce(s);
      }
    },

    initBilliards: function (s) {
      var ballR = s.ballRadius || 10;
      var pocketR = s.pocketRadius || 18;

      // Table dimensions
      this.tableMargin = 30;
      this.tableTop = 100;
      this.tableWidth = this.WIDTH - this.tableMargin * 2;
      this.tableHeight = this.HEIGHT - this.tableTop - 100;
      this.tableBottom = this.tableTop + this.tableHeight;

      // Pockets
      var tm = this.tableMargin;
      var tt = this.tableTop;
      var tw = this.tableWidth;
      var th = this.tableHeight;
      this.pockets = (this.config.entities && this.config.entities.pockets) || [
        { x: tm, y: tt },
        { x: tm + tw / 2, y: tt - 5 },
        { x: tm + tw, y: tt },
        { x: tm, y: tt + th },
        { x: tm + tw / 2, y: tt + th + 5 },
        { x: tm + tw, y: tt + th }
      ];
      this.pocketRadius = pocketR;

      // Balls
      this.physicsBodies = [];
      var balls = (this.config.entities && this.config.entities.balls) || [];
      if (balls.length === 0) {
        // Default: cue ball + triangle rack with REAL pool ball colors
        balls = [{ x: this.WIDTH / 2, y: this.tableBottom - 120, color: '#FFFFFF', type: 'cue' }];
        var rackX = this.WIDTH / 2;
        var rackY = this.tableTop + this.tableHeight * 0.35;
        // Real pool ball colors: 1-7 solids, 8 black, 9-15 stripes
        var poolBalls = [
          { color: '#FFD700', stripe: false }, // 1 Yellow
          { color: '#0000CC', stripe: false }, // 2 Blue
          { color: '#DD0000', stripe: false }, // 3 Red
          { color: '#6B0080', stripe: false }, // 4 Purple
          { color: '#FF6600', stripe: false }, // 5 Orange
          { color: '#006400', stripe: false }, // 6 Green
          { color: '#8B0000', stripe: false }, // 7 Maroon
          { color: '#111111', stripe: false }, // 8 Black (8-ball)
          { color: '#FFD700', stripe: true  }, // 9 Yellow stripe
          { color: '#0000CC', stripe: true  }, // 10 Blue stripe
          { color: '#DD0000', stripe: true  }, // 11 Red stripe
          { color: '#6B0080', stripe: true  }, // 12 Purple stripe
          { color: '#FF6600', stripe: true  }, // 13 Orange stripe
          { color: '#006400', stripe: true  }, // 14 Green stripe
          { color: '#8B0000', stripe: true  }, // 15 Maroon stripe
        ];
        var ballCount = Math.min((this.getLevelConfig().ballCount || 6), 15);
        var row = 0, col = 0, maxInRow = 1;
        for (var i = 0; i < ballCount && i < poolBalls.length; i++) {
          balls.push({
            x: rackX + (col - (maxInRow - 1) / 2) * (ballR * 2.2),
            y: rackY + row * (ballR * 2),
            color: poolBalls[i].color,
            stripe: poolBalls[i].stripe,
            type: i === 7 ? 'eight' : (poolBalls[i].stripe ? 'stripe' : 'solid'),
            number: i + 1
          });
          col++;
          if (col >= maxInRow) { col = 0; row++; maxInRow++; }
        }
      }

      var self = this;
      balls.forEach(function (b) {
        self.physicsBodies.push({
          x: b.x, y: b.y,
          vx: 0, vy: 0,
          radius: ballR,
          color: b.color || '#FFD700',
          type: b.type || 'solid',
          number: b.number || 0,
          mass: s.ballDensity || 1,
          restitution: s.ballRestitution || 0.95,
          friction: s.ballFriction || 0.4,
          active: true
        });
      });

      this.cueBall = this.physicsBodies[0];
      this.waitingForShot = true;
    },

    initLauncher: function (s) {
      // Angry birds style
      this.launchX = 80;
      this.launchY = this.HEIGHT - 200;
      this.physicsBodies = [];
      this.physicsTargets = [];

      // Create targets (blocks to knock over)
      var targetX = this.WIDTH - 120;
      var colors = ['#FF6B6B', '#FBBF24', '#4ECDC4'];
      for (var i = 0; i < 5 + this.level; i++) {
        this.physicsTargets.push({
          x: targetX + rand(-30, 30),
          y: this.HEIGHT - 100 - i * 30,
          width: 30, height: 25,
          vx: 0, vy: 0,
          color: colors[i % colors.length],
          health: 1,
          mass: 0.5,
          active: true
        });
      }

      this.launchReady = true;
      this.shotsLeft = s.maxShots || 5;
    },

    initBounce: function (s) {
      // Simple bouncing balls
      this.physicsBodies = [];
      for (var i = 0; i < (s.ballCount || 5); i++) {
        this.physicsBodies.push({
          x: rand(50, this.WIDTH - 50),
          y: rand(100, this.HEIGHT / 2),
          vx: rand(-100, 100),
          vy: rand(-50, 50),
          radius: rand(10, 25),
          color: ['#FF6B6B', '#4ECDC4', '#FFD93D', '#6C5CE7', '#A8E6CF'][i % 5],
          mass: 1,
          restitution: s.ballRestitution || 0.9,
          active: true
        });
      }
    },

    updatePhysics: function (dt) {
      if (this.physicsMode === 'topdown') this.updateBilliards(dt);
      else if (this.physicsMode === 'launch') this.updateLauncher(dt);
      else this.updateBounce(dt);
    },

    updateBilliards: function (dt) {
      var damping = this.physicsDamping;
      var self = this;
      var allStopped = true;

      this.physicsBodies.forEach(function (b) {
        if (!b.active) return;
        var speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (speed > 0.5) {
          allStopped = false;
          // Apply damping
          var df = Math.pow(0.99, damping * dt * 60);
          b.vx *= df;
          b.vy *= df;

          b.x += b.vx * dt;
          b.y += b.vy * dt;

          // Wall bounces
          var cushionR = (self.config.settings || {}).cushionRestitution || 0.8;
          if (b.x - b.radius < self.tableMargin) { b.x = self.tableMargin + b.radius; b.vx = Math.abs(b.vx) * cushionR; }
          if (b.x + b.radius > self.tableMargin + self.tableWidth) { b.x = self.tableMargin + self.tableWidth - b.radius; b.vx = -Math.abs(b.vx) * cushionR; }
          if (b.y - b.radius < self.tableTop) { b.y = self.tableTop + b.radius; b.vy = Math.abs(b.vy) * cushionR; }
          if (b.y + b.radius > self.tableBottom) { b.y = self.tableBottom - b.radius; b.vy = -Math.abs(b.vy) * cushionR; }

          // Stop if very slow
          if (speed < 1) { b.vx = 0; b.vy = 0; }
        } else {
          b.vx = 0; b.vy = 0;
        }

        // Pocket check
        self.pockets.forEach(function (pk) {
          if (dist(b.x, b.y, pk.x, pk.y) < self.pocketRadius) {
            if (b.type === 'cue') {
              // Foul — reset cue ball
              b.x = self.WIDTH / 2;
              b.y = self.tableBottom - 120;
              b.vx = 0; b.vy = 0;
            } else {
              b.active = false;
              self.addScore(20);
              self.collectCount++;
              self.sfx('score');
              self.spawnParticles(pk.x, pk.y, b.color, 8);
            }
          }
        });
      });

      // Ball-ball collision
      for (var i = 0; i < this.physicsBodies.length; i++) {
        for (var j = i + 1; j < this.physicsBodies.length; j++) {
          var a = this.physicsBodies[i], b = this.physicsBodies[j];
          if (!a.active || !b.active) continue;
          this.resolveCircleCollision(a, b);
        }
      }

      if (allStopped) {
        this.waitingForShot = true;
      }

      // Check if all target balls pocketed
      var remaining = this.physicsBodies.filter(function (b) { return b.active && b.type !== 'cue'; });
      if (remaining.length === 0) {
        this.completeLevel();
      }
    },

    resolveCircleCollision: function (a, b) {
      var dx = b.x - a.x, dy = b.y - a.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      var minD = a.radius + b.radius;
      if (d < minD && d > 0) {
        // Separate
        var overlap = minD - d;
        var nx = dx / d, ny = dy / d;
        a.x -= nx * overlap * 0.5;
        a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5;
        b.y += ny * overlap * 0.5;

        // Elastic collision
        var dvx = a.vx - b.vx, dvy = a.vy - b.vy;
        var dvn = dvx * nx + dvy * ny;
        if (dvn > 0) {
          var restitution = Math.min(a.restitution || 0.95, b.restitution || 0.95);
          a.vx -= dvn * nx * restitution;
          a.vy -= dvn * ny * restitution;
          b.vx += dvn * nx * restitution;
          b.vy += dvn * ny * restitution;
          ZyraAudio.sfxBounce();
        }
      }
    },

    updateLauncher: function (dt) {
      var gravity = this.physicsGravity;

      // Update launched ball
      this.physicsBodies.forEach(function (b) {
        if (!b.active) return;
        b.vx += gravity.x * dt;
        b.vy += gravity.y * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      });

      // Update targets
      var self = this;
      this.physicsTargets.forEach(function (t) {
        if (!t.active) return;
        t.vy += gravity.y * dt;
        t.x += t.vx * dt;
        t.y += t.vy * dt;

        // Ground
        if (t.y + t.height > self.HEIGHT - 60) {
          t.y = self.HEIGHT - 60 - t.height;
          t.vy = -t.vy * 0.3;
          t.vx *= 0.8;
          if (Math.abs(t.vy) < 10) t.vy = 0;
        }
      });

      // Ball-target collision
      for (var i = this.physicsBodies.length - 1; i >= 0; i--) {
        var b = this.physicsBodies[i];
        if (!b.active) continue;

        // Off screen
        if (b.y > this.HEIGHT + 50 || b.x > this.WIDTH + 50 || b.x < -50) {
          b.active = false;
          continue;
        }

        for (var j = this.physicsTargets.length - 1; j >= 0; j--) {
          var t = this.physicsTargets[j];
          if (!t.active) continue;
          // Circle-rect collision
          var cx = clamp(b.x, t.x, t.x + t.width);
          var cy = clamp(b.y, t.y, t.y + t.height);
          if (dist(b.x, b.y, cx, cy) < b.radius) {
            t.vx += b.vx * 0.5;
            t.vy += b.vy * 0.5;
            t.health--;
            if (t.health <= 0) {
              t.active = false;
              this.addScore(20);
              this.destroyCount++;
              ZyraAudio.sfxDestroy();
              this.spawnParticles(t.x + t.width / 2, t.y + t.height / 2, t.color, 8);
            }
            b.active = false;
            break;
          }
        }
      }

      // Check win
      var remaining = this.physicsTargets.filter(function (t) { return t.active; });
      if (remaining.length === 0) {
        this.completeLevel();
      }

      // Check lose
      var activeBalls = this.physicsBodies.filter(function (b) { return b.active; });
      if (activeBalls.length === 0 && remaining.length > 0 && this.shotsLeft <= 0) {
        this.gameOver();
      }
    },

    updateBounce: function (dt) {
      var gravity = this.physicsGravity;
      var self = this;

      this.physicsBodies.forEach(function (b) {
        if (!b.active) return;
        b.vx += gravity.x * dt;
        b.vy += gravity.y * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // Wall bounce
        if (b.x - b.radius < 0) { b.x = b.radius; b.vx = Math.abs(b.vx) * b.restitution; }
        if (b.x + b.radius > self.WIDTH) { b.x = self.WIDTH - b.radius; b.vx = -Math.abs(b.vx) * b.restitution; }
        if (b.y - b.radius < 80) { b.y = 80 + b.radius; b.vy = Math.abs(b.vy) * b.restitution; }
        if (b.y + b.radius > self.HEIGHT - 20) { b.y = self.HEIGHT - 20 - b.radius; b.vy = -Math.abs(b.vy) * b.restitution; }
      });

      // Ball-ball collision
      for (var i = 0; i < this.physicsBodies.length; i++) {
        for (var j = i + 1; j < this.physicsBodies.length; j++) {
          this.resolveCircleCollision(this.physicsBodies[i], this.physicsBodies[j]);
        }
      }

      // Score from tapping balls
      this.levelScore = this.collectCount * 10;
    },

    renderPhysics: function (ctx) {
      if (this.physicsMode === 'topdown') this.renderBilliards(ctx);
      else if (this.physicsMode === 'launch') this.renderLauncher(ctx);
      else this.renderBounce(ctx);
    },

    renderBilliards: function (ctx) {
      var s = this.config.settings || {};
      // Table
      ctx.fillStyle = s.tableColor || '#0B6623';
      this.roundRect(ctx, this.tableMargin - 10, this.tableTop - 10, this.tableWidth + 20, this.tableHeight + 20, 10);
      ctx.fill();
      // Cushions
      ctx.strokeStyle = s.cushionColor || '#8B4513';
      ctx.lineWidth = 10;
      this.roundRect(ctx, this.tableMargin - 5, this.tableTop - 5, this.tableWidth + 10, this.tableHeight + 10, 8);
      ctx.stroke();
      // Playing surface
      ctx.fillStyle = s.tableColor || '#0B6623';
      ctx.fillRect(this.tableMargin, this.tableTop, this.tableWidth, this.tableHeight);

      // Pockets
      var self = this;
      this.pockets.forEach(function (pk) {
        ctx.beginPath();
        ctx.arc(pk.x, pk.y, self.pocketRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#000';
        ctx.fill();
      });

      // Balls — rendered as realistic pool balls
      var ballR = (this.config.settings || {}).ballRadius || 10;
      this.physicsBodies.forEach(function (b) {
        if (!b.active) return;
        var r = b.radius;

        if (b.type === 'cue') {
          // Cue ball — pure white with shine
          ctx.beginPath();
          ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
          var cueGrad = ctx.createRadialGradient(b.x - r * 0.3, b.y - r * 0.3, r * 0.1, b.x, b.y, r);
          cueGrad.addColorStop(0, '#FFFFFF');
          cueGrad.addColorStop(1, '#DDDDDD');
          ctx.fillStyle = cueGrad;
          ctx.fill();
          ctx.strokeStyle = '#BBBBBB';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        } else if (b.stripe) {
          // Stripe ball — white body with colored stripe band through middle
          // White base
          ctx.beginPath();
          ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
          var stripeBaseGrad = ctx.createRadialGradient(b.x - r * 0.3, b.y - r * 0.3, 0, b.x, b.y, r);
          stripeBaseGrad.addColorStop(0, '#FFFFFF');
          stripeBaseGrad.addColorStop(1, '#E8E8E8');
          ctx.fillStyle = stripeBaseGrad;
          ctx.fill();
          // Colored stripe band (horizontal band across middle)
          ctx.save();
          ctx.beginPath();
          ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillStyle = b.color;
          ctx.fillRect(b.x - r, b.y - r * 0.5, r * 2, r * 1);
          ctx.restore();
          // Number circle in center
          ctx.beginPath();
          ctx.arc(b.x, b.y, r * 0.38, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
          if (b.number) {
            ctx.fillStyle = '#000000';
            ctx.font = 'bold ' + Math.max(7, Math.round(r * 0.7)) + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(b.number), b.x, b.y + 0.5);
          }
        } else {
          // Solid ball — full color with gradient shine
          ctx.beginPath();
          ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
          var solidGrad = ctx.createRadialGradient(b.x - r * 0.3, b.y - r * 0.3, 0, b.x, b.y, r);
          solidGrad.addColorStop(0, lighten(b.color, 50));
          solidGrad.addColorStop(0.7, b.color);
          solidGrad.addColorStop(1, b.color === '#111111' ? '#000000' : b.color);
          ctx.fillStyle = solidGrad;
          ctx.fill();
          // Number circle in center
          ctx.beginPath();
          ctx.arc(b.x, b.y, r * 0.38, 0, Math.PI * 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fill();
          if (b.number) {
            ctx.fillStyle = '#000000';
            ctx.font = 'bold ' + Math.max(7, Math.round(r * 0.7)) + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(b.number), b.x, b.y + 0.5);
          }
        }

        // Glossy shine highlight on all balls
        ctx.beginPath();
        ctx.arc(b.x - r * 0.25, b.y - r * 0.25, r * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fill();
      });

      // Aim line
      if (this.aimLine && this.waitingForShot) {
        ctx.beginPath();
        ctx.moveTo(this.aimLine.x1, this.aimLine.y1);
        ctx.lineTo(this.aimLine.x2, this.aimLine.y2);
        ctx.strokeStyle = rgba('#FFFFFF', 0.4);
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        // Power indicator
        var power = Math.min(dist(this.aimLine.x1, this.aimLine.y1, this.aimLine.x2, this.aimLine.y2) / 150, 1);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(power * 100) + '%', this.aimLine.x1, this.aimLine.y1 + this.cueBall.radius + 18);
      }
    },

    renderLauncher: function (ctx) {
      // Ground
      ctx.fillStyle = rgba(this.config.theme.primary, 0.15);
      ctx.fillRect(0, this.HEIGHT - 60, this.WIDTH, 60);

      // Launch point
      ctx.beginPath();
      ctx.arc(this.launchX, this.launchY, 20, 0, Math.PI * 2);
      ctx.fillStyle = rgba(this.config.theme.primary, 0.3);
      ctx.fill();

      // Targets
      var self = this;
      this.physicsTargets.forEach(function (t) {
        if (!t.active) return;
        self.drawEntity(ctx, t.x, t.y, t.width, t.height, t.color, 'rect');
      });

      // Launched balls
      this.physicsBodies.forEach(function (b) {
        if (!b.active) return;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = self.config.theme.primary;
        ctx.fill();
      });

      // Aim line
      if (this.aimLine && this.launchReady) {
        ctx.beginPath();
        ctx.moveTo(this.launchX, this.launchY);
        ctx.lineTo(this.aimLine.x2, this.aimLine.y2);
        ctx.strokeStyle = rgba(this.config.theme.primary, 0.5);
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Shots remaining
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Shots: ' + this.shotsLeft, 10, this.HEIGHT - 20);
    },

    renderBounce: function (ctx) {
      this.physicsBodies.forEach(function (b) {
        if (!b.active) return;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        var grad = ctx.createRadialGradient(b.x - b.radius * 0.3, b.y - b.radius * 0.3, 0, b.x, b.y, b.radius);
        grad.addColorStop(0, lighten(b.color, 50));
        grad.addColorStop(1, b.color);
        ctx.fillStyle = grad;
        ctx.fill();
      });
    },

    onTouchDown_physics: function (x, y) {
      if (this.physicsMode === 'topdown') {
        if (this.waitingForShot && this.cueBall && this.cueBall.active) {
          this.aimLine = { x1: this.cueBall.x, y1: this.cueBall.y, x2: x, y2: y };
        }
      } else if (this.physicsMode === 'launch') {
        if (this.launchReady && this.shotsLeft > 0) {
          this.aimLine = { x2: x, y2: y };
        }
      } else {
        // Bounce — tap to add force to nearest ball
        var nearest = null, minD = Infinity;
        this.physicsBodies.forEach(function (b) {
          if (!b.active) return;
          var d = dist(x, y, b.x, b.y);
          if (d < minD) { minD = d; nearest = b; }
        });
        if (nearest && minD < nearest.radius + 30) {
          nearest.vy -= 200;
          nearest.vx += (nearest.x - x) * 3;
          this.addScore(5);
          this.collectCount++;
          ZyraAudio.sfxTap();
        }
      }
    },

    onTouchMove_physics: function (x, y) {
      if (this.aimLine) {
        this.aimLine.x2 = x;
        this.aimLine.y2 = y;
      }
    },

    onTouchUp_physics: function (x, y) {
      if (this.physicsMode === 'topdown' && this.aimLine && this.waitingForShot && this.cueBall) {
        var maxPower = ((this.config.settings || {}).maxPower || 8) * 100;
        var dx = this.cueBall.x - x;
        var dy = this.cueBall.y - y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > 10) {
          var power = Math.min(d / 150, 1) * maxPower;
          this.cueBall.vx = (dx / d) * power;
          this.cueBall.vy = (dy / d) * power;
          this.waitingForShot = false;
          ZyraAudio.sfxCueHit();
        }
        this.aimLine = null;
      } else if (this.physicsMode === 'launch' && this.aimLine && this.launchReady && this.shotsLeft > 0) {
        var dx = this.launchX - x;
        var dy = this.launchY - y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > 20) {
          var power = Math.min(d / 100, 1) * 600;
          this.physicsBodies.push({
            x: this.launchX, y: this.launchY,
            vx: (dx / d) * power,
            vy: (dy / d) * power,
            radius: 12,
            mass: 1,
            restitution: 0.6,
            active: true
          });
          this.shotsLeft--;
          ZyraAudio.sfxShoot();
        }
        this.aimLine = null;
      }
    },

    // ═══════════════════════════════════════════════════════════════════
    // TOUCH DISPATCH
    // ═══════════════════════════════════════════════════════════════════
    onTouchDown: function (x, y) {
      var type = this.config.type;
      if (type === 'tap') this.onTouchDown_tap(x, y);
      else if (type === 'puzzle') this.onTouchDown_puzzle(x, y);
      else if (type === 'physics') this.onTouchDown_physics(x, y);
    },

    onTouchMove: function (x, y) {
      var type = this.config.type;
      if (type === 'dodge') this.onTouchMove_dodge(x, y);
      else if (type === 'shooter') this.onTouchMove_shooter(x, y);
      else if (type === 'breakout') this.onTouchMove_breakout(x, y);
      else if (type === 'catcher') this.onTouchMove_catcher(x, y);
      else if (type === 'physics') this.onTouchMove_physics(x, y);
    },

    onTouchUp: function (x, y) {
      var type = this.config.type;
      if (type === 'physics') this.onTouchUp_physics(x, y);
    },

    // ═══════════════════════════════════════════════════════════════════
    // BOSS SYSTEM
    // ═══════════════════════════════════════════════════════════════════
    updateBoss: function (dt) {
      if (!this.boss || !this.boss.active) return;
      var b = this.boss;
      var lvl = this.getLevelConfig();
      var bossConfig = lvl.boss || {};
      var patterns = bossConfig.patterns || ['spread_shot'];
      var patternDur = bossConfig.patternDuration || 3;
      var pauseDur = bossConfig.pauseDuration || 1.5;

      this.bossPatternTimer += dt;

      // Boss movement — oscillate
      b.x = this.WIDTH / 2 - b.width / 2 + Math.sin(this.gameTime * 1.5) * (this.WIDTH / 2 - b.width);
      b.y = lerp(b.y, 80, 0.02);

      // Pattern execution
      var totalCycle = patternDur + pauseDur;
      var cycleTime = this.bossPatternTimer % totalCycle;
      var patternIdx = Math.floor(this.bossPatternTimer / totalCycle) % patterns.length;

      if (cycleTime < patternDur) {
        var pattern = patterns[patternIdx];
        if (pattern === 'spread_shot') {
          if (Math.random() < dt * 2) {
            for (var a = -2; a <= 2; a++) {
              this.enemyProjectiles.push({
                x: b.x + b.width / 2,
                y: b.y + b.height,
                width: 6, height: 6,
                vx: a * 2,
                vy: 4,
                color: b.color
              });
            }
          }
        } else if (pattern === 'charge') {
          b.y = lerp(b.y, this.HEIGHT / 2, 0.05);
        } else if (pattern === 'spawn_minions') {
          if (Math.random() < dt * 0.5 && this.entities.length < 3) {
            this.spawnShooterEnemy(lvl);
          }
        }
      }
    },

    spawnBoss: function (lvl) {
      var bossConfig = lvl.boss;
      if (!bossConfig) return;
      ZyraAudio.sfxBossAppear();
      this.boss = {
        x: this.WIDTH / 2 - (bossConfig.width || 100) / 2,
        y: -80,
        width: bossConfig.width || 100,
        height: bossConfig.height || 60,
        color: bossConfig.color || '#FF4757',
        health: bossConfig.health || 15,
        maxHealth: bossConfig.health || 15,
        active: true,
        name: bossConfig.name || 'BOSS'
      };
    },

    renderBossBar: function (ctx) {
      if (!this.boss || !this.boss.active) return;
      var b = this.boss;
      var barW = this.WIDTH - 40;
      var barH = 8;
      var barX = 20;
      var barY = this.HEIGHT - 30;

      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      this.roundRect(ctx, barX, barY, barW, barH, 4);
      ctx.fill();

      var pct = b.health / b.maxHealth;
      ctx.fillStyle = pct > 0.3 ? b.color : '#FF0000';
      this.roundRect(ctx, barX, barY, barW * pct, barH, 4);
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, this.WIDTH / 2, barY - 4);
    },

    // ═══════════════════════════════════════════════════════════════════
    // POWER-UP SYSTEM
    // ═══════════════════════════════════════════════════════════════════
    spawnPowerUp: function (x, y) {
      var puConfig = this.config.powerUps || {};
      var types = Object.keys(puConfig);
      if (types.length === 0) {
        types = ['shield', 'rapid'];
        puConfig = {
          shield: { color: '#00D4FF', icon: 'S', duration: 8 },
          rapid: { color: '#FFD700', icon: 'R', duration: 5 }
        };
      }
      var puType = types[randInt(0, types.length - 1)];
      var pu = puConfig[puType];
      this.powerUps.push({
        x: x - 12, y: y,
        width: 24, height: 24,
        puType: puType,
        color: pu.color || '#FFD700',
        icon: pu.icon || '?',
        emoji: pu.emoji || null
      });
    },

    activatePowerUp: function (type) {
      var puConfig = this.config.powerUps || {};
      var pu = puConfig[type] || {};
      var duration = pu.duration || 5;

      if (type === 'extra_life') {
        this.lives++;
        ZyraAudio.sfxCoin();
        return;
      }
      if (type === 'shield') ZyraAudio.sfxShield();
      this.activePowerUps[type] = duration;
    },

    renderPowerUpIndicators: function (ctx) {
      var self = this;
      var y = 90;
      Object.keys(this.activePowerUps).forEach(function (k) {
        var t = self.activePowerUps[k];
        var puConfig = (self.config.powerUps || {})[k] || {};
        ctx.fillStyle = rgba(puConfig.color || '#FFD700', 0.8);
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText((puConfig.icon || k) + ' ' + Math.ceil(t) + 's', self.WIDTH - 14, y);
        y += 16;
      });
    },

    // ═══════════════════════════════════════════════════════════════════
    // PARTICLE SYSTEM
    // ═══════════════════════════════════════════════════════════════════
    spawnParticles: function (x, y, color, count) {
      for (var i = 0; i < count; i++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = rand(30, 120);
        this.particles.push({
          x: x, y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: rand(0.3, 0.8),
          maxLife: rand(0.3, 0.8),
          radius: rand(2, 5),
          color: color
        });
      }
    },

    updateParticles: function (dt) {
      for (var i = this.particles.length - 1; i >= 0; i--) {
        var p = this.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 150 * dt; // gravity
        p.life -= dt;
        if (p.life <= 0) this.particles.splice(i, 1);
      }
    },

    renderParticles: function (ctx) {
      this.particles.forEach(function (p) {
        var alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * alpha, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    },

    // ═══════════════════════════════════════════════════════════════════
    // COLLISION HELPERS
    // ═══════════════════════════════════════════════════════════════════
    aabb: function (a, b) {
      return a.x < b.x + b.width && a.x + a.width > b.x &&
        a.y < b.y + b.height && a.y + a.height > b.y;
    },

    // ═══════════════════════════════════════════════════════════════════
    // DRAWING HELPERS
    // ═══════════════════════════════════════════════════════════════════
    roundRect: function (ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    },

    drawEntity: function (ctx, x, y, w, h, color, shape, emoji) {
      if (emoji) {
        // Draw emoji as sprite — much more visually appealing than plain shapes
        ctx.font = Math.max(w, h) + 'px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, x + w / 2, y + h / 2);
      } else if (shape === 'circle') {
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
        var grad = ctx.createRadialGradient(x + w * 0.35, y + h * 0.35, 0, x + w / 2, y + h / 2, Math.min(w, h) / 2);
        grad.addColorStop(0, lighten(color, 40));
        grad.addColorStop(1, color);
        ctx.fillStyle = grad;
        ctx.fill();
      } else if (shape === 'triangle-up') {
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        ctx.fillStyle = color;
        this.roundRect(ctx, x, y, w, h, Math.min(w, h) * 0.2);
        ctx.fill();
      }
    },

    // Draw player with emoji if configured
    drawPlayer: function (ctx, p) {
      var emoji = (this.config.settings && this.config.settings.playerEmoji) || null;
      if (emoji) {
        ctx.font = Math.max(p.width, p.height) * 1.2 + 'px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, p.x + p.width / 2, p.y + p.height / 2);
      } else {
        ctx.fillStyle = p.color;
        this.roundRect(ctx, p.x, p.y, p.width, p.height, 6);
        ctx.fill();
      }
    },

    // ─── THEMED BACKGROUNDS ──────────────────────────────────────────
    _bgStars: null,
    _bgClouds: null,

    drawBackground: function (ctx, W, H) {
      var bgType = (this.config.theme && this.config.theme.backgroundType) || 'plain';

      if (bgType === 'starfield') {
        // Twinkling star field
        if (!this._bgStars) {
          this._bgStars = [];
          for (var i = 0; i < 80; i++) {
            this._bgStars.push({ x: rand(0, W), y: rand(0, H), r: rand(0.5, 2.5), b: rand(0.3, 1), s: rand(0.5, 2) });
          }
        }
        for (var i = 0; i < this._bgStars.length; i++) {
          var s = this._bgStars[i];
          var twinkle = 0.5 + 0.5 * Math.sin(this.gameTime * s.s + i);
          ctx.globalAlpha = s.b * twinkle;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

      } else if (bgType === 'clouds') {
        // Floating cloud puffs
        if (!this._bgClouds) {
          this._bgClouds = [];
          for (var i = 0; i < 6; i++) {
            this._bgClouds.push({ x: rand(0, W), y: rand(40, H * 0.4), w: rand(60, 140), h: rand(25, 45), s: rand(0.2, 0.6) });
          }
        }
        for (var i = 0; i < this._bgClouds.length; i++) {
          var c = this._bgClouds[i];
          c.x -= c.s * 0.5;
          if (c.x + c.w < -20) c.x = W + 20;
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          ctx.beginPath();
          ctx.ellipse(c.x + c.w / 2, c.y, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }

      } else if (bgType === 'grid') {
        // Neon grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        var gs = 40;
        for (var x = 0; x < W; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (var y = 0; y < H; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      } else if (bgType === 'mountains' || bgType === 'forest') {
        // Layered mountain silhouettes
        var c1 = this.config.theme.backgroundAlt || '#1a1a3e';
        var layers = [
          { y: H * 0.55, a: 0.3, h: 120, n: 5 },
          { y: H * 0.65, a: 0.2, h: 80, n: 7 },
          { y: H * 0.75, a: 0.1, h: 50, n: 9 }
        ];
        for (var l = 0; l < layers.length; l++) {
          var layer = layers[l];
          ctx.fillStyle = rgba(c1, layer.a + 0.1);
          ctx.beginPath();
          ctx.moveTo(0, H);
          for (var i = 0; i <= layer.n; i++) {
            var px = (i / layer.n) * W;
            var py = layer.y + Math.sin(i * 2.5 + l * 1.3) * layer.h;
            if (i === 0) ctx.lineTo(0, py);
            else ctx.lineTo(px, py);
          }
          ctx.lineTo(W, H);
          ctx.closePath();
          ctx.fill();
        }

      } else if (bgType === 'city') {
        // City skyline silhouette
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        var bx = 0;
        while (bx < W) {
          var bw = rand(20, 50);
          var bh = rand(60, 200);
          ctx.fillRect(bx, H - 120 - bh, bw, bh);
          // Windows
          ctx.fillStyle = 'rgba(255,200,50,0.06)';
          for (var wy = H - 120 - bh + 8; wy < H - 130; wy += 14) {
            for (var wx = bx + 4; wx < bx + bw - 4; wx += 10) {
              if (Math.random() > 0.4) ctx.fillRect(wx, wy, 5, 7);
            }
          }
          ctx.fillStyle = 'rgba(255,255,255,0.03)';
          bx += bw + rand(3, 12);
        }
        // Ground line
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(0, H - 120, W, 2);

      } else if (bgType === 'ocean') {
        // Animated wave lines
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1.5;
        for (var w = 0; w < 4; w++) {
          ctx.beginPath();
          var baseY = H * 0.3 + w * 50;
          for (var x = 0; x < W; x += 4) {
            var y = baseY + Math.sin((x + this.gameTime * 40 + w * 30) * 0.03) * 15;
            if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }

      } else if (bgType === 'neon') {
        // Subtle neon glow circles
        var pri = this.config.theme.primary;
        var sec = this.config.theme.secondary;
        ctx.globalAlpha = 0.03;
        ctx.beginPath();
        ctx.arc(W * 0.2, H * 0.3, 150, 0, Math.PI * 2);
        ctx.fillStyle = pri;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(W * 0.8, H * 0.7, 120, 0, Math.PI * 2);
        ctx.fillStyle = sec;
        ctx.fill();
        ctx.globalAlpha = 1;

      } else if (bgType === 'dungeon') {
        // Stone-like grid pattern
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        var ts = 50;
        for (var x = 0; x < W; x += ts) {
          for (var y = 0; y < H; y += ts) {
            ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
          }
        }
      }
      // 'plain' and unknown types: no background decoration — just the solid bg color
    }
  };

  // Also handle boss spawning in initLevel when level has boss config
  var originalInitLevel = ZyraEngine.initLevel;
  ZyraEngine.initLevel = function () {
    originalInitLevel.call(this);
    var lvl = this.getLevelConfig();
    if (lvl.boss) {
      this.spawnBoss(lvl);
    }
  };

  // Expose globally
  window.ZyraEngine = ZyraEngine;
  window.ZyraAudio = ZyraAudio;
})();
