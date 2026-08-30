// ============================================================
// استيراد بالجملة من كشف حساب PDF (ميزة دائمة — تبويب الإعدادات)
// ============================================================
// حل لمشكلة السفر: رسائل SMS ما تُسجَّل أولاً بأول (آيفون ما يسمح بنسخ عدة رسائل
// دفعة وحدة)، فبعد الرجوع يوجد كشف حساب PDF يغطي الفترة كاملة. هذا الملف يقرأه،
// يستخرج العمليات، يصنّفها تلقائياً (بإعادة استخدام classifyMerchant/DICT/learned)،
// ويعرضها بجدول مراجعة قابل للتعديل قبل الحفظ الفعلي عبر نفس مسار appendEntryParams
// المستخدم بالحفظ اليدوي/SMS — الشيت والتطبيق يبقيان مصدر حقيقة واحد.
//
// PDF.js تُحمَّل من CDN عند الطلب فقط (لا ضمن سلسلة السكربتات الأساسية ولا كاش
// الـ Service Worker) — استثناء واعٍ من قاعدة "بدون اعتماديات" لأن قراءة PDF
// بجافاسكربت خام غير عملية.

var _pdfJsPromise = null;
var _bulkRows = [];
var _bulkRawLines = [];   // الأسطر الخام المستخرجة من آخر ملف — لتشخيص/معايرة parseStatementLines
var _bulkAccount = '';    // حساب/بطاقة الكشف كامله (واحد لكل الدفعة) — يُطبَّق وقت الحفظ عبر applyAccount()

function loadPdfJs() {
  if (_pdfJsPromise) return _pdfJsPromise;
  _pdfJsPromise = new Promise(function(resolve, reject) {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      return resolve(window.pdfjsLib);
    }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    s.onload = function() {
      try {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      } catch (e) { reject(e); }
    };
    s.onerror = function() { _pdfJsPromise = null; reject(new Error('تعذّر تحميل مكتبة قراءة PDF — تأكد من الاتصال بالإنترنت')); };
    document.head.appendChild(s);
  });
  return _pdfJsPromise;
}

// يحوّل عناصر النص بصفحة PDF (كل عنصر له إحداثيات x/y) إلى أسطر — يجمّع العناصر
// المتقاربة بمحور y بنفس السطر ثم يرتّبها بمحور x (PDF.js لا يحافظ على ترتيب
// الجدول تلقائياً، فهذا ضروري لإعادة بناء الصف كما يظهر بصرياً)
function pageTextToLines(content) {
  var items = content.items.map(function(it) {
    return { str: it.str, x: it.transform[4], y: it.transform[5] };
  }).filter(function(it) { return it.str && it.str.trim(); });
  items.sort(function(a, b) { return (b.y - a.y) || (a.x - b.x); });
  var lines = [], curY = null, cur = null;
  items.forEach(function(it) {
    if (curY === null || Math.abs(it.y - curY) > 2.5) {
      cur = []; lines.push(cur); curY = it.y;
    }
    cur.push(it);
  });
  return lines.map(function(l) {
    l.sort(function(a, b) { return a.x - b.x; });
    var s = l.map(function(it) { return it.str; }).join(' ').replace(/\s+/g, ' ').trim();
    // بعض ملفات PDF (لوحظ بكشف الراجحي) تُضمِّن العربي بأشكال العرض الموضعية
    // (presentation forms، مثل "ﻛﺸﻒ" بدل "كشف") بدل الحروف المنطقية — لا تطابق
    // أي نمط عربي عادي بالكود. normalize('NFKC') يحوّلها لحروفها القياسية.
    return s.normalize ? s.normalize('NFKC') : s;
  }).filter(Boolean);
}

// كل الأرقام العشرية بصيغة "1,234.56" أو "12.50" ضمن سطر واحد
function extractLineAmounts(line) {
  var m = line.match(/-?[\d,]+\.\d{2}/g);
  return m ? m.map(function(s) { return parseFloat(s.replace(/,/g, '')); }) : [];
}

function findLineIndex(lines, re, fromIdx) {
  for (var i = fromIdx || 0; i < lines.length; i++) if (re.test(lines[i])) return i;
  return -1;
}

function findLastLineIndex(lines, re, fromIdx) {
  for (var i = lines.length - 1; i > (fromIdx || 0); i--) if (re.test(lines[i])) return i;
  return -1;
}

// دفعة سداد بطاقة مستلمة ("Payment received"/"SABNet") = نفس معنى رسالة "تم سداد
// بطاقتك" المُحلَّلة من SMS (parseCardPayment بـjs/parsers.js): إضافة ترفع الرصيد
// المتاح، غير محسوبة كصرف. نطبّق نفس الاسم/التصنيف الثابتين حتى تُعامَل وتُعرض
// بنفس الطريقة بغض النظر عن مصدرها (SMS أو كشف حساب).
function normalizeCardPaymentRow(merchant, isCredit) {
  if (isCredit && /payment\s*received|sabnet/i.test(merchant || '')) {
    return { merchant: 'سداد بطاقة ائتمانية', type: 'سداد بطاقة' };
  }
  return null;
}

// كشف حساب بطاقة الأول (SAB) الائتمانية: صف لكل عملية بالشكل
// "DD/MM/YYYY  الوصف  [مبلغ_دولي  عملة  سعر_صرف]  رسوم_أخرى  ضريبة  Amount(SAR) [CR]"
// آخر رقم بالسطر = "Amount (Saudi Riyals)" وهو المبلغ الصحيح بعد الرسوم/الضريبة —
// وليس أول رقم (غالباً 0.00 لعملية محلية، أو المبلغ الأجنبي الخام لعملية دولية).
// لاحقة "CR" = عملية إضافة (دفعة سداد مستلمة)، غيابها = خصم.
// نقيّد التحليل بين رأس جدول العمليات وجدول الملخّص أسفله فقط، حتى لا يُلتقط صف
// "رقم الحساب/تاريخ الكشف" أعلى الصفحة كعملية وهمية (فيه تاريخ ورقم 0.00 أيضاً).
// كشوف متعددة الصفحات تكرّر جدول الملخّص (Previous Balance/Minimum Payment Due)
// مرتين: مرة أولى بمنتصف الكشف (بعد أول صفحة عمليات فقط) ومرة ثانية بالنهاية
// الفعلية (بعد آخر صفحة عمليات، قبل جدول أقساط SAB AQSAT إن وجد). لازم نأخذ آخر
// ظهور له لا أول ظهور، وإلا تُقطَع عمليات الصفحات الوسطى بالكامل (لوحظ فعلياً:
// كشف بأكثر من ١٠٠ عملية عبر ٤ صفحات كان يُستخرَج منه ١٦ عملية فقط — عمليات
// الصفحة الأولى حصراً — بسبب هذا القطع المبكر).
//
// كشف قد يغطي أكثر من بطاقة على نفس الحساب (بطاقة أساسية + بطاقة إضافية باسم آخر،
// مثال فعلي: "1321" لحامل الحساب و"1740" باسم "IBAA TOLIB") — كل قسم يبدأ بسطر
// مقنَّع "XXXXXXXXXX<رقم>" (آخر ٤ أرقامه هي رقم البطاقة الظاهر بالتطبيق) يليه اسم
// حامل تلك البطاقة، قبل أول عملية بذاك القسم. نتتبّعه ونعلّم كل عملية ببطاقتها
// الفعلية بدل تطبيق حقل "الحساب/البطاقة" الموحّد على كل الصفوف بلا تمييز.
var SAB_CARD_HEADER_RE = /^X{4,}(\d{4,})$/i;

function parseSABStatement(lines) {
  var startIdx = findLineIndex(lines, /trans\W{0,3}date|activity\s*\/?\s*transaction|amount\s*\(saudi riyals\)/i);
  if (startIdx === -1) return [];
  var endIdx = findLastLineIndex(lines, /previous balance|total amount due|minimum payment due/i, startIdx);
  var body = lines.slice(startIdx + 1, endIdx === -1 ? lines.length : endIdx);
  var rows = [];
  var lastMatchedIdx = -1;
  var currentCard = '';
  for (var i = 0; i < body.length; i++) {
    var line = body[i];
    var cardHeader = line.match(SAB_CARD_HEADER_RE);
    if (cardHeader) { currentCard = cardHeader[1].slice(-4); continue; }
    var m = line.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.*)$/);
    if (m) {
      var rest = m[2];
      var isCredit = /\bCR\b\s*$/i.test(rest);
      var restNoCr = rest.replace(/\bCR\b\s*$/i, '').trim();
      var amounts = extractLineAmounts(restNoCr);
      if (!amounts.length) continue;
      var amount = Math.abs(amounts[amounts.length - 1]);   // آخر رقم = Amount (Saudi Riyals)
      var firstAmountIdx = restNoCr.search(/-?[\d,]+\.\d{2}/);
      var merchant = (firstAmountIdx === -1 ? restNoCr : restNoCr.slice(0, firstAmountIdx)).trim() || 'غير محدد';
      var payment = normalizeCardPaymentRow(merchant, isCredit);
      var type = payment ? payment.type : classifyMerchant(merchant, '');
      if (payment) merchant = payment.merchant;
      rows.push({
        date: extractDate(m[1]), merchant: merchant, amount: amount,
        direction: isCredit ? 'credit' : 'debit',
        type: type, behalf: '', note: '', include: true, card: currentCard
      });
      lastMatchedIdx = i;
    } else if (rows.length && lastMatchedIdx === i - 1 && !/\d/.test(line) && line.length < 40
               && rows[rows.length - 1].type !== 'سداد بطاقة') {
      // سطر بدون تاريخ/رقم مباشرة بعد عملية مطابَقة — على الأغلب تكملة وصف التفّ
      // لسطر ثانٍ بخلية الجدول (مثل "...SAN" ثم "FRANCISCO" بسطر مستقل). نتجاهل
      // صفوف سداد البطاقة المطبَّعة حتى لا يُفسَد اسمها الثابت
      rows[rows.length - 1].merchant = (rows[rows.length - 1].merchant + ' ' + line).trim();
      rows[rows.length - 1].type = classifyMerchant(rows[rows.length - 1].merchant, '');
      lastMatchedIdx = i;
    }
  }
  return rows;
}

// تحليل أولي عام (احتياطي لأي كشف حساب غير SAB): بدون علم بمواقع الأعمدة، فقط
// أفضل تخمين — يأخذ أول رقم عشري بالسطر كمبلغ. أقل دقة من parseSABStatement عمداً؛
// راجع كل صف قبل الحفظ (الصفوف المشبوهة بمبلغ 0 تُعلَّم تلقائياً بالواجهة).
function parseGenericStatement(lines) {
  var rows = [];
  lines.forEach(function(line) {
    var hasDate = /\d{4}-\d{2}-\d{2}/.test(line) || /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line);
    if (!hasDate) return;   // على الأغلب رأس/تذييل/سطر رصيد بدون تاريخ عملية
    var amounts = extractLineAmounts(line);
    if (!amounts.length) return;
    var date = extractDate(line);
    var amount = Math.abs(amounts[0]);
    var direction = detectDirection(line);
    var merchant = line
      .replace(/\d{4}-\d{2}-\d{2}/, '')
      .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/, '')
      .replace(/-?[\d,]+\.\d{2}/g, '')
      .replace(/\s+/g, ' ')
      .trim() || 'غير محدد';
    var payment = normalizeCardPaymentRow(merchant, direction === 'credit');
    var type = payment ? payment.type : classifyMerchant(merchant, '');
    if (payment) merchant = payment.merchant;
    rows.push({
      date: date,
      merchant: merchant,
      amount: amount,
      direction: direction,
      type: type,
      behalf: '',
      note: '',
      include: true
    });
  });
  return rows;
}

function pad2(n) { n = String(n); return n.length < 2 ? '0' + n : n; }

// كشف حساب جاري الراجحي (وليس بطاقة ائتمانية): جدول RTL، كل صف عملية فعلياً
// يمتد على عدة أسطر مستخرَجة بهذا الترتيب (مؤكَّد من نص PDF.js خام فعلي):
//   1. سطر "نوع العملية" وحده (مثل "عملية تحويل داخلية"/"خصم أقساط متاجرة وتمويل")
//   2. سطر "٣ مبالغ" متتالية بريال — الرصيد، دائن، مدين بهذا الترتيب — وغالباً
//      ملتصق فيه أيضاً التاريخ (YYYY/MM/DD) و/أو بداية نص الملاحظة بنفس السطر
//   3. سطر/أسطر "ملاحظة" خام (مرجع/وقت/اسم أحياناً) حتى سطر نوع العملية التالي
// المرجع الخام يُحفظ بحقل "ملاحظة" بدل ما يُقحَم بالتاجر ويصعّب قراءته.
// عمليات هذا النوع من الحساب أغلبها تحويلات (راتب، تحويل بين حسابات العميل،
// حوالات لأشخاص) وليست شراء مباشر — التصنيف الافتراضي غالباً "غير محدد" وهذا
// متوقّع ومقصود؛ المستخدم يراجع/يستبعد/يحدّد "نيابة عن" يدوياً حسب الحاجة.
function parseRajhiStatement(lines) {
  var dateRe = /(\d{4})\/(\d{1,2})\/(\d{1,2})/;
  function isAmountsLine(l) { return (l.match(/[\d,]+\.\d{2}\s*SAR/g) || []).length >= 3; }

  var headerIdx = findLineIndex(lines, /دائن/);   // رأس عمود "دائن" — بداية جدول العمليات
  var sectionEnd = findLineIndex(lines, /^Notes\b|هذه الوثيقة سرية|confidential/i, headerIdx + 1);
  if (sectionEnd === -1) sectionEnd = lines.length;

  var starts = [];
  for (var i = headerIdx + 1; i < sectionEnd; i++) if (isAmountsLine(lines[i])) starts.push(i);
  if (!starts.length) return [];

  var rows = [];
  for (var s = 0; s < starts.length; s++) {
    var idx = starts[s];
    var nums = lines[idx].match(/[\d,]+\.\d{2}(?=\s*SAR)/g) || [];
    if (nums.length < 3) continue;
    var credit = parseFloat(nums[1].replace(/,/g, ''));
    var debit = parseFloat(nums[2].replace(/,/g, ''));
    var isCredit = credit > 0;
    var amount = Math.abs(isCredit ? credit : debit);
    if (!amount) continue;

    // نوع العملية = السطر مباشرة قبل سطر المبالغ
    var typeIdx = idx - 1;
    var typeLine = (typeIdx > headerIdx && starts.indexOf(typeIdx) === -1) ? lines[typeIdx].trim() : '';

    // باقي سطر المبالغ (بعد حذف الـ٣ مبالغ) + أسطر الملاحظة حتى سطر نوع العملية التالي
    var leftover = lines[idx].replace(/[\d,]+\.\d{2}\s*SAR/g, '');
    var date = '';
    var dm = leftover.match(dateRe);
    if (dm) { date = dm[1] + '-' + pad2(dm[2]) + '-' + pad2(dm[3]); leftover = leftover.replace(dateRe, ''); }
    leftover = leftover.replace(/\s+/g, ' ').trim();

    var blockEnd = (s + 1 < starts.length) ? starts[s + 1] - 2 : sectionEnd - 1;
    var noteParts = leftover ? [leftover] : [];
    for (var j = idx + 1; j <= blockEnd; j++) {
      var line = lines[j];
      if (!date) {
        var dm2 = line.match(dateRe);
        if (dm2) { date = dm2[1] + '-' + pad2(dm2[2]) + '-' + pad2(dm2[3]); line = line.replace(dateRe, '').trim(); }
      }
      if (line) noteParts.push(line);
    }
    // نص المرجع الخام (وقت/رقم حساب/اسم أحياناً) لا يُعرض بحقل الملاحظة — مبعثَر
    // وغير مفيد للمستخدم؛ يُستخدم فقط كاحتياط لاسم التاجر لو سطر النوع فاضي
    var noteBlob = noteParts.join(' ').replace(/\s+/g, ' ').trim();
    var merchant = typeLine || noteBlob || 'غير محدد';
    var payment = normalizeCardPaymentRow(merchant, isCredit);
    var type = payment ? payment.type : (isCredit ? classifyCreditType(merchant) : classifyMerchant(merchant, ''));
    rows.push({
      date: date || today(),
      merchant: payment ? payment.merchant : merchant,
      amount: amount,
      // الاتجاه من عمودي دائن/مدين بالكشف مباشرة (مو تخمين من النص) — دائن>0 يعني
      // تحويل داخل للحساب (credit)، مدين>0 يعني تحويل صادر منه (debit)
      direction: isCredit ? 'credit' : 'debit',
      type: type,
      behalf: '',
      note: '',
      include: true
    });
  }
  return rows;
}

function parseStatementLines(lines) {
  if (findLineIndex(lines, /trans\W{0,3}date|SAB Credit Card Statement|كشف حساب بطاقة الأول/i) !== -1) {
    var sab = parseSABStatement(lines);
    if (sab.length) return sab;
  }
  if (findLineIndex(lines, /مصرف الراجحي|alrajhi bank|كشف حساب جاري/i) !== -1) {
    var rajhi = parseRajhiStatement(lines);
    if (rajhi.length) return rajhi;
  }
  return parseGenericStatement(lines);
}

async function handleStatementFile(input) {
  var f = input.files && input.files[0];
  if (!f) return;
  var area = document.getElementById('bulkimport-area');
  function setArea(h) { if (area) area.innerHTML = h; }
  setArea('<div class="alert alert-blue">⏳ جاري تحميل مكتبة قراءة PDF...</div>');
  try {
    var pdfjsLib = await loadPdfJs();
    setArea('<div class="alert alert-blue">⏳ جاري استخراج النص من الملف...</div>');
    var buf = await f.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    var lines = [];
    for (var i = 1; i <= pdf.numPages; i++) {
      var page = await pdf.getPage(i);
      var content = await page.getTextContent();
      lines = lines.concat(pageTextToLines(content));
    }
    input.value = '';
    _bulkRawLines = lines;
    var rows = parseStatementLines(lines);
    if (!rows.length) {
      setArea('<div class="alert alert-yellow">⚠️ ما قدرنا نطلع عمليات من الملف. جرّب ملف آخر أو راجع صيغته.</div>' + rawLinesDebugHtml());
      return;
    }
    _bulkRows = rows;
    renderImportPreview();
  } catch (e) {
    setArea('<div class="alert alert-red">⚠️ خطأ: ' + e.message + '</div>');
  }
}

// لوحة تشخيص: الأسطر الخام كما استخرجها PDF.js قبل أي تحليل — تظهر مطوية،
// تفيد لمعايرة parseStatementLines على شكل كشف حساب فعلي (نفس فكرة "رسائل لم
// تُحلَّل" بـjs/save.js: بدل ما نخمّن، نعرض الخام وينسخه المستخدم لمراجعته).
function rawLinesDebugHtml() {
  if (!_bulkRawLines.length) return '';
  var blob = _bulkRawLines.map(function(l, i) { return (i + 1) + '. ' + l; }).join('\n');
  return '<details style="margin-top:12px">'
    + '<summary style="cursor:pointer;font-size:12px;color:var(--muted)">🔍 عرض النص الخام المستخرج من الملف (' + _bulkRawLines.length + ' سطر)</summary>'
    + '<textarea readonly onclick="this.select()" style="width:100%;min-height:160px;font-size:11.5px;direction:ltr;text-align:left;margin-top:8px">' + htmlEsc(blob) + '</textarea>'
    + '<div class="btn-row" style="margin-top:8px"><button class="btn btn-outline btn-sm" onclick="copyBulkRawLines()">📋 نسخ</button></div>'
    + '<div id="bulkimport-debug-status"></div>'
    + '</details>';
}

function copyBulkRawLines() {
  var blob = _bulkRawLines.map(function(l, i) { return (i + 1) + '. ' + l; }).join('\n');
  var s = document.getElementById('bulkimport-debug-status');
  function done() { if (s) s.innerHTML = '<div class="alert alert-green">✅ نُسخ النص الخام</div>'; }
  function fail() { if (s) s.innerHTML = '<div class="alert alert-yellow">⚠️ انسخه يدوياً من المربّع أعلاه</div>'; }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(blob).then(done, fail);
  else done();
}

// كل عملية تُعرض كبطاقة <details> مفتوحة افتراضياً (كل الحقول ظاهرة دفعة وحدة —
// أسهل لمراجعة التصنيف/التاجر/الاتجاه لعدد كبير من العمليات بدون فتح كل واحدة)،
// وتقدر تطويها بالنقر على شريط العنوان إذا خلصت مراجعتها وتبي تختصر الصفحة.
function renderImportPreview() {
  var area = document.getElementById('bulkimport-area');
  if (!area) return;
  var included = _bulkRows.filter(function(r) { return r.include; }).length;
  var html = '<div style="font-size:12.5px;color:var(--muted);margin:8px 0">راجع كل عملية قبل الحفظ — عدّل الحقول أو ألغِ تحديد أي صف تبي تستبعده (مثل سطر رصيد افتتاحي/إجمالي انقرأ غلط كعملية). اطوِ أي بطاقة بالنقر على شريط عنوانها بعد ما تراجعها. الصفوف بمبلغ 0 مُعلَّمة بالأحمر — راجعها قبل الحفظ.</div>';
  html += '<div class="field"><label>الحساب/البطاقة لهذا الكشف (اختياري)</label><input type="text" list="accounts-list" placeholder="مثال: 1321 أو اسم البنك — يُطبَّق على كل العمليات المحفوظة" oninput="_bulkAccount=this.value"></div>';
  _bulkRows.forEach(function(r, i) {
    var suspect = !r.amount;
    html += '<div class="card" style="margin-bottom:8px' + (suspect ? ';border-color:var(--red-border)' : '') + '">';
    html += '<details open>';
    html += '<summary style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px;cursor:pointer">';
    html += '<span style="display:flex;align-items:center;gap:8px;overflow:hidden;flex:1">';
    html += '<input type="checkbox" onclick="event.stopPropagation()" ' + (r.include ? 'checked' : '') + ' onchange="_bulkRows[' + i + '].include=this.checked;updateBulkImportCount()">';
    html += '<span style="direction:ltr;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px">' + htmlEsc(r.merchant || '') + '</span>';
    html += '</span>';
    html += '<span style="font-size:11.5px;color:var(--muted);white-space:nowrap">' + (suspect ? '⚠️ ' : '') + fmt(r.amount) + ' · ' + (r.date || '') + (r.card ? ' · ' + htmlEsc(r.card) : '') + '</span>';
    html += '</summary>';
    html += '<div style="padding:0 12px 12px">';
    html += '<div class="field"><label>الوصف</label><input type="text" value="' + htmlEsc(r.merchant || '') + '" style="direction:ltr;text-align:left" onchange="_bulkRows[' + i + '].merchant=this.value"></div>';
    html += '<div class="field-row">';
    html += '<div class="field"><label>التاريخ</label><input type="date" value="' + (r.date || '') + '" onchange="_bulkRows[' + i + '].date=this.value"></div>';
    html += '<div class="field"><label>المبلغ (ر.س)</label><input type="number" step="0.01" value="' + r.amount + '" onchange="_bulkRows[' + i + '].amount=parseFloat(this.value)||0"></div>';
    html += '</div>';
    html += '<div class="field-row">';
    html += '<div class="field"><label>الاتجاه</label><select onchange="_bulkRows[' + i + '].direction=this.value">'
      + '<option value="debit"' + (r.direction === 'debit' ? ' selected' : '') + '>خصم</option>'
      + '<option value="credit"' + (r.direction === 'credit' ? ' selected' : '') + '>إضافة</option></select></div>';
    html += '<div class="field"><label>التصنيف</label><select onchange="_bulkRows[' + i + '].type=this.value">'
      + [['أساسيات', 'أساسيات'], ['كماليات', 'كماليات'], ['سداد التمويل', 'سداد التمويل'], ['غير محدد', 'غير محدد'],
         ['إضافة', 'إضافة (وارد)'], ['استرداد', 'استرداد'], ['حوالة واردة', 'حوالة واردة'], ['راتب', 'راتب'], ['سداد بطاقة', 'سداد بطاقة']]
        .map(function(t) {
          return '<option value="' + t[0] + '"' + (r.type === t[0] ? ' selected' : '') + '>' + t[1] + '</option>';
        }).join('')
      + '</select></div>';
    html += '</div>';
    html += '<div class="field"><label>البطاقة' + (r.card ? ' (مُكتشَفة تلقائياً من الكشف)' : '') + '</label><input type="text" placeholder="مثال: 1321" value="' + htmlEsc(r.card || '') + '" style="direction:ltr;text-align:left" onchange="_bulkRows[' + i + '].card=this.value"></div>';
    html += '<div class="field"><label>👥 نيابة عن (اختياري)</label><input type="text" list="people-list" placeholder="اسم الشخص — يُخصم من المتبقي عليه" value="' + htmlEsc(r.behalf || '') + '" onchange="_bulkRows[' + i + '].behalf=this.value"></div>';
    html += '<div class="field"><label>ملاحظة (اختياري)</label><input type="text" value="' + htmlEsc(r.note || '') + '" onchange="_bulkRows[' + i + '].note=this.value"></div>';
    html += '</div>';
    html += '</details>';
    html += '</div>';
  });
  html += '<div class="btn-row" style="margin-top:10px">';
  html += '<button class="btn btn-green btn-sm" onclick="confirmBulkImport()">💾 حفظ العمليات المحدَّدة (<span id="bulkimport-count">' + included + '</span>)</button>';
  html += '<button class="btn btn-outline btn-sm" onclick="_bulkRows=[];_bulkAccount=\'\';renderSettings()">إلغاء</button>';
  html += '</div>';
  // بجانب زر الحفظ مباشرة — لا فوق قائمة البطاقات (قد تكون مئات) حتى تظهر حالة "جاري
  // الحفظ: X من Y" بدون تمرير للأعلى أثناء الحفظ. id مختلف عن s-bulkimport-status (رسالة
  // النتيجة النهائية بأعلى البطاقة) لأن هذا العنصر يختفي بعد اكتمال الحفظ (تُفرَّغ _bulkRows)
  html += '<div id="s-bulkimport-progress"></div>';
  html += rawLinesDebugHtml();
  area.innerHTML = html;
}

function updateBulkImportCount() {
  var el = document.getElementById('bulkimport-count');
  if (el) el.textContent = _bulkRows.filter(function(r) { return r.include; }).length;
}

// يبني كائن العملية محلياً من صف المعاينة (بدون لمس الشبكة) — مستخرج من bulkSaveEntry
// القديمة لفصل الحفظ المحلي (سريع) عن الرفع لـSheets (بالدفعات، انظر confirmBulkImport).
function buildBulkEntry(p, idOffset) {
  var entry = {
    id: Date.now() + idOffset,   // Date.now() وحده يتصادم بين عمليات تُبنى بنفس المللي ثانية
    date: p.date || today(),
    time: '',
    merchant: p.merchant || '',
    amount: p.amount,
    type: p.type || 'غير محدد',
    method: 'بطاقة',
    balance: '',
    card: p.card || '',   // مُكتشَف تلقائياً من قسم البطاقة بالكشف (parseSABStatement) — يبقى فارغاً لو الكشف بلا أقسام متعددة
    bank: 'كشف حساب (استيراد)',
    txType: 'استيراد من كشف حساب',
    intl: '',
    note: (p.note || '').trim(),
    origAmount: p.amount,
    direction: p.direction || 'debit',
    behalf: (p.behalf || '').trim()
  };
  if (_bulkAccount && typeof applyAccount === 'function') applyAccount(entry, _bulkAccount);
  return entry;
}

// عدد العمليات بكل طلب رفع جماعي — يوازن بين تقليل عدد الطلبات (كل طلب GET سابقاً كان
// يفتح تنفيذ Apps Script مستقل بمصادقة كاملة، وهذا كان سبب بطء الرفع الفعلي: دقائق لـ١٥٠
// عملية) وبين البقاء ضمن حد وقت تنفيذ Apps Script (٦ دقائق) وإظهار تقدّم تدريجي بدل انتظار
// طويل صامت لدفعة وحدة ضخمة.
var BULK_UPLOAD_CHUNK = 40;

async function confirmBulkImport() {
  var toSave = _bulkRows.filter(function(r) { return r.include; });
  function setProgress(h) { var el = document.getElementById('s-bulkimport-progress'); if (el) el.innerHTML = h; }
  function setFinal(h) { var el = document.getElementById('s-bulkimport-status'); if (el) el.innerHTML = h; }
  var ok = 0, dup = 0, err = 0;
  var toSync = [];
  // لقطة من مفاتيح التكرار الموجودة *قبل* بداية هذه الدفعة فقط — isDuplicate() العادية تفحص
  // expenses الحي المتنامي أثناء الحلقة، فيتصادم صف مع صف آخر أُضيف للتو بنفس الدفعة إذا
  // تطابقا بالتاريخ/المبلغ/التاجر/الاتجاه (مثال حقيقي: عدة تذاكر JETT AMMAN بنفس المبلغ
  // بنفس اليوم — عمليات حقيقية متكررة شرعاً، مو تكراراً بالخطأ) فتُتجاهل الثانية والثالثة
  // خطأً. الفحص هنا يقتصر على ما كان موجوداً فعلاً قبل الاستيراد — يمنع إعادة استيراد نفس
  // الكشف مرتين، بدون التضحية بعمليات متعددة متطابقة القيم ضمن نفس الدفعة.
  var preExistingKeys = {};
  expenses.forEach(function(e) { preExistingKeys[dupKey(e)] = true; });
  try {
    // المرحلة ١: بناء كل العمليات وحفظها محلياً فوراً (بدون شبكة، سريع) — التكرار يُتجاوَز صامتاً
    setProgress('<div class="alert alert-blue">⏳ جاري الحفظ محلياً...</div>');
    for (var i = 0; i < toSave.length; i++) {
      var entry = buildBulkEntry(toSave[i], i);
      if (preExistingKeys[dupKey(entry)]) { dup++; continue; }
      expenses.unshift(entry);
      if (entry.behalf && typeof registerPerson === 'function') registerPerson(entry.behalf);
      if (typeof learnMerchant === 'function') learnMerchant(entry.merchant, entry.type, entry.direction);
      if (settings.webapp) toSync.push(entry);
      else { entry.synced = false; ok++; }
    }
    localStorage.setItem('expenses_v2', JSON.stringify(expenses));

    // المرحلة ٢: رفع العمليات لـSheets بدفعات — طلب POST واحد لكل ٤٠ عملية بدل طلب GET
    // منفصل لكل عملية (الفرق الجوهري بالسرعة: من مئات الطلبات المتتالية لعدد محدود من الدفعات)
    for (var c = 0; c < toSync.length; c += BULK_UPLOAD_CHUNK) {
      var chunk = toSync.slice(c, c + BULK_UPLOAD_CHUNK);
      setProgress('<div class="alert alert-blue">⏳ جاري الرفع لـSheets: ' + Math.min(c + BULK_UPLOAD_CHUNK, toSync.length) + ' من ' + toSync.length + '</div>');
      try {
        var results = await bulkAppendEntries(chunk);
        var byId = {};
        results.forEach(function(r) { byId[String(r.id)] = r; });
        chunk.forEach(function(en) {
          var r = byId[String(en.id)];
          en.synced = !!(r && r.status === 'ok');
          if (en.synced) ok++; else err++;
        });
      } catch (e) {
        chunk.forEach(function(en) { en.synced = false; err++; });
      }
      localStorage.setItem('expenses_v2', JSON.stringify(expenses));
    }
  } finally {
    if (toSync.length && typeof sortSheetsInBackground === 'function') sortSheetsInBackground();   // مرة وحدة لكل الدفعة كلها
    _bulkRows = [];
    if (typeof renderDashboard === 'function') renderDashboard();
    if (typeof refreshPeopleList === 'function') refreshPeopleList();
    if (typeof refreshAccountsList === 'function') refreshAccountsList();
    renderSettings();
    var msg = '✅ اكتمل الاستيراد — حُفظت ' + ok + ' عملية';
    if (dup) msg += '، تجوهلت ' + dup + ' مكررة';
    if (err) msg += '، وفشل رفع ' + err + ' للشيت (بقيت محلياً — أعد المزامنة من تبويب الإعدادات لاحقاً)';
    setFinal('<div class="alert alert-green">' + msg + '</div>');
  }
}
