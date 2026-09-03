/* Fetches the live policy text from the CommuneWorld content API and renders it.
   The page already ships a complete copy of the policy in the markup below, so if
   the API is unreachable the visitor (or an app-store / payment-gateway reviewer)
   still sees the full policy. The fetch only ever replaces good content with newer
   good content -- it never blanks the page. */
(function () {
  var API_BASE = 'https://api.communeworld.com/api/content-pages/';
  var CONTACT_EMAIL = 'communeworld01@gmail.com';

  var body = document.body;
  var slug = body.getAttribute('data-slug');
  var target = document.getElementById('policy-content');
  var stamp = document.getElementById('policy-updated');
  var heading = document.querySelector('.policy-head h1');
  var pageTitle = heading ? heading.textContent.trim().toLowerCase() : '';

  /* Tags and attributes we are willing to render. Anything else is dropped, so a
     compromised or mistyped CMS entry cannot inject script into this page. */
  var ALLOWED_TAGS = ('h1 h2 h3 h4 h5 h6 p div span section article ul ol li dl dt dd ' +
    'strong b em i u s small sub sup br hr a blockquote code pre figure figcaption ' +
    'table thead tbody tfoot tr th td caption colgroup col img').toUpperCase().split(' ');
  var ALLOWED_ATTRS = ['href', 'title', 'alt', 'src', 'colspan', 'rowspan', 'span', 'datetime'];

  function sanitize(root) {
    var nodes = Array.prototype.slice.call(root.querySelectorAll('*'));
    nodes.forEach(function (el) {
      if (ALLOWED_TAGS.indexOf(el.tagName) === -1) {
        if (el.parentNode) el.parentNode.removeChild(el);
        return;
      }
      Array.prototype.slice.call(el.attributes).forEach(function (attr) {
        var name = attr.name.toLowerCase();
        var value = (attr.value || '').trim();
        var unsafeUrl = (name === 'href' || name === 'src') && /^(javascript|data|vbscript):/i.test(value);
        if (ALLOWED_ATTRS.indexOf(name) === -1 || unsafeUrl) el.removeAttribute(attr.name);
      });
      if (el.tagName === 'A' && el.getAttribute('href')) {
        var href = el.getAttribute('href');
        if (/^https?:/i.test(href)) {
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        }
      }
    });
    return root;
  }

  function textNodes(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var out = [], node;
    while ((node = walker.nextNode())) out.push(node);
    return out;
  }

  /* The stored copy still carries editorial placeholders such as [CSAE EMAIL].
     Publishing those verbatim would defeat the purpose of the page, so they are
     resolved to the published contact address at render time. Remove this once
     the placeholders are fixed in the CMS. */
  function resolvePlaceholders(root) {
    textNodes(root).forEach(function (node) {
      if (node.nodeValue.indexOf('[') === -1) return;
      node.nodeValue = node.nodeValue
        .replace(/\[\s*(?:DPO|GRIEVANCE|CSAE|SUPPORT|CONTACT)\s+EMAIL\s*\]/gi, CONTACT_EMAIL);
    });
  }

  /* Turns bare email addresses and the published phone number into real links. */
  function linkify(root) {
    var pattern = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})|(\+91[\s-]?\d{5}[\s-]?\d{5})/g;
    textNodes(root).forEach(function (node) {
      var parent = node.parentNode;
      if (!parent || (parent.closest && parent.closest('a'))) return;
      var text = node.nodeValue;
      pattern.lastIndex = 0;
      if (!pattern.test(text)) return;

      pattern.lastIndex = 0;
      var frag = document.createDocumentFragment();
      var last = 0, match;
      while ((match = pattern.exec(text))) {
        if (match.index > last) frag.appendChild(document.createTextNode(text.slice(last, match.index)));
        var link = document.createElement('a');
        link.textContent = match[0];
        link.setAttribute('href', match[1] ? 'mailto:' + match[1] : 'tel:' + match[0].replace(/[\s-]/g, ''));
        frag.appendChild(link);
        last = match.index + match[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      parent.replaceChild(frag, node);
    });
  }

  /* The stored content repeats the policy title and its own "Last updated" line.
     Both are already rendered in the page header, so drop the duplicates. */
  function dropDuplicateLede(root) {
    var first = root.firstElementChild;
    if (first && /^H[1-3]$/.test(first.tagName) &&
        first.textContent.trim().toLowerCase().indexOf(pageTitle) === 0) {
      root.removeChild(first);
    }
    var next = root.firstElementChild;
    if (next && next.tagName === 'P' && /last\s+updated/i.test(next.textContent)) {
      root.removeChild(next);
    }
  }

  /* Wide tables must scroll inside their own box rather than the page. */
  function wrapTables(root) {
    Array.prototype.slice.call(root.querySelectorAll('table')).forEach(function (table) {
      if (table.parentNode && table.parentNode.classList.contains('table-scroll')) return;
      var box = document.createElement('div');
      box.className = 'table-scroll';
      table.parentNode.insertBefore(box, table);
      box.appendChild(table);
    });
  }

  function polish(root) {
    dropDuplicateLede(root);
    resolvePlaceholders(root);
    linkify(root);
    wrapTables(root);
  }

  function setUpdated(iso) {
    if (!stamp || !iso) return;
    var date = new Date(iso);
    if (isNaN(date.getTime())) return;
    stamp.textContent = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    stamp.setAttribute('datetime', iso);
  }

  /* Clean up the copy that shipped with the page, so it reads identically to the
     live one even when the request below never completes. */
  if (target) polish(target);

  if (!target || !slug || typeof fetch !== 'function') return;

  fetch(API_BASE + slug, { headers: { Accept: 'application/json' }, credentials: 'omit' })
    .then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(function (payload) {
      var data = payload && payload.data;
      if (!data || typeof data.content !== 'string' || data.content.trim().length < 200) {
        throw new Error('empty content');
      }
      var parsed = new DOMParser().parseFromString('<div>' + data.content + '</div>', 'text/html');
      var incoming = parsed.body.firstElementChild;
      sanitize(incoming);
      polish(incoming);
      if (!incoming.textContent.trim()) throw new Error('nothing left to render');

      target.textContent = '';
      while (incoming.firstChild) target.appendChild(document.adoptNode(incoming.firstChild));
      setUpdated(data.updated_at);
      body.setAttribute('data-source', 'live');
    })
    .catch(function () {
      /* Keep the copy that shipped with the page. */
      body.setAttribute('data-source', 'builtin');
    });
})();
