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

function extractBalance(txt) {
  var m = txt.match(/(?:الرصيد|رصيدك)[:\s]*(?:SAR|SR)?\s*([\d,]+\.?\d*)/i);
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  return null;
}

function extractCard(txt) {
  var m = txt.match(/\((\d{4})\)/);
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
    m = txt.match(/لدى\s+([^\n\r،,*#]{3,50})/i) || txt.match(/عبر:\s*([^\n\r،,]{3,40})/i) || txt.match(/من\s+([^\n\r،,]{3,40})/i);
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
  var isIntl = /USD|EUR|UNITED STATES/i.test(txt);
  var amount = null, m;

  if (isIntl) {
    m = txt.match(/المبلغ الإجمالي بالريال[:\s]*([\d,]+\.?\d*)/) || txt.match(/المبلغ بالريال[:\s]*([\d,]+\.?\d*)/);
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
    m = txt.match(/لدى\s+(.+?)\s+بمبلغ/i) || txt.match(/لدى\s+(.+?)(?:\s+تاريخ|\s*\n|\s*$)/im) || txt.match(/لدى\s+([^\n\r،,*#]{3,50})/i);
    if (m) merchant = m[1].trim();
  }

  return {
    amount: amount, merchant: merchant, bank: 'الأول (SAB)',
    date: extractDate(txt), balance: extractBalance(txt),
    card: extractCard(txt), method: extractMethod(txt),
    txType: txt.trim().split('\n')[0]
  };
}

function detectAndParse(txt) {
  var t = txt.toLowerCase();
  var isRajhi = t.includes('الراجحي') || t.includes('rajhi') || t.includes('رصيدك') || t.includes('تم خصم')
    || /ب?\s*sr\s*[\d]/i.test(txt) || /عبر:\s*\d/i.test(txt);

  var isSAB = !isRajhi && (
    t.includes('الأول') || t.includes('sab') || t.includes('alfursan')
    || t.includes('إيداع حوالة')
    || (t.includes('لدى') && (t.includes('sar') || t.includes('usd')))
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
  var i;
  for (i = 0; i < DICT['سداد التمويل'].length; i++) {
    if (text.includes(DICT['سداد التمويل'][i].toLowerCase())) return 'سداد التمويل';
  }
  for (i = 0; i < DICT['أساسيات'].length; i++) {
    if (text.includes(DICT['أساسيات'][i].toLowerCase())) return 'أساسيات';
  }
  for (i = 0; i < DICT['كماليات'].length; i++) {
    if (text.includes(DICT['كماليات'][i].toLowerCase())) return 'كماليات';
  }
  return 'غير محدد';
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
