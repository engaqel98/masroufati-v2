// ============================================================
// TABS
// ============================================================
function switchTab(t, el) {
  document.querySelectorAll('.tab').forEach(function(b) { b.classList.remove('active'); });
  el.classList.add('active');
  ['parse','history','finance','settings'].forEach(function(id) {
    document.getElementById('sec-' + id).style.display = id === t ? 'block' : 'none';
  });
  if (t === 'history') renderHistory();
  if (t === 'finance') renderFinance();
  if (t === 'settings') renderSettings();
}

// ============================================================
// INIT
// ============================================================
document.getElementById('m-date').value = today();
loadDictFromSheets();
if (settings.webapp) syncFromSheets();
