// ============================================================
// SAVE & SYNC
// ============================================================
// يُلحق المفتاح السري بكل طلب للـ Web App (متى ما كان مضبوطاً في الإعدادات).
// المفتاح يعيش في إعدادات المتصفح فقط — لا يُكتب في الكود العام.
function appendKey(url) {
  if (!settings.webappKey) return url;
  return url + (url.indexOf('?') !== -1 ? '&' : '?') + 'key=' + encodeURIComponent(settings.webappKey);
}

function _loc() { return (typeof localeCode === 'function') ? localeCode() : 'ar-SA'; }
function fmt(n) {
  return Number(n).toLocaleString(_loc(), {minimumFractionDigits:2, maximumFractionDigits:2});
}
function fmtInt(n) {
  return Number(n).toLocaleString(_loc(), {maximumFractionDigits:0});
}

// ============================================================
// أرشيف الرسائل الفاشلة (لمعالجتها لاحقاً دفعة واحدة)
// ============================================================
function saveFailedParse(text) {
  var t = String(text == null ? '' : text).trim();
  if (!t) return;
  if (!Array.isArray(window.failedMsgs)) window.failedMsgs = [];
  if (failedMsgs.some(function(m) { return m.text === t; })) return;   // تفادي التكرار
  failedMsgs.unshift({ id: Date.now(), at: (typeof today === 'function' ? today() : ''), text: t });
  if (failedMsgs.length > 200) failedMsgs = failedMsgs.slice(0, 200);
  localStorage.setItem('failed_parses_v2', JSON.stringify(failedMsgs));
}

function failedParsesBlob() {
  return failedMsgs.map(function(m, i) {
    return '----- [' + (i + 1) + '] ' + (m.at || '') + ' -----\n' + m.text;
  }).join('\n\n');
}

function deleteFailedParse(id) {
  failedMsgs = failedMsgs.filter(function(m) { return String(m.id) !== String(id); });
  localStorage.setItem('failed_parses_v2', JSON.stringify(failedMsgs));
  if (typeof renderSettings === 'function') renderSettings();
}

function clearFailedParses() {
  if (!failedMsgs.length) return;
  if (!confirm('مسح كل الرسائل غير المحلَّلة؟')) return;
  failedMsgs = [];
  localStorage.removeItem('failed_parses_v2');
  if (typeof renderSettings === 'function') renderSettings();
}

// مدخلة تبدو رسالة بنك حقيقية: طول معقول + تحتوي أرقاماً
function looksLikeSms(t) {
  t = String(t == null ? '' : t).trim();
  return t.length >= 15 && /\d/.test(t);
}

// يحذف المدخلات غير الصالحة فقط (حافظة عشوائية لُصقت بالخطأ) ويُبقي رسائل البنوك
function cleanFailedParses() {
  var s = document.getElementById('s-failed-status');
  var kept = failedMsgs.filter(function(m) { return looksLikeSms(m.text); });
  var removed = failedMsgs.length - kept.length;
  if (!removed) { if (s) s.innerHTML = '<div class="alert alert-green">✅ لا توجد مدخلات غير صالحة</div>'; return; }
  if (!confirm('حذف ' + removed + ' مدخلة لا تبدو رسالة بنك (بدون أرقام أو قصيرة جداً)؟')) return;
  failedMsgs = kept;
  localStorage.setItem('failed_parses_v2', JSON.stringify(failedMsgs));
  if (typeof renderSettings === 'function') renderSettings();
}

function copyFailedParses() {
  if (!failedMsgs.length) return;
  var blob = failedParsesBlob();
  var s = document.getElementById('s-failed-status');
  function done() { if (s) s.innerHTML = '<div class="alert alert-green">✅ نُسخت ' + failedMsgs.length + ' رسالة — ألصقها في المحادثة لأعالجها</div>'; }
  function fail() { if (s) s.innerHTML = '<div class="alert alert-yellow">⚠️ انسخها يدوياً من المربّع أعلاه</div>'; }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(blob).then(done, fail);
  else done();
}

// ============================================================
// تعلّم التصنيف من تصحيحات المستخدم
// ============================================================
var LEARNABLE_CATS = ['أساسيات', 'كماليات', 'سداد التمويل'];
function learnMerchant(merchant, type, direction) {
  if (direction === 'credit') return;                       // الإضافات لا تُصنَّف
  if (LEARNABLE_CATS.indexOf(type) === -1) return;          // لا نتعلّم "غير محدد" أو أنواع الإضافة
  var k = (typeof merchantKey === 'function') ? merchantKey(merchant) : '';
  if (!k || k.length < 2 || k === 'غير محدد') return;
  if (learned[k] === type) return;
  learned[k] = type;
  localStorage.setItem('learned_v2', JSON.stringify(learned));
}
function clearLearned() {
  var n = Object.keys(learned).length;
  if (!n) return;
  if (!confirm('نسيان ' + n + ' تصنيف متعلَّم؟ (لن تتأثر العمليات المحفوظة)')) return;
  learned = {};
  localStorage.removeItem('learned_v2');
  if (typeof renderSettings === 'function') renderSettings();
}

// ============================================================
// كشف التكرار
// ============================================================
// عملية مطابقة = نفس التاريخ والمبلغ والتاجر والاتجاه
function dupKey(e) {
  return [e.date || '', Number(e.amount) || 0, (typeof merchantKey === 'function' ? merchantKey(e.merchant) : ''), e.direction || 'debit'].join('|');
}
function isDuplicate(entry) {
  var k = dupKey(entry);
  return expenses.some(function(e) { return dupKey(e) === k; });
}
function findDuplicates() {
  var seen = {}, dups = [];
  expenses.forEach(function(e) {
    var k = dupKey(e);
    if (seen[k]) dups.push(e); else seen[k] = true;
  });
  return dups;
}
async function removeDuplicates() {
  var dups = findDuplicates();
  var s = document.getElementById('s-backup-status');
  if (!dups.length) { if (s) s.innerHTML = '<div class="alert alert-green">✅ لا توجد عمليات مكررة</div>'; return; }
  if (!confirm('وُجدت ' + dups.length + ' عملية مكررة. حذف النسخ الزائدة؟')) return;
  var ids = {};
  dups.forEach(function(e) { ids[String(e.id)] = true; });
  expenses = expenses.filter(function(e) { return !ids[String(e.id)]; });
  localStorage.setItem('expenses_v2', JSON.stringify(expenses));
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof renderSettings === 'function') renderSettings();
  if (s) s.innerHTML = '<div class="alert alert-green">✅ حُذف ' + dups.length + ' تكرار محلياً</div>';
  // حذف من Sheets في الخلفية (أفضل جهد)
  if (settings.webapp) {
    Object.keys(ids).forEach(function(id) {
      try { fetch(appendKey(settings.webapp + '?action=delete&id=' + encodeURIComponent(id))); } catch (e) {}
    });
  }
}

// ============================================================
// تنبيهات الميزانية — إشعار متصفح عند الاقتراب/التجاوز (opt-in)
// ============================================================
// مجاميع الشهر الحالي للتصنيفات ذات السقف (نيابة/وارد مستثناة — مطابق للوحة)
function curMonthCapped() {
  var m = today().substring(0, 7);
  var t = { 'أساسيات': 0, 'كماليات': 0 };
  expenses.forEach(function (e) {
    if (!e.date || e.date.indexOf(m) !== 0 || e.behalf || e.direction === 'credit' || e.fxUnconverted) return;
    if (t.hasOwnProperty(e.type)) t[e.type] += (e.amount || 0);
  });
  return t;
}

// يُطلق إشعاراً عند عبور تصنيف عتبة 80% أو 100% لأول مرة هذا الشهر (بلا تكرار)
function maybeNotify() {
  if (!settings.notify) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  var m = today().substring(0, 7);
  if (!firedAlerts[m]) firedAlerts[m] = {};
  var bt = curMonthCapped();
  var free = settings.salary - settings.payment - settings.basic;
  [{ name: 'أساسيات', spent: bt['أساسيات'], cap: settings.basic },
   { name: 'كماليات', spent: bt['كماليات'], cap: free }].forEach(function (c) {
    if (!(c.cap > 0)) return;
    var pct = (c.spent / c.cap) * 100;
    var lvl = pct >= 100 ? 100 : (pct >= 80 ? 80 : 0);
    if (!lvl) return;
    var key = c.name + ':' + lvl;
    if (firedAlerts[m][key]) return;
    firedAlerts[m][key] = true;
    localStorage.setItem('alerts_v2', JSON.stringify(firedAlerts));
    try {
      new Notification('مصروفاتي 💳', {
        body: lvl >= 100
          ? 'تجاوزت سقف ' + c.name + ' (' + fmt(c.spent) + ' من ' + fmtInt(c.cap) + ' ر.س)'
          : 'اقتربت من سقف ' + c.name + ' — صُرف ' + fmt(c.spent) + ' من ' + fmtInt(c.cap) + ' ر.س',
        icon: 'icons/icon-192.png',
        tag: 'masroufati-' + key
      });
    } catch (e) {}
  });
}

// تفعيل/تعطيل إشعارات المتصفح من الإعدادات
function requestNotifyPermission() {
  var s = document.getElementById('s-notify-status');
  function setStatus(h) { if (s) s.innerHTML = h; }
  if (typeof Notification === 'undefined') {
    setStatus('<div class="alert alert-yellow">⚠️ متصفحك لا يدعم الإشعارات</div>');
    return;
  }
  if (settings.notify) {   // مفعّل → عطّله
    settings.notify = false;
    localStorage.setItem('settings_v2', JSON.stringify(settings));
    if (typeof renderSettings === 'function') renderSettings();
    return;
  }
  if (Notification.permission === 'denied') {
    setStatus('<div class="alert alert-yellow">⚠️ الإشعارات محظورة من إعدادات المتصفح — فعّلها يدوياً ثم أعد المحاولة</div>');
    return;
  }
  Notification.requestPermission().then(function (perm) {
    settings.notify = (perm === 'granted');
    localStorage.setItem('settings_v2', JSON.stringify(settings));
    if (typeof renderSettings === 'function') renderSettings();
  });
}

// ============================================================
// النسخ الاحتياطي والتصدير
// ============================================================
function downloadFile(name, content, mime) {
  var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}
function exportBackup() {
  var data = { app: 'masroufati', v: 2, exportedAt: today(), expenses: expenses, settings: settings, learned: learned, failedMsgs: failedMsgs };
  downloadFile('masroufati-backup-' + today() + '.json', JSON.stringify(data, null, 2), 'application/json');
  var s = document.getElementById('s-backup-status');
  if (s) s.innerHTML = '<div class="alert alert-green">✅ نُزّلت نسخة احتياطية (' + expenses.length + ' عملية)</div>';
}
function exportCSV() {
  var cols = [['التاريخ', 'date'], ['الوقت', 'time'], ['المبلغ', 'amount'], ['التاجر', 'merchant'], ['النوع', 'type'], ['الاتجاه', 'direction'], ['طريقة الدفع', 'method'], ['البطاقة', 'card'], ['البنك', 'bank'], ['الرصيد', 'balance'], ['العملة الدولية', 'intl'], ['نوع العملية', 'txType'], ['ملاحظة', 'note'], ['نيابة عن', 'behalf'], ['المعرّف', 'id']];
  function esc(v) { v = (v == null ? '' : String(v)); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  var lines = [cols.map(function(c) { return esc(c[0]); }).join(',')];
  expenses.forEach(function(e) { lines.push(cols.map(function(c) { return esc(e[c[1]]); }).join(',')); });
  downloadFile('masroufati-' + today() + '.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  var s = document.getElementById('s-backup-status');
  if (s) s.innerHTML = '<div class="alert alert-green">✅ صُدّر CSV (' + expenses.length + ' عملية)</div>';
}
function importBackupFile(input) {
  var f = input.files && input.files[0];
  if (!f) return;
  var reader = new FileReader();
  reader.onload = function() {
    var s = document.getElementById('s-backup-status');
    try {
      var data = JSON.parse(reader.result);
      var imp = data.expenses || [];
      if (!Array.isArray(imp)) throw new Error('no expenses');
      if (!confirm('استيراد ' + imp.length + ' عملية؟ ستُدمج مع الموجود بدون تكرار.')) { input.value = ''; return; }
      var byId = {};
      expenses.forEach(function(e) { byId[String(e.id)] = true; });
      var added = 0;
      imp.forEach(function(e) { if (e && e.id != null && !byId[String(e.id)]) { expenses.push(e); byId[String(e.id)] = true; added++; } });
      localStorage.setItem('expenses_v2', JSON.stringify(expenses));
      if (data.learned && typeof data.learned === 'object') {
        Object.keys(data.learned).forEach(function(k) { learned[k] = data.learned[k]; });
        localStorage.setItem('learned_v2', JSON.stringify(learned));
      }
      if (data.settings) {
        ['total', 'payment', 'basic', 'salary', 'start'].forEach(function(k) { if (data.settings[k] != null) settings[k] = data.settings[k]; });
        if (Array.isArray(data.settings.people)) data.settings.people.forEach(function(p) { if (settings.people.indexOf(p) === -1) settings.people.push(p); });
        localStorage.setItem('settings_v2', JSON.stringify(settings));
      }
      if (typeof refreshPeopleList === 'function') refreshPeopleList();
      if (typeof refreshAccountsList === 'function') refreshAccountsList();
      if (typeof renderDashboard === 'function') renderDashboard();
      if (typeof renderSettings === 'function') renderSettings();
      if (s) s.innerHTML = '<div class="alert alert-green">✅ أُضيفت ' + added + ' عملية جديدة (تجاهلت ' + (imp.length - added) + ' مكررة)</div>';
    } catch (e) {
      if (s) s.innerHTML = '<div class="alert alert-red">⚠️ ملف غير صالح</div>';
    }
    input.value = '';
  };
  reader.readAsText(f);
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
  // الرسالة ما فيها سعر صرف نحوّل بيه، والمبلغ لسه بالعملة الأجنبية الخام (المستخدم ما عدّله) —
  // تأكيد صريح قبل الحفظ حتى لا يُحفظ رقم أجنبي بالغلط على إنه بالريال
  if (p.fxUnconverted && Math.abs(amt - p.fxAmount) < 0.005) {
    if (!confirm('⚠️ المبلغ (' + amt + ' ' + (p.fxCurrency || '') + ') لسه بعملته الأجنبية بدون تحويل لريال. متأكد تبي تحفظه بهذا الشكل بدون تصحيح؟')) return;
  }
  var noteEl = document.getElementById('note-edit');
  var behalfEl = document.getElementById('behalf-edit');
  p.note = noteEl ? noteEl.value : '';
  p.behalf = behalfEl ? behalfEl.value.trim() : '';
  var acctEl = document.getElementById('acct-edit');
  if (acctEl && typeof applyAccount === 'function') applyAccount(p, acctEl.value);
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
    if (typeof showTopSave === 'function') showTopSave(false);   // ارجع زر «لصق» مكان «حفظ»
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
    note: (document.getElementById('m-note') ? document.getElementById('m-note').value : ''),
    behalf: (document.getElementById('m-behalf') ? document.getElementById('m-behalf').value.trim() : '')
  };
  await doSave(p, 'manual-status');
  if (document.getElementById('manual-status').innerHTML.includes('alert-green')) {
    document.getElementById('m-amount').value = '';
    document.getElementById('m-merchant').value = '';
    document.getElementById('m-method').value = '';
    document.getElementById('m-type').value = '';
    if (document.getElementById('m-note')) document.getElementById('m-note').value = '';
    if (document.getElementById('m-behalf')) document.getElementById('m-behalf').value = '';
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
    direction: p.direction || 'debit',
    behalf: (p.behalf || '').toString().trim()
  };
  // رسوم دولية (محلي فقط، لا تُرسل لـ Sheets) — تُستخدم لتفسير فرق مطابقة الرصيد لاحقاً
  if (p.intlFee != null) entry.intlFee = p.intlFee;
  // عملية دولية بعملتها الأجنبية بدون تحويل (محلي فقط) — تُستخدم لتفسير فجوات لاحقة ولإظهار
  // تنبيه بالسجل حتى تُصحَّح يدوياً؛ تُمسح عند تعديل العملية (saveEdit)
  if (p.fxUnconverted) { entry.fxUnconverted = true; entry.fxCurrency = p.fxCurrency; }

  // كشف التكرار قبل الحفظ — نفس التاريخ/المبلغ/التاجر/الاتجاه
  if (typeof isDuplicate === 'function' && isDuplicate(entry)) {
    if (!confirm('⚠️ توجد عملية مطابقة (' + fmt(entry.amount) + ' ر.س · ' + (entry.merchant || '—') + ' · ' + entry.date + ').\nحفظها مرة أخرى؟')) {
      if (btn) btn.innerHTML = origText;
      var se0 = document.getElementById(statusId);
      if (se0) se0.innerHTML = '<div class="alert alert-yellow">تم الإلغاء — عملية مكررة</div>';
      return;
    }
  }

  expenses.unshift(entry);
  localStorage.setItem('expenses_v2', JSON.stringify(expenses));
  if (entry.behalf && typeof registerPerson === 'function') registerPerson(entry.behalf);
  if (typeof learnMerchant === 'function') learnMerchant(entry.merchant, entry.type, entry.direction);
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof maybeNotify === 'function') maybeNotify();   // إشعار ميزانية إن عبرنا عتبة

  var statusEl = document.getElementById(statusId);
  function setStatus(h) { if (statusEl) statusEl.innerHTML = h; }
  if (!settings.webapp) {
    if (btn) btn.innerHTML = origText;
    setStatus('<div class="alert alert-green">✅ حُفظ محلياً</div>');
    return;
  }

  try {
    var params = appendEntryParams(entry);
    var resp = await fetch(appendKey(settings.webapp + '?' + params.toString()));
    var json = await resp.json();
    if (btn) btn.innerHTML = origText;
    if (json.status === 'ok') {
      entry.synced = true;
      localStorage.setItem('expenses_v2', JSON.stringify(expenses));
      setStatus('<div class="alert alert-green">✅ حُفظ محلياً وفي Sheets (صف ' + json.row + ')</div>');
      sortSheetsInBackground();   // إعادة ترتيب الصفوف تلقائياً (تاريخ ثم وقت)
    } else {
      entry.synced = false;
      localStorage.setItem('expenses_v2', JSON.stringify(expenses));
      setStatus('<div class="alert alert-yellow">⚠️ حُفظ محلياً. خطأ في Sheets: ' + (json.message||'') + '</div>');
    }
  } catch(e) {
    if (btn) btn.innerHTML = origText;
    entry.synced = false;
    localStorage.setItem('expenses_v2', JSON.stringify(expenses));
    setStatus('<div class="alert alert-yellow">⚠️ حُفظ محلياً. فشل الرفع: ' + e.message + '</div>');
  }
}

// معاملات رفع عملية جديدة إلى Sheets — مستخرجة لإعادة استخدامها في إعادة الرفع (retryUpload)
function appendEntryParams(entry) {
  return new URLSearchParams({
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
    direction: entry.direction,
    behalf: encodeURIComponent(entry.behalf),
    // أعمدة حقيقية بالشيت (بعد ترحيل الحقول المحلية-فقط) — ترسل دايماً (حتى فارغة) عشان
    // "لا شي" تكون قيمة صريحة، مو غياب مفتاح يخليها تُتجاهل عند التحديث لاحقاً
    fxCurrency: entry.fxCurrency || '',
    fxUnconverted: entry.fxUnconverted ? 'TRUE' : '',
    intlFee: entry.intlFee != null ? entry.intlFee : '',
    intlFeeSettled: entry.intlFeeSettled ? 'TRUE' : ''
  });
}

// إعادة رفع عملية حُفظت محلياً بس فشل رفعها لـ Sheets (entry.synced === false).
// يتحقق أولاً هل الصف وصل فعلاً (عبر update) قبل الإضافة من جديد، لتفادي تكرار الصف
// في حال كان الفشل مجرد انقطاع بالرد بعد ما نجحت الكتابة فعلياً في الشيت.
async function retryUpload(id) {
  var entry = expenses.find(function(e) { return String(e.id) === String(id); });
  if (!entry) return;
  var eid = String(id).replace(/'/g, "\\'");
  var statusEl = document.getElementById('retry-status-' + eid);
  function setStatus(h) { if (statusEl) statusEl.innerHTML = h; }
  if (!settings.webapp) return;
  setStatus('<div class="alert alert-blue">⏳ جاري إعادة الرفع...</div>');
  try {
    var upd = new URLSearchParams({ action: 'update', id: entry.id, amount: entry.amount, date: entry.date });
    var respUpd = await fetch(appendKey(settings.webapp + '?' + upd.toString()));
    var jsonUpd = await respUpd.json();
    var json;
    if (jsonUpd.status === 'ok') {
      json = jsonUpd;   // الصف كان موجوداً بالفعل — التحديث كفى
    } else {
      var resp = await fetch(appendKey(settings.webapp + '?' + appendEntryParams(entry).toString()));
      json = await resp.json();
    }
    if (json.status === 'ok') {
      entry.synced = true;
      localStorage.setItem('expenses_v2', JSON.stringify(expenses));
      setStatus('<div class="alert alert-green">✅ تم الرفع لـ Sheets</div>');
      sortSheetsInBackground();
      if (typeof renderHistory === 'function') renderHistory();
      if (typeof renderDashboard === 'function') renderDashboard();
    } else {
      setStatus('<div class="alert alert-yellow">⚠️ فشل مرة أخرى: ' + (json.message || '') + '</div>');
    }
  } catch (e) {
    setStatus('<div class="alert alert-yellow">⚠️ فشل الرفع: ' + e.message + '</div>');
  }
}

// تسجيل رسوم دولية معلَّقة كعملية مصروف واحدة، وربطها بالعملية/العمليات المسبِّبة لها
// (تُعلَّم مصادرها intlFeeSettled حتى لا تظهر كفجوة مرة ثانية ولا تُحسب مرتين).
function recordFeeSettlement(ids, total, date, card, bank, rerender) {
  total = Math.round(Math.abs(total) * 100) / 100;
  if (!total) return;
  var sources = (ids || []).map(function (id) {
    return expenses.find(function (e) { return String(e.id) === String(id); });
  }).filter(Boolean);
  var label = sources.length === 1 ? (sources[0].merchant || '—') : (sources.length + ' عمليات');
  doSave({
    date: date || today(),
    merchant: 'رسوم دولية — ' + label,
    amount: total,
    type: 'غير محدد',
    direction: 'debit',
    card: card || '',
    bank: bank || '',
    note: 'رسوم دولية مؤجَّلة لعملية/عمليات: ' + sources.map(function (e) { return (e.merchant || '—') + ' (' + e.date + ')'; }).join('، '),
    txType: 'رسوم دولية'
  });
  sources.forEach(function (e) { e.intlFeeSettled = true; });
  localStorage.setItem('expenses_v2', JSON.stringify(expenses));
  // بلّغ الشيت بتسوية كل عملية مصدر (بلا انتظار) — وإلا العلامة تبقى محلية فقط
  if (settings.webapp) {
    sources.forEach(function (e) {
      try { fetch(appendKey(settings.webapp + '?' + new URLSearchParams({ action: 'update', id: e.id, intlFeeSettled: 'TRUE' }).toString())); } catch (er) {}
    });
  }
  if (rerender === 'accounts' && typeof renderAccounts === 'function') renderAccounts();
}

// فرز تلقائي لصفوف Sheets بعد الحفظ/التعديل — في الخلفية، بدون انتظار أو واجهة.
// يضمن بقاء العمليات مرتّبة (التاريخ تنازلياً ثم الوقت تنازلياً) حتى لو أُضيفت عملية
// وقتها أبكر من غيرها في نفس اليوم.
function sortSheetsInBackground() {
  if (!settings.webapp) return;
  try { fetch(appendKey(settings.webapp + '?action=sortrows')); } catch (e) {}
}

async function syncFromSheets() {
  var statusEl = document.getElementById('s-data-status');
  function setStatus(h) { if (statusEl) statusEl.innerHTML = h; }
  if (!settings.webapp) { setStatus('<div class="alert alert-red">⚠️ لم يُحدَّد Web App URL</div>'); return; }
  setStatus('<div class="alert alert-blue">⏳ جاري التحديث...</div>');
  try {
    var resp = await fetch(appendKey(settings.webapp + '?action=read'));
    var json = await resp.json();
    if (json.status === 'ok' && json.rows && json.rows.length > 0) {
      // شبكة أمان انتقالية فقط (مو تصميم دائم بعد الآن): fxUnconverted/fxCurrency/intlFee/
      // intlFeeSettled صارت أعمدة حقيقية بالشيت (apps-script.gs). هذا يحمي فقط العمليات القديمة
      // اللي انحفظت محلياً قبل الترحيل ولسه ما "لمست" عمودها الجديد ولو مرة (عدّل/سجّل من جديد
      // عشان تُكتب فعلياً) — بعدها يصير الاسترجاع من localStorage عديم الفايدة ويُحذف لاحقاً.
      // "behalf" أزيلت من هذي القائمة: عمودها كان يعمل فعلياً من قبل، الاسترجاع المحلي لها غير
      // ضروري وقد يخفي عطل حقيقي بالـbackend. "synced" مستثناة دايماً — وجود الصف بالقراءة دليل
      // مباشر إنه فعلاً وصل للشيت، فأي علامة "false" قديمة عليه تصير غير صحيحة وتُتجاهل.
      var LOCAL_ONLY_FIELDS = ['intlFee', 'intlFeeSettled', 'fxUnconverted', 'fxCurrency'];
      var localFieldsById = {}, unsynced = [];
      expenses.forEach(function(e) {
        if (!e) return;
        // عملية اتحفظت محلياً بس ما وصلت للشيت بعد — لو ما ظهرت بالقراءة، لازم تبقى محلياً
        // بدل ما يمسحها الاستبدال الكامل بصمت (فقدان بيانات حقيقي، مش مجرد نسيان علامة)
        if (e.synced === false) unsynced.push(e);
        var saved = {}, has = false;
        LOCAL_ONLY_FIELDS.forEach(function(k) { if (e[k] !== undefined && e[k] !== '') { saved[k] = e[k]; has = true; } });
        if (has) localFieldsById[String(e.id)] = saved;
      });
      var syncedIds = {};
      json.rows.forEach(function(r) {
        if (r && r.id != null) syncedIds[String(r.id)] = true;
        var saved = r && localFieldsById[String(r.id)];
        if (saved) Object.keys(saved).forEach(function(k) { if (r[k] === undefined || r[k] === '') r[k] = saved[k]; });
        // ملاذ أخير فقط: صف قديم جداً (سابق حتى لوجود العلامة محلياً، وعموده الجديد لسه فاضي) —
        // استرجع "غير محوَّلة" من حقل intl نفسه (بصيغة "عملة مبلغ" بلا "@سعر_صرف" يعني ما توفّر
        // سعر صرف وقت الحفظ)، بشرط يطابق المبلغ المسجَّل بالضبط (لسه خام بدون تحويل).
        if (r && !r.fxUnconverted) {
          var m = String(r.intl || '').match(/^([A-Z]{3})\s+([\d.]+)$/);
          if (m && Math.abs(parseFloat(r.amount) - parseFloat(m[2])) < 0.01) {
            r.fxUnconverted = true;
            r.fxCurrency = m[1];
          }
        }
      });
      var stillUnsynced = unsynced.filter(function(e) { return !syncedIds[String(e.id)]; });
      expenses = json.rows.concat(stillUnsynced);
      localStorage.setItem('expenses_v2', JSON.stringify(expenses));
      if (typeof refreshPeopleList === 'function') refreshPeopleList();
      if (typeof refreshAccountsList === 'function') refreshAccountsList();
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
    var resp = await fetch(appendKey(settings.webapp + '?action=dict'));
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

// ============================================================
// DELETE / EDIT
// ============================================================
async function deleteEntry(id) {
  if (!id) return;
  var entry = expenses.find(function(e) { return String(e.id) === String(id); });
  if (!entry) return;
  if (!confirm('حذف العملية «' + (entry.merchant || '—') + '» بمبلغ ' + fmt(entry.amount) + ' ر.س؟')) return;

  // احذف محلياً أولاً (response سريع)
  expenses = expenses.filter(function(e) { return String(e.id) !== String(id); });
  localStorage.setItem('expenses_v2', JSON.stringify(expenses));
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof renderHistory === 'function') renderHistory();

  if (!settings.webapp) return;
  try {
    var resp = await fetch(appendKey(settings.webapp + '?action=delete&id=' + encodeURIComponent(id)));
    var json = await resp.json();
    if (json.status !== 'ok') { console.warn('Sheet delete failed:', json.message); markDeletePending(id); }
  } catch (e) {
    console.warn('Sheet delete error:', e.message);
    markDeletePending(id);
  }
}

// يسجّل عملية حُذفت محلياً بس فشل حذفها من الشيت — تبقى صفها موجود هناك حتى تُعاد المحاولة
// (لا داعي لإعادة رسم فورية — تظهر في الإعدادات عند فتحها لاحقاً)
function markDeletePending(id) {
  id = String(id);
  if (pendingDeletes.indexOf(id) === -1) pendingDeletes.push(id);
  localStorage.setItem('pendingDeletes_v2', JSON.stringify(pendingDeletes));
}

// إعادة محاولة حذف كل العمليات المعلَّقة من الشيت (بعد استرجاع الاتصال/تصحيح المفتاح)
async function retryPendingDeletes() {
  var s = document.getElementById('s-pending-del-status');
  function setStatus(h) { if (s) s.innerHTML = h; }
  if (!settings.webapp || !pendingDeletes.length) return;
  setStatus('<div class="alert alert-blue">⏳ جاري إعادة محاولة الحذف...</div>');
  var stillPending = [];
  for (var i = 0; i < pendingDeletes.length; i++) {
    var id = pendingDeletes[i];
    try {
      var resp = await fetch(appendKey(settings.webapp + '?action=delete&id=' + encodeURIComponent(id)));
      var json = await resp.json();
      // "id not found" يعني الصف محذوف فعلاً (أو غير موجود أصلاً) — لا داعي لإعادة محاولته
      if (json.status !== 'ok' && json.message !== 'id not found') stillPending.push(id);
    } catch (e) {
      stillPending.push(id);
    }
  }
  pendingDeletes = stillPending;
  localStorage.setItem('pendingDeletes_v2', JSON.stringify(pendingDeletes));
  setStatus(stillPending.length
    ? '<div class="alert alert-yellow">⚠️ لا يزال ' + stillPending.length + ' حذف معلّقاً</div>'
    : '<div class="alert alert-green">✅ اكتمل حذف كل العمليات المعلَّقة من Sheets</div>');
  setTimeout(function () { if (typeof renderSettings === 'function') renderSettings(); }, 1500);
}

function editEntry(id) {
  var entry = expenses.find(function(e) { return String(e.id) === String(id); });
  if (!entry) return;
  document.getElementById('e-merchant').value = entry.merchant || '';
  document.getElementById('e-amount').value = entry.amount != null ? entry.amount : '';
  document.getElementById('e-date').value = entry.date || '';
  document.getElementById('e-type').value = entry.type || 'غير محدد';
  document.getElementById('e-direction').value = entry.direction === 'credit' ? 'credit' : 'debit';
  document.getElementById('e-note').value = entry.note || '';
  document.getElementById('e-behalf').value = entry.behalf || '';
  document.getElementById('edit-status').innerHTML = '';
  window._editingId = id;
  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEdit() {
  document.getElementById('edit-modal').classList.add('hidden');
  window._editingId = null;
}

async function saveEdit() {
  var id = window._editingId;
  if (!id) return;
  var entry = expenses.find(function(e) { return String(e.id) === String(id); });
  if (!entry) return;

  var newAmt = parseFloat(document.getElementById('e-amount').value);
  if (!newAmt || newAmt <= 0) {
    document.getElementById('edit-status').innerHTML = '<div class="alert alert-red">⚠️ أدخل مبلغاً صحيحاً</div>';
    return;
  }
  var fields = {
    merchant: document.getElementById('e-merchant').value.trim() || entry.merchant,
    amount: newAmt,
    date: document.getElementById('e-date').value || entry.date,
    type: document.getElementById('e-type').value,
    direction: document.getElementById('e-direction').value,
    note: document.getElementById('e-note').value,
    behalf: document.getElementById('e-behalf').value.trim()
  };

  // حدّث محلياً
  Object.keys(fields).forEach(function(k) { entry[k] = fields[k]; });
  // تعديل عملية "غير محوَّلة" مو بالضرورة يعني تصحيح المبلغ — ممكن التعديل لسبب ثاني (تصنيف/ملاحظة)
  // قبل ما يوصل كشف الحساب. نسأل صراحة بدل ما نفترض ونمسح العلامة بصمت.
  if (entry.fxUnconverted) {
    if (confirm('هذي العملية معلَّمة «عملية دولية غير محوَّلة» — المبلغ الحالي بعد التعديل: ' + fmt(entry.amount) + ' ر.س.\nهل هذا هو المبلغ الصحيح النهائي بالريال (من كشف الحساب)؟\n\nموافق = نعم، صحّحته بالكامل.\nإلغاء = لا، التعديل كان لسبب ثاني — خلّها بانتظار المبلغ الصحيح.')) {
      entry.fxUnconverted = false;
    }
  }
  localStorage.setItem('expenses_v2', JSON.stringify(expenses));
  if (fields.behalf && typeof registerPerson === 'function') registerPerson(fields.behalf);
  if (typeof learnMerchant === 'function') learnMerchant(fields.merchant, fields.type, fields.direction);
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof renderHistory === 'function') renderHistory();

  if (!settings.webapp) {
    closeEdit();
    return;
  }

  document.getElementById('edit-status').innerHTML = '<div class="alert alert-blue">⏳ جاري حفظ التعديلات في Sheets...</div>';
  try {
    var params = new URLSearchParams({
      action: 'update',
      id: id,
      merchant: encodeURIComponent(fields.merchant),
      amount: fields.amount,
      date: fields.date,
      type: encodeURIComponent(fields.type),
      direction: fields.direction,
      note: encodeURIComponent(fields.note),
      behalf: encodeURIComponent(fields.behalf),
      // ينعكس هنا تأكيد/إلغاء تصحيح المبلغ الدولي أعلاه، حتى يوصل التصحيح الفعلي للشيت
      fxUnconverted: entry.fxUnconverted ? 'TRUE' : ''
    });
    var resp = await fetch(appendKey(settings.webapp + '?' + params.toString()));
    var json = await resp.json();
    if (json.status === 'ok') {
      entry.synced = true;
      localStorage.setItem('expenses_v2', JSON.stringify(expenses));
      document.getElementById('edit-status').innerHTML = '<div class="alert alert-green">✅ تم التحديث في Sheets</div>';
      sortSheetsInBackground();   // قد يتغيّر التاريخ → أعِد الترتيب
      setTimeout(closeEdit, 800);
    } else {
      entry.synced = false;
      localStorage.setItem('expenses_v2', JSON.stringify(expenses));
      if (typeof renderHistory === 'function') renderHistory();
      document.getElementById('edit-status').innerHTML = '<div class="alert alert-yellow">⚠️ حُفظ محلياً. Sheets: ' + (json.message || 'فشل') + '</div>';
    }
  } catch (e) {
    entry.synced = false;
    localStorage.setItem('expenses_v2', JSON.stringify(expenses));
    if (typeof renderHistory === 'function') renderHistory();
    document.getElementById('edit-status').innerHTML = '<div class="alert alert-yellow">⚠️ حُفظ محلياً. فشل الرفع: ' + e.message + '</div>';
  }
}

function clearData() {
  if (!confirm('هل أنت متأكد من مسح جميع البيانات المحلية؟')) return;
  expenses = [];
  localStorage.removeItem('expenses_v2');
  if (typeof renderDashboard === 'function') renderDashboard();
  document.getElementById('s-data-status').innerHTML = '<div class="alert alert-green">✅ تم مسح البيانات المحلية</div>';
  renderSettings();
}
