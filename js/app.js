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

// زر + : يفتح ورقة التحليل السفلية
function openAddSheet() {
  document.getElementById('add-backdrop').classList.add('on');
  document.getElementById('add-sheet').classList.add('on');
  // لا نركّز على الحقل تلقائياً — يتفادى ظهور الكيبورد/الزوم عند الفتح
}
function closeAddSheet() {
  document.getElementById('add-backdrop').classList.remove('on');
  document.getElementById('add-sheet').classList.remove('on');
}

// يبدّل الزر العلوي بين «لصق» (وضع التحرير) و«حفظ» (بعد التحليل)
function showTopSave(on) {
  var p = document.getElementById('btn-paste'), s = document.getElementById('btn-savetop');
  if (p) p.style.display = on ? 'none' : '';
  if (s) s.style.display = on ? '' : 'none';
}

// ============================================================
// PRIVACY — إخفاء الأرقام (الافتراضي: مخفية عند كل فتح)
// ============================================================
var EYE_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
var EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7c2 0 3.7.6 5.2 1.5M22 12s-3.5 7-10 7c-2 0-3.7-.6-5.2-1.5"/><path d="M9.5 9.5a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/></svg>';
function applyPrivacyIcon() {
  var btn = document.getElementById('eye-btn');
  if (!btn) return;
  var hidden = document.body.classList.contains('priv');
  btn.innerHTML = hidden ? EYE_OPEN : EYE_OFF;
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
    if (ta) {
      ta.value = sms;
      if (typeof openAddSheet === 'function') openAddSheet();
      if (typeof analyze === 'function') analyze();
    }
    if (history.replaceState) history.replaceState(null, '', location.pathname);
  } catch (e) {}
})();
