// ============================================================
// SAVE & SYNC
// ============================================================
function fmt(n) {
  return Number(n).toLocaleString('ar-SA', {minimumFractionDigits:2, maximumFractionDigits:2});
}
function fmtInt(n) {
  return Number(n).toLocaleString('ar-SA', {maximumFractionDigits:0});
}

async function saveEntry() {
  if (!window._parsed) return;
  var isCredit = window._parsed.direction === 'credit';
  var typeEl = document.getElementById('type-select');
  var type = isCredit ? (window._parsed.type || 'سداد بطاقة') : (typeEl ? typeEl.value : '');
  if (!isCredit && !type) {
    document.getElementById('save-status').innerHTML = '<div class="alert alert-red">⚠️ الرجاء اختيار التصنيف أولاً</div>';
    return;
  }
  var amt = parseFloat(document.getElementById('amount-edit').value);
  if (!amt || amt <= 0) {
    document.getElementById('save-status').innerHTML = '<div class="alert alert-red">⚠️ أدخل مبلغاً صحيحاً</div>';
    return;
  }
  var p = window._parsed;
  var noteEl = document.getElementById('note-edit');
  p.note = noteEl ? noteEl.value : '';
  p.origAmount = p.amount;
  p.type = type;
  p.amount = amt;
  await doSave(p);
  var st = document.getElementById('save-status');
  if (st && st.innerHTML.indexOf('alert-green') !== -1) {
    var sms = document.getElementById('sms-input');
    if (sms) sms.value = '';
    window._parsed = null;
    document.getElementById('result-area').innerHTML = '<div class="alert alert-green">✅ حُفظت — الصق الرسالة التالية</div>';
  }
}

async function saveManual() {
  var amount = parseFloat(document.getElementById('m-amount').value);
  if (!amount || amount <= 0) {
    document.getElementById('manual-status').innerHTML = '<div class="alert alert-red">⚠️ أدخل مبلغاً صحيحاً</div>';
    return;
  }
  var mType = document.getElementById('m-type').value;
  if (!mType) {
    document.getElementById('manual-status').innerHTML = '<div class="alert alert-red">⚠️ الرجاء اختيار التصنيف</div>';
    return;
  }
  var p = {
    date: document.getElementById('m-date').value || today(),
    merchant: document.getElementById('m-merchant').value || 'غير محدد',
    amount: amount,
    type: mType,
    method: document.getElementById('m-method').value,
    balance: '', card: '', bank: 'يدوي',
    txType: 'إدخال يدوي',
    note: (document.getElementById('m-note') ? document.getElementById('m-note').value : '')
  };
  await doSave(p, 'manual-status');
  if (document.getElementById('manual-status').innerHTML.includes('alert-green')) {
    document.getElementById('m-amount').value = '';
    document.getElementById('m-merchant').value = '';
    document.getElementById('m-method').value = '';
    document.getElementById('m-type').value = '';
    if (document.getElementById('m-note')) document.getElementById('m-note').value = '';
  }
}

async function doSave(p, statusId) {
  statusId = statusId || 'save-status';
  var btn = event && event.target;
  var origText = btn ? btn.innerHTML : '';
  if (btn) btn.innerHTML = '<span class="spin"></span>';

  var entry = {
    id: Date.now(),
    date: p.date || today(),
    time: p.time || '',
    merchant: p.merchant || '',
    amount: p.amount,
    type: p.type || 'غير محدد',
    method: p.method || '',
    balance: p.balance || '',
    card: p.card || '',
    bank: p.bank || '',
    txType: p.txType || '',
    intl: (p.fxCurrency && p.fxAmount) ? (p.fxCurrency + ' ' + p.fxAmount + (p.fxRate ? ' @' + p.fxRate : '')) : '',
    note: p.note || '',
    origAmount: (p.origAmount != null && p.origAmount !== '') ? p.origAmount : p.amount,
    direction: p.direction || 'debit'
  };

  expenses.unshift(entry);
  localStorage.setItem('expenses_v2', JSON.stringify(expenses));
  if (typeof renderDashboard === 'function') renderDashboard();

  var statusEl = document.getElementById(statusId);
  if (!settings.webapp) {
    if (btn) btn.innerHTML = origText;
    statusEl.innerHTML = '<div class="alert alert-green">✅ حُفظ محلياً</div>';
    return;
  }

  try {
    var params = new URLSearchParams({
      date: entry.date,
      time: entry.time,
      merchant: encodeURIComponent(entry.merchant),
      amount: entry.amount,
      type: encodeURIComponent(entry.type),
      method: encodeURIComponent(entry.method),
      balance: entry.balance,
      card: entry.card,
      bank: encodeURIComponent(entry.bank),
      intl: encodeURIComponent(entry.intl),
      txType: encodeURIComponent(entry.txType),
      id: entry.id,
      note: encodeURIComponent(entry.note),
      origAmount: entry.origAmount,
      direction: entry.direction
    });
    var resp = await fetch(settings.webapp + '?' + params.toString());
    var json = await resp.json();
    if (btn) btn.innerHTML = origText;
    if (json.status === 'ok') {
      statusEl.innerHTML = '<div class="alert alert-green">✅ حُفظ محلياً وفي Sheets (صف ' + json.row + ')</div>';
    } else {
      statusEl.innerHTML = '<div class="alert alert-yellow">⚠️ حُفظ محلياً. خطأ في Sheets: ' + (json.message||'') + '</div>';
    }
  } catch(e) {
    if (btn) btn.innerHTML = origText;
    statusEl.innerHTML = '<div class="alert alert-yellow">⚠️ حُفظ محلياً. فشل الرفع: ' + e.message + '</div>';
  }
}

async function syncFromSheets() {
  var statusEl = document.getElementById('s-data-status');
  function setStatus(h) { if (statusEl) statusEl.innerHTML = h; }
  if (!settings.webapp) { setStatus('<div class="alert alert-red">⚠️ لم يُحدَّد Web App URL</div>'); return; }
  setStatus('<div class="alert alert-blue">⏳ جاري التحديث...</div>');
  try {
    var resp = await fetch(settings.webapp + '?action=read');
    var json = await resp.json();
    if (json.status === 'ok' && json.rows && json.rows.length > 0) {
      expenses = json.rows;
      localStorage.setItem('expenses_v2', JSON.stringify(expenses));
      if (typeof renderDashboard === 'function') renderDashboard();
      if (typeof renderHistory === 'function' && document.getElementById('sec-history').style.display !== 'none') renderHistory();
      setStatus('<div class="alert alert-green">✅ تم التحديث · ' + expenses.length + ' عملية</div>');
    } else {
      setStatus('<div class="alert alert-yellow">⚠️ لا توجد بيانات في Sheets</div>');
    }
  } catch(e) {
    setStatus('<div class="alert alert-red">⚠️ فشل الاتصال: ' + e.message + '</div>');
  }
}

async function loadDictFromSheets() {
  if (!settings.webapp) return;
  try {
    var resp = await fetch(settings.webapp + '?action=dict');
    var json = await resp.json();
    if (json.status === 'ok' && json.dict) {
      ['أساسيات','كماليات','سداد التمويل'].forEach(function(k) {
        if (json.dict[k] && json.dict[k].length > 0) {
          var merged = DICT[k] ? DICT[k].slice() : [];
          json.dict[k].forEach(function(w) { if (merged.indexOf(w) === -1) merged.push(w); });
          DICT[k] = merged;
        }
      });
    }
  } catch(e) {}
}

function clearData() {
  if (!confirm('هل أنت متأكد من مسح جميع البيانات المحلية؟')) return;
  expenses = [];
  localStorage.removeItem('expenses_v2');
  if (typeof renderDashboard === 'function') renderDashboard();
  document.getElementById('s-data-status').innerHTML = '<div class="alert alert-green">✅ تم مسح البيانات المحلية</div>';
  renderSettings();
}
