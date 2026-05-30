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
  html += '<div class="field" style="margin-top:8px"><label>👥 نيابة عن (اختياري)</label>';
  html += '<input type="text" id="behalf-edit" placeholder="اكتب اسم الشخص — تُستثنى من حسابك"' + (parsed.behalf ? ' value="' + htmlEsc(parsed.behalf) + '"' : '') + '>';
  html += '</div>';
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

// حالة الفلتر للشهر — افتراضي: الشهر الحالي للوحة، "all" للسجل
var dashMonth = today().substring(0, 7);
var histMonth = 'all';

function ymLabel(ym) {
  if (ym === 'all') return 'كل الأشهر';
  var p = String(ym).split('-');
  var mi = parseInt(p[1], 10) - 1;
  return (MONTH_NAMES[mi] || p[1]) + ' ' + p[0];
}

function availableMonths() {
  var s = {};
  expenses.forEach(function(e) {
    if (e.date && /^\d{4}-\d{2}/.test(e.date)) s[e.date.substring(0, 7)] = true;
  });
  // الأحدث أولاً
  return Object.keys(s).sort().reverse();
}

function navDash(delta) {
  var months = availableMonths();
  if (!months.length) return;
  var idx = months.indexOf(dashMonth);
  if (idx < 0) idx = 0;
  var ni = idx + delta;
  if (ni < 0 || ni >= months.length) return;
  dashMonth = months[ni];
  renderDashboard();
}

function setHistMonth(ym) {
  histMonth = ym || 'all';
  renderHistory();
}

function htmlEsc(s) {
  return String(s == null ? '' : s).replace(/[<>&"']/g, function(c){
    return { '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;' }[c];
  });
}

// ============================================================
// DASHBOARD (top of parse tab)
// ============================================================
function renderDashboard() {
  var el = document.getElementById('dashboard');
  if (!el) return;
  var curM = dashMonth || today().substring(0, 7);
  var ymp = curM.split('-');
  var monthLabel = (MONTH_NAMES[parseInt(ymp[1], 10) - 1] || ymp[1]);
  var fullMonthLabel = monthLabel + ' ' + ymp[0];

  // كل عمليات الشهر (للعدّ — يطابق السجل بدون النيابة فقط)
  var monthAll = expenses.filter(function(e) {
    return e.date && e.date.indexOf(curM) === 0 && !e.behalf;
  });
  var monthCount = monthAll.length;
  // العمليات المدينة فقط للتجميع المالي (نستثني الدائن)
  var month = monthAll.filter(function(e) { return e.direction !== 'credit'; });
  var byType = { 'أساسيات': 0, 'كماليات': 0, 'سداد التمويل': 0, 'غير محدد': 0 };
  month.forEach(function(e) {
    var t = byType.hasOwnProperty(e.type) ? e.type : 'غير محدد';
    byType[t] += (e.amount || 0);
  });
  var loan = byType['سداد التمويل'];                                  // قسط التمويل الفعلي هذا الشهر — يُعرض منفصلاً
  var spent = byType['أساسيات'] + byType['كماليات'] + byType['غير محدد']; // "صرفت" = مصروف معيشي صافٍ بدون القسط
  // الميزانية: الفائض الحر المخطّط (راتب − قسط مخطّط − حد الأساسيات)، يُستهلك بالكماليات
  var freeBudget = settings.salary - settings.payment - settings.basic;
  var budgetLeft = freeBudget - byType['كماليات'];

  var html = '';

  // شريط التنقّل بين الأشهر (لو فيه أكثر من شهر بيانات)
  var monthsAvail = availableMonths();
  if (monthsAvail.length > 1) {
    var idx = monthsAvail.indexOf(curM);
    if (idx < 0) idx = 0;
    var canNewer = idx > 0;            // أحدث = idx أقل (مصفوفة معكوسة)
    var canOlder = idx < monthsAvail.length - 1;
    html += '<div class="month-nav stagger">';
    html += '<button class="month-nav-btn" ' + (canOlder ? 'onclick="navDash(1)"' : 'disabled') + ' aria-label="شهر أقدم">‹</button>';
    html += '<span class="month-nav-label">' + fullMonthLabel + '</span>';
    html += '<button class="month-nav-btn" ' + (canNewer ? 'onclick="navDash(-1)"' : 'disabled') + ' aria-label="شهر أحدث">›</button>';
    html += '</div>';
  }

  // Hero
  html += '<div class="hero stagger">';
  html += '<div class="hero-top"><span class="hero-label">💸 صرفت خلال ' + monthLabel + '</span><span class="hero-chip">' + monthCount + ' عملية</span></div>';
  html += '<div class="hero-amount"><span class="cur">ر.س</span><span data-count="' + spent.toFixed(2) + '" data-decimals="2">0</span></div>';
  html += '<div class="hero-grid">';
  html += '<div class="hero-stat"><div class="hero-stat-label">المتبقي من الميزانية</div><div class="hero-stat-val">' + fmtInt(budgetLeft) + ' ر.س</div><div class="hero-stat-sub">من فائض ' + fmtInt(freeBudget) + '</div></div>';
  html += '<div class="hero-stat"><div class="hero-stat-label">سداد التمويل</div><div class="hero-stat-val">' + fmtInt(loan) + ' ر.س</div><div class="hero-stat-sub">قسط هذا الشهر</div></div>';
  html += '</div></div>';

  // Donut distribution (يشمل القسط كشريحة منفصلة)
  html += '<div class="card stagger"><div class="card-body">';
  html += '<div class="card-title">📊 توزيع المصروفات · ' + monthLabel + '</div>';
  var outflowTotal = spent + loan; // إجمالي المدين (ess+lux+unk+loan)
  if (outflowTotal <= 0) {
    html += '<div class="empty" style="padding:18px"><div class="empty-icon">🧾</div><div class="empty-text">لا توجد مصروفات هذا الشهر بعد</div></div>';
  } else {
    var segs = [
      { label: 'أساسيات', value: byType['أساسيات'], colorVar: 'var(--c-ess)' },
      { label: 'كماليات', value: byType['كماليات'], colorVar: 'var(--c-lux)' },
      { label: 'غير محدد', value: byType['غير محدد'], colorVar: 'var(--c-unk)' },
      { label: 'سداد التمويل', value: byType['سداد التمويل'], colorVar: 'var(--c-loan)' }
    ];
    html += '<div class="donut-wrap">';
    html += donutChart(segs, monthCount, 'عملية');
    html += '<div class="legend">';
    segs.forEach(function(s) {
      if (s.value <= 0) return;
      var pct = Math.round((s.value / outflowTotal) * 100);
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

  // بطاقة "نيابة عن آخرين" — تجميع لكل اسم عبر كل الفترات (ليس الشهر فقط)
  var byPerson = {};
  expenses.forEach(function(e) {
    var name = e.behalf ? String(e.behalf).trim() : '';
    if (!name) return;
    if (!byPerson[name]) byPerson[name] = { paid: 0, refunded: 0, count: 0 };
    var amt = e.amount || 0;
    if (e.direction === 'credit') byPerson[name].refunded += amt;
    else byPerson[name].paid += amt;
    byPerson[name].count++;
  });
  var people = Object.keys(byPerson).map(function(n) {
    return { name: n, paid: byPerson[n].paid, refunded: byPerson[n].refunded, count: byPerson[n].count, owed: byPerson[n].paid - byPerson[n].refunded };
  });
  people.sort(function(a, b) { return b.owed - a.owed; });

  if (people.length) {
    html += '<div class="card stagger"><div class="card-body">';
    html += '<div class="card-title">👥 نيابة عن آخرين</div>';
    people.forEach(function(p) {
      var cls = p.owed > 0.005 ? ' owe-pos' : ' owe-zero';
      html += '<div class="behalf-row">';
      html += '<div class="behalf-head"><span class="behalf-name">' + htmlEsc(p.name) + '</span><span class="behalf-count">' + p.count + ' عملية</span></div>';
      html += '<div class="behalf-stats">';
      html += '<div><span>دفعت</span><b>' + fmt(p.paid) + '</b></div>';
      html += '<div><span>استرد</span><b>' + fmt(p.refunded) + '</b></div>';
      html += '<div class="behalf-owed' + cls + '"><span>المتبقي عليه</span><b>' + fmt(p.owed) + '</b></div>';
      html += '</div></div>';
    });
    html += '</div></div>';
  }

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
  var data = expenses.filter(function(e) {
    // فلتر الشهر
    if (histMonth !== 'all' && !(e.date && e.date.indexOf(histMonth) === 0)) return false;
    // فلتر التصنيف
    if (histFilter === 'all') return true;
    if (histFilter === 'behalf') return !!e.behalf;
    return e.type === histFilter && !e.behalf;
  });
  data.sort(function(a,b) {
    var da = a.date || '', db = b.date || '';
    if (da !== db) return da < db ? 1 : -1;   // أحدث تاريخ أولاً
    var ta = a.time || '', tb = b.time || '';
    if (ta !== tb) return ta < tb ? 1 : -1;   // ثم أحدث وقت للعملية (مو وقت التسجيل)
    return 0;
  });

  // قائمة الشهور (نبنيها مرة، تُستخدم في كل الحالات)
  var monthsAvail = availableMonths();
  var monthBar = '<div class="hist-month-bar"><label for="hist-month-sel">📅 الشهر</label>'
    + '<select id="hist-month-sel" onchange="setHistMonth(this.value)">'
    + '<option value="all"' + (histMonth === 'all' ? ' selected' : '') + '>كل الأشهر</option>';
  monthsAvail.forEach(function(m) {
    monthBar += '<option value="' + m + '"' + (histMonth === m ? ' selected' : '') + '>' + ymLabel(m) + '</option>';
  });
  monthBar += '</select></div>';

  if (!data.length) {
    el.innerHTML = monthBar + '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">لا توجد سجلات' + (histFilter !== 'all' ? ' لهذا التصنيف' : '') + (histMonth !== 'all' ? ' في ' + ymLabel(histMonth) : '') + '</div></div>';
    return;
  }

  // الصرف = مدين بدون القسط وبدون نيابة (تماشياً مع لوحة الملخّص)
  // ونحسب أيضاً مجاميع النيابة (دفعت/استرد) لعرضها تحت فلتر النيابة
  var spendTotal = 0, loanTotal = 0, behalfPaid = 0, behalfRefund = 0;
  data.forEach(function(e) {
    var amt = e.amount || 0;
    if (e.behalf) {
      if (e.direction === 'credit') behalfRefund += amt;
      else behalfPaid += amt;
      return;
    }
    if (e.direction === 'credit') return;
    if (e.type === 'سداد التمويل') loanTotal += amt;
    else spendTotal += amt;
  });

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
    if (e.behalf) rows += '<div class="hist-sub" style="margin-top:5px"><span class="behalf-tag">👥 ' + htmlEsc(e.behalf) + '</span></div>';
    if (e.balance !== '' && e.balance != null) rows += '<div class="hist-sub" style="color:var(--muted)">الرصيد: ' + fmt(e.balance) + ' ر.س</div>';
    if (e.note) rows += '<div class="hist-sub" style="color:var(--muted)">📝 ' + htmlEsc(e.note) + '</div>';
    rows += '</div></div>';
  });

  var totalCard = '<div class="card" style="margin-bottom:10px"><div class="card-body" style="padding:10px 15px">';
  if (histFilter === 'سداد التمويل') {
    totalCard += '<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--muted)">' + data.length + ' عملية · سداد التمويل</span><span style="font-weight:700;color:var(--blue-text)">' + fmt(loanTotal) + ' ر.س</span></div>';
  } else if (histFilter === 'behalf') {
    var net = behalfPaid - behalfRefund;
    totalCard += '<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--muted)">' + data.length + ' عملية · دفعت نيابة</span><span style="font-weight:700;color:var(--hero-1)">' + fmt(behalfPaid) + ' ر.س</span></div>';
    totalCard += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border-soft)"><span style="color:var(--muted)">استرد</span><span style="font-weight:700;color:var(--green)">' + fmt(behalfRefund) + ' ر.س</span></div>';
    totalCard += '<div style="display:flex;justify-content:space-between;font-size:12.5px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border-soft)"><span style="font-weight:700">المتبقي على الآخرين</span><span style="font-weight:800;color:' + (net > 0.005 ? 'var(--hero-1)' : 'var(--green)') + '">' + fmt(net) + ' ر.س</span></div>';
  } else {
    totalCard += '<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--muted)">' + data.length + ' عملية · الصرف</span><span style="font-weight:700">' + fmt(spendTotal) + ' ر.س</span></div>';
    if (loanTotal > 0) totalCard += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border-soft)"><span style="color:var(--muted)">سداد التمويل (منفصل)</span><span style="font-weight:700;color:var(--blue-text)">' + fmt(loanTotal) + ' ر.س</span></div>';
    if (behalfPaid > 0 || behalfRefund > 0) totalCard += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border-soft)"><span style="color:var(--muted)">نيابة عن آخرين (مستثناة)</span><span style="font-weight:700;color:var(--hero-1)">' + fmt(behalfPaid - behalfRefund) + ' ر.س</span></div>';
  }
  totalCard += '</div></div>';

  var sheetBtn = settings.sheetUrl ? '<a href="' + settings.sheetUrl + '" target="_blank" class="sheet-link">📊 فتح Google Sheets ↗</a>' : '';
  el.innerHTML = monthBar + summary + totalCard + '<div class="card">' + rows + '</div>' + sheetBtn;
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
  var totalPaid = expenses.filter(function(e) { return e.type === 'سداد التمويل' && !e.behalf && e.direction !== 'credit'; }).reduce(function(s,e) { return s + (e.amount||0); }, 0);
  var paidEst = Math.min(totalPaid, total);
  var remaining = Math.max(0, total - paidEst);
  var progress = Math.min(100, Math.round((paidEst/total)*100));
  var progClass = progress >= 66 ? 'prog-green' : progress >= 33 ? 'prog-orange' : 'prog-red';

  var mNames = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  var curLabel = mNames[now.getMonth()] + ' ' + now.getFullYear();
  var endD = new Date(sy, sm - 1 + 23); // الشهر الـ24 (آخر قسط)
  var endLabel = mNames[endD.getMonth()] + ' ' + endD.getFullYear();
  var curM = today().substring(0,7);
  var thisMonth = expenses.filter(function(e) { return e.date && e.date.startsWith(curM) && !e.behalf && e.direction !== 'credit'; });
  var essAct = thisMonth.filter(function(e) { return e.type==='أساسيات'; }).reduce(function(s,e) { return s+(e.amount||0); },0);
  var luxAct = thisMonth.filter(function(e) { return e.type==='كماليات'; }).reduce(function(s,e) { return s+(e.amount||0); },0);
  var loanAct = thisMonth.filter(function(e) { return e.type==='سداد التمويل'; }).reduce(function(s,e) { return s+(e.amount||0); },0);

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
