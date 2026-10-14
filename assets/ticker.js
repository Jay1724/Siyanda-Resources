// Precious metals ticker. Reads assets/prices.json (refreshed on a schedule);
// hides itself if the file is missing, malformed or older than MAX_AGE_H hours.
(function () {
  var MAX_AGE_H = 96; // covers a weekend gap
  var section = document.getElementById('metals-ticker');
  var track = document.getElementById('ticker-track');
  var meta = document.getElementById('ticker-meta');
  if (!section || !track) return;

  function fmt(n, cur) {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n);
  }

  function item(m, cur) {
    var el = document.createElement('div');
    el.className = 'tick';
    var name = document.createElement('span'); name.className = 'tick-name'; name.textContent = m.name;
    var price = document.createElement('span'); price.className = 'tick-price'; price.textContent = fmt(m.price, cur) + '/oz';
    el.appendChild(name); el.appendChild(price);
    if (typeof m.change_pct === 'number') {
      var c = document.createElement('span');
      c.className = 'tick-chg ' + (m.change_pct >= 0 ? 'up' : 'down');
      c.textContent = (m.change_pct >= 0 ? '▲ ' : '▼ ') + Math.abs(m.change_pct).toFixed(2) + '%';
      el.appendChild(c);
    }
    return el;
  }

  fetch('assets/prices.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      var updated = new Date(d.updated);
      if (!d.items || !d.items.length || isNaN(updated) || (Date.now() - updated) > MAX_AGE_H * 3600e3) return;
      var cur = d.currency || 'USD';
      var group = document.createElement('div');
      group.style.display = 'flex';
      d.items.forEach(function (m) { group.appendChild(item(m, cur)); });
      var copy = group.cloneNode(true);
      copy.setAttribute('aria-hidden', 'true');
      track.appendChild(group); track.appendChild(copy);
      track.style.setProperty('--ticker-dur', Math.max(20, d.items.length * 8) + 's');
      if (meta) meta.textContent = 'Updated ' + updated.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
      section.hidden = false;
    })
    .catch(function () { /* leave hidden */ });
})();
