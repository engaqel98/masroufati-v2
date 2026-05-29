// ============================================================
// SMS PARSERS  (الراجحي / الأهلي / SAB)
// ============================================================
function today() {
  return new Date().toISOString().split('T')[0];
}

function extractAmount(txt) {
  var m = txt.match(/(?:SAR|SR)\s*([\d,]+\.?\d*)/i);
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  m = txt.match(/([\d,]+\.?\d*)\s*(?:SAR|SR)/i);
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  m = txt.match(/مبلغ\s*([\d,]+\.?\d*)/i);
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  m = txt.match(/([\d,]+\.?\d*)\s*ريال/i);
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  return null;
}

function extractDate(txt) {
  var m = txt.match(/(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  m = txt.match(/(\d{2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    var a = m[1], b = m[2], c = m[3];
    if (parseInt(a) > 31) return '20' + a + '-' + b.padStart(2,'0') + '-' + c.padStart(2,'0');
    var yr = c.length === 2 ? '20' + c : c;
    return yr + '-' + b.padStart(2,'0') + '-' + a.padStart(2,'0');
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
  var m = txt.match(/\((?:\*+\s*)?(\d{4})\)/) || txt.match(/\*+\s*(\d{4})/) || txt.match(/عبر:\s*(\d{3,4})/);
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
      || txt.match(/لدى\s+([^\n\r،,*#]{3,50})/i)
      || txt.match(/من\s+([^\n\r،,]{3,40})/i);
    if (m) merchant = m[1].split(/\s{2,}|تاريخ|الرصيد/)[0].trim();
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
  // معاملة دولية: تُكتشف عبر "نقاط البيع الدولي" أو "سعر الصرف" أو وجود عملة أجنبية
  var fxCur = null, fxAmount = null, fxRate = null;
  var curMatch = txt.match(/بمبلغ\s+([A-Z]{3})\s*([\d,]+\.?\d*)/);
  if (curMatch && curMatch[1] !== 'SAR' && curMatch[1] !== 'SR') {
    fxCur = curMatch[1];
    fxAmount = parseFloat(curMatch[2].replace(/,/g, ''));
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
  }
  if (!amount) {
    m = txt.match(/بمبلغ\s*([\d,]+\.?\d*)\s*(?:SAR|SR)/i) || txt.match(/بمبلغ\s*(?:SAR|SR)\s*([\d,]+\.?\d*)/i) || txt.match(/(?:SAR|SR)\s*([\d,]+\.?\d*)/i) || txt.match(/([\d,]+\.?\d*)\s*(?:SAR|SR)/i);
    if (m) amount = parseFloat(m[1].replace(/,/g, ''));
  }
  if (!amount) return null;

  var merchant = 'غير محدد';
  if (isIncoming) {
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

function detectAndParse(txt) {
  var result = _detectBank(txt);
  if (result) {
    if (!result.direction) result.direction = detectDirection(txt);
    if (result.direction === 'credit' && (!result.type || result.type === 'غير محدد')) result.type = 'إضافة';
    if (!result.time) result.time = extractTime(txt);
  }
  return result;
}

function _detectBank(txt) {
  if (/سداد/.test(txt) && /بطاقت/.test(txt) && /ائتمان/.test(txt)) return parseCardPayment(txt);
  var t = txt.toLowerCase();
  var isRajhi = t.includes('الراجحي') || t.includes('rajhi') || t.includes('رصيدك') || t.includes('تم خصم')
    || /ب?\s*sr\s*[\d]/i.test(txt) || /عبر:\s*\d/i.test(txt);

  var isSAB = !isRajhi && (
    t.includes('الأول') || t.includes('sab') || t.includes('alfursan')
    || t.includes('إيداع حوالة') || t.includes('نقاط البيع الدولي')
    || (t.includes('لدى') && (t.includes('sar') || t.includes('usd') || t.includes('qar') || t.includes('سعر الصرف')))
  );

  var isAhli = !isRajhi && !isSAB && (
    t.includes('الأهلي') || t.includes('ahli') || t.includes('ncb')
    || t.includes('مرسل:')
  );

  var result = null;
  if (isRajhi) result = parseRAJHI(txt) || parseSAB(txt);
  else if (isSAB) result = parseSAB(txt) || parseRAJHI(txt);
  else if (isAhli) result = parseAHLI(txt) || parseSAB(txt);
  else result = parseSAB(txt) || parseRAJHI(txt) || parseAHLI(txt);

  return result;
}

// ============================================================
// CLASSIFICATION
// ============================================================
function classifyMerchant(merchant, txType) {
  var text = ((merchant || '') + ' ' + (txType || '')).toLowerCase();
  var mer = (merchant || '').toLowerCase().trim();
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

// كشف اتجاه الحركة من كلمات الرسالة: إضافة (credit) أو خصم (debit)
function detectDirection(txt) {
  var t = (txt || '').toLowerCase();
  if (/استرداد|استرجاع|مرتجع|اضافة|إضافة|إيداع|ايداع|حوالة واردة|تحويل وارد|عملية واردة|واردة|راتب|refund|reversal|deposit|salary|incoming/.test(t)) {
    return 'credit';
  }
  return 'debit';   // شراء / خصم / حوالة صادرة / مدفوعات = خصم (الافتراضي)
}

function typeDot(type) {
  if (type === 'أساسيات') return 'dot-ess';
  if (type === 'كماليات') return 'dot-lux';
  if (type === 'سداد التمويل') return 'dot-loan';
  return 'dot-unk';
}

function typeBadge(type) {
  if (type === 'أساسيات') return 'badge-green';
  if (type === 'كماليات') return 'badge-orange';
  if (type === 'سداد التمويل') return 'badge-blue';
  return 'badge-gray';
}
