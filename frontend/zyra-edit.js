/* zyra-edit.js — Visual Edit Bridge (runs INSIDE the generated game iframe) */
(function () {
  'use strict';
  if (window.__zyraEditLoaded) return;
  window.__zyraEditLoaded = true;

  var parent = window.parent;
  if (!parent || parent === window) return; // not in an iframe

  // ── CSS-path stable IDs ────────────────────────────────────────────────────

  function getCssPath(el) {
    if (!el || el === document.body) return 'body';
    var parts = [];
    var node = el;
    while (node && node !== document.documentElement) {
      var seg = node.tagName.toLowerCase();
      if (node.id) {
        seg += '#' + node.id;
        parts.unshift(seg);
        break;
      }
      var cls = Array.prototype.slice.call(node.classList || [])
        .filter(function (c) { return /^[a-zA-Z_-]/.test(c); })
        .slice(0, 2).join('.');
      if (cls) seg += '.' + cls;
      // nth-of-type for disambiguation
      var siblings = node.parentNode ? node.parentNode.children : [];
      var sameTag = Array.prototype.filter.call(siblings, function (s) {
        return s.tagName === node.tagName;
      });
      if (sameTag.length > 1) {
        var idx = sameTag.indexOf(node) + 1;
        seg += ':nth-of-type(' + idx + ')';
      }
      parts.unshift(seg);
      node = node.parentNode;
    }
    return parts.join(' > ');
  }

  // ── State ──────────────────────────────────────────────────────────────────

  var editMode   = false;
  var hoveredEl  = null;
  var selectedEl = null;
  var styleEl    = null; // <style data-zyra="edit-overrides">

  // ── Style tag for persistent overrides ────────────────────────────────────

  function getStyleTag() {
    if (styleEl) return styleEl;
    styleEl = document.querySelector('style[data-zyra="edit-overrides"]');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.setAttribute('data-zyra', 'edit-overrides');
      (document.head || document.documentElement).appendChild(styleEl);
    }
    return styleEl;
  }

  function applyOverrides(overrides) {
    // overrides: { [cssPath]: { prop: value, ... } }
    if (!overrides) return;
    var rules = '';
    Object.keys(overrides).forEach(function (path) {
      var props = overrides[path];
      var decls = Object.keys(props).map(function (p) {
        return p + ':' + props[p] + ' !important';
      }).join(';');
      if (decls) rules += path + '{' + decls + '}\n';
    });
    getStyleTag().textContent = rules;
  }

  // ── Highlight overlay ──────────────────────────────────────────────────────

  var hoverBox  = null;
  var selectBox = null;

  function ensureOverlayBox(id, color, zIndex) {
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.style.cssText = [
        'position:fixed', 'pointer-events:none', 'border-radius:2px',
        'border:2px solid ' + color, 'z-index:' + zIndex,
        'transition:all 0.08s ease', 'display:none', 'box-sizing:border-box',
      ].join(';');
      document.body.appendChild(el);
    }
    return el;
  }

  function positionBox(box, el) {
    if (!el) { box.style.display = 'none'; return; }
    var r = el.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left    = r.left + 'px';
    box.style.top     = r.top  + 'px';
    box.style.width   = r.width  + 'px';
    box.style.height  = r.height + 'px';
  }

  function showHoverBox(el) {
    if (!hoverBox) hoverBox = ensureOverlayBox('__zyra_hover', 'rgba(99,179,237,0.7)', 2147483640);
    positionBox(hoverBox, el);
  }
  function hideHoverBox() {
    if (hoverBox) hoverBox.style.display = 'none';
  }

  function showSelectBox(el) {
    if (!selectBox) selectBox = ensureOverlayBox('__zyra_select', 'rgba(246,173,85,0.9)', 2147483641);
    positionBox(selectBox, el);
  }
  function hideSelectBox() {
    if (selectBox) selectBox.style.display = 'none';
  }

  // ── Event listeners ────────────────────────────────────────────────────────

  function onMouseMove(e) {
    if (!editMode) return;
    var el = e.target;
    if (!el || el === document.body || el === document.documentElement) { hideHoverBox(); return; }
    if (el === selectedEl) { hideHoverBox(); return; }
    if (el !== hoveredEl) {
      hoveredEl = el;
      showHoverBox(el);
    }
  }

  function onClick(e) {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    if (!el || el === document.body || el === document.documentElement) return;

    selectedEl = el;
    hideHoverBox();
    showSelectBox(el);

    var path = getCssPath(el);
    var cs = window.getComputedStyle(el);

    // Gather editable computed styles
    var info = {
      cssPath: path,
      tagName: el.tagName.toLowerCase(),
      textContent: el.childNodes.length === 1 && el.firstChild.nodeType === 3
        ? el.textContent.trim() : null,
      styles: {
        color:        cs.color,
        background:   cs.backgroundColor,
        fontSize:     cs.fontSize,
        fontWeight:   cs.fontWeight,
        borderRadius: cs.borderRadius,
        opacity:      cs.opacity,
        padding:      cs.padding,
      },
    };

    parent.postMessage({ type: 'ZYRA_ELEMENT_SELECTED', data: info }, '*');
  }

  function onScroll() {
    if (selectedEl) showSelectBox(selectedEl);
    if (hoveredEl)  showHoverBox(hoveredEl);
  }

  // ── postMessage protocol ───────────────────────────────────────────────────

  window.addEventListener('message', function (e) {
    var msg = e.data;
    if (!msg || !msg.type) return;

    if (msg.type === 'ZYRA_EDIT_MODE') {
      editMode = !!msg.enabled;
      if (!editMode) {
        hideHoverBox();
        hideSelectBox();
        selectedEl = null;
        hoveredEl  = null;
        parent.postMessage({ type: 'ZYRA_ELEMENT_DESELECTED' }, '*');
      }
      document.body.style.cursor = editMode ? 'crosshair' : '';
    }

    if (msg.type === 'ZYRA_APPLY_STYLES' && msg.cssPath) {
      // Apply inline styles to target element
      try {
        var target = document.querySelector(msg.cssPath);
        if (target && msg.styles) {
          Object.keys(msg.styles).forEach(function (prop) {
            target.style[prop] = msg.styles[prop];
          });
          // Reposition selection box
          if (target === selectedEl) showSelectBox(target);
        }
      } catch (_) {}
    }

    if (msg.type === 'ZYRA_APPLY_TEXT' && msg.cssPath) {
      try {
        var target = document.querySelector(msg.cssPath);
        if (target && msg.text !== undefined) {
          // Only edit text nodes to avoid destroying child elements
          if (target.childNodes.length === 1 && target.firstChild.nodeType === 3) {
            target.textContent = msg.text;
          }
        }
      } catch (_) {}
    }

    if (msg.type === 'ZYRA_LOAD_OVERRIDES') {
      applyOverrides(msg.overrides);
    }
  });

  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click',     onClick,     true);
  window.addEventListener('scroll',      onScroll,    true);

  // ── Signal ready ───────────────────────────────────────────────────────────
  parent.postMessage({ type: 'ZYRA_EDIT_READY' }, '*');
}());
