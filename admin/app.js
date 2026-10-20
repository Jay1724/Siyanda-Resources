/* Siyanda content portal.
 * Static page + Supabase. Roles: super_admin (everything) and admin
 * (articles, careers, tenders, documents: create / edit / move to bin).
 * Permissions are enforced by the database (see supabase/migrations); this file
 * only decides what to show. All dynamic text goes through h() / textContent,
 * never innerHTML, so content can't inject markup.
 */
(function () {
  'use strict';

  var cfg = window.CMS_CONFIG || {};
  var app = document.getElementById('app');
  var db = null;
  var me = null;            // { id, role, name, email }
  var DOC_BUCKET = 'documents', IMG_BUCKET = 'images';
  var MAX_BYTES = 50 * 1024 * 1024;
  var FILE_EXT = /\.(pdf|docx?|xlsx?|pptx?|zip|csv|txt|png|jpe?g)$/i;

  /* ------------------------------------------------------------ helpers */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function toast(msg, isErr) {
    var t = h('div', { class: 'a-toast' + (isErr ? ' err' : '') }, msg);
    document.getElementById('toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, isErr ? 7000 : 3500);
  }

  function msgOf(e) { return (e && (e.message || e.error_description || e.error)) || String(e); }

  var fmtDT = function (iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
  };
  var fmtD = function (iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-ZA', { dateStyle: 'medium' });
  };
  function toLocalInput(iso) {
    if (!iso) return '';
    var d = new Date(iso), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fromLocalInput(v) { return v ? new Date(v).toISOString() : null; }
  function fmtSize(n) {
    if (!n && n !== 0) return '';
    return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  }
  function safeName(n) { return n.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120); }

  /* ------------------------------------------------------------ status */
  function statusOf(r) {
    var now = Date.now();
    if (r.deleted_at) return { key: 'bin', label: 'In bin' };
    if (r.status !== 'published') return { key: 'draft', label: 'Draft' };
    if (r.published_at && new Date(r.published_at) > now) return { key: 'scheduled', label: 'Scheduled' };
    if (r.expires_at) {
      var left = new Date(r.expires_at) - now;
      if (left <= 0) return { key: 'expired', label: 'Expired' };
      if (left < 7 * 864e5) return { key: 'soon', label: 'Expiring soon' };
    }
    return { key: 'live', label: 'Live' };
  }
  function badge(r) { var s = statusOf(r); return h('span', { class: 'badge ' + s.key }, s.label); }

  /* ------------------------------------------------------------ content types */
  var TYPES = {
    articles: {
      label: 'Articles', one: 'article', table: 'articles', expiry: 'Expires on',
      fields: [
        { k: 'title', l: 'Headline', t: 'text', req: true },
        { k: 'summary', l: 'Summary', t: 'textarea', help: 'Shown on the news list.' },
        { k: 'body', l: 'Article text', t: 'textarea' },
        { k: 'source_url', l: 'Link to full article', t: 'url', help: 'Optional. Where "Read more" goes if the article lives elsewhere.' }
      ]
    },
    careers: {
      label: 'Careers', one: 'vacancy', table: 'careers', expiry: 'Closing date',
      fields: [
        { k: 'title', l: 'Job title', t: 'text', req: true },
        { k: 'department', l: 'Department', t: 'text', half: true },
        { k: 'location', l: 'Location', t: 'text', half: true },
        { k: 'employment_type', l: 'Employment type', t: 'select', opts: ['', 'Permanent', 'Fixed-term', 'Contract', 'Internship', 'Learnership'], half: true },
        { k: 'description', l: 'Description and requirements', t: 'textarea' },
        { k: 'how_to_apply', l: 'How to apply', t: 'textarea' },
        { k: 'apply_url', l: 'Application link', t: 'url', half: true },
        { k: 'apply_email', l: 'Application email', t: 'email', half: true }
      ]
    },
    tenders: {
      label: 'Tenders', one: 'tender', table: 'tenders', expiry: 'Closing date',
      fields: [
        { k: 'reference_no', l: 'Reference number', t: 'text', half: true },
        { k: 'title', l: 'Tender title', t: 'text', req: true },
        { k: 'description', l: 'Description', t: 'textarea' },
        { k: 'briefing_at', l: 'Briefing session', t: 'datetime', half: true, help: 'Optional.' },
        { k: 'contact_email', l: 'Contact email', t: 'email', half: true }
      ]
    },
    documents: {
      label: 'Documents', one: 'document', table: 'documents', expiry: 'Expires on',
      fields: [
        { k: 'title', l: 'Document title', t: 'text', req: true },
        { k: 'category', l: 'Category', t: 'text', half: true, help: 'e.g. Policies, Reports, Forms' },
        { k: 'tender_id', l: 'Belongs to tender', t: 'tender', half: true, help: 'Leave blank for a general document. Tender documents disappear when the tender closes.' },
        { k: 'article_id', l: 'Belongs to article', t: 'article', half: true, help: 'Optional. A document can belong to a tender or an article, not both. It is available only while the article is.' },
        { k: 'description', l: 'Description', t: 'textarea' }
      ]
    }
  };
  var TYPE_ORDER = ['articles', 'careers', 'tenders', 'documents'];

  /* ------------------------------------------------------------ routing */
  var route = { view: 'articles', id: null, isNew: false, tender: null, article: null };
  function readRoute() {
    var q = new URLSearchParams(location.search);
    route = { view: q.get('view') || 'articles', id: q.get('id'), isNew: q.get('new') === '1', tender: q.get('tender'), article: q.get('article') };
  }
  function go(view, extra) {
    var q = new URLSearchParams({ view: view });
    Object.keys(extra || {}).forEach(function (k) { if (extra[k]) q.set(k, extra[k]); });
    history.pushState(null, '', '?' + q.toString());
    readRoute();
    render();
  }
  window.addEventListener('popstate', function () { readRoute(); if (me) render(); });

  /* ------------------------------------------------------------ boot */
  function boot() {
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_KEY) {
      return mount(h('div', { class: 'a-login' }, h('div', { class: 'a-card' },
        h('h1', null, 'Portal not connected yet'),
        h('p', { class: 'a-sub' }, 'Add the Supabase project URL and public key to assets/cms-config.js to switch the portal on. See supabase/README.md.'))));
    }
    if (!window.supabase) {
      return mount(h('div', { class: 'a-login' }, h('div', { class: 'a-card a-note err' }, 'Could not load the Supabase library. Check your connection and refresh.')));
    }
    // Invite and password-reset emails land here with a token in the URL hash.
    var hash = location.hash || '';
    var needsPassword = /type=(invite|recovery)/.test(hash);

    db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);
    readRoute();

    db.auth.onAuthStateChange(function (ev) {
      if (ev === 'PASSWORD_RECOVERY') needsPassword = true;
      if (ev === 'SIGNED_OUT') { me = null; renderLogin(); }
    });

    db.auth.getSession().then(function (r) {
      var session = r.data && r.data.session;
      if (!session) return renderLogin();
      if (needsPassword) return renderSetPassword();
      return enter(session.user);
    });
  }

  function mount(node) { clear(app); app.appendChild(node); }

  /* ------------------------------------------------------------ auth screens */
  function renderLogin(notice) {
    var email = h('input', { type: 'email', id: 'em', required: true, autocomplete: 'username' });
    var pw = h('input', { type: 'password', id: 'pw', required: true, autocomplete: 'current-password' });
    var btn = h('button', { class: 'a-btn', type: 'submit' }, 'Sign in');
    var form = h('form', { class: 'a-card', onsubmit: function (e) {
      e.preventDefault();
      btn.disabled = true;
      db.auth.signInWithPassword({ email: email.value.trim(), password: pw.value }).then(function (r) {
        if (r.error) { btn.disabled = false; return toast('Sign-in failed: ' + r.error.message, true); }
        enter(r.data.user);
      });
    } },
      h('h1', null, 'Siyanda content portal'),
      h('p', { class: 'a-sub' }, 'Sign in with the account you were invited with.'),
      notice ? h('div', { class: 'a-note' }, notice) : null,
      h('div', { class: 'a-field' }, h('label', { for: 'em' }, 'Email'), email),
      h('div', { class: 'a-field' }, h('label', { for: 'pw' }, 'Password'), pw),
      btn, ' ',
      h('button', { type: 'button', class: 'a-link', onclick: function () {
        if (!email.value.trim()) return toast('Enter your email first, then choose "Forgot password".', true);
        db.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + location.pathname }).then(function (r) {
          if (r.error) toast(r.error.message, true); else toast('If that address has an account, a reset link is on its way.');
        });
      } }, 'Forgot password?'));
    mount(h('div', { class: 'a-login' }, form));
  }

  function renderSetPassword() {
    var p1 = h('input', { type: 'password', id: 'p1', required: true, minlength: 10, autocomplete: 'new-password' });
    var p2 = h('input', { type: 'password', id: 'p2', required: true, minlength: 10, autocomplete: 'new-password' });
    mount(h('div', { class: 'a-login' }, h('form', { class: 'a-card', onsubmit: function (e) {
      e.preventDefault();
      if (p1.value !== p2.value) return toast('The two passwords do not match.', true);
      db.auth.updateUser({ password: p1.value }).then(function (r) {
        if (r.error) return toast(r.error.message, true);
        history.replaceState(null, '', location.pathname);
        toast('Password saved.');
        enter(r.data.user);
      });
    } },
      h('h1', null, 'Choose your password'),
      h('p', { class: 'a-sub' }, 'At least 10 characters.'),
      h('div', { class: 'a-field' }, h('label', { for: 'p1' }, 'New password'), p1),
      h('div', { class: 'a-field' }, h('label', { for: 'p2' }, 'Repeat password'), p2),
      h('button', { class: 'a-btn', type: 'submit' }, 'Save and continue'))));
  }

  function enter(user) {
    db.from('user_roles').select('*').eq('user_id', user.id).maybeSingle().then(function (r) {
      var row = r.data;
      if (r.error || !row || !row.active) {
        return mount(h('div', { class: 'a-login' }, h('div', { class: 'a-card' },
          h('h1', null, 'No access'),
          h('p', null, 'This account has not been given access to the portal, or it has been switched off. Ask a super admin.'),
          h('button', { class: 'a-btn ghost', onclick: signOut }, 'Sign out'))));
      }
      me = { id: user.id, role: row.role, name: row.full_name || row.email || user.email, email: user.email };
      render();
    });
  }
  function signOut() { db.auth.signOut().then(function () { me = null; renderLogin(); }); }
  var isSuper = function () { return me && me.role === 'super_admin'; };

  /* ------------------------------------------------------------ shell */
  function render() {
    var views = TYPE_ORDER.map(function (k) { return [k, TYPES[k].label]; }).concat([['bin', 'Bin']]);
    if (isSuper()) views.push(['users', 'Users'], ['activity', 'Activity']);
    var current = route.view;
    if (!views.some(function (v) { return v[0] === current; })) current = 'articles';

    var main = h('main', { class: 'a-main' }, h('div', { class: 'a-wrap', id: 'view' }));
    clear(app);
    app.appendChild(h('header', { class: 'a-top' },
      h('div', { class: 'a-wrap' },
        h('div', { class: 'a-brand' }, 'Siyanda ', h('span', null, 'Content Portal')),
        h('div', { class: 'a-user' }, me.name, h('span', { class: 'badge role' }, me.role === 'super_admin' ? 'Super admin' : 'Admin'),
          h('button', { class: 'a-btn ghost small', onclick: signOut }, 'Sign out'))),
      h('nav', { class: 'a-nav', 'aria-label': 'Sections' }, h('div', { class: 'a-wrap' },
        views.map(function (v) {
          return h('button', { type: 'button', 'aria-current': v[0] === current ? 'page' : null, onclick: function () { go(v[0]); } }, v[1]);
        })))));
    app.appendChild(main);

    var el = document.getElementById('view');
    var fn;
    if (TYPES[current]) fn = (route.id || route.isNew) ? renderForm : renderList;
    else if (current === 'bin') fn = renderBin;
    else if (current === 'users') fn = renderUsers;
    else if (current === 'activity') fn = renderActivity;
    Promise.resolve(fn(el, current)).catch(function (e) { toast(msgOf(e), true); });
  }

  /* ------------------------------------------------------------ list */
  var listState = { q: '', f: 'all' };

  async function renderList(el, type) {
    var T = TYPES[type];
    var res = await db.from(T.table).select('*').is('deleted_at', null).order('updated_at', { ascending: false });
    if (res.error) throw res.error;
    var rows = res.data || [];

    var versions = {};
    if (type === 'documents' && rows.length) {
      var vr = await db.from('document_versions').select('id,document_id,version_number,file_name,size_bytes');
      (vr.data || []).forEach(function (v) { (versions[v.document_id] = versions[v.document_id] || []).push(v); });
    }

    var tbody = h('tbody');
    var search = h('input', { class: 'a-input grow', type: 'search', placeholder: 'Search…', value: listState.q, 'aria-label': 'Search' });
    var filter = h('select', { class: 'a-input', style: 'width:auto', 'aria-label': 'Filter by status' },
      [['all', 'All'], ['live', 'Live'], ['soon', 'Expiring soon'], ['scheduled', 'Scheduled'], ['draft', 'Draft'], ['expired', 'Expired']].map(function (o) {
        return h('option', { value: o[0], selected: o[0] === listState.f ? true : null }, o[1]);
      }));

    function draw() {
      listState.q = search.value; listState.f = filter.value;
      var q = search.value.trim().toLowerCase();
      var shown = rows.filter(function (r) {
        if (filter.value !== 'all' && statusOf(r).key !== filter.value) return false;
        return !q || (r.title || '').toLowerCase().indexOf(q) > -1 || (r.reference_no || '').toLowerCase().indexOf(q) > -1;
      });
      clear(tbody);
      if (!shown.length) tbody.appendChild(h('tr', null, h('td', { colspan: 4, class: 'a-empty' }, rows.length ? 'Nothing matches.' : 'No ' + T.label.toLowerCase() + ' yet.')));
      shown.forEach(function (r) {
        var meta = [];
        if (type === 'tenders' && r.reference_no) meta.push(r.reference_no);
        if (type === 'careers' && r.location) meta.push(r.location);
        if (type === 'documents') {
          var vs = versions[r.id] || [];
          var cur = vs.filter(function (v) { return v.id === r.current_version_id; })[0];
          meta.push(cur ? cur.file_name + ' (v' + cur.version_number + (vs.length > 1 ? ' of ' + vs.length : '') + ')' : 'No file yet');
        }
        tbody.appendChild(h('tr', null,
          h('td', null, h('div', { class: 't' }, r.title), h('div', { class: 'm' }, meta.join(' · '))),
          h('td', null, badge(r)),
          h('td', null, h('div', null, fmtDT(r.expires_at)), h('div', { class: 'm' }, r.published_at ? 'From ' + fmtD(r.published_at) : '')),
          h('td', { class: 'act' },
            h('button', { class: 'a-btn ghost small', onclick: function () { go(type, { id: r.id }); } }, 'Edit'),
            h('button', { class: 'a-btn danger small', onclick: function () { toBin(type, r); } }, 'Delete'))));
      });
    }
    search.addEventListener('input', draw);
    filter.addEventListener('change', draw);

    clear(el);
    el.appendChild(h('h1', null, T.label));
    el.appendChild(h('p', { class: 'a-sub' }, 'Published items appear on the website until their expiry. Deleted items go to the bin.'));
    el.appendChild(h('div', { class: 'a-bar' }, search, filter,
      h('button', { class: 'a-btn', onclick: function () { go(type, { new: '1' }); } }, 'New ' + T.one)));
    el.appendChild(h('div', { class: 'a-card', style: 'padding:0' },
      h('table', { class: 'a-table' },
        h('thead', null, h('tr', null, h('th', null, 'Title'), h('th', null, 'Status'), h('th', null, T.expiry), h('th'))), tbody)));
    draw();
  }

  async function toBin(type, r) {
    if (!confirm('Move "' + r.title + '" to the bin? It will disappear from the website. A super admin can restore it.')) return;
    var res = await db.from(TYPES[type].table).update({ deleted_at: new Date().toISOString() }).eq('id', r.id);
    if (res.error) return toast(msgOf(res.error), true);
    toast('Moved to the bin.');
    render();
  }

  /* ------------------------------------------------------------ form */
  async function renderForm(el, type) {
    var T = TYPES[type];
    var row = {};
    if (route.id) {
      var res = await db.from(T.table).select('*').eq('id', route.id).maybeSingle();
      if (res.error) throw res.error;
      if (!res.data) { clear(el); return el.appendChild(h('div', { class: 'a-card a-note err' }, 'That item no longer exists.')); }
      row = res.data;
      if (row.deleted_at) { clear(el); return el.appendChild(h('div', { class: 'a-card a-note' }, 'This item is in the bin.')); }
    } else if (type === 'documents' && (route.tender || route.article)) {
      row.tender_id = route.tender; row.article_id = route.article;
    }
    var tenders = [], articlesList = [];
    if (type === 'documents') {
      var ar = await db.from('articles').select('id,title').is('deleted_at', null).order('title');
      articlesList = ar.data || [];
      var tr = await db.from('tenders').select('id,title,reference_no').is('deleted_at', null).order('title');
      tenders = tr.data || [];
    }

    var inputs = {};
    function fieldEl(f) {
      var id = 'f_' + f.k, v = row[f.k], input;
      if (f.t === 'textarea') input = h('textarea', { id: id }, v || '');
      else if (f.t === 'select') input = h('select', { id: id }, f.opts.map(function (o) { return h('option', { value: o, selected: o === (v || '') ? true : null }, o || '—'); }));
      else if (f.t === 'tender') input = h('select', { id: id }, h('option', { value: '' }, 'None (general document)'),
        tenders.map(function (t) { return h('option', { value: t.id, selected: t.id === v ? true : null }, (t.reference_no ? t.reference_no + ' — ' : '') + t.title); }));
      else if (f.t === 'article') input = h('select', { id: id }, h('option', { value: '' }, 'None'),
        articlesList.map(function (a) { return h('option', { value: a.id, selected: a.id === v ? true : null }, a.title); }));
      else if (f.t === 'datetime') input = h('input', { id: id, type: 'datetime-local', value: toLocalInput(v) });
      else input = h('input', { id: id, type: f.t, value: v || '' });
      if (f.req) input.required = true;
      inputs[f.k] = input;
      return h('div', { class: 'a-field' }, h('label', { for: id }, f.l, f.req ? h('span', { class: 'req' }, ' *') : null), input,
        f.help ? h('div', { class: 'help' }, f.help) : null);
    }

    // lay out: consecutive "half" fields share a row
    var fieldNodes = [], pending = [];
    T.fields.forEach(function (f) {
      if (f.half) { pending.push(fieldEl(f)); if (pending.length === 2) { fieldNodes.push(h('div', { class: 'a-grid2' }, pending)); pending = []; } }
      else { if (pending.length) { fieldNodes.push(h('div', { class: 'a-grid2' }, pending)); pending = []; } fieldNodes.push(fieldEl(f)); }
    });
    if (pending.length) fieldNodes.push(h('div', { class: 'a-grid2' }, pending));

    var status = h('select', { id: 'f_status' },
      h('option', { value: 'draft', selected: (row.status || 'draft') === 'draft' ? true : null }, 'Draft (hidden)'),
      h('option', { value: 'published', selected: row.status === 'published' ? true : null }, 'Published'));
    var pub = h('input', { id: 'f_pub', type: 'datetime-local', value: toLocalInput(row.published_at) });
    var exp = h('input', { id: 'f_exp', type: 'datetime-local', value: toLocalInput(row.expires_at) });

    var fileInput = null, noteInput = null, imgInput = null;
    var extra = [];
    if (type === 'documents' && !route.id) {
      fileInput = h('input', { id: 'f_file', type: 'file', required: true, accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.csv,.txt,.png,.jpg,.jpeg' });
      extra.push(h('div', { class: 'a-field' }, h('label', { for: 'f_file' }, 'File', h('span', { class: 'req' }, ' *')), fileInput,
        h('div', { class: 'help' }, 'Up to 50 MB. You can upload newer versions later; older versions are kept.')));
    }
    if (type === 'articles') {
      imgInput = h('input', { id: 'f_img', type: 'file', accept: 'image/png,image/jpeg,image/webp' });
      extra.push(h('div', { class: 'a-field' }, h('label', { for: 'f_img' }, 'Image'), imgInput,
        row.image_url ? h('div', { class: 'help' }, 'Current image is kept unless you choose a new one.') : null));
    }

    var attach = null;                       // tenders and articles: attach documents while creating / editing
    if (type === 'tenders' || type === 'articles') { attach = makeAttachPicker(type === 'tenders' ? 'Tender documents' : 'Documents'); extra.push(attach.node); }

    var saveBtn = h('button', { class: 'a-btn', type: 'submit' }, route.id ? 'Save changes' : 'Create ' + T.one);
    var form = h('form', { class: 'a-card', onsubmit: onSave },
      fieldNodes, extra,
      h('div', { class: 'a-grid2' },
        h('div', { class: 'a-field' }, h('label', { for: 'f_status' }, 'Status'), status),
        h('div', { class: 'a-field' }, h('label', { for: 'f_pub' }, 'Show on website from'), pub,
          h('div', { class: 'help' }, 'Leave empty to publish immediately.'))),
      h('div', { class: 'a-field' }, h('label', { for: 'f_exp' }, T.expiry), exp,
        h('div', { class: 'help' }, 'After this date and time the item is hidden from the website automatically. Leave empty to never expire.')),
      saveBtn, ' ', h('button', { type: 'button', class: 'a-btn ghost', onclick: function () { go(type); } }, 'Cancel'));

    async function onSave(e) {
      e.preventDefault();
      var payload = {};
      T.fields.forEach(function (f) {
        var v = inputs[f.k].value;
        payload[f.k] = f.t === 'datetime' ? fromLocalInput(v) : (v === '' ? null : v.trim());
      });
      payload.status = status.value;
      payload.published_at = fromLocalInput(pub.value);
      payload.expires_at = fromLocalInput(exp.value);
      if (payload.published_at && payload.expires_at && new Date(payload.expires_at) <= new Date(payload.published_at)) {
        return toast(T.expiry + ' must be after the publish date.', true);
      }
      if (type === 'documents' && payload.tender_id && payload.article_id) return toast('A document can belong to a tender or an article, not both.', true);
      var f1 = fileInput && fileInput.files[0], f2 = imgInput && imgInput.files[0];
      if (f1) { var bad = checkFile(f1, FILE_EXT); if (bad) return toast(bad, true); }
      if (f2) { var bad2 = checkFile(f2, /\.(png|jpe?g|webp)$/i); if (bad2) return toast(bad2, true); }

      saveBtn.disabled = true;
      try {
        if (f2) payload.image_url = await uploadImage(f2);
        var saved;
        if (route.id) {
          var u = await db.from(T.table).update(payload).eq('id', route.id).select().single();
          if (u.error) throw u.error; saved = u.data;
        } else {
          var i = await db.from(T.table).insert(payload).select().single();
          if (i.error) throw i.error; saved = i.data;
        }
        if (f1) {
          try { await uploadVersion(saved.id, f1, null); }
          catch (err) { toast('Saved, but the file did not upload: ' + msgOf(err) + '. Open the document to retry.', true); return go(type, { id: saved.id }); }
        }
        if (attach && attach.items.length) {
          var r2 = await attachToParent(type === 'tenders' ? 'tender' : 'article', saved, attach.items);
          if (r2.failed.length) toast(T.one.charAt(0).toUpperCase() + T.one.slice(1) + ' saved. ' + r2.failed.length + ' document(s) did not attach: ' + r2.failed.join('; ') + '. Add them again from this page.', true);
          else toast('Saved, with ' + r2.ok + ' document' + (r2.ok === 1 ? '' : 's') + ' attached.');
          return go(type, { id: saved.id });
        }
        toast('Saved.');
        go(type, (type === 'tenders' || type === 'articles') && !route.id ? { id: saved.id } : null);
      } catch (err) { toast(msgOf(err), true); saveBtn.disabled = false; }
    }

    clear(el);
    el.appendChild(h('p', null, h('button', { class: 'a-link', onclick: function () { go(type); } }, '← All ' + T.label.toLowerCase())));
    el.appendChild(h('h1', null, route.id ? 'Edit ' + T.one : 'New ' + T.one));
    if (route.id) el.appendChild(h('p', { class: 'a-sub' }, badge(row), ' Last updated ' + fmtDT(row.updated_at)));
    el.appendChild(form);

    if (type === 'documents' && route.id) await renderVersions(el, row);
    if ((type === 'tenders' || type === 'articles') && route.id) await renderAttachedDocs(el, type === 'tenders' ? 'tender' : 'article', row);
  }

  /* Pick several files while creating or editing a tender or article. Each
   * becomes a document of that parent (published, so it goes live with it). */
  function makeAttachPicker(label) {
    var items = [];
    var list = h('div', { class: 'a-attach-list' });
    var input = h('input', { id: 'f_attach', type: 'file', multiple: true, accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.csv,.txt,.png,.jpg,.jpeg' });
    function draw() {
      clear(list);
      items.forEach(function (it, n) {
        list.appendChild(h('div', { class: 'a-attach-row' },
          h('input', { type: 'text', class: 'a-input', value: it.title, maxlength: 200, 'aria-label': 'Title for ' + it.file.name, oninput: function (e) { it.title = e.target.value; } }),
          h('span', { class: 'a-attach-meta' }, it.file.name + ' · ' + fmtSize(it.file.size)),
          h('button', { type: 'button', class: 'a-btn ghost small', onclick: function () { items.splice(n, 1); draw(); } }, 'Remove')));
      });
    }
    input.addEventListener('change', function () {
      Array.prototype.forEach.call(input.files, function (f) {
        var bad = checkFile(f, FILE_EXT);
        if (bad) return toast(bad, true);
        items.push({ file: f, title: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') });
      });
      input.value = '';
      draw();
    });
    var node = h('div', { class: 'a-field' }, h('label', { for: 'f_attach' }, label), input,
      h('div', { class: 'help' }, 'Choose one or more files (up to 50 MB each); change their titles below. They are attached when you save and go live with it. You can add more or upload newer versions later.'), list);
    return { node: node, items: items };
  }

  async function attachToParent(kind, parent, items) {
    var ok = 0, failed = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i], docId = null;
      try {
        var d = await db.from('documents').insert({ title: (it.title || '').trim() || it.file.name, category: kind === 'tender' ? 'Tender documents' : 'Article documents', tender_id: kind === 'tender' ? parent.id : null, article_id: kind === 'article' ? parent.id : null, status: 'published' }).select().single();
        if (d.error) throw d.error;
        docId = d.data.id;
        await uploadVersion(docId, it.file, null);
        ok++;
      } catch (err) {
        failed.push(it.file.name + ' (' + msgOf(err) + ')');
        // don't leave an empty document behind: move it to the bin
        if (docId) await db.from('documents').update({ deleted_at: new Date().toISOString() }).eq('id', docId);
      }
    }
    return { ok: ok, failed: failed };
  }

  function checkFile(f, rx) {
    if (!rx.test(f.name)) return '"' + f.name + '" is not an allowed file type.';
    if (f.size > MAX_BYTES) return '"' + f.name + '" is larger than 50 MB.';
    return null;
  }

  async function uploadImage(file) {
    var path = Date.now() + '-' + safeName(file.name);
    var r = await db.storage.from(IMG_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (r.error) throw r.error;
    return db.storage.from(IMG_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async function uploadVersion(docId, file, note) {
    var path = docId + '/' + Date.now() + '-' + safeName(file.name);
    var up = await db.storage.from(DOC_BUCKET).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (up.error) throw up.error;
    var r = await db.rpc('add_document_version', {
      p_document: docId, p_path: path, p_file_name: file.name, p_mime: file.type || null, p_size: file.size, p_note: note || null
    });
    if (r.error) throw r.error;
    return r.data;
  }

  /* ------------------------------------------------------------ document versions */
  async function renderVersions(el, doc) {
    var res = await db.from('document_versions').select('*').eq('document_id', doc.id).order('version_number', { ascending: false });
    if (res.error) throw res.error;
    var vs = res.data || [];
    var list = h('div');
    if (!vs.length) list.appendChild(h('p', { class: 'a-empty' }, 'No file uploaded yet.'));
    vs.forEach(function (v) {
      var isCur = v.id === doc.current_version_id;
      list.appendChild(h('div', { class: 'a-ver' },
        h('div', { class: 'n' }, 'v' + v.version_number),
        h('div', null,
          h('div', { class: 't' }, v.file_name, ' ', isCur ? h('span', { class: 'badge live' }, 'Current · on website') : null),
          h('div', { class: 'm', style: 'color:var(--muted);font-size:.82rem' }, [fmtDT(v.uploaded_at), fmtSize(v.size_bytes), v.change_note].filter(Boolean).join(' · '))),
        h('div', null,
          h('button', { class: 'a-btn ghost small', onclick: function () { download(v); } }, 'Download'), ' ',
          isCur ? null : h('button', { class: 'a-btn ghost small', onclick: function () { makeCurrent(doc, v); } }, 'Make current'))));
    });

    var file = h('input', { type: 'file', id: 'nv_file', required: true, accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.csv,.txt,.png,.jpg,.jpeg' });
    var note = h('input', { type: 'text', id: 'nv_note', placeholder: 'What changed? (optional)', maxlength: 200 });
    var btn = h('button', { class: 'a-btn', type: 'submit' }, 'Upload new version');
    var form = h('form', { onsubmit: async function (e) {
      e.preventDefault();
      var f = file.files[0]; var bad = f && checkFile(f, FILE_EXT);
      if (bad) return toast(bad, true);
      btn.disabled = true;
      try { await uploadVersion(doc.id, f, note.value.trim()); toast('New version uploaded; it is now the current version.'); render(); }
      catch (err) { toast(msgOf(err), true); btn.disabled = false; }
    } },
      h('div', { class: 'a-grid2' },
        h('div', { class: 'a-field' }, h('label', { for: 'nv_file' }, 'New file'), file),
        h('div', { class: 'a-field' }, h('label', { for: 'nv_note' }, 'Change note'), note)), btn);

    el.appendChild(h('div', { class: 'a-card' }, h('h2', null, 'Versions'),
      h('p', { class: 'a-sub' }, 'Visitors only ever get the current version. Older versions are kept and can be made current again.'),
      list, h('hr', { style: 'border:0;border-top:1px solid var(--line);margin:18px 0' }), form));
  }

  async function download(v) {
    var r = await db.storage.from(DOC_BUCKET).createSignedUrl(v.storage_path, 60, { download: v.file_name });
    if (r.error) return toast(msgOf(r.error), true);
    window.open(r.data.signedUrl, '_blank', 'noopener');
  }
  async function makeCurrent(doc, v) {
    var r = await db.rpc('set_current_version', { p_document: doc.id, p_version: v.id });
    if (r.error) return toast(msgOf(r.error), true);
    toast('Version ' + v.version_number + ' is now the current version.');
    render();
  }

  async function renderAttachedDocs(el, kind, parent) {
    var res = await db.from('documents').select('id,title,status,published_at,expires_at,deleted_at,current_version_id').eq(kind + '_id', parent.id).is('deleted_at', null).order('title');
    var docs = res.data || [];
    var files = {};
    if (docs.length) {
      var vr = await db.from('document_versions').select('id,document_id,version_number,file_name').in('document_id', docs.map(function (d) { return d.id; }));
      (vr.data || []).forEach(function (v) { files[v.id] = v; });
    }
    el.appendChild(h('div', { class: 'a-card' }, h('h2', null, 'Attached documents'),
      docs.length ? h('table', { class: 'a-table' }, h('tbody', null, docs.map(function (d) {
        var cur = files[d.current_version_id];
        return h('tr', null, h('td', null, h('div', { class: 't' }, d.title),
            h('div', { class: 'm' }, cur ? cur.file_name + ' (v' + cur.version_number + ')' : 'No file yet')), h('td', null, badge(d)),
          h('td', { class: 'act' }, h('button', { class: 'a-btn ghost small', onclick: function () { go('documents', { id: d.id }); } }, 'Open')));
      }))) : h('p', { class: 'a-empty' }, 'No documents attached yet.'),
      h('p', null, h('button', { class: 'a-btn', onclick: function () { var x = { new: '1' }; x[kind] = parent.id; go('documents', x); } }, 'Add document'))));
  }

  /* ------------------------------------------------------------ bin */
  async function renderBin(el) {
    var all = [];
    for (var i = 0; i < TYPE_ORDER.length; i++) {
      var type = TYPE_ORDER[i];
      var r = await db.from(TYPES[type].table).select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
      if (r.error) throw r.error;
      (r.data || []).forEach(function (x) { all.push({ type: type, row: x }); });
    }
    all.sort(function (a, b) { return new Date(b.row.deleted_at) - new Date(a.row.deleted_at); });

    clear(el);
    el.appendChild(h('h1', null, 'Bin'));
    el.appendChild(h('p', { class: 'a-sub' }, isSuper()
      ? 'Deleted items stay here until you restore them or delete them permanently.'
      : 'Deleted items stay here. Only a super admin can restore them or delete them permanently.'));
    var tbody = h('tbody');
    if (!all.length) tbody.appendChild(h('tr', null, h('td', { colspan: 4, class: 'a-empty' }, 'The bin is empty.')));
    all.forEach(function (x) {
      tbody.appendChild(h('tr', null,
        h('td', null, h('div', { class: 't' }, x.row.title)),
        h('td', null, h('span', { class: 'badge' }, TYPES[x.type].one)),
        h('td', null, fmtDT(x.row.deleted_at)),
        h('td', { class: 'act' }, isSuper() ? [
          h('button', { class: 'a-btn ghost small', onclick: async function () {
            var u = await db.from(TYPES[x.type].table).update({ deleted_at: null }).eq('id', x.row.id);
            if (u.error) return toast(msgOf(u.error), true);
            toast('Restored. Check its status and dates before it goes live again.'); render();
          } }, 'Restore'),
          h('button', { class: 'a-btn danger small', onclick: function () { purge(x); } }, 'Delete forever')
        ] : null)));
    });
    el.appendChild(h('div', { class: 'a-card', style: 'padding:0' }, h('table', { class: 'a-table' },
      h('thead', null, h('tr', null, h('th', null, 'Title'), h('th', null, 'Type'), h('th', null, 'Deleted'), h('th'))), tbody)));
  }

  async function purge(x) {
    if (!confirm('Permanently delete "' + x.row.title + '"? This cannot be undone.')) return;
    if (x.type === 'documents') {
      var vs = await db.from('document_versions').select('storage_path').eq('document_id', x.row.id);
      var paths = (vs.data || []).map(function (v) { return v.storage_path; });
      if (paths.length) { var rm = await db.storage.from(DOC_BUCKET).remove(paths); if (rm.error) return toast(msgOf(rm.error), true); }
    }
    var d = await db.from(TYPES[x.type].table).delete().eq('id', x.row.id);
    if (d.error) return toast(msgOf(d.error) + ((x.type === 'tenders' || x.type === 'articles') ? ' (Delete or move its documents first.)' : ''), true);
    toast('Deleted permanently.'); render();
  }

  /* ------------------------------------------------------------ users (super admin) */
  async function callUsers(body) {
    var r = await db.functions.invoke('admin-users', { body: body });
    if (r.error) {
      var detail = r.error.message;
      try { if (r.error.context && r.error.context.json) detail = (await r.error.context.json()).error || detail; } catch (e) { /* keep message */ }
      throw new Error(detail);
    }
    if (r.data && r.data.error) throw new Error(r.data.error);
    return r.data;
  }

  async function renderUsers(el) {
    if (!isSuper()) return;
    var res = await db.from('user_roles').select('*').order('created_at');
    if (res.error) throw res.error;

    var email = h('input', { type: 'email', id: 'iu_e', required: true, placeholder: 'name@company.co.za' });
    var name = h('input', { type: 'text', id: 'iu_n', placeholder: 'Full name' });
    var role = h('select', { id: 'iu_r' }, h('option', { value: 'admin' }, 'Admin'), h('option', { value: 'super_admin' }, 'Super admin'));
    var btn = h('button', { class: 'a-btn', type: 'submit' }, 'Send invitation');

    var tbody = h('tbody');
    (res.data || []).forEach(function (u) {
      var self = u.user_id === me.id;
      var sel = h('select', { class: 'a-input', style: 'width:auto', 'aria-label': 'Role for ' + (u.email || ''), disabled: self ? true : null, onchange: async function () {
        try { await callUsers({ action: 'set_role', user_id: u.user_id, role: sel.value }); toast('Role updated.'); render(); }
        catch (e) { toast(msgOf(e), true); sel.value = u.role; }
      } }, h('option', { value: 'admin', selected: u.role === 'admin' ? true : null }, 'Admin'),
        h('option', { value: 'super_admin', selected: u.role === 'super_admin' ? true : null }, 'Super admin'));
      tbody.appendChild(h('tr', null,
        h('td', null, h('div', { class: 't' }, u.full_name || '—'), h('div', { class: 'm' }, u.email), self ? h('div', { class: 'm' }, 'You') : null),
        h('td', null, sel),
        h('td', null, h('span', { class: 'badge ' + (u.active ? 'live' : 'expired') }, u.active ? 'Active' : 'Switched off')),
        h('td', { class: 'act' }, self ? null : h('button', { class: 'a-btn ' + (u.active ? 'danger' : 'ghost') + ' small', onclick: async function () {
          if (u.active && !confirm('Switch off ' + (u.email || 'this user') + '? They will no longer be able to sign in.')) return;
          try { await callUsers({ action: 'set_active', user_id: u.user_id, active: !u.active }); toast(u.active ? 'User switched off.' : 'User switched on.'); render(); }
          catch (e) { toast(msgOf(e), true); }
        } }, u.active ? 'Switch off' : 'Switch on'))));
    });

    clear(el);
    el.appendChild(h('h1', null, 'Users'));
    el.appendChild(h('p', { class: 'a-sub' }, 'Admins can create, edit and delete articles, careers, tenders and documents. Super admins can also restore from the bin, manage users and see activity.'));
    el.appendChild(h('form', { class: 'a-card', onsubmit: async function (e) {
      e.preventDefault(); btn.disabled = true;
      try {
        await callUsers({ action: 'invite', email: email.value, full_name: name.value, role: role.value, redirect_to: location.origin + location.pathname });
        toast('Invitation sent to ' + email.value.trim() + '.'); render();
      } catch (err) { toast(msgOf(err), true); btn.disabled = false; }
    } }, h('h2', null, 'Invite someone'),
      h('div', { class: 'a-grid2' },
        h('div', { class: 'a-field' }, h('label', { for: 'iu_e' }, 'Email'), email),
        h('div', { class: 'a-field' }, h('label', { for: 'iu_n' }, 'Name'), name)),
      h('div', { class: 'a-field' }, h('label', { for: 'iu_r' }, 'Role'), role), btn));
    el.appendChild(h('div', { class: 'a-card', style: 'padding:0' }, h('table', { class: 'a-table' },
      h('thead', null, h('tr', null, h('th', null, 'Person'), h('th', null, 'Role'), h('th', null, 'Status'), h('th'))), tbody)));
  }

  /* ------------------------------------------------------------ activity (super admin) */
  async function renderActivity(el) {
    if (!isSuper()) return;
    var r = await db.from('audit_log').select('*').order('id', { ascending: false }).limit(200);
    if (r.error) throw r.error;
    var tbody = h('tbody');
    (r.data || []).forEach(function (a) {
      tbody.appendChild(h('tr', null, h('td', null, fmtDT(a.at)), h('td', null, a.actor_email || 'system'),
        h('td', null, a.action), h('td', null, a.table_name), h('td', null, a.summary || '')));
    });
    clear(el);
    el.appendChild(h('h1', null, 'Activity'));
    el.appendChild(h('p', { class: 'a-sub' }, 'The latest 200 changes: who did what, and when.'));
    el.appendChild(h('div', { class: 'a-card', style: 'padding:0' }, h('table', { class: 'a-table' },
      h('thead', null, h('tr', null, ['When', 'Who', 'What', 'Where', 'Item'].map(function (x) { return h('th', null, x); }))),
      tbody.children.length ? tbody : h('tbody', null, h('tr', null, h('td', { colspan: 5, class: 'a-empty' }, 'Nothing yet.'))))));
  }

  boot();
})();
