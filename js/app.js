// ============================================================
// THEME
// ============================================================
function applyThemeIcon() {
  var btn = document.getElementById('theme-btn');
  if (!btn) return;
  var dark = document.documentElement.getAttribute('data-theme') === 'dark';
  btn.textContent = dark ? '☀️' : '🌙';
  btn.title = dark ? 'الوضع الفاتح' : 'الوضع الداكن';
}

function toggleTheme() {
  var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  var next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('theme_v2', next); } catch (e) {}
  applyThemeIcon();
}

// ============================================================
// TABS
// ============================================================
function switchTab(t, el) {
  document.querySelectorAll('.tab').forEach(function(b) { b.classList.remove('active'); });
  el.classList.add('active');
  ['parse','history','finance','settings'].forEach(function(id) {
    document.getElementById('sec-' + id).style.display = id === t ? 'block' : 'none';
  });
  if (t === 'parse') renderDashboard();
  if (t === 'history') renderHistory();
  if (t === 'finance') renderFinance();
  if (t === 'settings') renderSettings();

  // replay entrance animation
  var sec = document.getElementById('sec-' + t);
  sec.classList.remove('tab-enter');
  void sec.offsetWidth;
  sec.classList.add('tab-enter');
}

// ============================================================
// INIT
// ============================================================
applyThemeIcon();
document.getElementById('m-date').value = today();
if (typeof refreshPeopleList === 'function') refreshPeopleList();
renderDashboard();
document.getElementById('sec-parse').classList.add('tab-enter');
loadDictFromSheets();
if (settings.webapp) syncFromSheets();
