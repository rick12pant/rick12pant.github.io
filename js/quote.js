// Quote request form (order.html).
//
// Works with whichever parts the page includes:
//   .order-item rows      -> product quantities (data-pack = units per package)
//   data-price on a row   -> shows line totals and an estimated subtotal
//   #quote-helper         -> fence project helper that suggests quantities
//
// Requests are sent to the Formspree URL in the <form>'s action
// (https://formspree.io/f/<form id>). Without JavaScript the browser posts there
// directly and Formspree shows its own thank-you page. If the action still has
// the YOUR_FORM_ID placeholder (or isn't https), the button opens the customer's
// email app with the request filled in, addressed to data-email.
(function () {
  var form = document.getElementById('quote-form');
  if (!form) return;

  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  var num = new Intl.NumberFormat('en-US');
  var items = Array.prototype.slice.call(form.querySelectorAll('.order-item'));
  var subtotalEl = document.getElementById('order-subtotal');
  var statusEl = document.getElementById('form-status');
  var submitBtn = form.querySelector('button[type="submit"]');
  var showPrices = items.length > 0 && items[0].hasAttribute('data-price');

  // ---------------------------------------------------------------- quantities
  function qtyOf(item) {
    var n = parseInt(item.querySelector('input').value, 10);
    return isNaN(n) || n < 0 ? 0 : n;
  }
  function priceOf(item) { return parseFloat(item.getAttribute('data-price')) || 0; }

  function selectedLines() {
    return items.filter(function (item) { return qtyOf(item) > 0; }).map(function (item) {
      return { name: item.querySelector('input').name, qty: qtyOf(item), price: priceOf(item), total: qtyOf(item) * priceOf(item) };
    });
  }
  function subtotal() {
    return selectedLines().reduce(function (sum, l) { return sum + l.total; }, 0);
  }

  function updateTotals() {
    items.forEach(function (item) {
      var on = qtyOf(item) > 0;
      item.classList.toggle('has-qty', on);
      var out = item.querySelector('.line-total');
      if (out) out.textContent = money.format(qtyOf(item) * priceOf(item));
    });
    if (subtotalEl) subtotalEl.textContent = money.format(subtotal());
  }

  // ---------------------------------------------------------------- project helper
  var helper = document.getElementById('quote-helper');

  // Cheapest (if priced) or least-overage combination of package sizes covering `need`.
  // All package sizes are multiples of 100, so search in units of 100.
  function bestPacks(rows, need) {
    var unit = 100;
    var packs = rows.map(function (row) {
      return { row: row, size: parseInt(row.getAttribute('data-pack'), 10) / unit, price: priceOf(row) };
    });
    var target = Math.ceil(need / unit);
    var maxSize = Math.max.apply(null, packs.map(function (p) { return p.size; }));
    var limit = target + maxSize;
    // best[u] = cheapest way to make exactly u units: { cost, count, from }
    var best = [{ cost: 0, count: 0, from: null }];
    for (var u = 1; u <= limit; u++) {
      best[u] = null;
      packs.forEach(function (p, i) {
        var prev = best[u - p.size];
        if (u - p.size < 0 || !prev) return;
        var cost = prev.cost + (showPrices ? p.price : 0);
        var count = prev.count + 1;
        var cur = best[u];
        if (!cur || cost < cur.cost - 1e-9 || (Math.abs(cost - cur.cost) < 1e-9 && count < cur.count)) {
          best[u] = { cost: cost, count: count, from: i };
        }
      });
    }
    var chosen = null;
    for (var t = target; t <= limit; t++) {
      if (!best[t]) continue;
      if (!showPrices) { chosen = t; break; } // no prices: least overage, then fewest packages
      if (chosen === null || best[t].cost < best[chosen].cost - 1e-9) chosen = t;
    }
    var counts = packs.map(function () { return 0; });
    for (var x = chosen; x > 0; x -= packs[best[x].from].size) counts[best[x].from]++;
    return packs.map(function (p, i) { return { row: p.row, count: counts[i], size: p.size }; })
      .filter(function (r) { return r.count > 0; })
      .sort(function (a, b) { return b.size - a.size; }); // biggest packages first
  }

  function packLabel(row) {
    return row.querySelector('label').textContent.trim().toLowerCase();
  }

  if (helper) {
    var hOut = document.getElementById('helper-result');
    var lastPlan = null;

    function hval(id) { return parseFloat(document.getElementById(id).value); }

    function calc() {
      var length = hval('h-length');
      var unitMult = document.getElementById('h-unit').value === 'miles' ? 5280 : 1;
      var spacing = hval('h-spacing');
      var wires = parseInt(document.getElementById('h-wires').value, 10);
      var electric = parseInt(document.getElementById('h-electric').value, 10) || 0;
      var clip = document.getElementById('h-clip').value;

      if (!(length > 0) || !(spacing > 0) || !(wires > 0)) {
        hOut.hidden = true; lastPlan = null; return;
      }
      electric = Math.min(electric, wires);
      var feet = length * unitMult;
      // Same method as the Usage chart: one clip per wire at each post along the run.
      var posts = Math.ceil(feet / spacing);
      var clips = posts * wires;
      var insulators = posts * electric;

      var clipRows = items.filter(function (r) { return r.getAttribute('data-product') === clip; });
      var insRows = items.filter(function (r) { return r.getAttribute('data-product') === 'ins'; });
      var plan = bestPacks(clipRows, clips);
      if (insulators > 0) plan = plan.concat(bestPacks(insRows, insulators));
      lastPlan = { clip: clip, rows: plan, electric: insulators > 0 };

      var group = clipRows[0].closest('fieldset').querySelector('legend').textContent.trim();
      var list = plan.map(function (p) {
        var isIns = p.row.getAttribute('data-product') === 'ins';
        var price = showPrices ? ' <span class="muted">(' + money.format(p.count * priceOf(p.row)) + ')</span>' : '';
        return '<li><strong>' + p.count + ' &times;</strong> ' + (isIns ? 'Insulators, ' : '') + packLabel(p.row) + price + '</li>';
      }).join('');
      var est = showPrices
        ? '<p class="helper-est">Estimated ' + money.format(plan.reduce(function (s, p) { return s + p.count * priceOf(p.row); }, 0)) + ' plus shipping</p>'
        : '';

      hOut.innerHTML =
        '<p>About <strong>' + num.format(posts) + ' posts</strong> &times; ' + wires + ' wire' + (wires > 1 ? 's' : '') +
        ' = <strong>' + num.format(clips) + ' ' + group + 's</strong>' +
        (insulators > 0 ? ' and <strong>' + num.format(insulators) + ' insulators</strong>' : '') + '.</p>' +
        '<p class="muted">Suggested packages:</p><ul>' + list + '</ul>' + est +
        '<button type="button" class="btn btn-primary" id="helper-apply">Use these quantities</button>';
      hOut.hidden = false;
      document.getElementById('helper-apply').addEventListener('click', applyPlan);
    }

    function applyPlan() {
      if (!lastPlan) return;
      // Replace quantities for the chosen clip (and insulators if used), leave others alone.
      items.forEach(function (row) {
        var p = row.getAttribute('data-product');
        if (p === lastPlan.clip || (p === 'ins' && lastPlan.electric)) row.querySelector('input').value = '';
      });
      lastPlan.rows.forEach(function (p) { p.row.querySelector('input').value = p.count; });
      var notes = form.elements['Project details'];
      if (notes) notes.value = projectText();
      updateTotals();
      document.getElementById('products').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function projectText() {
      var len = document.getElementById('h-length').value;
      var unit = document.getElementById('h-unit').value;
      if (parseFloat(len) === 1) unit = unit === 'miles' ? 'mile' : 'foot';
      return len + ' ' + unit + ' of fence, ' +
        document.getElementById('h-clip').selectedOptions[0].textContent + ', posts every ' +
        document.getElementById('h-spacing').value + ' ft, ' + document.getElementById('h-wires').value +
        ' wires (' + (document.getElementById('h-electric').value || 0) + ' electric)';
    }

    helper.addEventListener('input', calc);
    helper.addEventListener('change', calc);
  }

  // ---------------------------------------------------------------- summary + submit
  function labelFor(el) {
    var l = el.id && form.querySelector('label[for="' + el.id + '"]');
    return (l ? l.textContent : el.name).replace(/\*/g, '').replace(/\(optional\)/i, '').trim();
  }

  function requestSummary() {
    var out = [];
    var lines = selectedLines();
    if (lines.length) {
      out.push('PRODUCTS');
      lines.forEach(function (l) {
        out.push('  ' + l.qty + ' x ' + l.name + (showPrices ? ' @ ' + money.format(l.price) + ' = ' + money.format(l.total) : ''));
      });
      if (showPrices) out.push('Estimated subtotal: ' + money.format(subtotal()) + ' plus shipping');
      out.push('');
    }
    out.push('CUSTOMER');
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.name === '_gotcha' || el.closest('.order-item')) return;
      if ((el.type === 'radio' || el.type === 'checkbox') && !el.checked) return;
      if (el.type === 'submit' || el.type === 'button') return;
      var v = String(el.value || '').trim();
      if (!v) return;
      out.push((el.type === 'radio' ? el.name : labelFor(el)) + ': ' + v);
    });
    return out.join('\n');
  }

  function showStatus(kind, html) {
    statusEl.className = 'form-status ' + kind;
    statusEl.innerHTML = html;
    statusEl.hidden = false;
    statusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function validate() {
    if (items.length && selectedLines().length === 0) {
      var notes = form.elements['Project details'];
      if (!notes || !notes.value.trim()) {
        showStatus('error', 'Please enter a quantity for at least one product, or tell us what you need in the notes.');
        items[0].querySelector('input').focus();
        return false;
      }
    }
    if (!form.checkValidity()) {
      form.classList.add('was-validated');
      var first = form.querySelector('input:invalid, textarea:invalid, select:invalid');
      showStatus('error', 'Please fill in the highlighted fields.');
      if (first) first.focus();
      return false;
    }
    return true;
  }

  var FALLBACK = 'If you have any trouble, call <a href="tel:+12088733000">208-873-3000</a> or email ' +
    '<a href="mailto:tincupcreekfence@gmail.com">tincupcreekfence@gmail.com</a>.';

  function subject() {
    var name = form.elements['Name'] ? form.elements['Name'].value.trim() : '';
    return 'Quote request from ' + (name || 'website');
  }

  function sendByEmail() {
    window.location.href = 'mailto:' + form.getAttribute('data-email') +
      '?subject=' + encodeURIComponent(subject()) + '&body=' + encodeURIComponent(requestSummary());
    showStatus('success', '<strong>Almost done!</strong> Your email app should open with your request filled in. ' +
      'Press <strong>Send</strong> there to send it to us. ' + FALLBACK);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fieldName(name) {
    var el = form.elements[name];
    return el && el.id ? labelFor(el) : name;
  }

  // The Formspree URL, or '' if it hasn't been set up yet.
  function endpointUrl() {
    var url = (form.getAttribute('action') || '').trim();
    return /^https:\/\//.test(url) && !/YOUR_FORM_ID/.test(url) ? url : '';
  }

  function sendToEndpoint(endpoint) {
    var data = new FormData(form);
    items.forEach(function (item) { if (qtyOf(item) === 0) data.delete(item.querySelector('input').name); });
    data.append('Request summary', requestSummary());
    data.append('_subject', subject());

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    fetch(endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (res.ok) return res;
        // Formspree explains rejections as { errors: [{ field, message }] } or { error }
        return res.json().catch(function () { return {}; }).then(function (body) {
          var msgs = (body.errors || []).map(function (e) {
            return (e.field ? fieldName(e.field) + ' ' : '') + e.message;
          });
          if (!msgs.length && body.error) msgs.push(body.error);
          throw new Error(msgs.join('. '));
        });
      })
      .then(function () {
        form.reset();
        updateTotals();
        if (helper) document.getElementById('helper-result').hidden = true;
        showStatus('success', '<strong>Thank you, your request was sent!</strong> We\'ll email you a quote, including shipping, soon.');
      })
      .catch(function (err) {
        var why = err && err.message && !/fetch|network/i.test(err.message) ? ' (' + escapeHtml(err.message) + ')' : '';
        showStatus('error', '<strong>Sorry, your request could not be sent' + why + '.</strong> ' + FALLBACK);
      })
      .then(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.getAttribute('data-label') || 'Request quote';
      });
  }

  form.addEventListener('input', function (e) {
    if (e.target.closest('.order-item')) updateTotals();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    statusEl.hidden = true;
    if (!validate()) return;
    var endpoint = endpointUrl();
    if (endpoint) sendToEndpoint(endpoint); else sendByEmail();
  });

  updateTotals();
})();
