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
  var p = window._parsed;
  p.type = document.getElementById('type-select').value;
  await doSave(p);
}

async function saveManual() {
  var amount = parseFloat(document.getElementById('m-amount').value);
  if (!amount || amount <= 0) {
    document.getElementById('manual-status').innerHTML = '<div class="alert alert-red">⚠️ أدخل مبلغاً صحيحاً</div>';
    return;
  }
  var p = {
    date: document.getElementById('m-date').value || today(),
    merchant: document.getElementById('m-merchant').value || 'غير محدد',
    amount: amount,
    type: document.getElementById('m-type').value,
    method: document.getElementById('m-method').value,
    balance: '', card: '', bank: 'يدوي',
    txType: 'إدخال يدوي'
  };
  await doSave(p, 'manual-status');
  if (document.getElementById('manual-status').innerHTML.includes('alert-green')) {
    document.getElementById('m-amount').value = '';
    document.getElementById('m-merchant').value = '';
    document.getElementById('m-method').value = '';
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
    merchant: p.merchant || '',
    amount: p.amount,
    type: p.type || 'غير محدد',
    method: p.method || '',
    balance: p.balance || '',
    card: p.card || '',
    bank: p.bank || '',
    txType: p.txType || '',
    intl: (p.fxCurrency && p.fxAmount) ? (p.fxCurrency + ' ' + p.fxAmount + (p.fxRate ? ' @' + p.fxRate : '')) : ''
  };

  expenses.unshift(entry);
  localStorage.setItem('expenses_v2', JSON.stringify(expenses));

  var statusEl = document.getElementById(statusId);
  if (!settings.webapp) {
    if (btn) btn.innerHTML = origText;
    statusEl.innerHTML = '<div class="alert alert-green">✅ حُفظ محلياً</div>';
    return;
  }

  try {
    var params = new URLSearchParams({
      date: entry.date,
      merchant: encodeURIComponent(entry.merchant),
      amount: entry.amount,
      type: encodeURIComponent(entry.type),
      method: encodeURIComponent(entry.method),
      balance: entry.balance,
      card: entry.card,
      bank: encodeURIComponent(entry.bank),
      intl: encodeURIComponent(entry.intl)
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
  if (!settings.webapp) { statusEl.innerHTML = '<div class="alert alert-red">⚠️ لم يُحدَّد Web App URL</div>'; return; }
  statusEl.innerHTML = '<div class="alert alert-blue">⏳ جاري التحديث...</div>';
  try {
    var resp = await fetch(settings.webapp + '?action=read');
    var json = await resp.json();
    if (json.status === 'ok' && json.rows && json.rows.length > 0) {
      expenses = json.rows;
      localStorage.setItem('expenses_v2', JSON.stringify(expenses));
      statusEl.innerHTML = '<div class="alert alert-green">✅ تم التحديث · ' + expenses.length + ' عملية</div>';
    } else {
      statusEl.innerHTML = '<div class="alert alert-yellow">⚠️ لا توجد بيانات في Sheets</div>';
    }
  } catch(e) {
    statusEl.innerHTML = '<div class="alert alert-red">⚠️ فشل الاتصال: ' + e.message + '</div>';
  }
}

async function loadDictFromSheets() {
  if (!settings.webapp) return;
  try {
    var resp = await fetch(settings.webapp + '?action=dict');
    var json = await resp.json();
    if (json.status === 'ok' && json.dict) {
      ['أساسيات','كماليات','سداد التمويل'].forEach(function(k) {
        if (json.dict[k] && json.dict[k].length > 0) DICT[k] = json.dict[k];
      });
    }
  } catch(e) {}
}

function clearData() {
  if (!confirm('هل أنت متأكد من مسح جميع البيانات المحلية؟')) return;
  expenses = [];
  localStorage.removeItem('expenses_v2');
  document.getElementById('s-data-status').innerHTML = '<div class="alert alert-green">✅ تم مسح البيانات المحلية</div>';
  renderSettings();
}
