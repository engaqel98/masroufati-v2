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
  // حالة التبويب النشط في الشريط السفلي تُدار عبر data-tab (لا تعتمد على العنصر الضاغط)
  document.querySelectorAll('.navbtn[data-tab]').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-tab') === t);
  });
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
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// زر + : ينتقل لتبويب التحليل ويركّز على مربع الرسالة
function quickAnalyze() {
  switchTab('parse');
  var ta = document.getElementById('sms-input');
  if (ta) { try { ta.focus(); } catch (e) {} }
}

// ============================================================
// PRIVACY — إخفاء الأرقام (الافتراضي: مخفية عند كل فتح)
// ============================================================
function applyPrivacyIcon() {
  var btn = document.getElementById('eye-btn');
  if (!btn) return;
  var hidden = document.body.classList.contains('priv');
  btn.textContent = hidden ? '👁️' : '🙈';
  btn.title = hidden ? 'إظهار الأرقام' : 'إخفاء الأرقام';
}
function togglePrivacy() {
  document.body.classList.toggle('priv');
  applyPrivacyIcon();
  if (typeof applyPrivacyDOM === 'function') applyPrivacyDOM();   // أخفِ/أظهر الأرقام فوراً
}

// ============================================================
// INIT
// ============================================================
applyThemeIcon();
applyPrivacyIcon();
document.getElementById('m-date').value = today();
if (typeof refreshPeopleList === 'function') refreshPeopleList();
if (typeof refreshAccountsList === 'function') refreshAccountsList();
renderDashboard();
document.getElementById('sec-parse').classList.add('tab-enter');
loadDictFromSheets();
if (settings.webapp) syncFromSheets();

// تعبئة تلقائية من رابط ?sms=... (لاختصار iOS Shortcuts أو مشاركة أندرويد):
// يلصق نص الرسالة في الحقل ويحلّلها فوراً، ثم ينظّف الرابط.
(function() {
  try {
    var sms = new URLSearchParams(location.search).get('sms');
    if (!sms) return;
    var ta = document.getElementById('sms-input');
    if (ta) { ta.value = sms; if (typeof analyze === 'function') analyze(); }
    if (history.replaceState) history.replaceState(null, '', location.pathname);
  } catch (e) {}
})();
