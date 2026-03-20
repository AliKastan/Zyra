/**
 * zyra-edit.js — Runs INSIDE the generated game iframe.
 *
 * Architecture: ALL selection, hover, and inline text editing happens here,
 * directly on the real DOM elements. The parent page only shows the floating
 * toolbar and handles persistence. No parent-side overlay intercepts clicks.
 *
 * Interaction model (Figma-like):
 *   click        → select element  (selection box drawn here, inside iframe)
 *   double-click → enter inline text edit (real contenteditable on the element)
 *   Esc          → cancel text edit → deselect → exit edit mode
 *   toolbar      → style changes applied directly to element via postMessage
 */
(function () {
  'use strict';
  if (window.__zyraEditLoaded) return;
  window.__zyraEditLoaded = true;

  var P = window.parent;
  if (!P || P === window) return;

  // ── State ──────────────────────────────────────────────────────────────────
  var editMode     = false;
  var selectedEl   = null;
  var selectedId   = null;
  var textEditEl   = null;
  var textEditSaved = null;   // text before editing (for Esc cancel)
  var hoverTarget  = null;
  var idSeq        = 0;

  // ── Tags we NEVER tag ──────────────────────────────────────────────────────
  var SKIP_TAGS = new Set([
    'HTML','HEAD','BODY','SCRIPT','STYLE','META','LINK',
    'TITLE','NOSCRIPT','BASE','TEMPLATE','CANVAS',
  ]);

  // ── ID + type assignment ───────────────────────────────────────────────────
  function classifyNode(el) {
    var tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'p')           return 'text';
    if (tag === 'span')        return 'text';
    if (tag === 'label')       return 'text';
    if (tag === 'li')          return 'text';
    if (tag === 'button')      return 'button';
    if (tag === 'a')           return 'button';
    if (tag === 'img')         return 'image';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return 'input';
    // div/section/article/etc: check if direct text child
    var direct = Array.from(el.childNodes).filter(function (n) {
      return n.nodeType === 3 && n.textContent.trim().length > 0;
    });
    if (direct.length > 0) return 'text-block';
    return 'container';
  }

  function isTextEditable(el) {
    var t = el.getAttribute('data-zyra-node-type');
    return t === 'heading' || t === 'text' || t === 'button' || t === 'text-block';
  }

  function assignIds() {
    var all = document.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (SKIP_TAGS.has(el.tagName)) continue;
      if (el.hasAttribute('data-zyra')) continue;       // zyra-injected scripts/divs
      if (el.closest('[data-zyra]')) continue;           // inside a zyra wrapper
      if (el.ownerSVGElement) continue;                  // svg internals
      // Skip zero-paint elements
      var r = el.getBoundingClientRect();
      if (r.width < 1 && r.height < 1) continue;

      if (!el.hasAttribute('data-zyra-id')) {
        el.setAttribute('data-zyra-id', 'z' + (++idSeq));
        el.setAttribute('data-zyra-editable', 'true');
        el.setAttribute('data-zyra-node-type', classifyNode(el));
      }
    }
    return idSeq;
  }

  // ── In-iframe CSS for hover/select states ──────────────────────────────────
  function injectEditCSS() {
    if (document.querySelector('[data-zyra="edit-css"]')) return;
    var s = document.createElement('style');
    s.setAttribute('data-zyra', 'edit-css');
    s.textContent = [
      /* Hover: dashed blue outline on any editable element (not selected, not while text-editing) */
      '.zyra-em [data-zyra-editable="true"]:not(.zyra-sel):not([data-zyra-editing]):hover {',
      '  outline: 1.5px dashed rgba(96,165,250,0.7) !important;',
      '  outline-offset: 2px !important;',
      '  cursor: pointer !important;',
      '}',
      /* Text cursor when text-editable element is selected */
      '.zyra-em [data-zyra-editable="true"].zyra-sel {',
      '  cursor: default !important;',
      '}',
      '.zyra-em [data-zyra-editable="true"].zyra-sel[data-zyra-node-type="heading"],',
      '.zyra-em [data-zyra-editable="true"].zyra-sel[data-zyra-node-type="text"],',
      '.zyra-em [data-zyra-editable="true"].zyra-sel[data-zyra-node-type="button"],',
      '.zyra-em [data-zyra-editable="true"].zyra-sel[data-zyra-node-type="text-block"] {',
      '  cursor: text !important;',
      '}',
      /* Inline text editing state */
      '[data-zyra-editing="true"] {',
      '  outline: none !important;',
      '  cursor: text !important;',
      '  caret-color: #F6AD55 !important;',
      '  -webkit-user-modify: read-write !important;',
      '}',
    ].join('\n');
    (document.head || document.documentElement).appendChild(s);
  }

  // ── Selection overlay (drawn inside iframe at fixed coords) ────────────────
  var selLayer  = null;
  var selBox    = null;
  var hoverBox  = null;
  var handles   = {};   // { tl, tr, bl, br }

  function buildSelLayer() {
    if (selLayer) return;

    selLayer = document.createElement('div');
    selLayer.setAttribute('data-zyra', 'sel-layer');
    selLayer.style.cssText = [
      'position:fixed;inset:0;',
      'pointer-events:none;',
      'z-index:2147483640;',
      'overflow:visible;',
    ].join('');
    document.body.appendChild(selLayer);

    // Hover indicator
    hoverBox = _makeBox('hov', [
      'border:1.5px dashed rgba(96,165,250,0.65);',
      'background:rgba(96,165,250,0.04);',
      'transition:left 0.05s,top 0.05s,width 0.05s,height 0.05s;',
    ].join(''));

    // Selection box
    selBox = _makeBox('sel', [
      'border:2px solid rgba(246,173,85,0.95);',
      'box-shadow:0 0 0 1px rgba(0,0,0,0.6),inset 0 0 0 1px rgba(246,173,85,0.12);',
    ].join(''));

    // Four corner handles
    ['tl','tr','bl','br'].forEach(function (k) {
      var h = document.createElement('div');
      h.setAttribute('data-zyra', 'h-' + k);
      h.style.cssText = [
        'position:fixed;width:7px;height:7px;',
        'background:#141416;',
        'border:2px solid rgba(246,173,85,0.95);',
        'border-radius:2px;',
        'box-sizing:border-box;',
        'pointer-events:none;',
        'display:none;',
        'z-index:1;',
      ].join('');
      selLayer.appendChild(h);
      handles[k] = h;
    });
  }

  function _makeBox(key, extraCss) {
    var d = document.createElement('div');
    d.setAttribute('data-zyra', 'box-' + key);
    d.style.cssText = [
      'position:fixed;pointer-events:none;display:none;',
      'box-sizing:border-box;border-radius:2px;z-index:1;',
      extraCss,
    ].join('');
    selLayer.appendChild(d);
    return d;
  }

  function _posBox(box, r) {
    box.style.display = 'block';
    box.style.left    = r.left   + 'px';
    box.style.top     = r.top    + 'px';
    box.style.width   = r.width  + 'px';
    box.style.height  = r.height + 'px';
  }

  function _hideBox(box) { if (box) box.style.display = 'none'; }

  function repositionSel() {
    if (!selectedEl) { _hideBox(selBox); _hideHandles(); return; }
    var r = selectedEl.getBoundingClientRect();
    _posBox(selBox, r);
    _posHandles(r);
  }

  function _posHandles(r) {
    var pos = {
      tl: [r.left - 4,           r.top - 4           ],
      tr: [r.left + r.width - 3, r.top - 4           ],
      bl: [r.left - 4,           r.top + r.height - 3],
      br: [r.left + r.width - 3, r.top + r.height - 3],
    };
    Object.keys(handles).forEach(function (k) {
      handles[k].style.display = 'block';
      handles[k].style.left = pos[k][0] + 'px';
      handles[k].style.top  = pos[k][1] + 'px';
    });
  }

  function _hideHandles() {
    Object.keys(handles).forEach(function (k) { handles[k].style.display = 'none'; });
  }

  // ── Selection / deselection ────────────────────────────────────────────────
  function selectEl(el) {
    if (selectedEl && selectedEl !== el) {
      selectedEl.classList.remove('zyra-sel');
      if (textEditEl) _exitTextEdit(true);
    }

    selectedEl = el;
    selectedId = el.getAttribute('data-zyra-id');
    el.classList.add('zyra-sel');

    buildSelLayer();
    var r = el.getBoundingClientRect();
    _posBox(selBox, r);
    _posHandles(r);
    _hideBox(hoverBox);
    hoverTarget = null;

    // Gather info for parent toolbar
    var cs   = window.getComputedStyle(el);
    var type = el.getAttribute('data-zyra-node-type');

    P.postMessage({
      type:     'ZYRA_ELEMENT_SELECTED',
      nodeId:   selectedId,
      nodeType: type,
      rect:     { left: r.left, top: r.top, width: r.width, height: r.height },
      info: {
        tag:        el.tagName.toLowerCase(),
        nodeType:   type,
        isTextNode: isTextEditable(el),
        textContent: isTextEditable(el) ? el.textContent : null,
        styles: {
          color:           cs.color,
          backgroundColor: cs.backgroundColor,
          fontSize:        cs.fontSize,
          fontWeight:      cs.fontWeight,
          fontFamily:      cs.fontFamily,
          fontStyle:       cs.fontStyle,
          textAlign:       cs.textAlign,
          borderRadius:    cs.borderRadius,
          opacity:         cs.opacity,
          width:           el.style.width  || cs.width,
          height:          el.style.height || cs.height,
          padding:         cs.padding,
        },
      },
    }, '*');
  }

  function deselect() {
    if (textEditEl) _exitTextEdit(true);
    if (selectedEl) {
      selectedEl.classList.remove('zyra-sel');
      selectedEl = null;
      selectedId = null;
    }
    if (selBox)  _hideBox(selBox);
    _hideHandles();
    if (hoverBox) _hideBox(hoverBox);
    P.postMessage({ type: 'ZYRA_ELEMENT_DESELECTED' }, '*');
  }

  // ── Inline text editing ────────────────────────────────────────────────────
  function _enterTextEdit(el) {
    if (textEditEl === el) return;
    if (textEditEl) _exitTextEdit(true);
    if (!isTextEditable(el)) return;

    textEditEl   = el;
    textEditSaved = el.textContent;

    el.setAttribute('contenteditable', 'true');
    el.setAttribute('data-zyra-editing', 'true');
    el.style.userSelect         = 'text';
    el.style.webkitUserSelect   = 'text';
    el.style.MozUserSelect      = 'text';
    el.focus();

    // Select all text for easy immediate replacement
    try {
      var range = document.createRange();
      range.selectNodeContents(el);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (_) {}

    P.postMessage({ type: 'ZYRA_TEXT_EDIT_START', nodeId: selectedId }, '*');
  }

  function _exitTextEdit(commit) {
    if (!textEditEl) return;
    var el   = textEditEl;
    var nid  = selectedId;
    textEditEl = null;

    el.removeAttribute('contenteditable');
    el.removeAttribute('data-zyra-editing');
    el.style.userSelect       = '';
    el.style.webkitUserSelect = '';
    el.style.MozUserSelect    = '';

    var finalText = commit ? el.textContent : textEditSaved;
    if (!commit && textEditSaved !== null) el.textContent = textEditSaved;

    // Reposition after text change (size may have changed)
    setTimeout(repositionSel, 0);

    P.postMessage({ type: 'ZYRA_TEXT_COMMITTED', nodeId: nid, text: finalText, saved: commit }, '*');
  }

  // ── Event handlers (attached only while edit mode is ON) ──────────────────
  function onDocClick(e) {
    if (!editMode) return;
    // Don't steal click while text editing; let the cursor land normally
    if (textEditEl) return;

    var t = _findZyraNode(e.target);
    if (!t) { deselect(); return; }

    e.preventDefault();
    e.stopPropagation();
    selectEl(t);
  }

  function onDocDblClick(e) {
    if (!editMode) return;
    var t = _findZyraNode(e.target);
    if (!t) return;

    e.preventDefault();
    e.stopPropagation();

    if (selectedEl !== t) selectEl(t);
    _enterTextEdit(t);
  }

  function onDocMouseMove(e) {
    if (!editMode || textEditEl) { _hideBox(hoverBox); return; }
    var t = _findZyraNode(e.target);
    if (!t || t === selectedEl) { _hideBox(hoverBox); hoverTarget = null; return; }
    if (t !== hoverTarget) {
      hoverTarget = t;
      buildSelLayer();
      _posBox(hoverBox, t.getBoundingClientRect());
    }
  }

  function onDocMouseLeave() {
    _hideBox(hoverBox);
    hoverTarget = null;
  }

  function onDocKeyDown(e) {
    if (!editMode) return;
    if (e.key === 'Escape') {
      if (textEditEl) {
        e.preventDefault();
        _exitTextEdit(false);   // cancel: revert text, stay selected
      } else if (selectedEl) {
        e.preventDefault();
        deselect();
      } else {
        P.postMessage({ type: 'ZYRA_REQUEST_EXIT_EDIT_MODE' }, '*');
      }
    }
    if (e.key === 'Enter' && textEditEl) {
      var tag = textEditEl.tagName.toLowerCase();
      if (tag !== 'p' && tag !== 'textarea') {
        e.preventDefault();
        _exitTextEdit(true);    // commit
      }
    }
  }

  function onDocFocusOut(e) {
    if (!textEditEl) return;
    // Commit when focus leaves the element entirely
    // Use a small timeout to let the browser settle focus (e.g., user clicked toolbar)
    var leavingEl = textEditEl;
    setTimeout(function () {
      if (!textEditEl) return;                               // already exited
      if (leavingEl.contains(document.activeElement)) return; // focus stayed inside
      _exitTextEdit(true);
    }, 200);
  }

  // Walk up DOM to find nearest ancestor with data-zyra-id
  function _findZyraNode(el) {
    var node = el;
    while (node && node !== document.body) {
      if (node.hasAttribute && node.hasAttribute('data-zyra-id')) return node;
      node = node.parentElement;
    }
    return null;
  }

  // ── Edit mode on / off ─────────────────────────────────────────────────────
  function setEditMode(on) {
    editMode = on;
    if (on) {
      injectEditCSS();
      buildSelLayer();
      document.body.classList.add('zyra-em');
      document.addEventListener('click',      onDocClick,     true);
      document.addEventListener('dblclick',   onDocDblClick,  true);
      document.addEventListener('mousemove',  onDocMouseMove, { passive: true });
      document.addEventListener('mouseleave', onDocMouseLeave);
      document.addEventListener('keydown',    onDocKeyDown,   true);
      document.addEventListener('focusout',   onDocFocusOut,  true);
    } else {
      document.body.classList.remove('zyra-em');
      document.removeEventListener('click',      onDocClick,     true);
      document.removeEventListener('dblclick',   onDocDblClick,  true);
      document.removeEventListener('mousemove',  onDocMouseMove);
      document.removeEventListener('mouseleave', onDocMouseLeave);
      document.removeEventListener('keydown',    onDocKeyDown,   true);
      document.removeEventListener('focusout',   onDocFocusOut,  true);
      deselect();
    }
  }

  // Keep selection box tracking on scroll / resize
  window.addEventListener('scroll', function () { if (editMode) repositionSel(); }, { passive: true });
  window.addEventListener('resize', function () { if (editMode) repositionSel(); });

  // ── Override application ───────────────────────────────────────────────────
  function applyOverrides(overrides) {
    if (!overrides) return;
    Object.keys(overrides).forEach(function (nodeId) {
      var el = document.querySelector('[data-zyra-id="' + nodeId + '"]');
      if (!el) return;
      var entry = overrides[nodeId];
      if (entry.styles) {
        Object.keys(entry.styles).forEach(function (prop) {
          try { el.style[prop] = entry.styles[prop]; } catch (_) {}
        });
      }
      if (entry.text != null) {
        // Only set text on simple text containers
        var ok = el.childNodes.length === 0 ||
                 (el.childNodes.length === 1 && el.firstChild.nodeType === 3);
        if (ok) el.textContent = entry.text;
      }
    });
  }

  // ── postMessage from parent ────────────────────────────────────────────────
  window.addEventListener('message', function (e) {
    var msg = e.data;
    if (!msg || !msg.type) return;

    if (msg.type === 'ZYRA_EDIT_MODE') {
      setEditMode(!!msg.enabled);
    }

    if (msg.type === 'ZYRA_LOAD_OVERRIDES') {
      applyOverrides(msg.overrides);
    }

    // Parent toolbar sent a style change — apply directly to the element
    if (msg.type === 'ZYRA_APPLY_OVERRIDE' && msg.nodeId) {
      var el = document.querySelector('[data-zyra-id="' + msg.nodeId + '"]');
      if (!el) return;
      if (msg.styles) {
        Object.keys(msg.styles).forEach(function (prop) {
          try { el.style[prop] = msg.styles[prop]; } catch (_) {}
        });
      }
      if (msg.text != null) {
        var ok2 = el.childNodes.length === 0 ||
                  (el.childNodes.length === 1 && el.firstChild.nodeType === 3);
        if (ok2) el.textContent = msg.text;
      }
      // Refresh selection box after style change (size may have changed)
      if (el === selectedEl) setTimeout(repositionSel, 0);
    }

    // Parent toolbar deselected
    if (msg.type === 'ZYRA_DESELECT') {
      deselect();
    }
  });

  // ── Public API (parent can call via iframe.contentWindow.__zyraEdit) ───────
  window.__zyraEdit = {
    repositionSel:   repositionSel,
    getSelectedId:   function () { return selectedId; },
    isTextEditing:   function () { return !!textEditEl; },
    commitText:      function () { if (textEditEl) _exitTextEdit(true); },
    reassignIds:     function () { idSeq = 0; assignIds(); },
  };

  // ── Boot ───────────────────────────────────────────────────────────────────
  function boot() {
    var count = assignIds();
    P.postMessage({ type: 'ZYRA_EDIT_READY', nodeCount: count }, '*');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    setTimeout(boot, 60);
  }
}());