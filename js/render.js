// ============================================================
// ANALYZE (render result)
// ============================================================
function analyze() {
  var txt = document.getElementById('sms-input').value.trim();
  var area = document.getElementById('result-area');
  if (!txt) { area.innerHTML = '<div class="alert alert-yellow">⚠️ الرجاء لصق رسالة SMS</div>'; return; }

  var parsed = detectAndParse(txt);
  if (!parsed || !parsed.amount) {
    area.innerHTML = '<div class="alert alert-red">⚠️ تعذّر استخراج البيانات. تأكد أن الرسالة من بنك سعودي (الراجحي / الأهلي / SAB / الأول).</div>';
    return;
  }

  var isCredit = parsed.direction === 'credit';
  if (!isCredit) parsed.type = classifyMerchant(parsed.merchant, parsed.txType);
  window._parsed = parsed;

  var hasAuto = !isCredit && parsed.type && parsed.type !== 'غير محدد';
  var balStr = (parsed.balance !== '' && parsed.balance != null) ? fmt(parsed.balance) + ' ر.س' : '';
  var cardStr = parsed.card ? '•••• ' + parsed.card : '';
  var fxStr = '';
  if (parsed.fxCurrency && parsed.fxAmount) {
    fxStr = parsed.fxCurrency + ' ' + fmt(parsed.fxAmount);
    if (parsed.fxRate) fxStr += ' (سعر الصرف ' + parsed.fxRate + ')';
  }

  var html = '';
  html += '<div class="card" style="margin-top:12px">';

  // رأس: المبلغ + التاجر + الشارة
  html += '<div class="amount-big">';
  html += '<div class="amount-num"' + (isCredit ? ' style="color:var(--green)"' : '') + '>' + (isCredit ? '+ ' : '') + fmt(parsed.amount) + ' <span style="font-size:18px;font-weight:400;color:var(--muted)">ر.س</span></div>';
  html += '<div class="amount-sub">' + (parsed.merchant || '—') + (parsed.txType ? ' · ' + parsed.txType : '') + '</div>';
  html += '<span class="badge ' + (isCredit ? 'badge-blue' : typeBadge(parsed.type)) + '">' + (isCredit ? '➕ ' + (parsed.type || 'إضافة') : parsed.type) + '</span>';
  html += '</div>';

  html += '<div class="card-body">';

  // === الأعلى: التصنيف + الحفظ (بدون سكرول) ===
  if (!isCredit) {
    html += '<div class="field"><label>التصنيف</label>';
    html += '<select id="type-select" onchange="window._parsed.type=this.value">';
    if (!hasAuto) html += '<option value="" disabled selected>— اختر التصنيف —</option>';
    ['أساسيات','كماليات','سداد التمويل','غير محدد'].forEach(function(v) {
      html += '<option value="' + v + '"' + (hasAuto && v === parsed.type ? ' selected' : '') + '>' + v + '</option>';
    });
    html += '</select>';
    if (hasAuto) html += '<div style="font-size:11px;color:var(--green);margin-top:4px">✓ صُنّفت تلقائياً من القاموس — غيّرها إن لزم</div>';
    html += '</div>';
  } else {
    html += '<div class="alert alert-green" style="margin-bottom:8px">➕ حركة إضافة (' + (parsed.type || 'إضافة') + ') — تزيد الرصيد وغير محسوبة في الصرف.</div>';
  }
  html += '<div class="btn-row">';
  html += '<button class="btn btn-green" onclick="saveEntry()">💾 حفظ وإرسال</button>';
  html += '<button class="btn btn-outline" onclick="clearSMS()">مسح</button>';
  html += '</div>';
  html += '<div id="save-status"></div>';

  // === التفاصيل / التعديل (سكرول للأسفل عند الحاجة) ===
  html += '<div class="divider"></div>';
  html += '<div class="field"><label>المبلغ المُسجَّل (ر.س)</label>';
  html += '<input type="number" id="amount-edit" value="' + parsed.amount + '" step="0.01">';
  html += '<div style="font-size:11px;color:var(--muted);margin-top:4px">' + (isCredit ? 'مبلغ السداد: ' : 'المخصوم: ') + fmt(parsed.amount) + ' ر.س' + (isCredit ? '' : ' — عدّله لو الخصم مشترك') + '</div></div>';
  html += '<div class="field"><label>ملاحظة (اختياري)</label><input type="text" id="note-edit" placeholder="مثال: قسمتها مع فلان"></div>';
  html += '<div class="drow"><span class="drow-key">التاريخ</span><span class="drow-val">' + parsed.date + '</span></div>';
  html += '<div class="drow"><span class="drow-key">البنك</span><span class="drow-val">' + (parsed.bank || '—') + '</span></div>';
  if (cardStr) html += '<div class="drow"><span class="drow-key">البطاقة</span><span class="drow-val">' + cardStr + '</span></div>';
  if (parsed.method) html += '<div class="drow"><span class="drow-key">طريقة الدفع</span><span class="drow-val">' + parsed.method + '</span></div>';
  if (fxStr) html += '<div class="drow"><span class="drow-key">العملة الدولية</span><span class="drow-val">' + fxStr + '</span></div>';
  if (balStr) html += '<div class="drow"><span class="drow-key">الرصيد</span><span class="drow-val">' + balStr + '</span></div>';

  html += '</div></div>';

  area.innerHTML = html;
}

function clearSMS() {
  document.getElementById('sms-input').value = '';
  document.getElementById('result-area').innerHTML = '';
}

var MONTH_NAMES = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

// ============================================================
// DASHBOARD (top of parse tab)
// ============================================================
function renderDashboard() {
  var el = document.getElementById('dashboard');
  if (!el) return;
  var now = new Date();
  var curM = today().substring(0, 7);
  var monthLabel = MONTH_NAMES[now.getMonth()];

  var month = expenses.filter(function(e) { return e.date && e.date.indexOf(curM) === 0 && e.direction !== 'credit'; });
  var byType = { 'أساسيات': 0, 'كماليات': 0, 'سداد التمويل': 0, 'غير محدد': 0 };
  month.forEach(function(e) {
    var t = byType.hasOwnProperty(e.type) ? e.type : 'غير محدد';
    byType[t] += (e.amount || 0);
  });
  var spent = byType['أساسيات'] + byType['كماليات'] + byType['سداد التمويل'] + byType['غير محدد'];
  var remaining = settings.salary - spent;
  var count = month.length;

  var html = '';

  // Hero
  html += '<div class="hero stagger">';
  html += '<div class="hero-top"><span class="hero-label">💸 صرفت خلال ' + monthLabel + '</span><span class="hero-chip">' + count + ' عملية</span></div>';
  html += '<div class="hero-amount"><span class="cur">ر.س</span><span data-count="' + spent.toFixed(2) + '" data-decimals="2">0</span></div>';
  html += '<div class="hero-grid">';
  html += '<div class="hero-stat"><div class="hero-stat-label">المتبقي من الراتب</div><div class="hero-stat-val">' + fmtInt(remaining) + ' ر.س</div><div class="hero-stat-sub">من ' + fmtInt(settings.salary) + '</div></div>';
  html += '<div class="hero-stat"><div class="hero-stat-label">الأساسيات</div><div class="hero-stat-val">' + fmtInt(byType['أساسيات']) + ' ر.س</div><div class="hero-stat-sub">الحد ' + fmtInt(settings.basic) + '</div></div>';
  html += '</div></div>';

  // Donut distribution
  html += '<div class="card stagger"><div class="card-body">';
  html += '<div class="card-title">📊 توزيع المصروفات · ' + monthLabel + '</div>';
  if (spent <= 0) {
    html += '<div class="empty" style="padding:18px"><div class="empty-icon">🧾</div><div class="empty-text">لا توجد مصروفات هذا الشهر بعد</div></div>';
  } else {
    var segs = [
      { label: 'أساسيات', value: byType['أساسيات'], colorVar: 'var(--c-ess)' },
      { label: 'كماليات', value: byType['كماليات'], colorVar: 'var(--c-lux)' },
      { label: 'سداد التمويل', value: byType['سداد التمويل'], colorVar: 'var(--c-loan)' },
      { label: 'غير محدد', value: byType['غير محدد'], colorVar: 'var(--c-unk)' }
    ];
    html += '<div class="donut-wrap">';
    html += donutChart(segs, count, 'عملية');
    html += '<div class="legend">';
    segs.forEach(function(s) {
      if (s.value <= 0) return;
      var pct = Math.round((s.value / spent) * 100);
      html += '<div class="legend-row">'
        + '<span class="legend-dot" style="background:' + s.colorVar + '"></span>'
        + '<span class="legend-name">' + s.label + '</span>'
        + '<span class="legend-val">' + fmtInt(s.value) + '</span>'
        + '<span class="legend-pct">' + pct + '%</span>'
        + '</div>';
    });
    html += '</div></div>';
  }
  html += '</div></div>';

  el.innerHTML = html;
  if (typeof animateCounts === 'function') animateCounts(el);
}

// ============================================================
// HISTORY TAB
// ============================================================
function filterHist(type, el) {
  histFilter = type;
  document.querySelectorAll('.filt-btn').forEach(function(b) { b.classList.remove('active'); });
  el.classList.add('active');
  renderHistory();
}

function renderHistory() {
  var el = document.getElementById('history-content');
  var data = histFilter === 'all' ? expenses.slice() : expenses.filter(function(e) { return e.type === histFilter; });
  data.sort(function(a,b) {
    var da = a.date || '', db = b.date || '';
    if (da !== db) return da < db ? 1 : -1;   // أحدث تاريخ أولاً
    var ta = a.time || '', tb = b.time || '';
    if (ta !== tb) return ta < tb ? 1 : -1;   // ثم أحدث وقت للعملية (مو وقت التسجيل)
    return 0;
  });

  if (!data.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">لا توجد سجلات' + (histFilter !== 'all' ? ' لهذا التصنيف' : '') + '</div></div>';
    return;
  }

  // الإجمالي = الصرف فقط (نستثني حركات الإضافة)
  var total = data.reduce(function(s,e) { return s + (e.direction === 'credit' ? 0 : (e.amount||0)); }, 0);

  // أحدث رصيد متاح لكل بطاقة (من كل العمليات)
  var balByCard = {};
  expenses.forEach(function(e) {
    if (e.balance === '' || e.balance == null) return;
    var key = e.card ? ('•••• ' + e.card) : (e.bank || '—');
    var cur = balByCard[key];
    var newer = !cur || (e.date||'') > (cur.date||'') || ((e.date||'') === (cur.date||'') && (Number(e.id)||0) > (Number(cur.id)||0));
    if (newer) balByCard[key] = e;
  });
  var balKeys = Object.keys(balByCard);
  var summary = '';
  if (balKeys.length) {
    summary += '<div class="card" style="margin-bottom:10px"><div class="card-body"><div class="card-title">الرصيد المتاح</div>';
    balKeys.forEach(function(k) {
      summary += '<div class="settings-row"><span>' + k + '</span><span class="settings-val">' + fmt(balByCard[k].balance) + ' ر.س</span></div>';
    });
    summary += '</div></div>';
  }

  var rows = '';
  data.forEach(function(e) {
    var isCredit = e.direction === 'credit';
    var edited = !isCredit && e.origAmount !== '' && e.origAmount != null && Number(e.origAmount) !== Number(e.amount);
    rows += '<div class="hist-item">';
    rows += '<div class="hist-right"><div class="hist-amt"' + (isCredit ? ' style="color:var(--green)"' : '') + '>' + (isCredit ? '+ ' : '') + fmt(e.amount) + ' ر.س</div>'
      + (edited ? '<div class="hist-date">من ' + fmt(e.origAmount) + '</div>' : '')
      + '<div class="hist-date">' + (e.date||'') + (e.time && e.time !== '00:00:00' ? ' · ' + e.time.substring(0,5) : '') + '</div></div>';
    rows += '<div style="flex:1;min-width:0;padding-right:8px">';
    rows += '<div class="hist-name">' + (e.merchant||'—') + '</div>';
    rows += '<div class="hist-sub"><span class="' + typeDot(e.type) + '">●</span> ' + (e.type||'') + (e.bank ? ' · ' + e.bank : '') + '</div>';
    if (e.balance !== '' && e.balance != null) rows += '<div class="hist-sub" style="color:var(--muted)">الرصيد: ' + fmt(e.balance) + ' ر.س</div>';
    if (e.note) rows += '<div class="hist-sub" style="color:var(--muted)">📝 ' + e.note + '</div>';
    rows += '</div></div>';
  });

  var sheetBtn = settings.sheetUrl ? '<a href="' + settings.sheetUrl + '" target="_blank" class="sheet-link">📊 فتح Google Sheets ↗</a>' : '';
  el.innerHTML = summary
    + '<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;padding:12px 15px;font-size:13px"><span style="color:var(--muted)">' + data.length + ' عملية · الصرف</span><span style="font-weight:600">' + fmt(total) + ' ر.س</span></div></div>'
    + '<div class="card">' + rows + '</div>' + sheetBtn;
}

// ============================================================
// FINANCE TAB
// ============================================================
function pBar(label, val, total, color) {
  var pct = Math.min(100, Math.max(0, (val/total)*100));
  return '<div style="margin-bottom:10px">'
    + '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>' + label + '</span><span style="font-weight:600">' + fmtInt(val) + ' ر.س</span></div>'
    + '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%;background:' + color + '"></div></div>'
    + '</div>';
}

function projectionRows(curMonth, total, payment, start) {
  var parts = start.split('-');
  var sy = parseInt(parts[0]), sm = parseInt(parts[1]);
  var months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  var rows = '';
  var from = Math.max(1, curMonth - 1);
  var to = Math.min(24, from + 5);
  for (var i = from; i <= to; i++) {
    var rem = Math.max(0, total - (i-1)*payment);
    var d = new Date(sy, sm - 1 + i - 1);
    var label = months[d.getMonth()] + ' ' + d.getFullYear();
    var isCur = i === curMonth;
    var isMilestone = [6,12,18,24].indexOf(i) >= 0;
    rows += '<tr' + (isCur ? ' class="cur-row"' : '') + '>';
    rows += '<td>' + i + '</td><td>' + label + '</td><td>' + fmtInt(payment) + '</td><td>' + fmtInt(rem) + '</td>';
    rows += '<td>' + (isMilestone ? '⭐' : '') + (isCur ? ' ← الحين' : '') + '</td>';
    rows += '</tr>';
  }
  return rows;
}

function renderFinance() {
  var el = document.getElementById('finance-content');
  var total = settings.total, payment = settings.payment;
  var basic = settings.basic, salary = settings.salary, start = settings.start;
  var free = salary - payment - basic;

  var now = new Date();
  var parts = start.split('-');
  var sy = parseInt(parts[0]), sm = parseInt(parts[1]);
  var monthNum = (now.getFullYear()-sy)*12 + (now.getMonth()+1-sm) + 1;
  var monthsLeft = Math.max(0, 24 - monthNum + 1);
  var totalPaid = expenses.filter(function(e) { return e.type === 'سداد التمويل'; }).reduce(function(s,e) { return s + (e.amount||0); }, 0);
  var paidEst = Math.min(totalPaid, total);
  var remaining = Math.max(0, total - paidEst);
  var progress = Math.min(100, Math.round((paidEst/total)*100));
  var progClass = progress >= 66 ? 'prog-green' : progress >= 33 ? 'prog-orange' : 'prog-red';

  var mNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  var curLabel = mNames[now.getMonth()] + ' ' + now.getFullYear();
  var endD = new Date(sy, sm - 1 + 23); // الشهر الـ24 (آخر قسط)
  var endLabel = mNames[endD.getMonth()] + ' ' + endD.getFullYear();
  var curM = today().substring(0,7);
  var thisMonth = expenses.filter(function(e) { return e.date && e.date.startsWith(curM); });
  var essAct = thisMonth.filter(function(e) { return e.type==='أساسيات'; }).reduce(function(s,e) { return s+e.amount; },0);
  var luxAct = thisMonth.filter(function(e) { return e.type==='كماليات'; }).reduce(function(s,e) { return s+e.amount; },0);
  var loanAct = thisMonth.filter(function(e) { return e.type==='سداد التمويل'; }).reduce(function(s,e) { return s+e.amount; },0);

  var committed = loanAct >= payment;
  var budgetOK = (essAct + luxAct) <= (salary - payment);

  var html = '';

  // بطاقة التقدم
  html += '<div class="card"><div class="card-body">';
  html += '<div class="card-title">تقدم السداد</div>';
  html += '<div class="metrics">';
  html += '<div class="metric"><div class="metric-label">المبلغ الأصلي</div><div class="metric-val">' + fmtInt(total) + ' <span class="metric-unit">ر.س</span></div></div>';
  html += '<div class="metric"><div class="metric-label">المتبقي</div><div class="metric-val" style="color:' + (remaining>0?'var(--red-text)':'var(--green)') + '">' + fmtInt(remaining) + ' <span class="metric-unit">ر.س</span></div></div>';
  html += '</div>';
  html += '<div class="progress-wrap">';
  html += '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:5px"><span>الشهر ' + monthNum + ' من 24</span><span>' + progress + '%</span></div>';
  html += '<div class="progress-track"><div class="progress-fill ' + progClass + '" style="width:' + progress + '%"></div></div>';
  html += '<div style="font-size:11px;color:var(--muted);margin-top:4px">متبقي ' + monthsLeft + ' شهر · ينتهي ' + endLabel + '</div>';
  html += '</div></div></div>';

  // مخطط تناقص الرصيد عبر الزمن
  if (typeof financeChart === 'function') {
    var pts = [];
    for (var k = 0; k <= 24; k++) {
      var d = new Date(sy, sm - 1 + k);
      pts.push({ label: (d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(2), value: Math.max(0, total - k * payment) });
    }
    var markerIdx = Math.max(0, Math.min(24, monthNum - 1));
    html += '<div class="card"><div class="card-body">';
    html += '<div class="card-title">📉 تناقص الرصيد المتبقي</div>';
    html += financeChart(pts, markerIdx);
    html += '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:8px"><span>البداية: ' + fmtInt(total) + ' ر.س</span><span>الحين: ' + fmtInt(Math.max(0, total - markerIdx * payment)) + ' ر.س</span></div>';
    html += '</div></div>';
  }

  // بطاقة الشهر الحالي
  html += '<div class="card"><div class="card-body">';
  html += '<div class="card-title">' + curLabel + '</div>';
  html += '<div class="metrics">';
  html += '<div class="metric"><div class="metric-label">أساسيات فعلية</div><div class="metric-val" style="color:' + (essAct>basic?'var(--red-text)':'var(--green)') + '">' + fmt(essAct) + '</div><div class="metric-sub">هدف ≤ ' + fmtInt(basic) + ' ر.س</div></div>';
  html += '<div class="metric"><div class="metric-label">كماليات فعلية</div><div class="metric-val" style="color:' + (luxAct>free?'var(--red-text)':'inherit') + '">' + fmt(luxAct) + '</div><div class="metric-sub">فائض ' + fmtInt(free) + ' ر.س</div></div>';
  html += '<div class="metric"><div class="metric-label">سداد التمويل</div><div class="metric-val" style="color:' + (committed?'var(--green)':'var(--red-text)') + '">' + fmt(loanAct) + '</div><div class="metric-sub">هدف ' + fmtInt(payment) + ' ر.س</div></div>';
  html += '<div class="metric"><div class="metric-label">مؤشر الالتزام</div><div class="metric-val" style="font-size:26px">' + (committed&&budgetOK?'✅':'❌') + '</div><div class="metric-sub">' + (committed&&budgetOK?'ملتزم':'غير ملتزم بعد') + '</div></div>';
  html += '</div>';
  if (!committed) html += '<div class="alert alert-red">⚠️ لم يُسجَّل سداد التمويل هذا الشهر (' + fmtInt(payment) + ' ر.س)</div>';
  if (essAct > basic) html += '<div class="alert alert-yellow">⚠️ الأساسيات تجاوزت الهدف</div>';
  if (luxAct > free) html += '<div class="alert alert-yellow">⚠️ الكماليات تجاوزت الفائض الحر</div>';
  html += '</div></div>';

  // توزيع الراتب
  html += '<div class="card"><div class="card-body">';
  html += '<div class="card-title">توزيع الراتب</div>';
  html += pBar('القسط المُسدَّد', payment, salary, '#1a56db');
  html += pBar('أساسيات (هدف)', basic, salary, '#057a55');
  html += pBar('فائض حر', free, salary, '#d97706');
  html += '<div class="divider"></div>';
  html += '<div style="font-size:12px;color:var(--muted);text-align:center">الراتب الإجمالي: ' + fmtInt(salary) + ' ر.س/شهر</div>';
  html += '</div></div>';

  // جدول الأشهر
  html += '<div class="card"><div class="card-body">';
  html += '<div class="card-title">الأشهر القادمة</div>';
  html += '<div style="overflow-x:auto"><table class="fin-table">';
  html += '<tr><th>#</th><th>الشهر</th><th>القسط</th><th>المتبقي</th><th></th></tr>';
  html += projectionRows(monthNum, total, payment, start);
  html += '</table></div></div></div>';

  el.innerHTML = html;
}

// ============================================================
// SETTINGS TAB
// ============================================================
function renderSettings() {
  var el = document.getElementById('settings-content');
  var html = '';

  html += '<div class="card"><div class="card-body">';
  html += '<div class="card-title">إعدادات التمويل</div>';
  html += '<div class="field-row"><div class="field"><label>الراتب (ر.س)</label><input type="number" id="s-salary" value="' + settings.salary + '"></div>';
  html += '<div class="field"><label>القسط الشهري (ر.س)</label><input type="number" id="s-payment" value="' + settings.payment + '"></div></div>';
  html += '<div class="field-row"><div class="field"><label>أساسيات (ر.س)</label><input type="number" id="s-basic" value="' + settings.basic + '"></div>';
  html += '<div class="field"><label>إجمالي التمويل (ر.س)</label><input type="number" id="s-total" value="' + settings.total + '"></div></div>';
  html += '<div class="field"><label>تاريخ بداية التمويل (YYYY-MM)</label><input type="text" id="s-start" value="' + settings.start + '" placeholder="2026-05"></div>';
  html += '<button class="btn btn-primary" onclick="saveSettings()">💾 حفظ الإعدادات</button>';
  html += '<div id="s-status"></div>';
  html += '</div></div>';

  html += '<div class="card"><div class="card-body">';
  html += '<div class="card-title">Google Sheets</div>';
  html += '<div class="field"><label>رابط Web App</label><input type="text" id="s-webapp" value="' + (settings.webapp||'') + '" placeholder="https://script.google.com/..."></div>';
  html += '<div class="field"><label>رابط الشيت</label><input type="text" id="s-sheeturl" value="' + (settings.sheetUrl||'') + '"></div>';
  html += '<div class="btn-row">';
  html += '<button class="btn btn-outline btn-sm" onclick="saveWebApp()">حفظ الروابط</button>';
  html += '<button class="btn btn-outline btn-sm" onclick="openSheet()">فتح الشيت ↗</button>';
  html += '</div>';
  html += '<div id="s-webapp-status"></div>';
  html += '</div></div>';

  html += '<div class="card"><div class="card-body">';
  html += '<div class="card-title">البيانات</div>';
  html += '<div class="settings-row"><span>عدد العمليات المحفوظة</span><span class="settings-val">' + expenses.length + ' عملية</span></div>';
  html += '<div class="btn-row" style="margin-top:12px">';
  html += '<button class="btn btn-outline btn-sm" onclick="syncFromSheets()">🔄 تحديث من Sheets</button>';
  html += '<button class="btn btn-danger btn-sm" onclick="clearData()">🗑 مسح البيانات</button>';
  html += '</div>';
  html += '<div id="s-data-status"></div>';
  html += '</div></div>';

  el.innerHTML = html;
}

function saveSettings() {
  settings.salary = parseFloat(document.getElementById('s-salary').value) || settings.salary;
  settings.payment = parseFloat(document.getElementById('s-payment').value) || settings.payment;
  settings.basic = parseFloat(document.getElementById('s-basic').value) || settings.basic;
  settings.total = parseFloat(document.getElementById('s-total').value) || settings.total;
  settings.start = document.getElementById('s-start').value || settings.start;
  localStorage.setItem('settings_v2', JSON.stringify(settings));
  document.getElementById('s-status').innerHTML = '<div class="alert alert-green">✅ تم حفظ الإعدادات</div>';
}

function saveWebApp() {
  settings.webapp = document.getElementById('s-webapp').value.trim();
  settings.sheetUrl = document.getElementById('s-sheeturl').value.trim();
  localStorage.setItem('settings_v2', JSON.stringify(settings));
  document.getElementById('s-webapp-status').innerHTML = '<div class="alert alert-green">✅ تم حفظ الروابط</div>';
}

function openSheet() {
  if (settings.sheetUrl) window.open(settings.sheetUrl, '_blank');
}
