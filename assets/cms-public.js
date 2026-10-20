/* Public pages fed by the content portal (Supabase).
 * careers.html -> #vacancies      tenders.html -> #tenders
 * news.html -> #news               article.html -> #article
 * Visitors only ever receive items that are published and not expired: the
 * database's row level security decides that, this file just displays them.
 * Everything is built with textContent / DOM nodes (never innerHTML), so
 * nothing typed into the portal can inject markup. */
(function () {
  'use strict';
  var cfg = window.CMS_CONFIG || {};
  var TZ = 'Africa/Johannesburg';

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
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

  var fmtDate = function (iso) { return new Date(iso).toLocaleDateString('en-ZA', { dateStyle: 'medium', timeZone: TZ }); };
  var fmtDateTime = function (iso) { return new Date(iso).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ }); };
  var fmtSize = function (n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round((n || 0) / 1024)) + ' KB'; };
  var isHttp = function (u) { return /^https?:\/\//i.test(u || ''); };
  var isEmail = function (e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || ''); };
  var stillOpen = function (r) { return !r.expires_at || new Date(r.expires_at) > Date.now(); };
  var closesSoon = function (r) { return r.expires_at && (new Date(r.expires_at) - Date.now()) < 7 * 864e5; };

  function chip(text, cls) { return h('span', { class: 'chip' + (cls ? ' ' + cls : '') }, text); }
  function text(s) { return s ? h('div', { class: 'pre' }, s) : null; }

  function db() {
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_KEY || !window.supabase) return null;
    return window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  function note(mount, msg) { clear(mount); mount.appendChild(h('p', { class: 'listing-note' }, msg)); }

  /* ---------------------------------------------------------- careers */
  function vacancyCard(r) {
    var meta = [r.location, r.department, r.employment_type].filter(Boolean).join(' · ');
    var apply = [];
    if (isHttp(r.apply_url)) apply.push(h('a', { class: 'btn small', href: r.apply_url, target: '_blank', rel: 'noopener' }, 'Apply online'));
    if (isEmail(r.apply_email)) apply.push(h('a', { class: 'btn ghost small', href: 'mailto:' + r.apply_email + '?subject=' + encodeURIComponent('Application: ' + r.title) }, 'Apply by email'));
    return h('article', { class: 'listing' },
      h('div', { class: 'listing-head' }, h('h3', null, r.title),
        r.expires_at ? chip('Closes ' + fmtDate(r.expires_at), closesSoon(r) ? 'soon' : '') : null),
      meta ? h('p', { class: 'meta' }, meta) : null,
      (r.description || r.how_to_apply || apply.length) ? h('details', { class: 'listing-more' },
        h('summary', null, 'Details and how to apply'),
        text(r.description),
        r.how_to_apply ? [h('h4', null, 'How to apply'), text(r.how_to_apply)] : null,
        apply.length ? h('p', { class: 'listing-actions' }, apply) : null) : null);
  }

  async function renderVacancies(mount) {
    var c = db();
    if (!c) return note(mount, 'We could not load the current vacancies. Please try again later.');
    var r = await c.from('careers').select('*').order('expires_at', { ascending: true, nullsFirst: false });
    if (r.error) return note(mount, 'We could not load the current vacancies. Please try again later.');
    var rows = (r.data || []).filter(stillOpen);
    if (!rows.length) return note(mount, 'There are no vacancies open at the moment. Please check back soon, or register your CV below.');
    clear(mount); mount.appendChild(h('div', { class: 'listing-grid' }, rows.map(vacancyCard)));
  }

  /* ---------------------------------------------------------- tenders */
  async function download(c, v, btn) {
    btn.disabled = true;
    try {
      var r = await c.storage.from('documents').createSignedUrl(v.storage_path, 300, { download: v.file_name });
      if (r.error) throw r.error;
      window.location.assign(r.data.signedUrl);
    } catch (e) {
      alert('Sorry, that document could not be downloaded just now. Please try again.');
    } finally { btn.disabled = false; }
  }

  function tenderCard(c, t, docs) {
    return h('article', { class: 'listing' },
      h('div', { class: 'listing-head' },
        h('h3', null, t.reference_no ? t.reference_no + ' — ' + t.title : t.title),
        t.expires_at ? chip('Closes ' + fmtDateTime(t.expires_at), closesSoon(t) ? 'soon' : '') : null),
      t.briefing_at ? h('p', { class: 'meta' }, 'Briefing session: ' + fmtDateTime(t.briefing_at)) : null,
      text(t.description),
      docs.length ? h('div', { class: 'listing-docs' }, h('h4', null, 'Tender documents'),
        docs.map(function (d) {
          var v = d.version;
          var btn = h('button', { class: 'btn small', type: 'button' }, 'Download');
          btn.addEventListener('click', function () { download(c, v, btn); });
          return h('div', { class: 'listing-doc' },
            h('div', null, h('div', { class: 'doc-title' }, d.title),
              h('div', { class: 'meta' }, [v.file_name, fmtSize(v.size_bytes), 'Version ' + v.version_number + (v.change_note ? ' — ' + v.change_note : ''), 'Updated ' + fmtDate(v.uploaded_at)].filter(Boolean).join(' · '))),
            btn);
        })) : null,
      isEmail(t.contact_email) ? h('p', { class: 'listing-actions' }, h('a', { class: 'btn ghost small', href: 'mailto:' + t.contact_email + '?subject=' + encodeURIComponent('Tender enquiry: ' + (t.reference_no || t.title)) }, 'Contact: ' + t.contact_email)) : null);
  }

  async function renderTenders(mount) {
    var c = db();
    var fail = 'We could not load the current tenders. Please try again later.';
    if (!c) return note(mount, fail);
    var tr = await c.from('tenders').select('*').order('expires_at', { ascending: true, nullsFirst: false });
    if (tr.error) return note(mount, fail);
    var tenders = (tr.data || []).filter(stillOpen);
    if (!tenders.length) return note(mount, 'There are no open tenders at the moment. Please check back soon.');

    var ids = tenders.map(function (t) { return t.id; });
    var dr = await c.from('documents').select('id,title,tender_id,current_version_id').in('tender_id', ids).order('title');
    var vr = await c.from('document_versions').select('id,document_id,version_number,storage_path,file_name,size_bytes,change_note,uploaded_at');
    var versions = {};
    (vr.data || []).forEach(function (v) { versions[v.id] = v; });
    var byTender = {};
    (dr.data || []).forEach(function (d) {
      var v = versions[d.current_version_id];
      if (!v) return;                     // not downloadable (or not visible to visitors)
      d.version = v;
      (byTender[d.tender_id] = byTender[d.tender_id] || []).push(d);
    });
    clear(mount);
    mount.appendChild(h('div', { class: 'listing-grid one' }, tenders.map(function (t) { return tenderCard(c, t, byTender[t.id] || []); })));
  }


  /* ---------------------------------------------------------- news */
  var PAGE = 9;
  var isUuid = function (x) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x || ''); };
  var isHttps = function (u) { return /^https:\/\//i.test(u || ''); };
  var articleDate = function (a) { return a.published_at || a.created_at; };

  function newsCard(a) {
    var internal = !!(a.body && a.body.trim());
    var href = internal ? 'article.html?id=' + encodeURIComponent(a.id) : (isHttp(a.source_url) ? a.source_url : null);
    var link = href ? h('a', { class: 'btn ghost small', href: href, target: internal ? null : '_blank', rel: internal ? null : 'noopener' }, 'Read More') : null;
    return h('article', { class: 'news-card' },
      isHttps(a.image_url) ? h('img', { class: 'news-thumb', src: a.image_url, alt: '', loading: 'lazy' }) : null,
      h('div', { class: 'body' }, h('h3', null, a.title),
        h('time', { datetime: articleDate(a) }, fmtDate(articleDate(a))),
        a.summary ? h('p', null, a.summary) : null, link));
  }

  async function renderNews(mount) {
    var c = db();
    var fail = 'We could not load the latest news. Please try again later.';
    if (!c) return note(mount, fail);
    var r = await c.from('articles').select('*').order('published_at', { ascending: false, nullsFirst: false }).limit(60);
    if (r.error) return note(mount, fail);
    var rows = (r.data || []).filter(stillOpen);
    rows.sort(function (x, y) { return new Date(articleDate(y)) - new Date(articleDate(x)); });
    if (!rows.length) return note(mount, 'There is no news to show right now. Please check back soon.');
    var shown = 0, grid = h('div', { class: 'grid g3 news-grid' }), more = h('p', { class: 'listing-actions center-actions' });
    function draw() {
      rows.slice(shown, shown + PAGE).forEach(function (a) { grid.appendChild(newsCard(a)); });
      shown = Math.min(rows.length, shown + PAGE);
      clear(more);
      if (shown < rows.length) more.appendChild(h('button', { class: 'btn ghost', type: 'button', onclick: draw }, 'Show more news'));
    }
    clear(mount); mount.appendChild(grid); mount.appendChild(more); draw();
  }

  async function renderArticle(mount) {
    var c = db();
    var back = h('p', null, h('a', { class: 'a-back', href: 'news.html' }, '\u2190 All news'));
    var missing = function (msg) { clear(mount); mount.appendChild(back); mount.appendChild(h('p', { class: 'listing-note' }, msg)); };
    var id = new URLSearchParams(location.search).get('id');
    if (!isUuid(id)) return missing('We could not find that article.');
    if (!c) return missing('We could not load this article. Please try again later.');
    var r = await c.from('articles').select('*').eq('id', id).maybeSingle();
    if (r.error) return missing('We could not load this article. Please try again later.');
    var a = r.data;
    if (!a || !stillOpen(a)) return missing('This article is no longer available.');
    document.title = a.title + ' | Siyanda Resources';
    var paras = (a.body || '').split(/\n{2,}/).map(function (x) { return x.trim(); }).filter(Boolean);
    clear(mount);
    mount.appendChild(back);
    mount.appendChild(h('article', { class: 'article' },
      h('h1', null, a.title),
      h('p', { class: 'meta' }, h('time', { datetime: articleDate(a) }, fmtDate(articleDate(a)))),
      isHttps(a.image_url) ? h('img', { class: 'article-img', src: a.image_url, alt: '' }) : null,
      a.summary ? h('p', { class: 'lead' }, a.summary) : null,
      paras.map(function (x) { return h('p', { class: 'pre' }, x); }),
      isHttp(a.source_url) ? h('p', { class: 'listing-actions' }, h('a', { class: 'btn ghost small', href: a.source_url, target: '_blank', rel: 'noopener' }, 'Read the original article')) : null));
  }

  /* ---------------------------------------------------------- boot */
  var v = document.getElementById('vacancies'), t = document.getElementById('tenders');
  if (v) renderVacancies(v).catch(function () { note(v, 'We could not load the current vacancies. Please try again later.'); });
  if (t) renderTenders(t).catch(function () { note(t, 'We could not load the current tenders. Please try again later.'); });
  var n = document.getElementById('news'), ar = document.getElementById('article');
  if (n) renderNews(n).catch(function () { note(n, 'We could not load the latest news. Please try again later.'); });
  if (ar) renderArticle(ar).catch(function () { note(ar, 'We could not load this article. Please try again later.'); });
})();
