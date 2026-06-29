// ============================================================
// SMS PARSERS  (الراجحي / الأهلي / SAB)
// ============================================================
function today() {
  return new Date().toISOString().split('T')[0];
}

// توحيد الأرقام العربية/الفارسية إلى لاتينية + فواصل عربية — سبب شائع لفشل
// التحليل: رسالة فيها ٠١٢٣ لا تطابق أنماط [\d] فتفشل تماماً.
function normalizeDigits(s) {
  if (s == null) return s;
  return String(s)
    .replace(/[٠-٩]/g, function(d) { return String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48); }) // ٠-٩
    .replace(/[۰-۹]/g, function(d) { return String.fromCharCode(d.charCodeAt(0) - 0x06F0 + 48); }) // ۰-۹ (فارسية)
    .replace(/٫/g, '.')   // الفاصلة العشرية العربية ٫
    .replace(/٬/g, ',')   // فاصلة الآلاف العربية ٬
    .replace(/‏|‎|‪|‫|‬/g, ''); // محارف الاتجاه (RTL/LTR) المخفية
}

// نمط موحّد لرموز عملة الريال: SAR / SR / ريال / ر.س / ﷼
var SAR_TOKEN = '(?:SAR|SR|ريال(?:\\s*سعودي)?|ر\\.?\\s?س|﷼)';

function extractAmount(txt) {
  var m = txt.match(new RegExp(SAR_TOKEN + '\\s*([\\d,]+\\.?\\d*)', 'i'));
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  m = txt.match(new RegExp('([\\d,]+\\.?\\d*)\\s*' + SAR_TOKEN, 'i'));
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  m = txt.match(/ب?مبلغ\s*:?\s*([\d,]+\.?\d*)/i);
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  return null;
}

function extractDate(txt) {
  var m = txt.match(/(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  m = txt.match(/(\d{1,4})\/(\d{1,2})\/(\d{1,4})/);
  if (m) {
    // السنة دائماً ٢٠٢٦+ (لا تُسجَّل عمليات قبل مايو ٢٠٢٦)، فجزء السنة قيمته ≥ 26.
    // إن كان الأخير سنة صالحة → DD/MM/YY (الشائع)؛ وإلا إن كان الأول سنة → YY/MM/DD.
    var p1 = parseInt(m[1], 10), p2 = parseInt(m[2], 10), p3 = parseInt(m[3], 10);
    var y, mo, d;
    if (m[1].length === 4) { y = p1; mo = p2; d = p3; }            // YYYY/MM/DD
    else if (m[3].length === 4) { d = p1; mo = p2; y = p3; }       // DD/MM/YYYY
    else if (p1 >= 26 && p3 < 26) { y = 2000 + p1; mo = p2; d = p3; } // YY/MM/DD (السنة أولاً)
    else { d = p1; mo = p2; y = 2000 + p3; }                       // DD/MM/YY (السنة أخيراً)
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return y + '-' + pad(mo) + '-' + pad(d);
  }
  return today();
}

function extractTime(txt) {
  var m = txt.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return '';
  return m[1].padStart(2,'0') + ':' + m[2] + ':' + (m[3] || '00');
}

function extractBalance(txt) {
  var m = txt.match(/(?:الرصيد|رصيدك)[:\s]*(?:SAR|SR)?\s*([\d,]+\.?\d*)/i);
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  return null;
}

function extractCard(txt) {
  var m = txt.match(/\((?:\*+\s*)?(\d{4})\)/) || txt.match(/\*+\s*(\d{4})/)
    || txt.match(/عبر:\s*(\d{3,4})/) || txt.match(/بطاقة:\s*(\d{3,4})/);
  return m ? m[1] : '';
}

function extractMethod(txt) {
  var t = txt.toLowerCase();
  if (t.includes('apple pay') || t.includes('applepay')) return 'Apple Pay';
  if (t.includes('مدى') || t.includes('mada')) return 'مدى';
  if (t.includes('visa')) return 'Visa';
  if (t.includes('mastercard')) return 'Mastercard';
  if (t.includes('stc pay') || t.includes('stcpay')) return 'STC Pay';
  return '';
}

// رسالة سداد بطاقة ائتمانية = حركة إضافة (تجدّد الرصيد)، مو خصم
function parseCardPayment(txt) {
  var amount = null, m;
  m = txt.match(/بمبلغ\s*(?:SAR|SR)?\s*([\d,]+\.?\d*)/i);
  if (m) amount = parseFloat(m[1].replace(/,/g, ''));
  if (!amount) amount = extractAmount(txt);
  m = txt.match(/\*+\s*(\d{4})/);
  var card = m ? m[1] : extractCard(txt);
  var bank = /alfursan|الفرسان|الأول|sab/i.test(txt) ? 'الأول (SAB)' : '';
  return {
    amount: amount,
    merchant: 'سداد بطاقة ائتمانية',
    bank: bank,
    date: extractDate(txt),
    time: extractTime(txt),
    balance: extractBalance(txt),
    card: card,
    method: extractMethod(txt),
    txType: 'سداد بطاقة',
    type: 'سداد بطاقة',
    direction: 'credit'
  };
}

function parseRAJHI(txt) {
  var isIncoming = /حوالة واردة|إيداع|واردة/.test(txt);
  var amount = null, m;
  m = txt.match(/ب?\s*(?:SR|SAR)\s*([\d,]+\.?\d*)/i) || txt.match(/(?:SR|SAR)\s*([\d,]+\.?\d*)/i);
  if (m) amount = parseFloat(m[1].replace(/,/g, ''));
  if (!amount) amount = extractAmount(txt);
  if (!amount) return null;

  var merchant = 'غير محدد';
  if (isIncoming) {
    m = txt.match(/من\s*:\s*([^\n\r]+)/i) || txt.match(/من\s+([A-Za-z\u0600-\u06FF][^\n\r،,]{2,40})/);
    if (m) merchant = m[1].trim();
  } else {
    // التاجر بعد "لـ" (لام + تطويل) — "عبر:" قناة الدفع مو التاجر فلا نستخدمها
    m = txt.match(/لـ\s*([^\n\r،,؛;]{2,40})/)
      || txt.match(/لدى\s*:?\s*([^\n\r،,*#]{3,50})/i)
      || txt.match(/من\s+([^\n\r،,]{3,40})/i);
    if (m) merchant = m[1].split(/\s{2,}|تاريخ|الرصيد|عبر/)[0].trim();
  }

  return {
    amount: amount, merchant: merchant, bank: 'الراجحي',
    date: extractDate(txt), balance: extractBalance(txt),
    card: extractCard(txt), method: extractMethod(txt),
    txType: txt.trim().split('\n')[0]
  };
}

function parseAHLI(txt) {
  var amount = null, m;
  m = txt.match(/ب([\d,]+\.?\d*)\s*(?:SAR|SR)?/i) || txt.match(/بمبلغ\s*([\d,]+\.?\d*)/i);
  if (m) amount = parseFloat(m[1].replace(/,/g, ''));
  if (!amount) amount = extractAmount(txt);
  if (!amount) return null;

  var merchant = 'غير محدد';
  m = txt.match(/لدى\s+([^\n\r،,*#]{3,50})/i) || txt.match(/من\s*:\s*([^\n\r،,]{3,40})/i);
  if (m) merchant = m[1].split(/\s{2,}|في\s*\d/)[0].trim();

  return {
    amount: amount, merchant: merchant, bank: 'الأهلي',
    date: extractDate(txt), balance: extractBalance(txt),
    card: extractCard(txt), method: extractMethod(txt),
    txType: txt.trim().split('\n')[0]
  };
}

function parseSAB(txt) {
  var isIncoming = /إيداع حوالة|حوالة واردة|واردة/.test(txt);
  // استرداد/مرتجع: «تم استرداد مبلغ ... من <التاجر> إلى بطاقة ...»
  var isRefund = /استرداد|استرجاع|مرتجع|refund|reversal/i.test(txt);
  // معاملة دولية: تُكتشف عبر "نقاط البيع الدولي" أو "سعر الصرف" أو وجود عملة أجنبية
  var fxCur = null, fxAmount = null, fxRate = null;
  var curMatch = txt.match(/بمبلغ\s+([A-Z]{3})\s*([\d,]+\.?\d*)/);   // بمبلغ USD 10.50
  if (curMatch && curMatch[1] !== 'SAR' && curMatch[1] !== 'SR') {
    fxCur = curMatch[1];
    fxAmount = parseFloat(curMatch[2].replace(/,/g, ''));
  } else {
    curMatch = txt.match(/بمبلغ\s+([\d,]+\.?\d*)\s*([A-Z]{3})/);     // بمبلغ 10.50 USD
    if (curMatch && curMatch[2] !== 'SAR' && curMatch[2] !== 'SR') {
      fxCur = curMatch[2];
      fxAmount = parseFloat(curMatch[1].replace(/,/g, ''));
    }
  }
  var rateMatch = txt.match(/سعر الصرف[:\s]*([\d.]+)/);
  if (rateMatch) fxRate = parseFloat(rateMatch[1]);
  var isIntl = /نقاط البيع الدولي|سعر الصرف/.test(txt) || (fxCur !== null) || /USD|EUR|UNITED STATES/i.test(txt);

  var amount = null, m;

  if (isIntl) {
    // المبلغ النهائي بالريال = "المبلغ الإجمالي" (بعد الرسوم). احتياطياً "المبلغ بالريال" ثم "بالريال"
    m = txt.match(/المبلغ الإجمالي(?:\s*بالريال)?[:\s]*([\d,]+\.?\d*)/)
      || txt.match(/المبلغ بالريال[:\s]*([\d,]+\.?\d*)/)
      || txt.match(/بالريال[:\s]*([\d,]+\.?\d*)/);
    if (m) amount = parseFloat(m[1].replace(/,/g, ''));
    if (!amount && fxAmount) amount = fxAmount;   // لا يوجد مبلغ بالريال → استخدم المبلغ الأجنبي (وليس الرصيد)
  }
  if (!amount) {
    // استبعد سطر الرصيد حتى لا يُلتقط الرصيد كمبلغ العملية
    var noBal = txt.replace(/(?:الرصيد|رصيدك)[^\n\r]*/g, '');
    m = noBal.match(/بمبلغ\s*([\d,]+\.?\d*)\s*(?:SAR|SR)/i) || noBal.match(/بمبلغ\s*(?:SAR|SR)\s*([\d,]+\.?\d*)/i) || noBal.match(/(?:SAR|SR)\s*([\d,]+\.?\d*)/i) || noBal.match(/([\d,]+\.?\d*)\s*(?:SAR|SR)/i);
    if (m) amount = parseFloat(m[1].replace(/,/g, ''));
  }
  if (!amount) return null;

  var merchant = 'غير محدد';
  if (isRefund) {
    // التاجر بين "من" و "إلى/الى" (إلى البطاقة)؛ وإلا أول كلمة بعد "من"
    m = txt.match(/من\s+(.+?)\s+(?:إلى|الى)\s/) || txt.match(/من\s+([^\n\r،,]{2,40})/);
    if (m) merchant = m[1].trim();
  } else if (isIncoming) {
    m = txt.match(/من\s*:\s*([^\n\r،,]{3,40})/i);
    if (m) merchant = m[1].trim();
  } else {
    // التاجر بين "لدى" وأقرب فاصل: "من خلال" / "في" / "بمبلغ" / نهاية السطر
    m = txt.match(/لدى\s+(.+?)\s+(?:من خلال|بمبلغ|في\s+[A-Z\u0600-\u06FF])/i)
      || txt.match(/لدى\s+(.+?)(?:\s+تاريخ|\s*\n|\s*$)/im)
      || txt.match(/لدى\s+([^\n\r،,*#]{3,50})/i);
    if (m) merchant = m[1].trim();
  }

  var result = {
    amount: amount, merchant: merchant, bank: 'الأول (SAB)',
    date: extractDate(txt), balance: extractBalance(txt),
    card: extractCard(txt), method: extractMethod(txt),
    txType: txt.trim().split('\n')[0]
  };
  // أضف تفاصيل العملة الدولية إن وُجدت
  if (fxCur && fxAmount) {
    result.fxCurrency = fxCur;
    result.fxAmount = fxAmount;
    if (fxRate) result.fxRate = fxRate;
  }
  return result;
}

// ============================================================
// المحلّل العام الذكي (بدون اعتماد على صيغة بنك معيّن)
// يتعرّف على المبلغ + العملة + الاتجاه + التاجر بالأنماط، فلو تغيّرت
// صيغة أي بنك أو جاء بنك جديد يظل قادراً على القراءة.
// ============================================================
function extractAmountSmart(txt) {
  var fxCur = null, fxAmt = null, fxRate = null, sar = null, total = null, instal = null, m;
  // قسط تمويل: المبلغ = «القسط» وليس «المبلغ المتبقي» (يأخذ الأولوية)
  m = txt.match(new RegExp('(?:القسط|قسط)\\s*:?\\s*' + SAR_TOKEN + '?\\s*([\\d,]+\\.?\\d*)', 'i'));
  if (m) instal = parseFloat(m[1].replace(/,/g, ''));
  // عملات معروفة فقط (تفادي التقاط أسماء/أكواد عشوائية)
  m = txt.match(/\b(AED|USD|EUR|GBP|QAR|KWD|BHD|OMR|JOD|EGP|TRY|INR|PKR|CNY|JPY|CHF|CAD|AUD|MAD|TND|THB|MYR|IDR)\s*[: ]?\s*([\d,]+\.?\d*)/);
  if (m) { fxCur = m[1]; fxAmt = parseFloat(m[2].replace(/,/g, '')); }
  m = txt.match(new RegExp('ب?مبلغ\\s*:?\\s*' + SAR_TOKEN + '\\s*([\\d,]+\\.?\\d*)', 'i'))
    || txt.match(new RegExp(SAR_TOKEN + '\\s*([\\d,]+\\.?\\d*)', 'i'))
    || txt.match(new RegExp('([\\d,]+\\.?\\d*)\\s*' + SAR_TOKEN, 'i'))
    || txt.match(/ب?مبلغ\s*:?\s*([\d,]+\.?\d*)/i);
  if (m) sar = parseFloat(m[1].replace(/,/g, ''));
  m = txt.match(/(?:المبلغ الإجمالي|الإجمالي|إجمالي|total)\D*([\d,]+\.?\d*)/i);
  if (m) total = parseFloat(m[1].replace(/,/g, ''));
  m = txt.match(/سعر الصرف[:\s]*([\d.]+)/);
  if (m) fxRate = parseFloat(m[1]);
  return { amount: (instal || total || sar || fxAmt), fxCurrency: fxCur, fxAmount: fxAmt, fxRate: fxRate };
}

function extractMerchant(txt, direction) {
  var m, pats;
  function clean(s) { return s.split(/\s{2,}|في:|تاريخ|الرصيد|رقم|عبر|من خلال|إلى|الى/)[0].trim(); }
  if (direction === 'credit') {
    // وارد: المرسِل بعد "من / مرسل / المرسل / من حساب"
    pats = [/(?:من|مرسل|المرسل)\s*:?\s*([^\n\r،,]{3,40})/, /من\s+حساب\s*:?\s*([^\n\r،,]{3,40})/, /received from\s+([^\n\r،,]{3,40})/i];
    for (var j = 0; j < pats.length; j++) { m = txt.match(pats[j]); if (m) return clean(m[1]); }
    return 'غير محدد';
  }
  // صادر/شراء: المستفيد أو التاجر بعد "لـ / لدى / الى / إلى / المستفيد / لحساب / at"
  pats = [/لـ\s*([^\n\r،,؛;]{2,40})/, /لدى\s*:?\s*([^\n\r،,*#]{3,50})/i,
          /(?:إلى|الى|المستفيد|لحساب)\s*:?\s*([^\n\r،,]{3,40})/, /\bat\s+([^\n\r،,]{3,40})/i,
          /من\s+([^\n\r،,]{3,40})/];
  for (var i = 0; i < pats.length; i++) {
    m = txt.match(pats[i]);
    if (m) return clean(m[1]);
  }
  return 'غير محدد';
}

function detectBankLabel(txt) {
  var t = txt.toLowerCase();
  if (t.indexOf('الراجحي') !== -1 || t.indexOf('rajhi') !== -1 || /;\s*مدى/.test(txt) || /عبر:\s*\d/.test(txt)) return 'الراجحي';
  if (t.indexOf('الأول') !== -1 || t.indexOf('sab') !== -1 || t.indexOf('alfursan') !== -1 || t.indexOf('الفرسان') !== -1) return 'الأول (SAB)';
  if (t.indexOf('الأهلي') !== -1 || t.indexOf('ahli') !== -1 || t.indexOf('ncb') !== -1 || t.indexOf('snb') !== -1) return 'الأهلي';
  if (t.indexOf('الإنماء') !== -1 || t.indexOf('الانماء') !== -1 || t.indexOf('alinma') !== -1) return 'الإنماء';
  if (t.indexOf('الرياض') !== -1 || t.indexOf('riyad') !== -1) return 'الرياض';
  if (t.indexOf('الفرنسي') !== -1 || t.indexOf('bsf') !== -1 || t.indexOf('fransi') !== -1) return 'الفرنسي';
  if (t.indexOf('البلاد') !== -1 || t.indexOf('albilad') !== -1) return 'البلاد';
  if (t.indexOf('الجزيرة') !== -1 || t.indexOf('aljazira') !== -1 || t.indexOf('jazira') !== -1) return 'الجزيرة';
  if (t.indexOf('سامبا') !== -1 || t.indexOf('samba') !== -1) return 'سامبا';
  // ملاحظة: لا نعتمد على «ساب» المجرّدة لأنها تتصادم مع «حساب»
  // المحافظ الرقمية
  if (t.indexOf('stc pay') !== -1 || t.indexOf('stcpay') !== -1 || t.indexOf('اس تي سي') !== -1) return 'STC Pay';
  if (t.indexOf('urpay') !== -1 || t.indexOf('يور باي') !== -1) return 'urpay';
  if (t.indexOf('barq') !== -1 || t.indexOf('بارق') !== -1) return 'بارق';
  if (t.indexOf('d360') !== -1) return 'D360';
  if (t.indexOf('mobily pay') !== -1 || t.indexOf('موبايلي') !== -1) return 'Mobily Pay';
  if (t.indexOf('tweeq') !== -1 || t.indexOf('تويق') !== -1) return 'Tweeq';
  return '';
}

function parseGeneric(txt) {
  var amt = extractAmountSmart(txt);
  if (!amt.amount) return null;
  var dir = detectDirection(txt);
  var r = {
    amount: amt.amount,
    merchant: extractMerchant(txt, dir),
    bank: detectBankLabel(txt),
    date: extractDate(txt), time: extractTime(txt),
    balance: extractBalance(txt), card: extractCard(txt),
    method: extractMethod(txt),
    txType: (txt.trim().split('\n')[0] || '').slice(0, 40),
    direction: dir
  };
  if (amt.fxCurrency && amt.fxAmount) { r.fxCurrency = amt.fxCurrency; r.fxAmount = amt.fxAmount; if (amt.fxRate) r.fxRate = amt.fxRate; }
  return r;
}

function detectAndParse(txt) {
  txt = normalizeDigits(txt);   // وحّد الأرقام/الرموز أولاً حتى تطابق كل الأنماط
  var result = _detectBank(txt);
  if (result) {
    if (!result.direction) result.direction = detectDirection(txt);
    if (result.direction === 'credit' && (!result.type || result.type === 'غير محدد')) result.type = classifyCreditType(txt);
    if (!result.time) result.time = extractTime(txt);
  }
  return result;
}

function _detectBank(txt) {
  if (/سداد/.test(txt) && /بطاقت/.test(txt) && /ائتمان/.test(txt)) return parseCardPayment(txt);
  var t = txt.toLowerCase();

  // 1) الاسم الصريح للبنك/المحفظة يغلب أي إشارة لينة (يمنع توجيه بنك آخر للراجحي
  //    لمجرد ورود "رصيدك" أو "تم خصم").
  var label = detectBankLabel(txt);
  if (label === 'الأول (SAB)') return parseSAB(txt) || parseGeneric(txt);
  if (label === 'الأهلي')      return parseAHLI(txt) || parseGeneric(txt);
  if (label === 'الراجحي')     return parseRAJHI(txt) || parseGeneric(txt);
  if (label) return parseGeneric(txt) || parseSAB(txt);   // بنك/محفظة معروفة بالاسم → المحلّل العام (يضبط اسم البنك بنفسه)

  // 2) لا اسم بنك صريح — استعن بالإشارات اللينة (صيغ بلا اسم بنك واضح)
  var softSAB = t.includes('إيداع حوالة') || t.includes('نقاط البيع الدولي')
    || (t.includes('لدى') && (t.includes('sar') || t.includes('usd') || t.includes('qar') || t.includes('سعر الصرف')));
  var softRajhi = t.includes('رصيدك') || t.includes('تم خصم')
    || /ب?\s*sr\s*[\d]/i.test(txt) || /عبر:\s*\d/i.test(txt);

  if (softSAB) return parseSAB(txt) || parseGeneric(txt);
  if (softRajhi) return parseRAJHI(txt) || parseGeneric(txt);
  return parseGeneric(txt) || parseSAB(txt) || parseRAJHI(txt) || parseAHLI(txt);
}

// ============================================================
// CLASSIFICATION
// ============================================================
// مفتاح موحّد لاسم التاجر (للتعلّم وكشف التكرار): حروف صغيرة، مسافات مضغوطة
function merchantKey(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function classifyMerchant(merchant, txType) {
  var text = ((merchant || '') + ' ' + (txType || '')).toLowerCase();
  var mer = (merchant || '').toLowerCase().trim();

  // 1) تصنيف متعلَّم من تصحيحات المستخدم يغلب القاموس
  if (typeof learned !== 'undefined' && learned) {
    var lk = merchantKey(merchant);
    if (lk && learned[lk]) return learned[lk];
    for (var key in learned) {
      if (learned.hasOwnProperty(key) && key.length >= 4 && text.indexOf(key) !== -1) return learned[key];
    }
  }
  function hit(list) {
    for (var i = 0; i < list.length; i++) {
      var kw = (list[i] || '').toLowerCase().trim();
      if (!kw) continue;
      if (text.indexOf(kw) !== -1) return true;          // الكلمة موجودة في النص
      if (mer.length >= 5 && kw.indexOf(mer) === 0) return true;  // اسم القاموس يبدأ بوصف مختصر (الراجحي يختصر)
    }
    return false;
  }
  if (hit(DICT['سداد التمويل'])) return 'سداد التمويل';
  if (hit(DICT['أساسيات'])) return 'أساسيات';
  if (hit(DICT['كماليات'])) return 'كماليات';
  return 'غير محدد';
}

// تصنيف نوع الحركة الواردة (credit) من كلمات الرسالة — أنواع مستقلّة بدل "إضافة" العامة
function classifyCreditType(txt) {
  var t = (txt || '').toLowerCase();
  if (/استرداد|استرجاع|مرتجع|refund|reversal/.test(t)) return 'استرداد';
  if (/راتب|مرتب|salary|payroll/.test(t)) return 'راتب';
  if (/حوالة واردة|إيداع حوالة|تحويل وارد|عملية واردة|واردة|إيداع|ايداع|أودع|اودع|deposit|received|incoming/.test(t)) return 'حوالة واردة';
  return 'إضافة';
}

// كشف اتجاه الحركة من كلمات الرسالة: إضافة (credit) أو خصم (debit)
function detectDirection(txt) {
  var t = (txt || '').toLowerCase();
  // أولاً: إشارات خصم صريحة تغلب أي كلمة وارد قد ترد في نفس النص (مثل "حوالة صادرة")
  if (/حوالة صادرة|تحويل صادر|حوالة مرسلة|صادرة|سحب نقدي|شراء|مشتريات|نقاط بيع|نقاط البيع|خصم|دفعت|سداد فاتورة|تسديد فاتورة|purchase|withdrawal|pos|sent|debit/.test(t)) {
    return 'debit';
  }
  // ثانياً: إشارات إضافة (وارد)
  if (/استرداد|استرجاع|مرتجع|اضافة|إضافة|أضيف|اضيف|تمت اضافة|تمت إضافة|إيداع|ايداع|أودع|اودع|حوالة واردة|تحويل وارد|عملية واردة|واردة|استلمت|تم استلام|استلام|مستلم|راتب|refund|reversal|deposit|received|credited|salary|incoming/.test(t)) {
    return 'credit';
  }
  return 'debit';   // الافتراضي = خصم
}

// أنواع الوارد (credit) — تشترك في معاملة "إضافة" (مستثناة من الصرف)
var CREDIT_TYPES = ['إضافة', 'استرداد', 'حوالة واردة', 'راتب', 'سداد بطاقة'];

function typeDot(type) {
  if (type === 'أساسيات') return 'dot-ess';
  if (type === 'كماليات') return 'dot-lux';
  if (type === 'سداد التمويل') return 'dot-loan';
  if (CREDIT_TYPES.indexOf(type) !== -1) return 'dot-in';   // وارد — نقطة خضراء
  return 'dot-unk';
}

function typeBadge(type) {
  if (type === 'أساسيات') return 'badge-green';
  if (type === 'كماليات') return 'badge-orange';
  if (type === 'سداد التمويل') return 'badge-blue';
  return 'badge-gray';
}
