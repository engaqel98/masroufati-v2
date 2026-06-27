// ============================================================
// ANALYZE (render result)
// ============================================================
function analyze() {
  var txt = document.getElementById('sms-input').value.trim();
  var area = document.getElementById('result-area');
  if (!txt) { area.innerHTML = '<div class="alert alert-yellow">⚠️ الرجاء لصق رسالة SMS</div>'; return; }

  var parsed = detectAndParse(txt);
  if (!parsed || !parsed.amount) {
    if (typeof saveFailedParse === 'function') saveFailedParse(txt);   // احفظها للمعالجة لاحقاً
    area.innerHTML = '<div class="alert alert-red">⚠️ تعذّر استخراج البيانات — حُفظت الرسالة في «الإعدادات ← رسائل لم تُحلَّل» لمعالجتها لاحقاً.</div>'
      + '<div class="btn-row" style="margin-top:8px"><button class="btn btn-outline btn-sm" onclick="manualFromSMS()">✍️ أدخلها يدوياً الآن</button></div>';
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
  html += '<div class="res2">';

  // رأس: المبلغ + التاجر + الشارة (تصميم ٢)
  html += '<div class="res-head' + (isCredit ? ' credit' : '') + '">';
  html += '<div class="res-big">' + (isCredit ? '+ ' : '') + fmt(parsed.amount) + ' <span class="cur">ر.س</span></div>';
  html += '<div class="res-mer">' + (parsed.merchant || '—') + (parsed.txType ? ' <span>· ' + parsed.txType + '</span>' : '') + '</div>';
  html += '<span class="res-tag badge ' + (isCredit ? 'badge-blue' : typeBadge(parsed.type)) + '">' + (isCredit ? '➕ ' + (parsed.type || 'إضافة') : parsed.type) + '</span>';
  html += '</div>';

  html += '<div class="res-body">';

  // === مطابقة الرصيد: قارن الرصيد المتوقّع بالفعلي للكشف عن عمليات/استردادات غير مُسجَّلة ===
  window._recon = null;
  if (parsed.balance !== '' && parsed.balance != null && !isNaN(parseFloat(parsed.balance))) {
    var acctK = accountKey(parsed);
    var prevE = lastBalanceFor(acctK);
    if (prevE && (parsed.date || '') >= (prevE.date || '')) {
      var prevBal = parseFloat(prevE.balance);
      var newBal = parseFloat(parsed.balance);
      // المتوقّع = رصيد آخر مرساة + الحركات المسجّلة بعدها (بلا رصيد) + حركة هذه العملية
      var expected = prevBal + signedSinceAnchor(acctK, prevE) + (isCredit ? parsed.amount : -parsed.amount);
      var diff = newBal - expected;
      if (Math.abs(diff) > 0.01) {
        var up = diff > 0;
        window._recon = { diff: diff, up: up, date: parsed.date, card: parsed.card || '', bank: parsed.bank || '' };
        html += '<div class="alert ' + (up ? 'alert-green' : 'alert-yellow') + '" id="recon-alert" style="margin-bottom:8px;display:block">'
          + (up ? '💡' : '⚠️') + ' <b>تنبيه مطابقة الرصيد</b><br>'
          + 'الرصيد السابق لهذه البطاقة: ' + fmt(prevBal) + ' ر.س<br>'
          + 'المتوقّع بعد هذه العملية: ' + fmt(expected) + ' ر.س · الفعلي: ' + fmt(newBal) + ' ر.س<br>'
          + '<b>فرق ' + fmt(Math.abs(diff)) + ' ر.س ' + (up ? 'زيادة' : 'نقص') + ' غير مُسجَّل</b> — '
          + (up ? 'غالباً صار استرداد/إيداع لم تُسجَّله.' : 'غالباً صار خصم/عملية لم تُسجَّلها.')
          + '<div class="btn-row" style="margin-top:8px"><button class="btn btn-outline btn-sm" onclick="confirmReconGap()">💵 سجّل الفرق المفقود</button></div>'
          + '<span style="font-size:11px;color:var(--muted)">يمكنك الحفظ عادي — هذا تنبيه فقط لمراجعة عملياتك.</span>'
          + '</div>';
      } else {
        html += '<div class="alert alert-green" style="margin-bottom:8px;font-size:12px">✅ الرصيد مطابق للمتوقّع (لا عمليات مفقودة على هذه البطاقة).</div>';
      }
    }
  }

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
  // للإيداع الوارد: الحقل يمثّل "سداد من شخص" (يُخصم من المتبقي عليه)؛ للخصم: "نيابة عن"
  html += '<div class="field" style="margin-top:8px"><label>' + (isCredit ? '👥 سداد من شخص (اختياري)' : '👥 نيابة عن (اختياري)') + '</label>';
  html += '<input type="text" id="behalf-edit" list="people-list" placeholder="' + (isCredit ? 'اسم الشخص — يُخصم من المتبقي عليه' : 'اكتب اسم الشخص أو اختر من القائمة') + '"' + (parsed.behalf ? ' value="' + htmlEsc(parsed.behalf) + '"' : '') + '>';
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
  html += '<div class="field"><label>💳 البطاقة / الحساب</label>';
  html += '<input type="text" id="acct-edit" list="accounts-list" value="' + htmlEsc(accountKey(parsed)) + '" placeholder="مثال: •••• 1234 أو اسم البنك">';
  html += '<div style="font-size:11px;color:var(--muted);margin-top:4px">صحّحها لو التحليل اختار بطاقة/حساب خطأ — تُستخدم في ملخّص الوارد الشهري</div></div>';
  html += '<div class="drow"><span class="drow-key">التاريخ</span><span class="drow-val">' + parsed.date + '</span></div>';
  html += '<div class="drow"><span class="drow-key">البنك</span><span class="drow-val">' + (parsed.bank || '—') + '</span></div>';
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

// يقرأ الحافظة مباشرة ويحلّل — يوفّر خطوة "اضغط النص ← لصق" اليدوية
function pasteAndAnalyze() {
  var ta = document.getElementById('sms-input');
  if (navigator.clipboard && navigator.clipboard.readText) {
    navigator.clipboard.readText().then(function(t) {
      if (ta) ta.value = t;
      analyze();
    }).catch(function() {
      if (ta) ta.focus();
      var area = document.getElementById('result-area');
      if (area) area.innerHTML = '<div class="alert alert-yellow">⚠️ تعذّر قراءة الحافظة — الصق يدوياً ثم اضغط «تحليل»</div>';
    });
  } else if (ta) {
    ta.focus();
  }
}

// تهريب نص لاستخدامه داخل onclick='...'
function jsStr(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

// صافي ما على شخص = (دفعت نيابة عنه) − (سدّده) عبر كل العمليات
function personOwed(name) {
  var nm = String(name == null ? '' : name).trim();
  var paid = 0, refunded = 0;
  expenses.forEach(function(e) {
    if (!e.behalf || String(e.behalf).trim() !== nm) return;
    var amt = e.amount || 0;
    if (e.direction === 'credit') refunded += amt; else paid += amt;
  });
  return paid - refunded;
}

// تسجيل سداد من شخص: يضيف حركة وارد (credit) باسمه فتنقص من المتبقي عليه.
// الافتراضي = كامل المتبقي (تصفية)، وتقدر تكتب مبلغاً أقل (سداد جزئي).
function recordSettlement(name) {
  var nm = String(name == null ? '' : name).trim();
  if (!nm) return;
  var owed = personOwed(nm);
  var def = owed > 0.005 ? String(Math.round(owed * 100) / 100) : '';
  var v = prompt('كم سدّد «' + nm + '»؟\nالمتبقي عليه: ' + fmt(owed) + ' ر.س', def);
  if (v == null) return;
  var amt = parseFloat(v);
  if (!amt || amt <= 0) return;
  doSave({
    date: today(),
    merchant: 'سداد من ' + nm,
    amount: amt,
    type: 'غير محدد',
    direction: 'credit',
    behalf: nm,
    bank: 'تسوية',
    txType: 'سداد شخص'
  });
}

// تعبئة نموذج الإدخال اليدوي من رسالة تعذّر تحليلها — يعبّي ما أمكن التقاطه
// (التاجر/المبلغ إن وُجد) ويضع النص الكامل في الملاحظة، ثم ينتقل للنموذج.
function manualFromSMS() {
  var txt = (document.getElementById('sms-input').value || '').trim();
  if (!txt) return;
  var p = (typeof detectAndParse === 'function') ? (detectAndParse(txt) || {}) : {};
  var note = document.getElementById('m-note');
  if (note) note.value = txt.replace(/\s+/g, ' ').slice(0, 140);
  var mer = document.getElementById('m-merchant');
  if (mer && p.merchant && p.merchant !== 'غير محدد') mer.value = p.merchant;
  var amt = document.getElementById('m-amount');
  if (amt && p.amount) amt.value = p.amount;
  if (amt) { amt.scrollIntoView({ behavior: 'smooth', block: 'center' }); amt.focus(); }
}

// ============================================================
// PEOPLE (نيابة عن) — اقتراحات الأسماء
// ============================================================
// اتحاد الأسماء المسجّلة في الإعدادات مع أي اسم ظهر في العمليات — فريدة ومرتّبة
function peopleNames() {
  var set = {};
  (settings.people || []).forEach(function(n) {
    var nm = String(n == null ? '' : n).trim(); if (nm) set[nm] = true;
  });
  expenses.forEach(function(e) {
    var nm = (e && e.behalf) ? String(e.behalf).trim() : '';
    if (nm) set[nm] = true;
  });
  return Object.keys(set).sort(function(a, b) { return a.localeCompare(b, 'ar'); });
}

// يملأ قائمة الاقتراحات <datalist> المشتركة لكل حقول "نيابة عن"
function refreshPeopleList() {
  var dl = document.getElementById('people-list');
  if (!dl) return;
  dl.innerHTML = peopleNames().map(function(n) {
    return '<option value="' + htmlEsc(n) + '"></option>';
  }).join('');
}

// يسجّل اسماً جديداً في القائمة الدائمة (الإعدادات) ويحدّث الاقتراحات
function registerPerson(name) {
  var nm = String(name == null ? '' : name).trim();
  if (!nm) return;
  if (!Array.isArray(settings.people)) settings.people = [];
  if (settings.people.indexOf(nm) === -1) {
    settings.people.push(nm);
    localStorage.setItem('settings_v2', JSON.stringify(settings));
  }
  refreshPeopleList();
}

// ============================================================
// البطاقة / الحساب — مفتاح موحّد + اقتراحات + تطبيق اختيار يدوي
// ============================================================
// مفتاح الحساب: "•••• 1234" إن وُجد رقم بطاقة، وإلا اسم البنك
function accountKey(e) {
  if (!e) return '';
  if (e.card) return '•••• ' + e.card;
  return e.bank || '';
}

// أحدث عملية مسجَّلة لنفس البطاقة/الحساب فيها رصيد رقمي — لمطابقة الرصيد
function lastBalanceFor(acctKey) {
  if (!acctKey) return null;
  var best = null;
  expenses.forEach(function(e) {
    if (e.balance === '' || e.balance == null || isNaN(parseFloat(e.balance))) return;
    if (accountKey(e) !== acctKey) return;
    var newer = !best
      || (e.date || '') > (best.date || '')
      || ((e.date || '') === (best.date || '') && fmtTime(e.time) > fmtTime(best.time))
      || ((e.date || '') === (best.date || '') && fmtTime(e.time) === fmtTime(best.time) && (Number(e.id) || 0) > (Number(best.id) || 0));
    if (newer) best = e;
  });
  return best;
}

// هل العملية e بعد المرساة anchor زمنياً؟
function isAfter(e, anchor) {
  var de = e.date || '', da = anchor.date || '';
  if (de !== da) return de > da;
  var te = fmtTime(e.time), ta = fmtTime(anchor.time);
  if (te !== ta) return te > ta;
  return (Number(e.id) || 0) > (Number(anchor.id) || 0);
}

// مجموع المبالغ الموقّعة (إضافة + / خصم −) للعمليات المسجّلة لحساب بعد مرساة معيّنة
// — لإغلاق سلسلة الرصيد عند وجود حركات مسجّلة بلا رصيد بينها.
function signedSinceAnchor(acctKey, anchor) {
  var sum = 0;
  expenses.forEach(function(e) {
    if (accountKey(e) !== acctKey) return;
    if (!isAfter(e, anchor)) return;
    sum += (e.direction === 'credit' ? (e.amount || 0) : -(e.amount || 0));
  });
  return sum;
}

// كشف فجوات الرصيد عبر كل العمليات: لكل حساب نمشي زمنياً، ونقارن كل رصيد فعلي
// بالمتوقّع (رصيد آخر مرساة + مجموع الحركات بينهما). أي فرق = عملية/استرداد غير مُسجَّل.
function detectBalanceGaps(limit) {
  var byAcct = {};
  expenses.forEach(function(e) {
    var k = accountKey(e);
    if (!k) return;
    (byAcct[k] = byAcct[k] || []).push(e);
  });
  var gaps = [];
  Object.keys(byAcct).forEach(function(k) {
    var arr = byAcct[k].slice().sort(function(a, b) {
      var da = a.date || '', db = b.date || '';
      if (da !== db) return da < db ? -1 : 1;
      var ta = fmtTime(a.time), tb = fmtTime(b.time);
      if (ta !== tb) return ta < tb ? -1 : 1;
      return (Number(a.id) || 0) - (Number(b.id) || 0);
    });
    var anchor = null, acc = 0;
    arr.forEach(function(e) {
      var signed = (e.direction === 'credit' ? (e.amount || 0) : -(e.amount || 0));
      var hasBal = !(e.balance === '' || e.balance == null || isNaN(parseFloat(e.balance)));
      if (hasBal) {
        if (anchor) {
          var expected = parseFloat(anchor.balance) + acc + signed;
          var diff = parseFloat(e.balance) - expected;
          if (Math.abs(diff) > 0.01) {
            gaps.push({ acct: k, diff: diff, up: diff > 0, date: e.date, merchant: e.merchant,
              card: e.card || '', bank: e.bank || '', expected: expected, curBal: parseFloat(e.balance) });
          }
        }
        anchor = e; acc = 0;
      } else {
        acc += signed;
      }
    });
  });
  gaps.sort(function(a, b) { return (a.date || '') < (b.date || '') ? 1 : -1; });   // الأحدث أولاً
  return limit ? gaps.slice(0, limit) : gaps;
}

// تسجيل عملية "تسوية فرق رصيد" لإغلاق فجوة (بلا رصيد حتى تُحتسب في السلسلة)
function recordGapEntry(up, amt, date, card, bank, rerender) {
  amt = Math.round(Math.abs(amt) * 100) / 100;
  if (!amt) return;
  doSave({
    date: date || today(),
    merchant: up ? 'استرداد/إيداع غير مسجّل' : 'خصم غير مسجّل',
    amount: amt,
    type: up ? 'استرداد' : 'غير محدد',
    direction: up ? 'credit' : 'debit',
    card: card || '',
    bank: bank || '',
    note: 'تسوية فرق رصيد',
    txType: 'تسوية رصيد'
  });
  if (rerender === 'history' && typeof renderHistory === 'function') renderHistory();
}

// زر التسوية داخل تنبيه التحليل
function confirmReconGap() {
  var r = window._recon;
  if (!r) return;
  var amt = Math.round(Math.abs(r.diff) * 100) / 100;
  if (!confirm('تسجيل عملية ' + (r.up ? 'استرداد/إيداع' : 'خصم') + ' بقيمة ' + fmt(amt) + ' ر.س لتوثيق فرق الرصيد؟')) return;
  recordGapEntry(r.up, r.diff, r.date, r.card, r.bank);
  var b = document.getElementById('recon-alert');
  if (b) b.innerHTML = '✅ سُجّلت تسوية الفرق (' + fmt(amt) + ' ر.س). أكمل حفظ العملية الحالية لإغلاق السلسلة.';
}

// يملأ datalist الحسابات من كل البطاقات/البنوك الظاهرة في العمليات
function refreshAccountsList() {
  var dl = document.getElementById('accounts-list');
  if (!dl) return;
  var set = {};
  expenses.forEach(function(e) { var k = accountKey(e); if (k) set[k] = true; });
  dl.innerHTML = Object.keys(set).sort().map(function(k) {
    return '<option value="' + htmlEsc(k) + '"></option>';
  }).join('');
}

// قيد تسوية يدوي (سداد شخص أُدخل من زر «سجّل سداد») — يخص دفتر الذمم فقط،
// يُخفى من العمليات العامة لكنه يبقى في فلتر «نيابة» ويُنقص المتبقي على الشخص.
function isSettlement(e) {
  return !!(e && e.behalf && e.direction === 'credit' && (e.txType === 'سداد شخص' || e.bank === 'تسوية'));
}

// يطبّق اختيار البطاقة/الحساب اليدوي على كائن العملية قبل الحفظ
function applyAccount(p, val) {
  val = String(val == null ? '' : val).trim();
  if (!val) return;
  var m = val.match(/(\d{3,4})\s*$/);            // ينتهي برقم بطاقة → بطاقة
  if (m) { p.card = m[1]; }
  else { p.bank = val; p.card = ''; }            // اسم بنك/حساب → بنك بدون رقم بطاقة
}

var MONTH_NAMES = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

// حالة الفلتر للشهر — افتراضي: الشهر الحالي للوحة، "all" للسجل
var dashMonth = today().substring(0, 7);
var histMonth = 'all';
var histPerson = 'all';   // فلتر الشخص داخل عرض "نيابة عن"
var histSearch = '';      // نص البحث الحر (تاجر/مبلغ/ملاحظة…)
var histDay = '';         // فلتر يوم محدد YYYY-MM-DD

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
  // لو فيه يوم محدد لا يخص الشهر الجديد، نلغيه حتى لا تتعارض الفلاتر
  if (histDay && (histMonth === 'all' || histDay.indexOf(histMonth) !== 0)) histDay = '';
  renderHistory();
}

function setHistPerson(name) {
  histPerson = name || 'all';
  renderHistory();
}

function setHistDay(v) {
  histDay = v || '';
  if (histDay) histMonth = histDay.substring(0, 7);   // وحّد الشهر مع اليوم المختار
  renderHistory();
}

function setHistSearch(v) {
  histSearch = v || '';
  renderHistory();
  // إعادة التركيز لمربع البحث بعد إعادة رسم القائمة (innerHTML يتلف العنصر)
  var inp = document.getElementById('hist-search');
  if (inp) { inp.focus(); var n = inp.value.length; try { inp.setSelectionRange(n, n); } catch (_) {} }
}

// مطابقة البحث الحر — تاجر/تصنيف/بنك/شخص/ملاحظة/بطاقة/مبلغ
function histMatch(e) {
  var q = (histSearch || '').trim().toLowerCase();
  if (!q) return true;
  var hay = [e.merchant, e.type, e.bank, e.behalf, e.note, e.card, e.method, e.txType, String(e.amount)]
    .join(' ').toLowerCase();
  return hay.indexOf(q) >= 0;
}

function htmlEsc(s) {
  return String(s == null ? '' : s).replace(/[<>&"']/g, function(c){
    return { '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;' }[c];
  });
}

// عرض الوقت HH:MM — يتعامل مع نص "HH:MM:SS" أو رقم (كسر يوم من Google Sheets)
function fmtTime(t) {
  if (t == null || t === '') return '';
  if (typeof t === 'number') {
    var mins = Math.round(t * 24 * 60);
    var hh = Math.floor(mins / 60) % 24, mm = mins % 60;
    return ('0' + hh).slice(-2) + ':' + ('0' + mm).slice(-2);
  }
  return String(t).substring(0, 5);
}

// ============================================================
// DASHBOARD (top of parse tab)
// ============================================================
// صف تصنيف بميزانية: شريط تقدّم + كم صُرف وكم باقي من السقف
function catBudgetRow(name, dotCls, colorVar, spent, budget) {
  var left = budget - spent;
  var over = left < -0.005;
  var pct = budget > 0 ? Math.min(100, Math.max(0, (spent / budget) * 100)) : (spent > 0 ? 100 : 0);
  var html = '<div class="cat-row">';
  html += '<div class="cat-head"><span class="cat-name"><span class="' + dotCls + '">●</span> ' + name + '</span>';
  html += '<span class="cat-left' + (over ? ' neg' : '') + '">باقي ' + fmtInt(left) + ' ر.س</span></div>';
  html += '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%;background:' + (over ? 'var(--red-text)' : colorVar) + '"></div></div>';
  html += '<div class="cat-sub">صُرف ' + fmt(spent) + ' من ' + fmtInt(budget) + ' ر.س' + (over ? ' · تجاوزت بـ ' + fmt(-left) : '') + '</div>';
  html += '</div>';
  return html;
}

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
  var essLeft = settings.basic - byType['أساسيات'];   // متبقي مظروف الأساسيات (سقف 2750)
  var luxLeft = freeBudget - byType['كماليات'];        // متبقي الفائض الحر (للكماليات)

  var html = '';

  // بطل التمويل (تصميم ٢) — العدّ التنازلي للمتبقّي + شريط ٢٤ شهر
  (function () {
    var fTotal = settings.total, fPay = settings.payment;
    var sp = String(settings.start || '2026-05').split('-');
    var fsy = parseInt(sp[0], 10), fsm = parseInt(sp[1], 10);
    var nowD = new Date();
    var fMonthNum = (nowD.getFullYear() - fsy) * 12 + (nowD.getMonth() + 1 - fsm) + 1;
    fMonthNum = Math.max(1, Math.min(24, fMonthNum));
    var fPaidAmt = expenses.filter(function (e) { return e.type === 'سداد التمويل' && !e.behalf && e.direction !== 'credit'; })
      .reduce(function (s, e) { return s + (e.amount || 0); }, 0);
    fPaidAmt = Math.min(fPaidAmt, fTotal);
    var fRemaining = Math.max(0, fTotal - fPaidAmt);
    var fPaidMonths = fPay > 0 ? Math.round(fPaidAmt / fPay) : 0;
    var fMonthsLeft = Math.max(0, 24 - fMonthNum + 1);
    var endD = new Date(fsy, fsm - 1 + 23);
    var fEnd = MONTH_NAMES[endD.getMonth()] + ' ' + endD.getFullYear();
    var comb = '';
    for (var i = 1; i <= 24; i++) {
      var cls = i <= fPaidMonths ? 'paid' : (i === fMonthNum ? 'now' : '');
      comb += '<span class="' + cls + '"></span>';
    }
    html += '<div class="fin-hero stagger">';
    html += '<div class="fh-eyebrow"><span class="fh-dot"></span> خطة التمويل · يتبقّى ' + fMonthsLeft + ' شهر</div>';
    html += '<div class="fh-big">' + fmtInt(fRemaining) + ' <span class="cur">ر.س</span></div>';
    html += '<div class="fh-sub">المتبقّي من إجمالي <b>' + fmtInt(fTotal) + ' ر.س</b></div>';
    html += '<div class="comb">' + comb + '</div>';
    html += '<div class="fh-foot"><div>التقدّم<b>شهر ' + fMonthNum + ' / 24</b></div>'
      + '<div>القسط الشهري<b>' + fmtInt(fPay) + ' ر.س</b></div>'
      + '<div>الانتهاء<b>' + fEnd + '</b></div></div>';
    html += '</div>';
  })();

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

  // بطاقة شاملة: المتبقي حسب كل تصنيف (مع غير محدد + نيابة)
  var unk = byType['غير محدد'];
  var nPaid = 0, nRefund = 0;
  expenses.forEach(function(e) {
    if (!e.behalf) return;
    if (e.direction === 'credit') nRefund += (e.amount || 0); else nPaid += (e.amount || 0);
  });
  var nOwed = nPaid - nRefund;
  html += '<div class="card stagger"><div class="card-body">';
  html += '<div class="card-title">📊 المتبقي حسب التصنيف · ' + monthLabel + '</div>';
  html += catBudgetRow('أساسيات', 'dot-ess', 'var(--c-ess)', byType['أساسيات'], settings.basic);
  html += catBudgetRow('كماليات', 'dot-lux', 'var(--c-lux)', byType['كماليات'], freeBudget);
  html += catBudgetRow('سداد التمويل', 'dot-loan', 'var(--c-loan)', byType['سداد التمويل'], settings.payment);
  html += '<div class="cat-row"><div class="cat-head"><span class="cat-name"><span class="dot-unk">●</span> غير محدد</span><span class="cat-left">صُرف ' + fmtInt(unk) + ' ر.س</span></div><div class="cat-sub">بدون سقف — صنّفها لتدخل أحد المظاريف</div></div>';
  html += '<div class="cat-row"><div class="cat-head"><span class="cat-name">👥 نيابة عن آخرين</span><span class="cat-left' + (nOwed > 0.005 ? '' : ' ') + '">باقي على الآخرين ' + fmtInt(nOwed) + ' ر.س</span></div><div class="cat-sub">دفعت ' + fmt(nPaid) + ' · استرد ' + fmt(nRefund) + ' · تراكمي (مستثناة من ميزانيتك)</div></div>';
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
    var totalOwed = people.reduce(function(s, p) { return s + p.owed; }, 0);
    html += '<div class="card stagger"><div class="card-body">';
    html += '<div class="card-title" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><span>👥 نيابة عن آخرين</span><span class="behalf-total' + (totalOwed > 0.005 ? ' owe-pos' : ' owe-zero') + '">المجموع لك عند الآخرين: <b>' + fmt(totalOwed) + '</b></span></div>';
    people.forEach(function(p) {
      var cls = p.owed > 0.005 ? ' owe-pos' : ' owe-zero';
      html += '<div class="behalf-row">';
      html += '<div class="behalf-head"><span class="behalf-name">' + htmlEsc(p.name) + '</span><span class="behalf-count">' + p.count + ' عملية</span></div>';
      html += '<div class="behalf-stats">';
      html += '<div><span>دفعت</span><b>' + fmt(p.paid) + '</b></div>';
      html += '<div><span>استرد</span><b>' + fmt(p.refunded) + '</b></div>';
      html += '<div class="behalf-owed' + cls + '"><span>المتبقي عليه</span><b>' + fmt(p.owed) + '</b></div>';
      html += '</div>';
      html += '<div class="btn-row" style="margin-top:8px"><button class="btn btn-outline btn-sm" onclick="recordSettlement(\'' + jsStr(p.name) + '\')">💵 سجّل سداد / تصفية</button></div>';
      html += '</div>';
    });
    html += '</div></div>';
  }

  el.innerHTML = html;
  if (typeof animateCounts === 'function') animateCounts(el);
}

// ============================================================
// HISTORY TAB
// ============================================================
// شارة (pill) ولون حسب التصنيف، وأيقونة العملية — لمطابقة تصميم ٢
function pillClass(type, isCredit) {
  if (isCredit) return 'p-in';
  if (type === 'أساسيات') return 'p-ess';
  if (type === 'كماليات') return 'p-lux';
  if (type === 'سداد التمويل') return 'p-loan';
  return 'p-unk';
}
function txIcon(e) {
  if (e && e.direction === 'credit') {
    if (e.type === 'راتب') return '💸';
    if (e.type === 'استرداد') return '↩️';
    if (e.type === 'سداد بطاقة') return '💳';
    return '⬇️';
  }
  if (!e) return '💳';
  if (e.type === 'أساسيات') return '🛒';
  if (e.type === 'كماليات') return '🛍️';
  if (e.type === 'سداد التمويل') return '🏦';
  return '💳';
}

function filterHist(type, el) {
  histFilter = type;
  if (type !== 'behalf') histPerson = 'all';   // فلتر الشخص يخص عرض النيابة فقط
  document.querySelectorAll('.filt-btn').forEach(function(b) { b.classList.remove('active'); });
  el.classList.add('active');
  renderHistory();
}

// تبويب فجوات الرصيد — قائمة الفروقات بين الرصيد الفعلي والمتوقّع لكل بطاقة
function renderGapsTab(el) {
  var gaps = detectBalanceGaps();
  if (!gaps.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">لا توجد فجوات — كل الأرصدة مطابقة للمتوقّع.</div></div>';
    return;
  }
  var net = gaps.reduce(function(s, g) { return s + g.diff; }, 0);
  var html = '<div class="card" style="margin-bottom:10px"><div class="card-body" style="padding:10px 15px">';
  html += '<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--muted)">' + gaps.length + ' فجوة مكتشفة</span><span style="font-weight:700;color:' + (net >= 0 ? 'var(--green)' : '#d9822b') + '">' + (net >= 0 ? '+ ' : '− ') + fmt(Math.abs(net)) + ' ر.س صافي</span></div>';
  html += '<div style="font-size:11.5px;color:var(--muted);margin-top:6px">فرق بين الرصيد الفعلي والمتوقّع — غالباً عمليات/استردادات لم تُسجَّل. سجّلها لإغلاق الفجوة.</div>';
  html += '</div></div>';

  html += '<div class="card"><div class="card-body">';
  gaps.forEach(function(g) {
    html += '<div class="settings-row" style="flex-wrap:wrap;gap:6px;align-items:center">';
    html += '<span style="flex:1;min-width:140px">' + htmlEsc(g.acct) + ' · ' + g.date + '<br><span style="font-size:11px;color:var(--muted)">المتوقّع ' + fmt(g.expected) + ' · الفعلي ' + fmt(g.curBal) + '</span></span>';
    html += '<span style="font-weight:700;color:' + (g.up ? 'var(--green)' : '#d9822b') + '">' + (g.up ? '+ ' : '− ') + fmt(Math.abs(g.diff)) + ' ر.س</span>';
    html += '<button class="btn btn-outline btn-sm" onclick="recordGapEntry(' + (g.up ? 'true' : 'false') + ',' + Math.abs(g.diff) + ',\'' + g.date + '\',\'' + jsStr(g.card) + '\',\'' + jsStr(g.bank) + '\',\'history\')">💵 سجّل</button>';
    html += '</div>';
  });
  html += '</div></div>';
  el.innerHTML = html;
}

function renderHistory() {
  var el = document.getElementById('history-content');

  // تبويب مستقل: فجوات الرصيد (مستقل عن فلاتر الشهر/البحث)
  if (histFilter === 'gaps') { renderGapsTab(el); return; }

  // أشخاص "نيابة عن" ضمن نطاق الشهر المحدد — لبناء فلتر الاسم في عرض الدفتر
  var behalfPeople = {};
  expenses.forEach(function(e) {
    if (!e.behalf) return;
    if (histMonth !== 'all' && !(e.date && e.date.indexOf(histMonth) === 0)) return;
    if (histDay && e.date !== histDay) return;
    var nm = String(e.behalf).trim();
    if (!nm) return;
    if (!behalfPeople[nm]) behalfPeople[nm] = { paid: 0, refunded: 0, count: 0 };
    var amt = e.amount || 0;
    if (e.direction === 'credit') behalfPeople[nm].refunded += amt; else behalfPeople[nm].paid += amt;
    behalfPeople[nm].count++;
  });
  var behalfNames = Object.keys(behalfPeople).sort(function(a, b) {
    return (behalfPeople[b].paid - behalfPeople[b].refunded) - (behalfPeople[a].paid - behalfPeople[a].refunded);
  });
  // لو الشخص المختار لم يعد ضمن النطاق (تغيّر الشهر مثلاً) نرجع لـ"الكل"
  if (histPerson !== 'all' && behalfNames.indexOf(histPerson) < 0) histPerson = 'all';

  var data = expenses.filter(function(e) {
    // فلتر الشهر
    if (histMonth !== 'all' && !(e.date && e.date.indexOf(histMonth) === 0)) return false;
    // فلتر اليوم المحدد
    if (histDay && e.date !== histDay) return false;
    // البحث الحر
    if (!histMatch(e)) return false;
    // فلتر التصنيف
    if (histFilter === 'all') return !isSettlement(e);   // التسويات تخص دفتر الذمم فقط
    if (histFilter === 'incoming') return e.direction === 'credit' && !e.behalf;   // الوارد للرصيد (سداد بطاقات/حوالات واردة)
    if (histFilter === 'behalf') {                        // عرض الدفتر: يشمل التسويات
      if (!e.behalf) return false;
      if (histPerson !== 'all' && String(e.behalf).trim() !== histPerson) return false;
      return true;
    }
    return e.type === histFilter && !e.behalf;
  });
  data.sort(function(a,b) {
    var da = a.date || '', db = b.date || '';
    if (da !== db) return da < db ? 1 : -1;   // أحدث تاريخ أولاً
    var ta = fmtTime(a.time), tb = fmtTime(b.time);
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

  // شريط فلتر الشخص — يظهر فقط في عرض "نيابة عن"، ويسرد أسماء أصحاب العمليات بالنيابة في الشهر المحدد
  var personBar = '';
  if (histFilter === 'behalf' && behalfNames.length) {
    personBar = '<div class="hist-month-bar"><label for="hist-person-sel">👤 الشخص</label>'
      + '<select id="hist-person-sel" onchange="setHistPerson(this.value)">'
      + '<option value="all"' + (histPerson === 'all' ? ' selected' : '') + '>كل الأشخاص</option>';
    behalfNames.forEach(function(nm) {
      var pnet = behalfPeople[nm].paid - behalfPeople[nm].refunded;
      personBar += '<option value="' + htmlEsc(nm) + '"' + (histPerson === nm ? ' selected' : '') + '>'
        + htmlEsc(nm) + ' · ' + fmt(pnet) + ' ر.س</option>';
    });
    personBar += '</select></div>';
  }

  // البحث الحر — سطر مستقل
  var searchBar = '<div class="hist-search-bar">'
    + '<input id="hist-search" type="search" inputmode="search" placeholder="🔍 ابحث: تاجر، مبلغ، ملاحظة…" value="' + htmlEsc(histSearch) + '" oninput="setHistSearch(this.value)">'
    + '</div>';
  // فلتر اليوم — سطر مستقل
  var dayBar = '<div class="hist-day-bar"><label for="hist-day">📅 يوم</label>'
    + '<input id="hist-day" type="date" value="' + htmlEsc(histDay) + '" onchange="setHistDay(this.value)" title="يوم محدد">'
    + (histDay ? '<button class="hist-day-clear" onclick="setHistDay(\'\')" title="مسح اليوم">✕</button>' : '')
    + '</div>';

  var filterBars = searchBar + dayBar + monthBar + personBar;

  if (!data.length) {
    el.innerHTML = filterBars + '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">لا توجد سجلات' + (histFilter !== 'all' ? ' لهذا التصنيف' : '') + (histPerson !== 'all' ? ' لـ ' + htmlEsc(histPerson) : '') + (histDay ? ' بتاريخ ' + htmlEsc(histDay) : (histMonth !== 'all' ? ' في ' + ymLabel(histMonth) : '')) + (histSearch ? ' مطابقة لـ «' + htmlEsc(histSearch) + '»' : '') + '</div></div>';
    return;
  }

  // الصرف = مدين بدون القسط وبدون نيابة (تماشياً مع لوحة الملخّص)
  // ونحسب أيضاً مجاميع النيابة (دفعت/استرد) لعرضها تحت فلتر النيابة
  var spendTotal = 0, loanTotal = 0;
  data.forEach(function(e) {
    if (e.behalf) return;                       // النيابة مستثناة من الصرف/القسط
    var amt = e.amount || 0;
    if (e.direction === 'credit') return;
    if (e.type === 'سداد التمويل') loanTotal += amt;
    else spendTotal += amt;
  });
  // مجاميع دفتر الذمم للشهر المحدد — مستقلة عن الفلتر، وتشمل التسويات (حتى المخفية من العمليات)
  var behalfPaid = 0, behalfRefund = 0;
  expenses.forEach(function(e) {
    if (!e.behalf) return;
    if (histMonth !== 'all' && !(e.date && e.date.indexOf(histMonth) === 0)) return;
    if (histDay && e.date !== histDay) return;
    if (histPerson !== 'all' && String(e.behalf).trim() !== histPerson) return;   // عند اختيار شخص: المجاميع تخصّه فقط
    if (!histMatch(e)) return;
    var amt = e.amount || 0;
    if (e.direction === 'credit') behalfRefund += amt; else behalfPaid += amt;
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

  // ملخّص الوارد (سداد/إضافة) لكل بطاقة/حساب خلال الشهر المحدد — مستقل عن فلتر التصنيف
  var inByAcct = {};
  expenses.forEach(function(e) {
    if (e.direction !== 'credit') return;
    if (e.behalf) return;   // تسويات/سداد الأشخاص تخص دفتر الذمم فقط — ليست دخلاً على البطاقة
    if (histMonth !== 'all' && !(e.date && e.date.indexOf(histMonth) === 0)) return;
    if (histDay && e.date !== histDay) return;
    var k = accountKey(e) || '—';
    if (!inByAcct[k]) inByAcct[k] = { sum: 0, count: 0 };
    inByAcct[k].sum += (e.amount || 0);
    inByAcct[k].count++;
  });
  var inKeys = Object.keys(inByAcct).sort(function(a, b) { return inByAcct[b].sum - inByAcct[a].sum; });
  var inCard = '';
  if (inKeys.length) {
    inCard += '<div class="card" style="margin-bottom:10px"><div class="card-body"><div class="card-title">⬇️ الوارد لكل بطاقة/حساب' + (histMonth !== 'all' ? ' · ' + ymLabel(histMonth) : '') + '</div>';
    var inTotal = 0;
    inKeys.forEach(function(k) {
      inTotal += inByAcct[k].sum;
      inCard += '<div class="settings-row"><span>' + htmlEsc(k) + ' <span style="color:var(--muted);font-size:11px">(' + inByAcct[k].count + ')</span></span><span class="settings-val" style="color:var(--green)">+ ' + fmt(inByAcct[k].sum) + ' ر.س</span></div>';
    });
    if (inKeys.length > 1) inCard += '<div class="settings-row" style="border-top:1px solid var(--border-soft);margin-top:6px;padding-top:8px"><span style="font-weight:700">إجمالي الوارد</span><span class="settings-val" style="color:var(--green);font-weight:800">+ ' + fmt(inTotal) + ' ر.س</span></div>';
    inCard += '</div></div>';
  }

  var rows = '';
  data.forEach(function(e) {
    var isCredit = e.direction === 'credit';
    var edited = !isCredit && e.origAmount !== '' && e.origAmount != null && Number(e.origAmount) !== Number(e.amount);
    var eid = String(e.id || '').replace(/'/g, "\\'");
    var tdisp = fmtTime(e.time);
    var dateLine = (e.date || '') + (tdisp && tdisp !== '00:00' ? ' · ' + tdisp : '');
    rows += '<div class="xtx" onclick="this.classList.toggle(\'open\')">';
    rows += '<div class="tx-main">';
    rows += '<div class="ic">' + txIcon(e) + '</div>';
    rows += '<div class="tx-body"><div class="tx-n">' + (e.merchant || '—') + '</div>';
    rows += '<div class="tx-m"><span class="pill ' + pillClass(e.type, isCredit) + '">' + (e.type || '') + '</span>'
      + (e.bank ? ' ' + e.bank : '')
      + (e.behalf ? ' <span class="behalf-tag">👥 ' + htmlEsc(e.behalf) + '</span>' : '') + '</div></div>';
    rows += '<div class="tx-amt' + (isCredit ? ' plus' : '') + '">' + (isCredit ? '+ ' : '') + fmt(e.amount) + ' ر.س</div>';
    rows += '<span class="tx-chev">⌄</span>';
    rows += '</div>';
    rows += '<div class="tx-exp"><div class="tx-detail"><div class="kv-grid">';
    rows += '<div class="kv"><span>التاريخ</span><b>' + dateLine + '</b></div>';
    if (e.balance !== '' && e.balance != null) rows += '<div class="kv"><span>الرصيد</span><b>' + fmt(e.balance) + ' ر.س</b></div>';
    if (edited) rows += '<div class="kv"><span>المبلغ الأصلي</span><b>' + fmt(e.origAmount) + ' ر.س</b></div>';
    if (e.note) rows += '<div class="kv"><span>ملاحظة</span><b>' + htmlEsc(e.note) + '</b></div>';
    rows += '</div><div class="tx-acts">';
    rows += '<button onclick="event.stopPropagation();editEntry(\'' + eid + '\')">✎ تعديل</button>';
    rows += '<button class="act-del" onclick="event.stopPropagation();deleteEntry(\'' + eid + '\')">🗑 حذف</button>';
    rows += '</div></div></div>';
    rows += '</div>';
  });

  var totalCard = '<div class="card" style="margin-bottom:10px"><div class="card-body" style="padding:10px 15px">';
  if (histFilter === 'سداد التمويل') {
    totalCard += '<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--muted)">' + data.length + ' عملية · سداد التمويل</span><span style="font-weight:700;color:var(--blue-text)">' + fmt(loanTotal) + ' ر.س</span></div>';
  } else if (histFilter === 'incoming') {
    var incTotal = 0, incByType = {};
    data.forEach(function(e) {
      incTotal += (e.amount || 0);
      var tt = e.type || 'إضافة';
      incByType[tt] = (incByType[tt] || 0) + (e.amount || 0);
    });
    totalCard += '<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--muted)">' + data.length + ' عملية · وارد للرصيد</span><span style="font-weight:700;color:var(--green)">+ ' + fmt(incTotal) + ' ر.س</span></div>';
    var incKeys = Object.keys(incByType).sort(function(a, b) { return incByType[b] - incByType[a]; });
    if (incKeys.length > 1) {
      incKeys.forEach(function(tt) {
        totalCard += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border-soft)"><span style="color:var(--muted)">' + htmlEsc(tt) + '</span><span style="font-weight:700;color:var(--green)">+ ' + fmt(incByType[tt]) + ' ر.س</span></div>';
      });
    }
  } else if (histFilter === 'behalf') {
    var net = behalfPaid - behalfRefund;
    var onePerson = histPerson !== 'all';
    totalCard += '<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--muted)">' + data.length + ' عملية · دفعت نيابة' + (onePerson ? ' عن ' + htmlEsc(histPerson) : '') + '</span><span style="font-weight:700;color:var(--hero-1)">' + fmt(behalfPaid) + ' ر.س</span></div>';
    totalCard += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border-soft)"><span style="color:var(--muted)">استرد</span><span style="font-weight:700;color:var(--green)">' + fmt(behalfRefund) + ' ر.س</span></div>';
    totalCard += '<div style="display:flex;justify-content:space-between;font-size:12.5px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border-soft)"><span style="font-weight:700">' + (onePerson ? 'المتبقي عليه' : 'المتبقي على الآخرين') + '</span><span style="font-weight:800;color:' + (net > 0.005 ? 'var(--hero-1)' : 'var(--green)') + '">' + fmt(net) + ' ر.س</span></div>';
    if (onePerson) totalCard += '<div class="btn-row" style="margin-top:10px"><button class="btn btn-outline btn-sm" onclick="recordSettlement(\'' + jsStr(histPerson) + '\')">💵 سجّل سداد / تصفية</button></div>';
  } else {
    totalCard += '<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--muted)">' + data.length + ' عملية · الصرف</span><span style="font-weight:700">' + fmt(spendTotal) + ' ر.س</span></div>';
    if (loanTotal > 0) totalCard += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border-soft)"><span style="color:var(--muted)">سداد التمويل (منفصل)</span><span style="font-weight:700;color:var(--blue-text)">' + fmt(loanTotal) + ' ر.س</span></div>';
    if (behalfPaid > 0 || behalfRefund > 0) totalCard += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border-soft)"><span style="color:var(--muted)">نيابة عن آخرين (مستثناة)</span><span style="font-weight:700;color:var(--hero-1)">' + fmt(behalfPaid - behalfRefund) + ' ر.س</span></div>';
  }
  totalCard += '</div></div>';

  var sheetBtn = settings.sheetUrl ? '<a href="' + settings.sheetUrl + '" target="_blank" class="sheet-link">📊 فتح Google Sheets ↗</a>' : '';
  el.innerHTML = filterBars + summary + inCard + totalCard + rows + sheetBtn;
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
  html += '<div class="field"><label>المفتاح السري</label><input type="password" id="s-webappkey" value="' + (settings.webappKey||'') + '" placeholder="مفتاح الحماية (Script Property: SECRET)"></div>';
  html += '<div style="font-size:12px;color:var(--muted);margin:-2px 0 8px">المفتاح يُحفظ في متصفحك فقط ويُرسل مع كل طلب. لازم يطابق قيمة <code>SECRET</code> في إعدادات الـ Apps Script.</div>';
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

  // النسخ الاحتياطي والتصدير
  var learnedCount = Object.keys(learned).length;
  html += '<div class="card"><div class="card-body">';
  html += '<div class="card-title">💾 النسخ الاحتياطي والتصدير</div>';
  html += '<div style="font-size:12.5px;color:var(--muted);margin-bottom:8px">احفظ نسخة كاملة (عمليات + إعدادات + تصنيفات متعلَّمة) أو صدّرها كـCSV.</div>';
  html += '<div class="btn-row">';
  html += '<button class="btn btn-outline btn-sm" onclick="exportBackup()">⬇️ نسخة احتياطية (JSON)</button>';
  html += '<button class="btn btn-outline btn-sm" onclick="document.getElementById(\'import-file\').click()">⬆️ استعادة</button>';
  html += '</div>';
  html += '<div class="btn-row" style="margin-top:8px">';
  html += '<button class="btn btn-outline btn-sm" onclick="exportCSV()">📄 تصدير CSV</button>';
  html += '<button class="btn btn-outline btn-sm" onclick="removeDuplicates()">🔍 فحص التكرارات</button>';
  html += '</div>';
  html += '<div class="settings-row" style="margin-top:12px"><span>تصنيفات متعلَّمة من تصحيحاتك</span><span class="settings-val">' + learnedCount + '</span></div>';
  if (learnedCount) html += '<div class="btn-row" style="margin-top:8px"><button class="btn btn-outline btn-sm" onclick="clearLearned()">🧠 نسيان التصنيفات المتعلَّمة</button></div>';
  html += '<div id="s-backup-status"></div>';
  html += '</div></div>';

  // رسائل لم تُحلَّل — أرشيف للمعالجة لاحقاً
  html += '<div class="card"><div class="card-body">';
  html += '<div class="card-title">📥 رسائل لم تُحلَّل' + (failedMsgs.length ? ' (' + failedMsgs.length + ')' : '') + '</div>';
  if (!failedMsgs.length) {
    html += '<div style="font-size:13px;color:var(--muted)">لا توجد رسائل فاشلة — كل شيء تمام 👍</div>';
  } else {
    html += '<div style="font-size:12.5px;color:var(--muted);margin-bottom:8px">رسائل تعذّر تحليلها وحُفظت تلقائياً. انسخها كلها وألصقها في المحادثة لمعالجتها دفعة واحدة وتحسين المحلّل.</div>';
    html += '<textarea readonly onclick="this.select()" style="width:100%;min-height:120px;font-size:12px;direction:rtl">' + htmlEsc(failedParsesBlob()) + '</textarea>';
    html += '<div class="btn-row" style="margin-top:10px">';
    html += '<button class="btn btn-outline btn-sm" onclick="copyFailedParses()">📋 نسخ الكل</button>';
    html += '<button class="btn btn-outline btn-sm" onclick="cleanFailedParses()">🧹 احذف غير الصالح</button>';
    html += '</div>';
    html += '<div class="btn-row" style="margin-top:8px">';
    html += '<button class="btn btn-danger btn-sm" onclick="clearFailedParses()">🗑 مسح الكل</button>';
    html += '</div>';
  }
  html += '<div id="s-failed-status"></div>';
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
  var keyEl = document.getElementById('s-webappkey');
  if (keyEl) settings.webappKey = keyEl.value.trim();
  settings.sheetUrl = document.getElementById('s-sheeturl').value.trim();
  localStorage.setItem('settings_v2', JSON.stringify(settings));
  document.getElementById('s-webapp-status').innerHTML = '<div class="alert alert-green">✅ تم حفظ الروابط والمفتاح</div>';
}

function openSheet() {
  if (settings.sheetUrl) window.open(settings.sheetUrl, '_blank');
}
