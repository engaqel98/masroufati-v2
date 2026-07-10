// ============================================================
// ANALYZE (render result)
// ============================================================
function analyze() {
  var txt = document.getElementById('sms-input').value.trim();
  var area = document.getElementById('result-area');
  if (!txt) { area.innerHTML = '<div class="alert alert-yellow">⚠️ الرجاء لصق رسالة SMS</div>'; if (typeof showTopSave === 'function') showTopSave(false); return; }

  var parsed = detectAndParse(txt);
  if (!parsed || !parsed.amount) {
    if (typeof saveFailedParse === 'function') saveFailedParse(txt);   // احفظها للمعالجة لاحقاً
    if (typeof showTopSave === 'function') showTopSave(false);
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

  // الرسالة ما فيها مبلغ نهائي بالريال ولا سعر صرف معلن نحوّل بيه — المبلغ تحت لسه
  // بعملته الأجنبية الخام. ما نخمّن من فرق الرصيد (ينكسر لو فيه عملية أخرى غير مسجَّلة
  // بينهما) — نحذّر ونسيبه للمستخدم يصحّحه يدوياً من كشف حسابه أو لاحقاً برسالة تأكيد.
  if (parsed.fxUnconverted) {
    html += '<div class="alert alert-yellow" style="margin-bottom:8px">'
      + '🌍 <b>عملية دولية بدون سعر صرف بالرسالة</b><br>'
      + 'المبلغ تحت (' + fmt(parsed.amount) + ' ' + (parsed.fxCurrency || '') + ') لسه بعملته الأجنبية بدون تحويل — الرسالة ما فيها سعر صرف ولا مبلغ نهائي بالريال.<br>'
      + 'عدّله يدوياً بالمبلغ الصحيح بالريال من كشف حسابك، أو احفظه كذا وصحّحه لاحقاً إذا وصلتك رسالة تأكيد.'
      + '</div>';
  }

  // === مطابقة الرصيد: قارن الرصيد المتوقّع بالفعلي للكشف عن عمليات/استردادات غير مُسجَّلة ===
  // (تُتخطّى كاملة لو هذي العملية نفسها fxUnconverted — أصلاً معروف إن مبلغها غير موثوق،
  // فلا داعي لتنبيه فجوة إضافي مربك فوق التنبيه أعلاه)
  window._recon = null;
  window._pendingFeeGap = null;
  if (!parsed.fxUnconverted && parsed.balance !== '' && parsed.balance != null && !isNaN(parseFloat(parsed.balance))) {
    var acctK = accountKey(parsed);
    var prevE = lastBalanceFor(acctK, parsed);
    if (prevE) {
      var prevBal = parseFloat(prevE.balance);
      var newBal = parseFloat(parsed.balance);
      // المتوقّع = رصيد آخر مرساة + الحركات المسجّلة بعدها (بلا رصيد) + حركة هذه العملية
      var expected = prevBal + signedSinceAnchor(acctK, prevE, parsed) + (isCredit ? parsed.amount : -parsed.amount);
      var diff = newBal - expected;
      // فرق يطابق رسوم دولية مذكورة بنفس الرسالة: البنك أحياناً ما يحدّث الرصيد المعروض بالرسوم فوراً
      // (تُخصم لاحقاً) — هذا مُفسَّر، مو عملية غير مسجَّلة، فلا نعرضه كفجوة
      var feeExplained = parsed.intlFee && Math.abs(Math.abs(diff) - parsed.intlFee) < 0.01;
      // فيه عملية/عمليات دولية سابقة على نفس الحساب لسه محفوظة بعملتها الأجنبية بدون تحويل؟
      // هذي الأرجح سبب أي فرق هنا (مبلغها غير موثوق أصلاً) — نوضّح السبب ونسهّل تعديلها
      var pendingFx = (!feeExplained && Math.abs(diff) > 0.01)
        ? expenses.filter(function (pe) { return accountKey(pe) === acctK && withinBalanceWindow(pe) && pe.fxUnconverted && isAfter(pe, prevE) && isBeforeRef(pe, parsed); })
        : [];
      // فرق يطابق رسوم دولية سابقة لسه ما انسجّلت (البنك لحّق الرصيد بيها الحين، متأخرة) —
      // نعرضها بوضوح ونسأل المستخدم إذا يبغى يسجّلها، بدل ما نتجاهلها أو نعتبرها فجوة مجهولة
      var pendingFees = (!feeExplained && !pendingFx.length && Math.abs(diff) > 0.01)
        ? unsettledIntlFees(acctK).filter(function (pe) { return (pe.date || '') <= (parsed.date || ''); })
        : [];
      var pendingSum = pendingFees.reduce(function (s, pe) { return s + (pe.intlFee || 0); }, 0);
      var pendingMatch = pendingFees.length && Math.abs(Math.abs(diff) - pendingSum) < 0.01;

      if (Math.abs(diff) > 0.01 && feeExplained) {
        html += '<div class="alert alert-blue" style="margin-bottom:8px;font-size:12px">ℹ️ فرق ' + fmt(Math.abs(diff)) + ' ر.س يطابق الرسوم الدولية لهذه العملية — البنك غالباً ما يحدّث الرصيد المعروض بالرسوم فوراً (تُخصم لاحقاً). مو فجوة حقيقية.</div>';
      } else if (Math.abs(diff) > 0.01 && pendingFx.length) {
        html += '<div class="alert alert-blue" style="margin-bottom:8px">'
          + 'ℹ️ <b>الفرق يطابق عملية/عمليات دولية غير محوَّلة</b><br>'
          + 'الأرجح سبب الفرق (' + fmt(Math.abs(diff)) + ' ر.س) عملية دولية سابقة لسه محفوظة بعملتها الأجنبية بدون تحويل:<br>'
          + pendingFx.map(function (pe) { return '• ' + htmlEsc(pe.merchant || '—') + ' — ' + fmt(pe.amount) + ' ' + (pe.fxCurrency || '') + ' (' + pe.date + ') <button class="btn btn-outline btn-sm" style="margin-right:6px" onclick="editEntry(\'' + String(pe.id) + '\')">✏️ عدّل</button>'; }).join('<br>')
          + '<span style="font-size:11px;color:var(--muted);display:block;margin-top:6px">يمكنك الحفظ عادي — عدّل العملية القديمة لما توصلك القيمة الصحيحة.</span>'
          + '</div>';
      } else if (Math.abs(diff) > 0.01 && pendingMatch) {
        window._pendingFeeGap = { ids: pendingFees.map(function (pe) { return pe.id; }), total: pendingSum, date: parsed.date, card: parsed.card || '', bank: parsed.bank || '' };
        html += '<div class="alert alert-blue" id="pending-fee-alert" style="margin-bottom:8px">'
          + 'ℹ️ <b>الفرق يطابق رسوم دولية معلّقة</b><br>'
          + 'الفرق ' + fmt(Math.abs(diff)) + ' ر.س يطابق رسوم دولية سابقة لسه ما انسجّلت (البنك غالباً حدّث الرصيد بيها الحين):<br>'
          + pendingFees.map(function (pe) { return '• ' + htmlEsc(pe.merchant || '—') + ' — ' + fmt(pe.intlFee) + ' ر.س (' + pe.date + ')'; }).join('<br>')
          + '<div class="btn-row" style="margin-top:8px"><button class="btn btn-outline btn-sm" onclick="confirmPendingFeeGap()">💵 تسجيل كرسوم دولية</button></div>'
          + '<span style="font-size:11px;color:var(--muted)">يمكنك الحفظ عادي — هذا تنبيه فقط.</span>'
          + '</div>';
      } else if (Math.abs(diff) > 0.01) {
        var up = diff > 0;
        window._recon = { diff: diff, up: up, date: parsed.date, card: parsed.card || '', bank: parsed.bank || '', prevMerchant: prevE.merchant || '', prevDate: prevE.date || '' };
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
  html += '<div id="save-status"></div>';
  html += '<div class="btn-row" style="margin-top:8px">';
  html += '<button class="btn btn-outline" onclick="clearSMS()">🗑 مسح</button>';
  html += '<button class="btn btn-outline" onclick="reportWrongParse()">⚠️ تحليل خاطئ</button>';
  html += '</div>';

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
  if (typeof showTopSave === 'function') showTopSave(true);   // أظهر «حفظ» مكان «لصق»
}

function clearSMS() {
  document.getElementById('sms-input').value = '';
  document.getElementById('result-area').innerHTML = '';
  if (typeof showTopSave === 'function') showTopSave(false);   // ارجع «لصق»
}

// زر "تحليل خاطئ" — يحفظ الرسالة في أرشيف «لم تُحلَّل» لمعالجتها لاحقاً بدل التصحيح اليدوي كل مرة
function reportWrongParse() {
  var sms = document.getElementById('sms-input');
  var txt = sms ? sms.value.trim() : '';
  if (txt && typeof saveFailedParse === 'function') saveFailedParse(txt);
  window._parsed = null;
  if (sms) sms.value = '';
  document.getElementById('result-area').innerHTML = '<div class="alert alert-yellow">⚠️ حُفظت في «رسائل لم تُحلَّل» لمراجعتها لاحقاً. شكراً!</div>';
  if (typeof showTopSave === 'function') showTopSave(false);
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

// صافي ما على شخص = (دفعت نيابة عنه) − (سدّده) عبر كل العمليات.
// عمليات fxUnconverted (بعملتها الأجنبية بدون تحويل) مستبعدة — مبلغها بالريال غير معروف بعد،
// فحسابها كأنها SAR يعطي رقم غلط. انظر personPendingFx لعرضها بشكل منفصل بدل تجاهلها بصمت.
function personOwed(name) {
  var nm = String(name == null ? '' : name).trim();
  var paid = 0, refunded = 0;
  expenses.forEach(function(e) {
    if (!e.behalf || String(e.behalf).trim() !== nm) return;
    if (e.fxUnconverted) return;
    var amt = e.amount || 0;
    if (e.direction === 'credit') refunded += amt; else paid += amt;
  });
  return paid - refunded;
}

// عمليات نيابة عن شخص معيّن بعملتها الأجنبية بدون تحويل — مستبعدة من personOwed حتى تُصحَّح
function personPendingFx(name) {
  var nm = String(name == null ? '' : name).trim();
  return expenses.filter(function(e) { return e.behalf && String(e.behalf).trim() === nm && e.fxUnconverted; });
}

// تسجيل سداد من شخص: يضيف حركة وارد (credit) باسمه فتنقص من المتبقي عليه.
// الافتراضي = كامل المتبقي (تصفية)، وتقدر تكتب مبلغاً أقل (سداد جزئي).
function recordSettlement(name) {
  var nm = String(name == null ? '' : name).trim();
  if (!nm) return;
  var owed = personOwed(nm);
  var pendingFx = personPendingFx(nm);
  var def = owed > 0.005 ? String(Math.round(owed * 100) / 100) : '';
  var pendingNote = pendingFx.length
    ? '\n(+ ' + pendingFx.length + ' عملية دولية غير محوَّلة غير محسوبة: ' + pendingFx.map(function (fe) { return fmt(fe.amount) + ' ' + (fe.fxCurrency || ''); }).join('، ') + ' — صحّحها من السجل أولاً)'
    : '';
  var v = prompt('كم سدّد «' + nm + '»؟\nالمتبقي عليه: ' + fmt(owed) + ' ر.س' + pendingNote, def);
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

// هل العملية e ضمن نطاق مطابقة الرصيد (بعد settings.balanceCutoff أو يساويه)؟
// تُستخدم لقطع أثر أي بيانات قديمة عند إعادة ضبط الرصيد يدوياً (مثلاً بعد إيداع بداية شهر).
function withinBalanceWindow(e) {
  return !settings.balanceCutoff || (e.date || '') >= settings.balanceCutoff;
}

// عمليات فيها رسوم دولية لسه ما انسجّلت (البنك ما حدّث الرصيد المعروض بيها وقت تسجيلها) —
// تُستخدم لتفسير فجوة تظهر لاحقاً على عملية أخرى لما البنك يلحّق الرصيد بالرسوم المؤجَّلة.
function unsettledIntlFees(acctKey) {
  return expenses.filter(function (e) {
    return accountKey(e) === acctKey && withinBalanceWindow(e) && e.intlFee && !e.intlFeeSettled;
  });
}

// أحدث عملية مسجَّلة لنفس البطاقة/الحساب فيها رصيد رقمي — لمطابقة الرصيد.
// beforeRef (اختياري): يقتصر البحث على عمليات سابقة له زمنياً فقط (تاريخ ثم وقت) — ضروري وقت
// تحليل رسالة جديدة لسه ما انحفظت، حتى لو فيه عمليات محفوظة بتاريخ/وقت لاحق على نفس البطاقة
// (مثلاً لو حلّلت رسائل بترتيب مو زمني بالكامل) — بدونه ترجع أحدث عملية بإطلاق، حتى لو بعد المرجع.
function lastBalanceFor(acctKey, beforeRef) {
  if (!acctKey) return null;
  var best = null;
  expenses.forEach(function(e) {
    if (e.balance === '' || e.balance == null || isNaN(parseFloat(e.balance))) return;
    if (accountKey(e) !== acctKey) return;
    if (!withinBalanceWindow(e)) return;
    if (beforeRef && !isBeforeRef(e, beforeRef)) return;
    // ملاحظة: المقارنة بالوقت الخام HH:MM:SS، مو fmtTime() (تُقصّ للدقيقة فقط للعرض) — عمليتان
    // بنفس الدقيقة (زي مشتريين Apple Pay بفارق ثوانٍ) كانتا تُحسبان "متعادلتين" وتكسر الترتيب.
    var newer = !best
      || (e.date || '') > (best.date || '')
      || ((e.date || '') === (best.date || '') && String(e.time || '') > String(best.time || ''))
      || ((e.date || '') === (best.date || '') && String(e.time || '') === String(best.time || '') && (Number(e.id) || 0) > (Number(best.id) || 0));
    if (newer) best = e;
  });
  return best;
}

// هل العملية e قبل المرجع ref زمنياً (تاريخ ثم وقت الخام HH:MM:SS)؟ — يُستخدم مع رسالة لسه ما
// انحفظت (بلا id)، فما نقدر نحسم تعادل الدقيقة بمعرّف زي isAfter — لازم دقة الثواني الخام.
function isBeforeRef(e, ref) {
  var de = e.date || '', dr = ref.date || '';
  if (de !== dr) return de < dr;
  return String(e.time || '') < String(ref.time || '');
}

// هل العملية e بعد المرساة anchor زمنياً؟ (وقت خام HH:MM:SS، مو fmtTime المقصوص للعرض)
function isAfter(e, anchor) {
  var de = e.date || '', da = anchor.date || '';
  if (de !== da) return de > da;
  var te = String(e.time || ''), ta = String(anchor.time || '');
  if (te !== ta) return te > ta;
  return (Number(e.id) || 0) > (Number(anchor.id) || 0);
}

// مجموع المبالغ الموقّعة (إضافة + / خصم −) للعمليات المسجّلة لحساب بعد مرساة معيّنة
// — لإغلاق سلسلة الرصيد عند وجود حركات مسجّلة بلا رصيد بينها.
// uptoRef (اختياري): يوقف الجمع عند هذا المرجع زمنياً — يمنع احتساب عمليات محفوظة بتاريخ/وقت
// لاحق على رسالة لسه قيد التحليل (نفس سبب beforeRef في lastBalanceFor).
function signedSinceAnchor(acctKey, anchor, uptoRef) {
  var sum = 0;
  expenses.forEach(function(e) {
    if (accountKey(e) !== acctKey) return;
    if (!withinBalanceWindow(e)) return;
    if (!isAfter(e, anchor)) return;
    if (uptoRef && isAfter(e, uptoRef)) return;
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
    if (!withinBalanceWindow(e)) return;
    (byAcct[k] = byAcct[k] || []).push(e);
  });
  var gaps = [];
  Object.keys(byAcct).forEach(function(k) {
    var arr = byAcct[k].slice().sort(function(a, b) {
      var da = a.date || '', db = b.date || '';
      if (da !== db) return da < db ? -1 : 1;
      var ta = String(a.time || ''), tb = String(b.time || '');
      if (ta !== tb) return ta < tb ? -1 : 1;
      return (Number(a.id) || 0) - (Number(b.id) || 0);
    });
    var anchor = null, acc = 0, pendingFxSinceAnchor = [];
    arr.forEach(function(e) {
      var signed = (e.direction === 'credit' ? (e.amount || 0) : -(e.amount || 0));
      var hasBal = !(e.balance === '' || e.balance == null || isNaN(parseFloat(e.balance)));
      // عملية دولية بعملتها الأجنبية الخام بدون تحويل — مبلغها غير موثوق أصلاً، نجمعها منذ
      // آخر مرساة (تشمل e نفسها لو هي الحالة) لتفسير أي فرق بدل اعتباره فجوة مجهولة
      if (e.fxUnconverted) pendingFxSinceAnchor.push(e);
      if (hasBal) {
        if (anchor) {
          var expected = parseFloat(anchor.balance) + acc + signed;
          var diff = parseFloat(e.balance) - expected;
          // فرق يطابق رسوم دولية هذه العملية بالذات — مُفسَّر، مش فجوة حقيقية (نفس منطق تنبيه التحليل)
          var feeExplained = e.intlFee && Math.abs(Math.abs(diff) - e.intlFee) < 0.01;
          if (Math.abs(diff) > 0.01 && !feeExplained) {
            if (pendingFxSinceAnchor.length) {
              gaps.push({ acct: k, diff: diff, up: diff > 0, date: e.date, merchant: e.merchant,
                card: e.card || '', bank: e.bank || '', expected: expected, curBal: parseFloat(e.balance),
                anchorMerchant: anchor.merchant || '', anchorDate: anchor.date || '',
                cause: 'fx', fxItems: pendingFxSinceAnchor.slice() });
            } else {
              // فرق يطابق رسوم دولية سابقة على نفس الحساب لسه ما انسجّلت — سبب معروف، نعرضه بوضوح
              var pending = unsettledIntlFees(k).filter(function (pe) { return (pe.date || '') <= (e.date || ''); });
              var pendingSum = pending.reduce(function (s, pe) { return s + (pe.intlFee || 0); }, 0);
              var feeMatch = pending.length && Math.abs(Math.abs(diff) - pendingSum) < 0.01;
              gaps.push({ acct: k, diff: diff, up: diff > 0, date: e.date, merchant: e.merchant,
                card: e.card || '', bank: e.bank || '', expected: expected, curBal: parseFloat(e.balance),
                anchorMerchant: anchor.merchant || '', anchorDate: anchor.date || '',
                cause: feeMatch ? 'fee' : 'unknown', feeItems: feeMatch ? pending : [] });
            }
          }
        }
        anchor = e; acc = 0; pendingFxSinceAnchor = [];
      } else {
        acc += signed;
      }
    });
  });
  gaps.sort(function(a, b) { return (a.date || '') < (b.date || '') ? 1 : -1; });   // الأحدث أولاً
  return limit ? gaps.slice(0, limit) : gaps;
}

// تسجيل عملية "تسوية فرق رصيد" لإغلاق فجوة (بلا رصيد حتى تُحتسب في السلسلة)
// context (اختياري): وصف العمليات المحيطة بالفجوة، يُضاف للملاحظة عشان يبين وقت المراجعة لاحقاً وين صارت
function recordGapEntry(up, amt, date, card, bank, rerender, context) {
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
    note: 'تسوية فرق رصيد' + (context ? ' — ' + context : ''),
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
  var context = r.prevMerchant ? ('بعد عملية ' + r.prevMerchant + ' (' + r.prevDate + ')') : '';
  recordGapEntry(r.up, r.diff, r.date, r.card, r.bank, undefined, context);
  var b = document.getElementById('recon-alert');
  if (b) b.innerHTML = '✅ سُجّلت تسوية الفرق (' + fmt(amt) + ' ر.س). أكمل حفظ العملية الحالية لإغلاق السلسلة.';
}

// زر تسجيل الرسوم الدولية المعلَّقة داخل تنبيه التحليل (لما الفرق يطابق رسوم سابقة لسه ما انسجّلت)
function confirmPendingFeeGap() {
  var r = window._pendingFeeGap;
  if (!r) return;
  if (!confirm('تسجيل رسوم دولية معلّقة بقيمة ' + fmt(r.total) + ' ر.س؟')) return;
  recordFeeSettlement(r.ids, r.total, r.date, r.card, r.bank);
  var b = document.getElementById('pending-fee-alert');
  if (b) b.innerHTML = '✅ سُجّلت الرسوم الدولية (' + fmt(r.total) + ' ر.س). أكمل حفظ العملية الحالية لإغلاق السلسلة.';
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

function prevMonthKey(ym) {
  var p = String(ym).split('-');
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10) - 1;
  if (m < 1) { m = 12; y -= 1; }
  return y + '-' + (m < 10 ? '0' + m : '' + m);
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
// بطل التمويل (تصميم ٢) — العدّ التنازلي للمتبقّي + شريط ٢٤ شهر (مشترك: اللوحة + التمويل)
function finHeroHtml() {
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
  var h = '<div class="fin-hero stagger">';
  h += '<div class="fh-eyebrow"><span class="fh-dot"></span> خطة التمويل · يتبقّى ' + fMonthsLeft + ' شهر</div>';
  h += '<div class="fh-big">' + fmtInt(fRemaining) + ' <span class="cur">ر.س</span></div>';
  h += '<div class="fh-sub">المتبقّي من إجمالي <b>' + fmtInt(fTotal) + ' ر.س</b></div>';
  h += '<div class="comb">' + comb + '</div>';
  h += '<div class="fh-foot"><div>التقدّم<b>شهر ' + fMonthNum + ' / 24</b></div>'
    + '<div>القسط الشهري<b>' + fmtInt(fPay) + ' ر.س</b></div>'
    + '<div>الانتهاء<b>' + fEnd + '</b></div></div>';
  h += '</div>';
  return h;
}

function catBudgetRow(name, dotCls, colorVar, spent, budget) {
  var left = budget - spent;
  var over = left < -0.005;
  var pct = budget > 0 ? Math.min(100, Math.max(0, (spent / budget) * 100)) : (spent > 0 ? 100 : 0);
  var html = '<div class="cat-row">';
  html += '<div class="cat-head"><span class="cat-name"><span class="' + dotCls + '">●</span> ' + name + '</span>';
  html += '<span class="cat-left' + (over ? ' neg' : '') + '">باقي ' + fmtInt(left) + ' ر.س</span></div>';
  html += '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%;background:' + (over ? 'var(--red-text)' : colorVar) + '"></div></div>';
  html += '<div class="cat-sub">صُرف ' + fmt(spent) + ' من ' + fmtInt(budget) + ' ر.س' + (over ? ' · تجاوزت بـ ' + fmt(-left) : '') + '</div>';
  // تنبيه استباقي: اقتربت من السقف (≥80%) قبل التجاوز
  if (!over && budget > 0 && (spent / budget) >= 0.8) {
    html += '<div class="cat-warn">⚠️ اقتربت من السقف — باقي ' + fmtInt(left) + ' ر.س فقط</div>';
  }
  html += '</div>';
  return html;
}

// حالة الميزانية لتصنيف: ok (<80%) / warn (≥80%) / over (≥100%) — للتنبيهات والإشعارات
function budgetLevel(spent, cap) {
  if (!(cap > 0)) return 'ok';   // بلا سقف → لا تنبيه
  var pct = (spent / cap) * 100;
  if (pct >= 100) return 'over';
  if (pct >= 80) return 'warn';
  return 'ok';
}

// ============================================================
// ملخّص الشهر + ترحيب بداية شهر جديد
// ============================================================
// ملخّص شهر معيّن (YYYY-MM) — يلتزم بنفس قواعد renderDashboard:
// النيابة دفتر ذمم (مستثناة)، والوارد لا يُحتسب في الصرف.
function monthSummary(ym) {
  var byType = { 'أساسيات': 0, 'كماليات': 0, 'سداد التمويل': 0, 'غير محدد': 0 };
  var incoming = 0, count = 0, days = {}, merchants = {}, pendingFx = [];
  expenses.forEach(function (e) {
    if (!e.date || e.date.indexOf(ym) !== 0 || e.behalf) return;
    // عملية بعملتها الأجنبية بدون تحويل — مبلغها بالريال غير معروف بعد، تُستبعد من كل المجاميع
    // (تُعرض منفصلة) حتى لا يُحسب رقمها الخام على إنه ريال
    if (e.fxUnconverted) { pendingFx.push(e); return; }
    if (e.direction === 'credit') { incoming += (e.amount || 0); return; }
    var t = byType.hasOwnProperty(e.type) ? e.type : 'غير محدد';
    byType[t] += (e.amount || 0);
    count++; days[e.date] = true;
    if (e.type !== 'سداد التمويل') {   // أعلى تاجر صرفاً بلا القسط
      var k = (typeof merchantKey === 'function') ? merchantKey(e.merchant) : (e.merchant || '');
      if (k) { if (!merchants[k]) merchants[k] = { name: e.merchant || k, sum: 0 }; merchants[k].sum += (e.amount || 0); }
    }
  });
  var loan = byType['سداد التمويل'];
  var spend = byType['أساسيات'] + byType['كماليات'] + byType['غير محدد'];
  var top = null;
  Object.keys(merchants).forEach(function (k) { if (!top || merchants[k].sum > top.sum) top = merchants[k]; });
  var pm = prevMonthKey(ym), prevSpend = 0;
  expenses.forEach(function (e) {
    if (!e.date || e.date.indexOf(pm) !== 0 || e.behalf || e.direction === 'credit' || e.type === 'سداد التمويل' || e.fxUnconverted) return;
    prevSpend += (e.amount || 0);
  });
  return {
    ym: ym, byType: byType, spend: spend, loan: loan, incoming: incoming,
    saved: (settings.salary || 0) - spend - loan, topMerchant: top,
    count: count, daysWithData: Object.keys(days).length, prevSpend: prevSpend,
    committed: loan >= settings.payment,
    budgetOK: (byType['أساسيات'] + byType['كماليات']) <= (settings.salary - settings.payment),
    pendingFx: pendingFx
  };
}

// بطاقة ملخّص الشهر — تُستخدم كبانر ترحيب (closing) أو كقسم دائم
function monthSummaryCardHtml(ym, opts) {
  opts = opts || {};
  var s = monthSummary(ym);
  if (!s.count && !s.incoming && !s.loan) {
    return '<div class="card"><div class="card-body"><div class="card-title">📋 ملخّص ' + ymLabel(ym) + '</div>'
      + '<div style="font-size:13px;color:var(--muted)">لا توجد عمليات في هذا الشهر.</div></div></div>';
  }
  var deltaHtml = '';
  if (s.prevSpend > 0) {
    var dp = Math.round(((s.spend - s.prevSpend) / s.prevSpend) * 100);
    var down = dp <= 0;
    deltaHtml = '<div class="spend-delta ' + (down ? 'down' : 'up') + '">' + (down ? '▼ ' : '▲ ') + Math.abs(dp) + '٪ عن الشهر السابق</div>';
  }
  var donut = '';
  if (typeof donutChart === 'function') {
    donut = donutChart([
      { label: 'أساسيات', value: s.byType['أساسيات'], colorVar: 'var(--c-ess)' },
      { label: 'كماليات', value: s.byType['كماليات'], colorVar: 'var(--c-lux)' },
      { label: 'غير محدد', value: s.byType['غير محدد'], colorVar: 'var(--c-unk)' }
    ], fmtInt(s.spend), 'صرف الشهر');
  }
  var title = opts.closing ? '🎉 بدأ شهر جديد — ملخّص ' + ymLabel(ym) : '📋 ملخّص ' + ymLabel(ym);
  var h = '<div class="card month-summary' + (opts.closing ? ' month-close' : '') + '"><div class="card-body">';
  h += '<div class="card-title">' + title + '</div>';
  h += '<div class="spend2">' + donut
    + '<div class="spend2-info"><div class="spend2-lbl">إجمالي الصرف</div>'
    + '<div class="spend2-amt">' + fmt(s.spend) + ' <span class="cur">ر.س</span></div>' + deltaHtml + '</div></div>';
  h += '<div class="cat-divider"></div>';
  h += '<div class="acct-line"><span>🏦 سداد التمويل</span><b>' + fmt(s.loan) + ' ر.س</b></div>';
  if (s.incoming > 0) h += '<div class="acct-line"><span>⬇️ الوارد</span><b class="acct-in">+ ' + fmt(s.incoming) + ' ر.س</b></div>';
  h += '<div class="acct-line"><span>💰 الفائض (راتب − صرف − قسط)</span><b style="color:' + (s.saved >= 0 ? 'var(--c-ess)' : 'var(--red-text)') + '">' + fmt(s.saved) + ' ر.س</b></div>';
  if (s.topMerchant) h += '<div class="acct-line"><span>🏷️ أعلى تاجر</span><b>' + htmlEsc(s.topMerchant.name) + ' · ' + fmt(s.topMerchant.sum) + ' ر.س</b></div>';
  h += '<div class="acct-line"><span>🧾 عدد العمليات</span><b>' + s.count + '</b></div>';
  var ok = s.committed && s.budgetOK;
  h += '<div class="commit-row"><span class="commit-icon">' + (ok ? '✅' : '❌') + '</span><span>' + (ok ? 'التزمت بالخطة هذا الشهر' : 'لم تلتزم بالخطة بالكامل') + '</span></div>';
  if (s.pendingFx.length) {
    h += '<div style="font-size:11.5px;color:var(--c-lux);margin-top:6px">🌍 + ' + s.pendingFx.length + ' عملية دولية غير محوَّلة (' + s.pendingFx.map(function (fe) { return fmt(fe.amount) + ' ' + (fe.fxCurrency || ''); }).join('، ') + ') غير محسوبة أعلاه — عدّلها من فلتر «عمليات دولية» بالسجل</div>';
  }
  if (opts.closing) h += '<div class="btn-row" style="margin-top:12px"><button class="btn btn-primary" onclick="dismissMonthClose()">✓ ابدأ الشهر الجديد</button></div>';
  h += '</div></div>';
  return h;
}

// إغلاق بانر الشهر الجديد: نسجّل أن المستخدم رأى الشهر الحالي فلا يظهر مجدداً
function dismissMonthClose() {
  settings.lastSeenMonth = today().substring(0, 7);
  localStorage.setItem('settings_v2', JSON.stringify(settings));
  if (typeof renderDashboard === 'function') renderDashboard();
}

// بطاقة الأرصدة والوارد للوحة (قابلة للطي) — تُعرض أول الصفحة
function dashBalancesHtml(curM) {
  var balByCard = {};
  expenses.forEach(function (e) {
    if (e.balance === '' || e.balance == null) return;
    var key = e.card ? ('•••• ' + e.card) : (e.bank || '—');
    var cur = balByCard[key];
    var newer = !cur || (e.date || '') > (cur.date || '') || ((e.date || '') === (cur.date || '') && (Number(e.id) || 0) > (Number(cur.id) || 0));
    if (newer) balByCard[key] = e;
  });
  var inByAcct = {};
  expenses.forEach(function (e) {
    if (e.direction !== 'credit' || e.behalf || e.fxUnconverted) return;
    if (!(e.date && e.date.indexOf(curM) === 0)) return;
    var k = accountKey(e) || '—';
    if (!inByAcct[k]) inByAcct[k] = { sum: 0, count: 0 };
    inByAcct[k].sum += (e.amount || 0); inByAcct[k].count++;
  });
  var allAcct = {};
  Object.keys(balByCard).forEach(function (k) { allAcct[k] = true; });
  Object.keys(inByAcct).forEach(function (k) { allAcct[k] = true; });
  var acctKeys = Object.keys(allAcct).sort(function (a, b) {
    var ba = balByCard[a] ? (parseFloat(balByCard[a].balance) || 0) : 0;
    var bb = balByCard[b] ? (parseFloat(balByCard[b].balance) || 0) : 0;
    return bb - ba;
  });
  if (!acctKeys.length) return '';
  var inTotal = 0, h = '';
  h += '<details class="hist-extra" style="margin-bottom:14px"><summary>💳 الأرصدة والوارد</summary>';
  h += '<div class="card"><div class="card-body">';
  acctKeys.forEach(function (k) {
    h += '<div class="acct-block"><div class="acct-name">' + htmlEsc(k) + '</div>';
    if (balByCard[k]) h += '<div class="acct-line"><span>الرصيد المتاح</span><b>' + fmt(balByCard[k].balance) + ' ر.س</b></div>';
    if (inByAcct[k]) { inTotal += inByAcct[k].sum; h += '<div class="acct-line"><span>الوارد (' + inByAcct[k].count + ')</span><b class="acct-in">+ ' + fmt(inByAcct[k].sum) + ' ر.س</b></div>'; }
    h += '</div>';
  });
  if (inTotal > 0) h += '<div class="settings-row" style="border-top:1px solid var(--border-soft);margin-top:4px;padding-top:10px"><span style="font-weight:700">إجمالي الوارد</span><span class="settings-val acct-in" style="font-weight:800">+ ' + fmt(inTotal) + ' ر.س</span></div>';
  h += '</div></div></details>';
  return h;
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
  var monthPendingFx = [];
  month.forEach(function(e) {
    // عملية بعملتها الأجنبية بدون تحويل — مستبعدة من كل مجاميع الميزانية حتى تُصحَّح يدوياً
    if (e.fxUnconverted) { monthPendingFx.push(e); return; }
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

  // بانر بداية شهر جديد (مرة واحدة): إذا دخلنا شهراً لم يره المستخدم وفيه عمليات بالشهر الماضي
  (function () {
    var nowM = today().substring(0, 7);
    if (settings.lastSeenMonth === nowM) return;
    var prevM = prevMonthKey(nowM);
    var hasPrev = expenses.some(function (e) { return e.date && e.date.indexOf(prevM) === 0; });
    if (!hasPrev) return;
    html += monthSummaryCardHtml(prevM, { closing: true });
  })();

  html += dashBalancesHtml(curM);   // الأرصدة والوارد (مطوي) — أول شيء

  // ١) آخر العمليات
  (function () {
    var recent = expenses.filter(function (e) { return !isSettlement(e); }).slice().sort(function (a, b) {
      var da = a.date || '', db = b.date || '';
      if (da !== db) return da < db ? 1 : -1;
      var ta = String(a.time || ''), tb = String(b.time || '');
      if (ta !== tb) return ta < tb ? 1 : -1;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    }).slice(0, 5);
    if (recent.length) {
      html += '<div class="sec-head" style="margin-top:2px"><span>آخر العمليات</span><span class="sec-more" onclick="switchTab(\'history\')">عرض الكل ›</span></div>';
      recent.forEach(function (e) { html += txRowHtml(e); });
    }
  })();

  // ٢) بطل التمويل
  html += finHeroHtml();

  // ٣) شريط التنقّل بين الأشهر
  var monthsAvail = availableMonths();
  if (monthsAvail.length > 1) {
    var idx = monthsAvail.indexOf(curM);
    if (idx < 0) idx = 0;
    var canNewer = idx > 0;
    var canOlder = idx < monthsAvail.length - 1;
    html += '<div class="month-nav stagger">';
    html += '<button class="month-nav-btn" ' + (canOlder ? 'onclick="navDash(1)"' : 'disabled') + ' aria-label="شهر أقدم">‹</button>';
    html += '<span class="month-nav-label">' + fullMonthLabel + '</span>';
    html += '<button class="month-nav-btn" ' + (canNewer ? 'onclick="navDash(-1)"' : 'disabled') + ' aria-label="شهر أحدث">›</button>';
    html += '</div>';
  }

  // ملخّص الشهر المختار (قابل للطي) — متاح في أي وقت، يتبع التنقّل بين الأشهر
  html += '<details class="hist-extra" style="margin-bottom:14px"><summary>📋 ملخّص ' + monthLabel + '</summary>'
    + monthSummaryCardHtml(curM) + '</details>';

  // ٤) بطاقة مدموجة: دائرة صرف الشهر + المتبقي حسب التصنيف + الالتزام
  (function () {
    var inc = settings.salary || 0;
    var pct = inc > 0 ? Math.min(100, Math.round((spent / inc) * 100)) : 0;
    var C = 264, off = Math.round(C - C * pct / 100);
    var pm = prevMonthKey(curM);
    var prevSpent = 0;
    expenses.forEach(function (e) {
      if (!e.date || e.date.indexOf(pm) !== 0 || e.behalf || e.direction === 'credit' || e.fxUnconverted) return;
      if (e.type === 'سداد التمويل') return;
      prevSpent += (e.amount || 0);
    });
    var deltaHtml = '';
    if (prevSpent > 0) {
      var dp = Math.round(((spent - prevSpent) / prevSpent) * 100);
      var down = dp <= 0;
      deltaHtml = '<div class="spend-delta ' + (down ? 'down' : 'up') + '">' + (down ? '▼ ' : '▲ ') + Math.abs(dp) + '٪ عن الشهر السابق</div>';
    }
    html += '<div class="card stagger"><div class="card-body">';
    html += '<div class="spend2">';
    html += '<div class="donut2"><svg width="104" height="104" viewBox="0 0 104 104">'
      + '<circle cx="52" cy="52" r="42" fill="none" stroke="var(--bg-soft)" stroke-width="10"/>'
      + '<circle cx="52" cy="52" r="42" fill="none" stroke="var(--hero-1)" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + off + '" transform="rotate(-90 52 52)"/></svg>'
      + '<div class="donut2-mid"><b>' + pct + '٪</b><span>من الدخل</span></div></div>';
    html += '<div class="spend2-info"><div class="spend2-lbl">صرف ' + monthLabel + '</div>'
      + '<div class="spend2-amt">' + fmt(spent) + ' <span class="cur">ر.س</span></div>' + deltaHtml + '</div>';
    html += '</div>';
    html += '<div class="cat-divider"></div>';
    html += catBudgetRow('أساسيات', 'dot-ess', 'var(--c-ess)', byType['أساسيات'], settings.basic);
    html += catBudgetRow('كماليات', 'dot-lux', 'var(--c-lux)', byType['كماليات'], freeBudget);
    html += catBudgetRow('سداد التمويل', 'dot-loan', 'var(--c-loan)', byType['سداد التمويل'], settings.payment);
    html += '<div class="cat-row"><div class="cat-head"><span class="cat-name"><span class="dot-unk">●</span> غير محدد</span><span class="cat-left">صُرف ' + fmtInt(byType['غير محدد']) + ' ر.س</span></div><div class="cat-sub">بدون سقف — صنّفها لتدخل أحد المظاريف</div></div>';
    var _committed = byType['سداد التمويل'] >= settings.payment;
    var _budgetOK = (byType['أساسيات'] + byType['كماليات']) <= (settings.salary - settings.payment);
    var _ok = _committed && _budgetOK;
    html += '<div class="commit-row"><span class="commit-icon">' + (_ok ? '✅' : '❌') + '</span><span>' + (_ok ? 'ملتزم بالخطة هذا الشهر' : 'غير ملتزم بعد') + '</span></div>';
    if (!_committed) html += '<div class="alert alert-red" style="margin-top:8px">⚠️ لم يُسجَّل سداد التمويل هذا الشهر (' + fmtInt(settings.payment) + ' ر.س)</div>';
    if (byType['أساسيات'] > settings.basic) html += '<div class="alert alert-yellow" style="margin-top:8px">⚠️ الأساسيات تجاوزت الهدف</div>';
    if (byType['كماليات'] > freeBudget) html += '<div class="alert alert-yellow" style="margin-top:8px">⚠️ الكماليات تجاوزت الفائض الحر</div>';
    if (monthPendingFx.length) {
      html += '<div class="alert alert-blue" style="margin-top:8px">🌍 + ' + monthPendingFx.length + ' عملية دولية غير محوَّلة (' + monthPendingFx.map(function (fe) { return fmt(fe.amount) + ' ' + (fe.fxCurrency || ''); }).join('، ') + ') غير محسوبة أعلاه — عدّلها من فلتر «عمليات دولية» بالسجل</div>';
    }
    html += '</div></div>';
  })();

  // ٥) إحصائيات سريعة (٣ بطاقات)
  (function () {
    var d = new Date();
    var isThisMonth = curM === today().substring(0, 7);
    var days = isThisMonth ? d.getDate() : 30;
    var avg = days > 0 ? spent / days : spent;
    var incLeft = (settings.salary || 0) - spent - loan;
    html += '<div class="stat-row">';
    html += '<div class="stat2"><div class="stat2-v">' + monthCount + '</div><div class="stat2-k">عملية الشهر</div></div>';
    html += '<div class="stat2"><div class="stat2-v">' + fmtInt(avg) + '</div><div class="stat2-k">متوسط يومي</div></div>';
    html += '<div class="stat2"><div class="stat2-v">' + fmtInt(incLeft) + '</div><div class="stat2-k">متبقّي الدخل</div></div>';
    html += '</div>';
  })();

  // ٧) نيابة عن آخرين (قابل للطي لتقصير الصفحة)
  (function () {
    var byPerson = {};
    expenses.forEach(function(e) {
      var name = e.behalf ? String(e.behalf).trim() : '';
      if (!name) return;
      if (!byPerson[name]) byPerson[name] = { paid: 0, refunded: 0, count: 0, pendingFx: [] };
      // عملية بعملتها الأجنبية بدون تحويل — مبلغها بالريال غير معروف بعد، تُستبعد من المجموع
      // (تُعرض منفصلة تحت) حتى لا يُحسب رقمها الخام على إنه ريال
      if (e.fxUnconverted) { byPerson[name].pendingFx.push(e); return; }
      var amt = e.amount || 0;
      if (e.direction === 'credit') byPerson[name].refunded += amt; else byPerson[name].paid += amt;
      byPerson[name].count++;
    });
    var people = Object.keys(byPerson).map(function(n) {
      return { name: n, paid: byPerson[n].paid, refunded: byPerson[n].refunded, count: byPerson[n].count, owed: byPerson[n].paid - byPerson[n].refunded, pendingFx: byPerson[n].pendingFx };
    });
    people.sort(function(a, b) { return b.owed - a.owed; });
    if (!people.length) return;
    var totalOwed = people.reduce(function(s, p) { return s + p.owed; }, 0);
    html += '<details class="hist-extra" style="margin-top:6px"><summary>👥 نيابة عن آخرين · المجموع لك: ' + fmt(totalOwed) + ' ر.س</summary>';
    html += '<div class="card"><div class="card-body">';
    people.forEach(function(p) {
      var cls = p.owed > 0.005 ? ' owe-pos' : ' owe-zero';
      html += '<div class="behalf-row">';
      html += '<div class="behalf-head"><span class="behalf-name">' + htmlEsc(p.name) + '</span><span class="behalf-count">' + p.count + ' عملية</span></div>';
      html += '<div class="behalf-stats">';
      html += '<div><span>دفعت</span><b>' + fmt(p.paid) + '</b></div>';
      html += '<div><span>استرد</span><b>' + fmt(p.refunded) + '</b></div>';
      html += '<div class="behalf-owed' + cls + '"><span>المتبقي عليه</span><b>' + fmt(p.owed) + '</b></div>';
      html += '</div>';
      if (p.pendingFx.length) {
        html += '<div style="font-size:11.5px;color:var(--c-lux);margin-top:6px">🌍 + ' + p.pendingFx.length + ' عملية دولية غير محوَّلة (' + p.pendingFx.map(function (fe) { return fmt(fe.amount) + ' ' + (fe.fxCurrency || ''); }).join('، ') + ') غير محسوبة بعد — صحّحها من السجل</div>';
      }
      html += '<div class="btn-row" style="margin-top:8px"><button class="btn btn-outline btn-sm" onclick="recordSettlement(\'' + jsStr(p.name) + '\')">💵 سجّل سداد / تصفية</button></div>';
      html += '</div>';
    });
    html += '</div></div></details>';
  })();

  // خطة الأشهر القادمة (قابلة للطي) — مدموجة من تبويب التمويل
  (function () {
    var sp = String(settings.start || '2026-05').split('-');
    var fsy = parseInt(sp[0], 10), fsm = parseInt(sp[1], 10);
    var nowD = new Date();
    var mNum = Math.max(1, Math.min(24, (nowD.getFullYear() - fsy) * 12 + (nowD.getMonth() + 1 - fsm) + 1));
    html += '<details class="hist-extra" style="margin-top:6px"><summary>📅 خطة الأشهر القادمة</summary>';
    html += '<div class="card"><div class="card-body" style="overflow-x:auto"><table class="fin-table">';
    html += '<tr><th>#</th><th>الشهر</th><th>القسط</th><th>المتبقي</th><th></th></tr>';
    html += projectionRows(mNum, settings.total, settings.payment, settings.start);
    html += '</table></div></div></details>';
  })();

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

// صف عملية واحد بنمط تصميم ٢ (قابل للتوسّع) — يُستخدم في السجل واللوحة
function txRowHtml(e) {
  var isCredit = e.direction === 'credit';
  var edited = !isCredit && e.origAmount !== '' && e.origAmount != null && Number(e.origAmount) !== Number(e.amount);
  var eid = String(e.id || '').replace(/'/g, "\\'");
  var tdisp = fmtTime(e.time);
  var dateLine = (e.date || '') + (tdisp && tdisp !== '00:00' ? ' · ' + tdisp : '');
  var s = '<div class="xtx" onclick="this.classList.toggle(\'open\')">';
  s += '<div class="tx-main">';
  s += '<div class="ic">' + txIcon(e) + '</div>';
  s += '<div class="tx-body"><div class="tx-n">' + (e.merchant || '—') + '</div>';
  s += '<div class="tx-m"><span class="pill ' + pillClass(e.type, isCredit) + '">' + (e.type || '') + '</span>'
    + (e.bank ? ' ' + e.bank : '')
    + (e.behalf ? ' <span class="behalf-tag">👥 ' + htmlEsc(e.behalf) + '</span>' : '') + '</div>';
  if (e.balance !== '' && e.balance != null) s += '<div class="tx-meta">الرصيد: ' + fmt(e.balance) + ' ر.س</div>';
  if (edited) s += '<div class="tx-meta">عُدّل من ' + fmt(e.origAmount) + ' ر.س</div>';
  if (e.note) s += '<div class="tx-meta">📝 ' + htmlEsc(e.note) + '</div>';
  if (e.synced === false) s += '<div class="tx-meta" style="color:var(--red-text)">⚠️ لم يُرفع إلى Sheets</div>';
  if (e.intlFee) {
    s += e.intlFeeSettled
      ? '<div class="tx-meta" style="color:var(--muted)">🔗 رسوم دولية ' + fmt(e.intlFee) + ' ر.س — سُجِّلت لاحقاً</div>'
      : '<div class="tx-meta" style="color:var(--muted)">⏳ رسوم دولية ' + fmt(e.intlFee) + ' ر.س لسه ما انسجّلت</div>';
  }
  if (e.fxUnconverted) s += '<div class="tx-meta" style="color:var(--c-lux)">🌍 عملية دولية بدون تحويل — عدّلها بالمبلغ الصحيح بالريال</div>';
  s += '</div>';
  var amtUnit = e.fxUnconverted ? (e.fxCurrency || '') : 'ر.س';
  s += '<div class="tx-end"><div class="tx-amt' + (isCredit ? ' plus' : '') + (e.fxUnconverted ? ' fx-pending' : '') + '">' + (isCredit ? '+ ' : '') + fmt(e.amount) + ' ' + amtUnit + '</div>'
    + '<div class="tx-date">' + dateLine + '</div></div>';
  s += '<span class="tx-chev">⌄</span>';
  s += '</div>';
  s += '<div class="tx-exp"><div class="tx-detail"><div class="tx-acts">';
  if (e.synced === false) s += '<button onclick="event.stopPropagation();retryUpload(\'' + eid + '\')">🔄 إعادة رفع</button>';
  s += '<button onclick="event.stopPropagation();editEntry(\'' + eid + '\')">✎ تعديل</button>';
  s += '<button class="act-del" onclick="event.stopPropagation();deleteEntry(\'' + eid + '\')">🗑 حذف</button>';
  s += '</div>';
  if (e.synced === false) s += '<div id="retry-status-' + eid + '"></div>';
  s += '</div></div>';
  s += '</div>';
  return s;
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
  window._gaps = gaps;   // مرجع بالفهرس لأزرار التسجيل (تفادي تمرير بيانات معقّدة داخل onclick)
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
  gaps.forEach(function(g, i) {
    html += '<div class="settings-row" style="flex-wrap:wrap;gap:6px;align-items:center">';
    html += '<span style="flex:1;min-width:140px">' + htmlEsc(g.acct) + ' · ' + g.date + '<br><span style="font-size:11px;color:var(--muted)">المتوقّع ' + fmt(g.expected) + ' · الفعلي ' + fmt(g.curBal) + '</span>';
    if (g.cause === 'fee') {
      html += '<br><span style="font-size:11.5px;color:var(--muted)">🧾 السبب: رسوم دولية معلّقة — '
        + g.feeItems.map(function (fe) { return htmlEsc(fe.merchant || '—') + ' (' + fe.date + ')'; }).join('، ') + '</span>';
    } else if (g.cause === 'fx') {
      html += '<br><span style="font-size:11.5px;color:var(--muted)">🌍 السبب: عملية/عمليات دولية غير محوَّلة — '
        + g.fxItems.map(function (fe) { return htmlEsc(fe.merchant || '—') + ' — ' + fmt(fe.amount) + ' ' + (fe.fxCurrency || '') + ' (' + fe.date + ')'; }).join('، ') + '</span>';
    } else {
      html += '<br><span style="font-size:11.5px;color:var(--muted)">بين عملية ' + htmlEsc(g.anchorMerchant || '—') + ' (' + g.anchorDate + ') وعملية ' + htmlEsc(g.merchant || '—') + ' (' + g.date + ')</span>';
    }
    html += '</span>';
    html += '<span style="font-weight:700;color:' + (g.up ? 'var(--green)' : '#d9822b') + '">' + (g.up ? '+ ' : '− ') + fmt(Math.abs(g.diff)) + ' ر.س</span>';
    if (g.cause === 'fee') {
      html += '<button class="btn btn-outline btn-sm" onclick="recordFeeGapAt(' + i + ')">💵 تسجيل كرسوم دولية</button>';
    } else if (g.cause === 'fx') {
      html += '<div class="btn-row">' + g.fxItems.map(function (fe) {
        return '<button class="btn btn-outline btn-sm" onclick="editEntry(\'' + String(fe.id) + '\')">✏️ عدّل ' + htmlEsc(fe.merchant || '—') + '</button>';
      }).join('') + '</div>';
    } else {
      html += '<button class="btn btn-outline btn-sm" onclick="recordUnknownGapAt(' + i + ')">💵 سجّل</button>';
    }
    html += '</div>';
  });
  html += '</div></div>';
  el.innerHTML = html;
}

// أزرار التسجيل بالفجوات (بالفهرس داخل window._gaps من آخر renderGapsTab)
function recordUnknownGapAt(i) {
  var g = window._gaps && window._gaps[i];
  if (!g) return;
  var context = 'بين عملية ' + (g.anchorMerchant || '—') + ' (' + g.anchorDate + ') وعملية ' + (g.merchant || '—') + ' (' + g.date + ')';
  recordGapEntry(g.up, g.diff, g.date, g.card, g.bank, 'history', context);
}

function recordFeeGapAt(i) {
  var g = window._gaps && window._gaps[i];
  if (!g || !g.feeItems || !g.feeItems.length) return;
  if (!confirm('تسجيل رسوم دولية معلّقة بقيمة ' + fmt(Math.abs(g.diff)) + ' ر.س؟')) return;
  var ids = g.feeItems.map(function (fe) { return fe.id; });
  recordFeeSettlement(ids, Math.abs(g.diff), g.date, g.card, g.bank, 'history');
}

// تبويب عمليات دولية بانتظار التحويل — كل عملية fxUnconverted بكل الأوقات (بلا فلاتر شهر/بحث)،
// لسهولة الوصول لها وتصحيحها دفعة واحدة بدل البحث عنها بين كل العمليات
function renderFxPendingTab(el) {
  var items = expenses.filter(function (e) { return e.fxUnconverted; });
  if (!items.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">لا توجد عمليات دولية بانتظار التحويل.</div></div>';
    return;
  }
  items.sort(function (a, b) {
    var da = a.date || '', db = b.date || '';
    if (da !== db) return da < db ? 1 : -1;
    var ta = String(a.time || ''), tb = String(b.time || '');
    return ta < tb ? 1 : -1;
  });
  var html = '<div class="card" style="margin-bottom:10px"><div class="card-body" style="padding:10px 15px">';
  html += '<div style="font-size:13px;color:var(--muted)">' + items.length + ' عملية بانتظار المبلغ الصحيح بالريال</div>';
  html += '<div style="font-size:11.5px;color:var(--muted);margin-top:6px">بعملتها الأجنبية بدون سعر صرف أو مبلغ نهائي واضح بالرسالة — مسجَّلة مؤقتاً بعملتها الأصلية وغير محسوبة بأي مصروف أو دفتر ذمم. عدّل كل عملية بالمبلغ الصحيح من كشف حسابك متى ما وصلك.</div>';
  html += '</div></div>';
  html += '<div class="card"><div class="card-body">';
  items.forEach(function (e) { html += txRowHtml(e); });
  html += '</div></div>';
  el.innerHTML = html;
}

function renderHistory() {
  var el = document.getElementById('history-content');

  // تبويب مستقل: فجوات الرصيد (مستقل عن فلاتر الشهر/البحث)
  if (histFilter === 'gaps') { renderGapsTab(el); return; }
  // تبويب مستقل: عمليات دولية بانتظار التحويل (كل الأوقات، بلا فلاتر شهر/بحث)
  if (histFilter === 'fxpending') { renderFxPendingTab(el); return; }

  // أشخاص "نيابة عن" ضمن نطاق الشهر المحدد — لبناء فلتر الاسم في عرض الدفتر
  var behalfPeople = {};
  expenses.forEach(function(e) {
    if (!e.behalf) return;
    if (histMonth !== 'all' && !(e.date && e.date.indexOf(histMonth) === 0)) return;
    if (histDay && e.date !== histDay) return;
    var nm = String(e.behalf).trim();
    if (!nm) return;
    if (!behalfPeople[nm]) behalfPeople[nm] = { paid: 0, refunded: 0, count: 0 };
    if (e.fxUnconverted) return;   // مبلغ أجنبي غير محوَّل — مستبعد حتى لا يُحسب على إنه ريال
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
    var ta = String(a.time || ''), tb = String(b.time || '');
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

  // البحث ظاهر دائماً؛ بقية الفلاتر (يوم/شهر/شخص) داخل قسم قابل للطي — لواجهة نظيفة كالمعاينة
  var extraFilters = dayBar + monthBar + personBar;
  var filterBars = searchBar
    + '<details class="hist-extra"><summary>🎚️ فلاتر متقدّمة</summary>' + extraFilters + '</details>';

  if (!data.length) {
    el.innerHTML = filterBars + '<div class="empty"><div class="empty-icon">📭</div><div class="empty-text">لا توجد سجلات' + (histFilter !== 'all' ? ' لهذا التصنيف' : '') + (histPerson !== 'all' ? ' لـ ' + htmlEsc(histPerson) : '') + (histDay ? ' بتاريخ ' + htmlEsc(histDay) : (histMonth !== 'all' ? ' في ' + ymLabel(histMonth) : '')) + (histSearch ? ' مطابقة لـ «' + htmlEsc(histSearch) + '»' : '') + '</div></div>';
    return;
  }

  // الصرف = مدين بدون القسط وبدون نيابة (تماشياً مع لوحة الملخّص)
  // ونحسب أيضاً مجاميع النيابة (دفعت/استرد) لعرضها تحت فلتر النيابة
  var spendTotal = 0, loanTotal = 0, histPendingFx = [];
  data.forEach(function(e) {
    if (e.behalf) return;                       // النيابة مستثناة من الصرف/القسط
    if (e.direction === 'credit') return;
    if (e.fxUnconverted) { histPendingFx.push(e); return; }   // مبلغ أجنبي غير محوَّل — مستبعد من الصرف حتى يُصحَّح
    var amt = e.amount || 0;
    if (e.type === 'سداد التمويل') loanTotal += amt;
    else spendTotal += amt;
  });
  // مجاميع دفتر الذمم للشهر المحدد — مستقلة عن الفلتر، وتشمل التسويات (حتى المخفية من العمليات)
  var behalfPaid = 0, behalfRefund = 0, behalfPendingFx = [];
  expenses.forEach(function(e) {
    if (!e.behalf) return;
    if (histMonth !== 'all' && !(e.date && e.date.indexOf(histMonth) === 0)) return;
    if (histDay && e.date !== histDay) return;
    if (histPerson !== 'all' && String(e.behalf).trim() !== histPerson) return;   // عند اختيار شخص: المجاميع تخصّه فقط
    if (!histMatch(e)) return;
    // عملية بعملتها الأجنبية بدون تحويل — مستبعدة من المجاميع حتى لا تُحسب على إنها ريال
    if (e.fxUnconverted) { behalfPendingFx.push(e); return; }
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

  // الوارد لكل بطاقة/حساب
  var inByAcct = {};
  expenses.forEach(function(e) {
    if (e.direction !== 'credit') return;
    if (e.behalf || e.fxUnconverted) return;   // تسويات/سداد الأشخاص تخص دفتر الذمم فقط، والمبالغ غير المحوَّلة مستبعدة حتى تُصحَّح
    if (histMonth !== 'all' && !(e.date && e.date.indexOf(histMonth) === 0)) return;
    if (histDay && e.date !== histDay) return;
    var k = accountKey(e) || '—';
    if (!inByAcct[k]) inByAcct[k] = { sum: 0, count: 0 };
    inByAcct[k].sum += (e.amount || 0);
    inByAcct[k].count++;
  });

  // بطاقة واحدة: الرصيد + الوارد لكل حساب
  var allAcct = {};
  balKeys.forEach(function(k) { allAcct[k] = true; });
  Object.keys(inByAcct).forEach(function(k) { allAcct[k] = true; });
  var acctKeys = Object.keys(allAcct).sort(function(a, b) {
    var ba = balByCard[a] ? (parseFloat(balByCard[a].balance) || 0) : 0;
    var bb = balByCard[b] ? (parseFloat(balByCard[b].balance) || 0) : 0;
    return bb - ba;
  });
  var acctCard = '';
  if (acctKeys.length) {
    var inTotal = 0;
    acctCard += '<div class="card" style="margin-bottom:10px"><div class="card-body"><div class="card-title">💳 الأرصدة والوارد' + (histMonth !== 'all' ? ' · ' + ymLabel(histMonth) : '') + '</div>';
    acctKeys.forEach(function(k) {
      acctCard += '<div class="acct-block"><div class="acct-name">' + htmlEsc(k) + '</div>';
      if (balByCard[k]) acctCard += '<div class="acct-line"><span>الرصيد المتاح</span><b>' + fmt(balByCard[k].balance) + ' ر.س</b></div>';
      if (inByAcct[k]) { inTotal += inByAcct[k].sum; acctCard += '<div class="acct-line"><span>الوارد (' + inByAcct[k].count + ')</span><b class="acct-in">+ ' + fmt(inByAcct[k].sum) + ' ر.س</b></div>'; }
      acctCard += '</div>';
    });
    if (inTotal > 0) acctCard += '<div class="settings-row" style="border-top:1px solid var(--border-soft);margin-top:4px;padding-top:10px"><span style="font-weight:700">إجمالي الوارد</span><span class="settings-val acct-in" style="font-weight:800">+ ' + fmt(inTotal) + ' ر.س</span></div>';
    acctCard += '</div></div>';
  }

  var rows = '';
  data.forEach(function(e) { rows += txRowHtml(e); });

  var totalCard = '<div class="card" style="margin-bottom:10px"><div class="card-body" style="padding:10px 15px">';
  if (histFilter === 'سداد التمويل') {
    totalCard += '<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--muted)">' + data.length + ' عملية · سداد التمويل</span><span style="font-weight:700;color:var(--blue-text)">' + fmt(loanTotal) + ' ر.س</span></div>';
  } else if (histFilter === 'incoming') {
    var incTotal = 0, incByType = {}, incPendingFx = [];
    data.forEach(function(e) {
      if (e.fxUnconverted) { incPendingFx.push(e); return; }
      incTotal += (e.amount || 0);
      var tt = e.type || 'إضافة';
      incByType[tt] = (incByType[tt] || 0) + (e.amount || 0);
    });
    totalCard += '<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--muted)">' + data.length + ' عملية · وارد للرصيد</span><span style="font-weight:700;color:var(--green)">+ ' + fmt(incTotal) + ' ر.س</span></div>';
    if (incPendingFx.length) totalCard += '<div style="font-size:11.5px;color:var(--c-lux);margin-top:6px">🌍 + ' + incPendingFx.length + ' عملية دولية غير محوَّلة (' + incPendingFx.map(function (fe) { return fmt(fe.amount) + ' ' + (fe.fxCurrency || ''); }).join('، ') + ') غير محسوبة أعلاه</div>';
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
    if (behalfPendingFx.length) {
      totalCard += '<div style="font-size:11.5px;color:var(--c-lux);margin-top:6px">🌍 + ' + behalfPendingFx.length + ' عملية دولية غير محوَّلة (' + behalfPendingFx.map(function (fe) { return fmt(fe.amount) + ' ' + (fe.fxCurrency || ''); }).join('، ') + ') غير محسوبة أعلاه — صحّحها من السجل</div>';
    }
    if (onePerson) totalCard += '<div class="btn-row" style="margin-top:10px"><button class="btn btn-outline btn-sm" onclick="recordSettlement(\'' + jsStr(histPerson) + '\')">💵 سجّل سداد / تصفية</button></div>';
  } else {
    totalCard += '<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--muted)">' + data.length + ' عملية · الصرف</span><span style="font-weight:700">' + fmt(spendTotal) + ' ر.س</span></div>';
    if (loanTotal > 0) totalCard += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border-soft)"><span style="color:var(--muted)">سداد التمويل (منفصل)</span><span style="font-weight:700;color:var(--blue-text)">' + fmt(loanTotal) + ' ر.س</span></div>';
    if (behalfPaid > 0 || behalfRefund > 0) totalCard += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px;padding-top:6px;border-top:1px solid var(--border-soft)"><span style="color:var(--muted)">نيابة عن آخرين (مستثناة)</span><span style="font-weight:700;color:var(--hero-1)">' + fmt(behalfPaid - behalfRefund) + ' ر.س</span></div>';
    if (histPendingFx.length) totalCard += '<div style="font-size:11.5px;color:var(--c-lux);margin-top:6px">🌍 + ' + histPendingFx.length + ' عملية دولية غير محوَّلة (' + histPendingFx.map(function (fe) { return fmt(fe.amount) + ' ' + (fe.fxCurrency || ''); }).join('، ') + ') غير محسوبة أعلاه — عدّلها من فلتر «عمليات دولية»</div>';
  }
  totalCard += '</div></div>';

  var sheetBtn = settings.sheetUrl ? '<a href="' + settings.sheetUrl + '" target="_blank" class="sheet-link">📊 فتح Google Sheets ↗</a>' : '';
  var acctSummary = acctCard
    ? '<details class="hist-extra"><summary>📊 ملخّص الحساب (الرصيد والوارد)</summary>' + acctCard + '</details>'
    : '';
  el.innerHTML = filterBars + acctSummary + totalCard + rows + sheetBtn;
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
  var thisMonth = expenses.filter(function(e) { return e.date && e.date.startsWith(curM) && !e.behalf && e.direction !== 'credit' && !e.fxUnconverted; });
  var essAct = thisMonth.filter(function(e) { return e.type==='أساسيات'; }).reduce(function(s,e) { return s+(e.amount||0); },0);
  var luxAct = thisMonth.filter(function(e) { return e.type==='كماليات'; }).reduce(function(s,e) { return s+(e.amount||0); },0);
  var loanAct = thisMonth.filter(function(e) { return e.type==='سداد التمويل'; }).reduce(function(s,e) { return s+(e.amount||0); },0);

  var committed = loanAct >= payment;
  var budgetOK = (essAct + luxAct) <= (salary - payment);

  var html = '';

  html += finHeroHtml();   // بطل التمويل في المقدّمة (يغني عن بطاقة "تقدم السداد")


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

  // المظهر واللغة
  var dark = document.documentElement.getAttribute('data-theme') === 'dark';
  var en = (typeof isEN === 'function') && isEN();
  html += '<div class="card"><div class="card-body">';
  html += '<div class="card-title">المظهر واللغة</div>';
  html += '<div class="settings-row"><span>الوضع الداكن</span><button class="btn btn-outline btn-sm" onclick="toggleTheme();renderSettings()">' + (dark ? '🌙 مفعّل' : '☀️ معطّل') + '</button></div>';
  html += '<div class="settings-row"><span>اللغة · Language</span><button class="btn btn-outline btn-sm" onclick="toggleLang()">' + (en ? 'English' : 'العربية') + '</button></div>';
  var notifyDenied = (typeof Notification !== 'undefined' && Notification.permission === 'denied');
  var notifyLbl = settings.notify ? '🔔 مفعّل' : (notifyDenied ? '🔕 محظور' : '🔕 معطّل');
  html += '<div class="settings-row"><span>تنبيهات الميزانية (المتصفح)</span><button class="btn btn-outline btn-sm" onclick="requestNotifyPermission()">' + notifyLbl + '</button></div>';
  html += '<div style="font-size:11.5px;color:var(--muted);margin-top:-2px">إشعار عند الاقتراب من سقف الأساسيات/الكماليات (80%) أو تجاوزه — مرة واحدة لكل عتبة شهرياً.</div>';
  html += '<div id="s-notify-status"></div>';
  html += '</div></div>';

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
  html += '<div class="card-title">مطابقة الرصيد</div>';
  html += '<div class="field"><label>تجاهل العمليات قبل تاريخ (YYYY-MM-DD)</label><input type="date" id="s-balcutoff" value="' + (settings.balanceCutoff || '') + '"></div>';
  html += '<div style="font-size:11.5px;color:var(--muted);margin:-2px 0 8px">مطابقة الرصيد وتبويب «فجوات الرصيد» تتجاهل أي عملية قبل هذا التاريخ تماماً، وتبدأ السلسلة من أول عملية برصيد بعده (مثلاً إيداع بداية شهر جديد). اتركه فارغاً لإلغاء القطع والعودة لاحتساب كل التاريخ.</div>';
  html += '<button class="btn btn-outline btn-sm" onclick="saveBalanceCutoff()">💾 حفظ</button>';
  html += '<div id="s-balcutoff-status"></div>';
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
  if (pendingDeletes.length) {
    html += '<div class="settings-row" style="margin-top:12px;border-top:1px solid var(--border-soft);padding-top:10px">'
      + '<span style="color:var(--red-text)">⚠️ ' + pendingDeletes.length + ' عملية لم تُحذف من Sheets</span>'
      + '<button class="btn btn-outline btn-sm" onclick="retryPendingDeletes()">🗑 أعد محاولة الحذف</button></div>';
    html += '<div style="font-size:11.5px;color:var(--muted);margin-top:4px">حُذفت من التطبيق لكن فشل حذف صفّها من الشيت (انقطاع شبكة/مفتاح خاطئ) — ستبقى ظاهرة هناك حتى تنجح إعادة المحاولة.</div>';
    html += '<div id="s-pending-del-status"></div>';
  }
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

// حفظ تاريخ قطع مطابقة الرصيد — الحقل فارغ يعني إلغاء القطع (احتساب كل التاريخ كالمعتاد)
function saveBalanceCutoff() {
  settings.balanceCutoff = document.getElementById('s-balcutoff').value || '';
  localStorage.setItem('settings_v2', JSON.stringify(settings));
  document.getElementById('s-balcutoff-status').innerHTML = '<div class="alert alert-green">✅ تم الحفظ' + (settings.balanceCutoff ? ' — سيتم تجاهل ما قبل ' + settings.balanceCutoff : ' — أُلغي القطع') + '</div>';
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
