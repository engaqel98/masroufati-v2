// ============================================================
// CHARTS — hand-rolled SVG (no libraries)
// ============================================================

// Donut chart. segments = [{label, value, colorVar}]. Returns SVG string.
function donutChart(segments, centerVal, centerLbl) {
  var size = 116, sw = 16, r = (size - sw) / 2, cx = size / 2, cy = size / 2;
  var total = segments.reduce(function(s, x) { return s + x.value; }, 0);
  var svg = '<svg class="donut" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">';
  // track
  svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--bg-soft)" stroke-width="' + sw + '"/>';

  if (total > 0) {
    svg += '<g transform="rotate(-90 ' + cx + ' ' + cy + ')">';
    var cumulative = 0;
    segments.forEach(function(seg) {
      if (seg.value <= 0) return;
      var pct = (seg.value / total) * 100;
      svg += '<circle class="donut-seg" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none"'
        + ' style="stroke:' + seg.colorVar + '" stroke-width="' + sw + '" pathLength="100"'
        + ' stroke-dasharray="' + pct.toFixed(2) + ' ' + (100 - pct).toFixed(2) + '"'
        + ' stroke-dashoffset="' + (-cumulative).toFixed(2) + '" stroke-linecap="butt"/>';
      cumulative += pct;
    });
    svg += '</g>';
  }
  svg += '<text x="' + cx + '" y="' + (cy - 2) + '" text-anchor="middle" class="donut-center-val">' + centerVal + '</text>';
  svg += '<text x="' + cx + '" y="' + (cy + 13) + '" text-anchor="middle" class="donut-center-lbl">' + centerLbl + '</text>';
  svg += '</svg>';
  return svg;
}

// Area/line chart of remaining balance across months.
// points = [{label, value}]. markerIndex highlights the current month.
function financeChart(points, markerIndex) {
  var W = 508, H = 150, padL = 8, padR = 8, padT = 14, padB = 22;
  var innerW = W - padL - padR, innerH = H - padT - padB;
  var n = points.length;
  if (n < 2) return '';
  var maxV = Math.max.apply(null, points.map(function(p) { return p.value; })) || 1;

  function x(i) { return padL + (innerW * i) / (n - 1); }
  function y(v) { return padT + innerH * (1 - v / maxV); }

  var line = '', area = 'M ' + x(0).toFixed(1) + ' ' + (padT + innerH).toFixed(1);
  points.forEach(function(p, i) {
    var px = x(i).toFixed(1), py = y(p.value).toFixed(1);
    line += (i === 0 ? 'M ' : 'L ') + px + ' ' + py + ' ';
    area += ' L ' + px + ' ' + py;
  });
  area += ' L ' + x(n - 1).toFixed(1) + ' ' + (padT + innerH).toFixed(1) + ' Z';

  var svg = '<svg class="fchart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">';
  svg += '<defs><linearGradient id="fgrad" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0%" stop-color="var(--blue)" stop-opacity="0.32"/>'
    + '<stop offset="100%" stop-color="var(--blue)" stop-opacity="0.02"/></linearGradient></defs>';
  // gridlines
  [0, 0.5, 1].forEach(function(g) {
    var gy = (padT + innerH * g).toFixed(1);
    svg += '<line class="fchart-grid" x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '"/>';
  });
  svg += '<path class="fchart-area" d="' + area + '" fill="url(#fgrad)"/>';
  svg += '<path d="' + line + '" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
  // current-month marker
  if (markerIndex != null && markerIndex >= 0 && markerIndex < n) {
    var mx = x(markerIndex).toFixed(1), my = y(points[markerIndex].value).toFixed(1);
    svg += '<line x1="' + mx + '" y1="' + padT + '" x2="' + mx + '" y2="' + (padT + innerH) + '" stroke="var(--blue)" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"/>';
    svg += '<circle class="fchart-dot" cx="' + mx + '" cy="' + my + '" r="4.5"/>';
  }
  // x labels: first, marker, last
  var lblIdx = [0, n - 1];
  if (markerIndex != null && lblIdx.indexOf(markerIndex) === -1) lblIdx.push(markerIndex);
  lblIdx.forEach(function(i) {
    var anchor = i === 0 ? 'start' : (i === n - 1 ? 'end' : 'middle');
    svg += '<text class="fchart-lbl" x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + anchor + '">' + points[i].label + '</text>';
  });
  svg += '</svg>';
  return svg;
}

// Animate every [data-count] element inside `root` from 0 → its numeric target.
function animateCounts(root) {
  var els = (root || document).querySelectorAll('[data-count]');
  els.forEach(function(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    if (isNaN(target)) return;
    var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
    var dur = 650, start = null;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      var cur = target * eased;
      el.textContent = Number(cur).toLocaleString('ar-SA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = Number(target).toLocaleString('ar-SA', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }
    requestAnimationFrame(step);
  });
}
