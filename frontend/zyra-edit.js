/* zyra-edit.js — Visual Edit Bridge v2 (runs INSIDE the generated game iframe) */
(function () {
  'use strict';
  if (window.__zyraEditLoaded) return;
  window.__zyraEditLoaded = true;

  var p = window.parent;
  if (!p || p === window) return;

  // ── Node registry ──────────────────────────────────────────────────────────

  var SKIP_TAGS = new Set(['HTML', 'HEAD', 'BODY', 'SCRIPT', 'STYLE', 'META',
    'LINK', 'TITLE', 'NOSCRIPT', 'BASE', 'TEMPLATE']);

  var idSeq = 0;

  function assignNodeIds() {
    var all = document.querySelectorAll('*');
    var registry = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (SKIP_TAGS.has(el.tagName)) continue;
      if (el.hasAttribute('data-zyra')) continue; // zyra-injected (monitor, viewport, etc.)
      // Skip zero-size or deeply hidden elements
      var r = el.getBoundingClientRect();
      if (r.width < 2 && r.height < 2) continue;

      if (!el.hasAttribute('data-zyra-id')) {
        el.setAttribute('data-zyra-id', 'z' + (++idSeq));
      }
      var nodeId = el.getAttribute('data-zyra-id');

      // Detect if this element contains only a text node (safe for text edit)
      var isTextNode = false;
      if (el.childNodes.length === 1 && el.firstChild.nodeType === 3) {
        isTextNode = true;
      }

      registry.push({
        id:         nodeId,
        tag:        el.tagName.toLowerCase(),
        isTextNode: isTextNode,
        text:       isTextNode ? el.textContent : null,
      });
    }
    return registry;
  }

  // ── Override style tag ─────────────────────────────────────────────────────

  var overrideStyleEl = null;
  function getOverrideStyle() {
    if (overrideStyleEl) return overrideStyleEl;
    overrideStyleEl = document.createElement('style');
    overrideStyleEl.setAttribute('data-zyra', 'overrides');
    (document.head || document.documentElement).appendChild(overrideStyleEl);
    return overrideStyleEl;
  }

  // Apply full override map: { nodeId: { styles: {…}, text: '…' } }
  function applyOverrides(overrides) {
    if (!overrides) return;
    Object.keys(overrides).forEach(function (nodeId) {
      var el = document.querySelector('[data-zyra-id="' + nodeId + '"]');
      if (!el) return;
      var entry = overrides[nodeId];
      if (entry.styles) {
        Object.keys(entry.styles).forEach(function (prop) {
          el.style[prop] = entry.styles[prop];
        });
      }
      if (entry.text != null) {
        if (el.childNodes.length === 1 && el.firstChild.nodeType === 3) {
          el.textContent = entry.text;
        } else if (el.childNodes.length === 0) {
          el.textContent = entry.text;
        }
      }
    });
  }

  // ── postMessage handler ────────────────────────────────────────────────────

  window.addEventListener('message', function (e) {
    var msg = e.data;
    if (!msg || !msg.type) return;

    // Load and apply saved overrides after iframe reload
    if (msg.type === 'ZYRA_LOAD_OVERRIDES') {
      applyOverrides(msg.overrides);
    }

    // Apply a single node override (live while user edits in toolbar)
    if (msg.type === 'ZYRA_APPLY_OVERRIDE' && msg.nodeId) {
      var el = document.querySelector('[data-zyra-id="' + msg.nodeId + '"]');
      if (!el) return;
      if (msg.styles) {
        Object.keys(msg.styles).forEach(function (prop) {
          el.style[prop] = msg.styles[prop];
        });
      }
      if (msg.text != null) {
        if (el.childNodes.length <= 1) el.textContent = msg.text;
      }
    }

    // Request current rect for a node (used to reposition selection box after style change)
    if (msg.type === 'ZYRA_GET_RECT' && msg.nodeId) {
      var target = document.querySelector('[data-zyra-id="' + msg.nodeId + '"]');
      var rect = target ? target.getBoundingClientRect() : null;
      p.postMessage({
        type:   'ZYRA_RECT_RESULT',
        nodeId: msg.nodeId,
        rect:   rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null,
      }, '*');
    }

    // Request computed styles + text for a node (used to populate toolbar)
    if (msg.type === 'ZYRA_GET_NODE_INFO' && msg.nodeId) {
      var target = document.querySelector('[data-zyra-id="' + msg.nodeId + '"]');
      if (!target) {
        p.postMessage({ type: 'ZYRA_NODE_INFO', nodeId: msg.nodeId, info: null }, '*');
        return;
      }
      var cs = window.getComputedStyle(target);
      var rect2 = target.getBoundingClientRect();
      var isText = (target.childNodes.length === 1 && target.firstChild.nodeType === 3);
      p.postMessage({
        type:   'ZYRA_NODE_INFO',
        nodeId: msg.nodeId,
        info: {
          tag:        target.tagName.toLowerCase(),
          isTextNode: isText,
          text:       isText ? target.textContent : null,
          rect:       { left: rect2.left, top: rect2.top, width: rect2.width, height: rect2.height },
          styles: {
            color:           cs.color,
            backgroundColor: cs.backgroundColor,
            fontSize:        cs.fontSize,
            fontWeight:      cs.fontWeight,
            fontFamily:      cs.fontFamily,
            fontStyle:       cs.fontStyle,
            borderRadius:    cs.borderRadius,
            opacity:         cs.opacity,
            width:           cs.width,
            height:          cs.height,
            padding:         cs.padding,
            textAlign:       cs.textAlign,
            lineHeight:      cs.lineHeight,
          },
        },
      }, '*');
    }
  });

  // ── Boot ───────────────────────────────────────────────────────────────────

  // Wait for DOM to be ready
  function boot() {
    var registry = assignNodeIds();
    p.postMessage({ type: 'ZYRA_EDIT_READY', registry: registry }, '*');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    // Slight delay to let game UI render
    setTimeout(boot, 80);
  }
}());
