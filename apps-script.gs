/**
 * مصروفاتي — Apps Script Web App
 *
 * يدعم:
 *  - GET بمعاملات الإدخال         → يضيف صفّاً في "العمليات" في مكانه الصحيح حسب التاريخ (الأحدث فوق + يرث التنسيق + فاصل بين الشهور)
 *  - GET ?action=read             → يرجّع كل الصفوف JSON
 *  - GET ?action=dict             → يرجّع قاموس التصنيفات
 *  - GET ?action=headers          → (تشخيص) يرجّع رؤوس "العمليات"
 *
 * النشر: Deploy → Manage deployments → القلم (تعديل) → Version: New version → Deploy
 *
 * يدعم رؤوس الأعمدة بالعربي أو بالإنجليزي.
 * عند الكتابة لمفتاح ما له عمود، يضيف العمود تلقائياً (بالاسم العربي الافتراضي).
 *
 * ملاحظة: هذا الملف مرجع نسخة الـ Apps Script (الباك-إند الفعلي يعيش في محرر Apps Script المرتبط بالشيت).
 */

// يفضّل الشيت المرتبط بهذا السكربت (Extensions → Apps Script من داخل الشيت).
// SHEET_ID يُستخدم فقط كاحتياط إن لم يكن السكربت مرتبطاً بشيت.
const SHEET_ID  = '13yjVYW2J2mJmuZiqyX-5tehdexPke7EBN2OWpPbcOqQ';
const SHEET_TXN = 'المعاملات';
const SHEET_DICT = 'القاموس';
const TZ = 'Asia/Riyadh';

function getSS() {
  const bound = SpreadsheetApp.getActiveSpreadsheet();
  return bound || SpreadsheetApp.openById(SHEET_ID);
}

// لكل مفتاح JSON: قائمة بأسماء الرؤوس المقبولة (الأول = المفضّل عند إضافة عمود جديد)
const KEY_HEADERS = {
  date:         ['التاريخ', 'date'],
  month:        ['الشهر (تلقائي)', 'الشهر', 'month'],
  year:         ['السنة (تلقائي)', 'السنة', 'year'],
  merchant:     ['التاجر', 'الملاحظة / الوصف', 'الوصف', 'merchant'],
  amount:       ['المبلغ', 'المبلغ (ريال)', 'amount'],
  type:         ['التصنيف', 'النوع (تلقائي)', 'النوع', 'type'],
  method:       ['طريقة الدفع', 'method'],
  balance:      ['الرصيد', 'balance'],
  card:         ['البطاقة', 'card'],
  bank:         ['البنك', 'البنك/ البطاقة', 'البنك/البطاقة', 'bank'],
  intl:         ['العملة الدولية', 'intl'],
  registeredAt: ['وقت التسجيل', 'registeredAt', 'registered_at'],
  time:         ['وقت العملية', 'time'],
  txType:       ['نوع العملية', 'txType', 'tx_type'],
  id:           ['المعرف', 'المعرّف', 'id'],
  note:         ['ملاحظة', 'note'],
  origAmount:   ['المبلغ الأصلي', 'origAmount', 'orig_amount'],
  direction:    ['الاتجاه', 'direction'],
  behalf:       ['نيابة', 'behalf']
};

// ترجمة قيم direction العربية → الإنجليزية المعتمدة في التطبيق
const DIRECTION_VALUES = {
  // debit (خصم/شراء/صادر)
  'خصم': 'debit', 'مدين': 'debit', 'صادر': 'debit', 'شراء': 'debit',
  // credit (إضافة/إيداع/استرداد/مرتجع)
  'إضافة': 'credit', 'اضافة': 'credit',
  'إيداع': 'credit', 'ايداع': 'credit',
  'دائن': 'credit', 'وارد': 'credit',
  'استرداد': 'credit', 'مرتجع': 'credit', 'استرجاع': 'credit',
  // الإنجليزية كما هي
  'debit': 'debit', 'credit': 'credit'
};

// header (any accepted name) → JSON key
const HEADER_TO_KEY = (function () {
  const m = {};
  Object.keys(KEY_HEADERS).forEach(function (k) {
    KEY_HEADERS[k].forEach(function (h) { m[h] = k; });
  });
  return m;
})();

// المفاتيح التي ترسلها الواجهة مرمّزة بـ encodeURIComponent
const ENCODED_KEYS = { merchant:1, type:1, method:1, bank:1, intl:1, txType:1, note:1, behalf:1 };
// المفاتيح الرقمية (نخزّنها كـNumber)
const NUMERIC_KEYS = { amount:1, balance:1, origAmount:1 };
// المفاتيح التي نضمن وجود أعمدتها عند الكتابة (الأساسية للتطبيق)
const ENSURE_KEYS = ['date','merchant','amount','type','method','balance','card','bank','intl','registeredAt','time','txType','id','note','origAmount','direction','behalf'];

// الترتيب المنطقي المطلوب لأعمدة "المعاملات" (يُطبَّق عبر action=reordercols).
// أي عمود معروف غير مذكور هنا، أو عمود مجهول، يُترك في النهاية بترتيبه الحالي.
const COLUMN_ORDER = ['date','month','year','amount','merchant','type','direction','method','card','bank','balance','intl','txType','note','origAmount','time','id','registeredAt'];

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = (p.action || '').toLowerCase();
    if (action === 'read')    return jsonOut(readRows());
    if (action === 'dict')    return jsonOut(readDict());
    if (action === 'headers') return jsonOut(readHeaders());
    if (action === 'info')    return jsonOut(diagInfo());
    if (action === 'tabs')    return jsonOut(listTabs());
    if (action === 'preview') return jsonOut(previewRows());
    if (action === 'cleancolumns') return jsonOut(cleanEmptyColumns());
    if (action === 'backfillmy')   return jsonOut(backfillMonthYear());
    if (action === 'reordercols')  return jsonOut(reorderColumns());
    if (action === 'fixtime')      return jsonOut(fixTimeColumn());
    if (action === 'update')  return jsonOut(updateRow(p));
    if (action === 'delete')  return jsonOut(deleteRow(p));
    // أكشن غير معروف → ارفض، لا تكتب
    if (action) return jsonOut({ status: 'error', message: 'unknown action: ' + action });
    // لا أكشن: تحتاج معاملات إدخال صالحة (التاريخ والمبلغ على الأقل) للإضافة
    if (!p.date && !p.amount) return jsonOut({ status: 'error', message: 'missing entry params' });
    return jsonOut(appendRow(p));
  } catch (err) {
    return jsonOut({ status: 'error', message: String(err && err.message || err) });
  }
}

function getTxnSheet() {
  const ss = getSS();
  let sh = ss.getSheetByName(SHEET_TXN);
  if (!sh) {
    sh = ss.insertSheet(SHEET_TXN);
    const headers = ENSURE_KEYS.map(function (k) { return KEY_HEADERS[k][0]; });
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  // لا نضيف أعمدة تلقائياً — نحترم بنية شيت المستخدم.
  // إضافة أعمدة جديدة (مثل "نيابة") تتم فقط عند الكتابة لمفتاح غير موجود.
  return sh;
}

function readHeaders() {
  const sh = getTxnSheet();
  const headers = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  const mapped = headers.map(function (h) { return { header: h, key: HEADER_TO_KEY[normalizeHeader(h)] || null }; });
  return { status: 'ok', count: headers.length, headers: mapped };
}

function listTabs() {
  const ss = getSS();
  const sheets = ss.getSheets();
  const tabs = sheets.map(function (sh) {
    return {
      name: sh.getName(),
      lastRow: sh.getLastRow(),
      lastCol: sh.getLastColumn(),
      dataRows: Math.max(0, sh.getLastRow() - 1)
    };
  });
  return { status: 'ok', spreadsheetId: ss.getId(), spreadsheetName: ss.getName(), tabs: tabs };
}

function diagInfo() {
  const sh = getTxnSheet();
  const dr = sh.getDataRange();
  // اقرأ أيضاً عمود التاريخ كاملاً للسقف الحقيقي (يكتشف صفوف بعد lastRow لو فيه ثغرات)
  const maxRows = sh.getMaxRows();
  let lastDateRow = 0;
  if (maxRows > 1) {
    const dateCol = (getHeaderMap(sh).keyToCol['date']) || 1;
    const vals = sh.getRange(2, dateCol, maxRows - 1, 1).getValues();
    for (let i = vals.length - 1; i >= 0; i--) {
      if (vals[i][0] !== '' && vals[i][0] != null) { lastDateRow = i + 2; break; }
    }
  }
  const hmap = getHeaderMap(sh);
  return {
    status: 'ok',
    spreadsheetId: getSS().getId(),
    spreadsheetName: getSS().getName(),
    sheetName: sh.getName(),
    headerRowDetected: hmap.headerRow,
    keyToCol: hmap.keyToCol,
    lastRow: sh.getLastRow(),
    lastCol: sh.getLastColumn(),
    maxRows: maxRows,
    maxCols: sh.getMaxColumns(),
    dataRangeRows: dr.getNumRows(),
    dataRangeCols: dr.getNumColumns(),
    lastDateRow: lastDateRow,
    dataRowsByDateCol: Math.max(0, lastDateRow - 1)
  };
}

function normalizeHeader(h) {
  return String(h == null ? '' : h).trim();
}

// يبحث عن أفضل صف رؤوس: الصف اللي فيه أكبر عدد رؤوس صحيحة (مو فقط أول صف فيه واحد)
function findHeaderRow(sh) {
  const maxScan = Math.min(20, sh.getLastRow());
  if (maxScan < 1) return 1;
  const lastCol = Math.max(1, sh.getLastColumn());
  const range = sh.getRange(1, 1, maxScan, lastCol).getValues();
  let bestRow = 1, bestCount = 0;
  for (let r = 0; r < range.length; r++) {
    let cnt = 0;
    for (let c = 0; c < range[r].length; c++) {
      if (HEADER_TO_KEY[normalizeHeader(range[r][c])]) cnt++;
    }
    if (cnt > bestCount) { bestCount = cnt; bestRow = r + 1; }
  }
  return bestRow;
}

function getHeaderMap(sh) {
  const lastCol = Math.max(1, sh.getLastColumn());
  const headerRow = findHeaderRow(sh);
  const raw = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  const headers = raw.map(normalizeHeader);
  const keyToCol = {};
  headers.forEach(function (h, i) {
    const k = HEADER_TO_KEY[h];
    if (k && !keyToCol[k]) keyToCol[k] = i + 1;
  });
  return { headers: headers, keyToCol: keyToCol, lastCol: lastCol, headerRow: headerRow };
}

function ensureKeysHaveColumns(sh, keys) {
  let map = getHeaderMap(sh);
  // لا تضف أعمدة لو الشيت أصلاً فاضي رؤوس (أول إعداد فقط).
  // لو فيه ولو رأس واحد معروف، نحترم الشيت ونكتفي بإضافة الجديد الناقص.
  const hasAnyHeader = Object.keys(map.keyToCol).length > 0;
  keys.forEach(function (k) {
    if (!map.keyToCol[k]) {
      if (!hasAnyHeader) return; // شيت فاضي تماماً: ما نضيف رؤوس عشوائية (نتركه للأول إعداد)
      const preferred = KEY_HEADERS[k][0];
      const newCol = sh.getLastColumn() + 1;
      sh.getRange(map.headerRow, newCol).setValue(preferred);
      map = getHeaderMap(sh);
    }
  });
  return map;
}

// يحذف بأمان أي عمود **فاضي تمامًا** تحت صف الرؤوس (للتنظيف بعد إضافات السكربت السابقة الخاطئة)
function cleanEmptyColumns() {
  const sh = getTxnSheet();
  const map = getHeaderMap(sh);
  const headerRow = map.headerRow;
  const lastRow = sh.getLastRow();
  if (lastRow <= headerRow) return { status: 'ok', removed: [], note: 'no data rows' };
  const lastCol = sh.getLastColumn();
  // اقرأ صف الرؤوس + كل البيانات تحته دفعة واحدة
  const headerVals = sh.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  const dataVals = sh.getRange(headerRow + 1, 1, lastRow - headerRow, lastCol).getValues();
  const removed = [];
  // امر من اليمين لليسار لتجنّب اختلال الفهارس بعد الحذف
  for (let c = lastCol; c >= 1; c--) {
    const colData = dataVals.map(function (r) { return r[c - 1]; });
    const isAllEmpty = colData.every(function (v) { return v === '' || v == null; });
    if (isAllEmpty) {
      const hdr = headerVals[c - 1];
      removed.push({ col: c, header: hdr });
      sh.deleteColumn(c);
    }
  }
  return { status: 'ok', removedCount: removed.length, removed: removed };
}

// يملأ عمودي "الشهر"/"السنة" لكل صف فيه تاريخ وأحدهما فارغ — يُشغَّل مرة واحدة من محرر Apps Script
// (action=backfillmy عبر الويب، أو نادِ backfillMonthYear() يدوياً من المحرر)
function backfillMonthYear() {
  const sh = getTxnSheet();
  const map = getHeaderMap(sh);
  const dateCol = map.keyToCol['date'], moCol = map.keyToCol['month'], yrCol = map.keyToCol['year'];
  if (!dateCol || (!moCol && !yrCol)) {
    return { status: 'error', message: 'missing date/month/year columns', keyToCol: map.keyToCol };
  }
  const headerRow = map.headerRow, lastRow = sh.getLastRow();
  if (lastRow <= headerRow) return { status: 'ok', filled: 0, note: 'no data rows' };
  const n = lastRow - headerRow;
  const dates = sh.getRange(headerRow + 1, dateCol, n, 1).getValues();
  const mos = moCol ? sh.getRange(headerRow + 1, moCol, n, 1).getValues() : null;
  const yrs = yrCol ? sh.getRange(headerRow + 1, yrCol, n, 1).getValues() : null;
  let filled = 0;
  for (let i = 0; i < n; i++) {
    const d = dates[i][0];
    if (d === '' || d == null) continue;            // صف فاصل/فارغ — تخطَّ
    if (mos && (mos[i][0] === '' || mos[i][0] == null)) { mos[i][0] = monthNum(d); filled++; }
    if (yrs && (yrs[i][0] === '' || yrs[i][0] == null)) { yrs[i][0] = yearNum(d); }
  }
  if (mos) sh.getRange(headerRow + 1, moCol, n, 1).setValues(mos);
  if (yrs) sh.getRange(headerRow + 1, yrCol, n, 1).setValues(yrs);
  return { status: 'ok', filled: filled, dataRows: n };
}

// يعيد ترتيب أعمدة "المعاملات" حسب COLUMN_ORDER (يطابق بالاسم، ينقل العمود كاملاً
// بتنسيقه وبياناته). يتحرّك يساراً فقط (selection sort) لتفادي غموض فهارس moveColumns.
function reorderColumns() {
  const sh = getTxnSheet();
  const map = getHeaderMap(sh);
  const lastCol = map.lastCol;
  const maxRows = sh.getMaxRows();

  // عمود (1-indexed) → مفتاح
  const colToKey = {};
  Object.keys(map.keyToCol).forEach(function (k) { colToKey[map.keyToCol[k]] = k; });

  // الترتيب الحالي للمفاتيح حسب الموضع (null لأي عمود مجهول)
  const order = [];
  for (let c = 1; c <= lastCol; c++) order.push(colToKey[c] || null);

  // المستهدف: المفاتيح المذكورة الموجودة فعلاً، ثم الباقي (مجهول/غير مدرج) بترتيبه الحالي
  const present = COLUMN_ORDER.filter(function (k) { return order.indexOf(k) !== -1; });
  const leftovers = order.filter(function (k) { return present.indexOf(k) === -1; });
  const target = present.concat(leftovers);

  const moved = [];
  for (let p = 1; p <= target.length; p++) {
    const desired = target[p - 1];
    let c = -1;
    for (let i = p - 1; i < order.length; i++) { if (order[i] === desired) { c = i + 1; break; } }
    if (c === -1 || c === p) continue;               // أصلاً في مكانه
    sh.moveColumns(sh.getRange(1, c, maxRows, 1), p); // c > p دائماً ⇒ حركة يسار آمنة
    moved.push({ key: desired, from: c, to: p });
    const item = order.splice(c - 1, 1)[0];
    order.splice(p - 1, 0, item);
  }
  return { status: 'ok', movedCount: moved.length, moved: moved, finalOrder: order };
}

// يضبط تنسيق عمود "وقت العملية" إلى تنسيق وقت (HH:mm) ليُعرض الكسر اليومي كوقت مقروء
function fixTimeColumn() {
  const sh = getTxnSheet();
  const map = getHeaderMap(sh);
  const tcol = map.keyToCol['time'];
  if (!tcol) return { status: 'error', message: 'no time column' };
  const headerRow = map.headerRow;
  const maxRows = sh.getMaxRows();
  const n = maxRows - headerRow;
  if (n < 1) return { status: 'ok', formatted: 0 };
  sh.getRange(headerRow + 1, tcol, n, 1).setNumberFormat('HH:mm');
  return { status: 'ok', col: tcol, rows: n };
}

// =================== UPDATE / DELETE BY ID ===================

function findRowById(sh, id) {
  const map = getHeaderMap(sh);
  const idCol = map.keyToCol['id'];
  if (!idCol) return { error: 'no id column' };
  const headerRow = map.headerRow;
  const lastRow = sh.getLastRow();
  if (lastRow <= headerRow) return { error: 'no data' };
  const ids = sh.getRange(headerRow + 1, idCol, lastRow - headerRow, 1).getValues();
  const target = String(id).trim();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === target) {
      return { row: headerRow + 1 + i, map: map };
    }
  }
  return { error: 'id not found' };
}

function deleteRow(p) {
  const id = String((p && p.id) || '').trim();
  if (!id) return { status: 'error', message: 'missing id' };
  const sh = getTxnSheet();
  const found = findRowById(sh, id);
  if (found.error) return { status: 'error', message: found.error };
  sh.deleteRow(found.row);
  return { status: 'ok', deleted: 1, row: found.row };
}

function updateRow(p) {
  const id = String((p && p.id) || '').trim();
  if (!id) return { status: 'error', message: 'missing id' };
  const sh = getTxnSheet();
  const found = findRowById(sh, id);
  if (found.error) return { status: 'error', message: found.error };
  const row = found.row;
  const map = found.map;
  const updated = {};
  Object.keys(p).forEach(function (k) {
    if (k === 'action' || k === 'id') return;
    const col = map.keyToCol[k];
    if (!col) return;
    sh.getRange(row, col).setValue(valueFor(k, p[k]));
    updated[k] = p[k];
  });
  // لو تغيّر التاريخ، أعِد اشتقاق الشهر/السنة تلقائياً
  if (p.date != null && p.date !== '') {
    const moCol = map.keyToCol['month'], yrCol = map.keyToCol['year'];
    if (moCol) { sh.getRange(row, moCol).setValue(monthNum(p.date)); updated.month = monthNum(p.date); }
    if (yrCol) { sh.getRange(row, yrCol).setValue(yearNum(p.date)); updated.year = yearNum(p.date); }
  }
  return { status: 'ok', updated: 1, row: row, fields: Object.keys(updated) };
}

function previewRows() {
  const sh = getTxnSheet();
  const lastRow = Math.min(8, sh.getLastRow());
  const lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return { status: 'ok', headerRow: null, rows: [] };
  const map = getHeaderMap(sh);
  const data = sh.getRange(1, 1, lastRow, lastCol).getValues();
  return {
    status: 'ok',
    headerRowDetected: map.headerRow,
    keyToCol: map.keyToCol,
    lastRow: sh.getLastRow(),
    lastCol: lastCol,
    rows: data
  };
}

function dec(v) {
  if (v == null) return '';
  try { return decodeURIComponent(String(v)); } catch (e) { return String(v); }
}

function valueFor(key, raw) {
  if (raw == null || raw === '') return '';
  if (ENCODED_KEYS[key]) return dec(raw);
  if (NUMERIC_KEYS[key]) {
    const n = Number(raw);
    return isFinite(n) ? n : '';
  }
  return String(raw);
}

// 'yyyy-MM' من قيمة تاريخ (Date أو نص مثل 2026-05-30)
function monthKey(v) {
  if (v == null || v === '') return '';
  if (v && typeof v === 'object' && typeof v.getTime === 'function') {
    return Utilities.formatDate(v, TZ, 'yyyy-MM');
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-\/](\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2);
  return s.slice(0, 7);
}

// 'yyyy-MM-dd' من قيمة تاريخ (Date أو نص) — للمقارنة والترتيب
function asDateStr(v) {
  if (v == null || v === '') return '';
  if (v && typeof v === 'object' && typeof v.getTime === 'function') {
    return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/); // DD/MM/YYYY احتياط
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return s;
}

// رقم الشهر (1–12 بدون صفر) من قيمة التاريخ — لتعبئة عمود "الشهر"
function monthNum(v) {
  const s = asDateStr(v);
  const m = s.match(/^\d{4}-(\d{2})/);
  return m ? Number(m[1]) : '';
}
// رقم السنة (4 خانات) من قيمة التاريخ — لتعبئة عمود "السنة"
function yearNum(v) {
  const s = asDateStr(v);
  const m = s.match(/^(\d{4})/);
  return m ? Number(m[1]) : '';
}

// كسر اليوم (0–1، صيغة Sheets للوقت) → "HH:mm:ss" مقروء
function fracToHMS(f) {
  const secs = Math.round(Number(f) * 86400);
  const hh = Math.floor(secs / 3600) % 24, mm = Math.floor(secs / 60) % 60, ss = secs % 60;
  const p = function (n) { return ('0' + n).slice(-2); };
  return p(hh) + ':' + p(mm) + ':' + p(ss);
}

// أقرب صف بيانات غير فارغ (لنسخ تنسيقه للصف الجديد)
function findFormatSource(sh, aroundRow, lastCol, headerRow) {
  const maxRows = sh.getMaxRows();
  for (let r = aroundRow + 1; r <= maxRows; r++) {
    const v = sh.getRange(r, 1, 1, lastCol).getValues()[0];
    if (v.some(function (c) { return c !== '' && c != null; })) return r;
  }
  for (let r = aroundRow - 1; r > headerRow; r--) {
    const v = sh.getRange(r, 1, 1, lastCol).getValues()[0];
    if (v.some(function (c) { return c !== '' && c != null; })) return r;
  }
  return 0;
}

// يضيف العملية في مكانها الصحيح حسب تاريخها (الأحدث فوق)، مع فواصل بين الشهور.
// لا ينقل ولا يعيد كتابة أي صف موجود — يكتفي بإدراج الصف الجديد.
function appendRow(p) {
  const sh = getTxnSheet();
  let map = getHeaderMap(sh);

  // أضف عمود فقط لمفتاح جديد له قيمة وما له عمود (مثل "نيابة" أول مرة)
  Object.keys(p).forEach(function (k) {
    if (k === 'action' || !KEY_HEADERS[k]) return;
    const hasValue = p[k] != null && p[k] !== '';
    if (hasValue && !map.keyToCol[k]) {
      const preferred = KEY_HEADERS[k][0];
      const newCol = sh.getLastColumn() + 1;
      sh.getRange(map.headerRow, newCol).setValue(preferred);
      map = getHeaderMap(sh);
    }
  });

  const lastCol = sh.getLastColumn();
  const headerRow = map.headerRow;
  const dataStart = headerRow + 1;
  const dateCol = map.keyToCol['date'] || 1;
  const SEP = 2; // عدد صفوف الفصل بين الشهور

  // ابنِ الصف الجديد
  const newRow = new Array(lastCol).fill('');
  Object.keys(map.keyToCol).forEach(function (k) {
    const col = map.keyToCol[k];
    if (k === 'registeredAt') newRow[col - 1] = new Date();
    else if (k === 'month') newRow[col - 1] = monthNum(p.date);   // مشتقّ من التاريخ
    else if (k === 'year')  newRow[col - 1] = yearNum(p.date);    // مشتقّ من التاريخ
    else newRow[col - 1] = valueFor(k, p[k]);
  });
  const newDate = asDateStr(p.date);
  const newMonth = monthKey(p.date);

  // اقرأ صفوف البيانات الحالية (غير الفارغة) مع فهارسها
  const lastRow = sh.getLastRow();
  const items = [];
  if (lastRow >= dataStart) {
    const region = sh.getRange(dataStart, 1, lastRow - headerRow, lastCol).getValues();
    region.forEach(function (r, i) {
      if (r.some(function (c) { return c !== '' && c != null; })) {
        items.push({ row: dataStart + i, date: asDateStr(r[dateCol - 1]), month: monthKey(r[dateCol - 1]) });
      }
    });
  }

  // أول إعداد: لا بيانات بعد
  if (!items.length) {
    sh.getRange(dataStart, 1, 1, lastCol).setValues([newRow]);
    return { status: 'ok', row: dataStart };
  }

  // موضع الإدراج: أول صف تاريخه أقدم من الجديد (الترتيب تنازلي)
  let ti = -1;
  for (let i = 0; i < items.length; i++) {
    if (items[i].date < newDate) { ti = i; break; }
  }
  const above = (ti === 0) ? null : (ti === -1 ? items[items.length - 1] : items[ti - 1]);
  const below = (ti === -1) ? null : items[ti];
  const sameAbove = above && newMonth && newMonth === above.month;
  const sameBelow = below && newMonth && newMonth === below.month;

  // احسب صف الإدراج، العدد، إزاحة الصف الجديد، ونطاقات الفواصل
  let insertAt, count, newRowOffset, sepRanges = [];
  if (!above) {                                   // أعلى القائمة
    insertAt = dataStart;
    if (sameBelow) { count = 1; newRowOffset = 0; }
    else { count = 1 + SEP; newRowOffset = 0; sepRanges = [[1, SEP]]; }
  } else if (!below) {                            // أسفل القائمة
    insertAt = above.row + 1;
    if (sameAbove) { count = 1; newRowOffset = 0; }
    else { count = 1 + SEP; newRowOffset = SEP; sepRanges = [[0, SEP]]; }
  } else if (sameAbove && sameBelow) {            // داخل نفس الشهر
    insertAt = below.row; count = 1; newRowOffset = 0;
  } else if (sameAbove) {                         // ينضم لكتلة الأعلى
    insertAt = above.row + 1; count = 1; newRowOffset = 0;
  } else if (sameBelow) {                         // ينضم لكتلة الأسفل
    insertAt = below.row; count = 1; newRowOffset = 0;
  } else {                                        // شهر مستقل بين شهرين
    insertAt = below.row; count = 1 + SEP; newRowOffset = 0; sepRanges = [[1, SEP]];
  }

  sh.insertRowsBefore(insertAt, count);
  const newRowSheet = insertAt + newRowOffset;
  sh.getRange(newRowSheet, 1, 1, lastCol).setValues([newRow]);

  // انسخ تنسيق أقرب صف بيانات
  const srcRow = findFormatSource(sh, newRowSheet, lastCol, headerRow);
  if (srcRow) {
    sh.getRange(srcRow, 1, 1, lastCol).copyTo(
      sh.getRange(newRowSheet, 1, 1, lastCol),
      SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  }
  // نظّف صفوف الفواصل لتظهر فجوات نظيفة
  sepRanges.forEach(function (sr) {
    const rng = sh.getRange(insertAt + sr[0], 1, sr[1], lastCol);
    rng.clearContent(); rng.clearFormat();
  });

  return { status: 'ok', row: newRowSheet };
}

function readRows() {
  const sh = getTxnSheet();
  const map = getHeaderMap(sh);
  const lastCol = map.lastCol;
  const dateCol = map.keyToCol['date'] || 1;
  const headerRow = map.headerRow;
  const dataStart = headerRow + 1;

  const maxRows = sh.getMaxRows();
  if (maxRows < dataStart) return { status: 'ok', rows: [] };
  const dateVals = sh.getRange(dataStart, dateCol, maxRows - headerRow, 1).getValues();
  let lastDataRow = headerRow;
  for (let i = dateVals.length - 1; i >= 0; i--) {
    if (dateVals[i][0] !== '' && dateVals[i][0] != null) { lastDataRow = i + dataStart; break; }
  }
  if (lastDataRow < dataStart) return { status: 'ok', rows: [] };

  const data = sh.getRange(dataStart, 1, lastDataRow - headerRow, lastCol).getValues();

  // عكس keyToCol → نحتاج لكل عمود معروف نعرف مفتاحه
  const colToKey = {};
  Object.keys(map.keyToCol).forEach(function (k) { colToKey[map.keyToCol[k]] = k; });

  const rows = data.filter(function (r) {
    // تخطّى أي صف فاضي تماماً (فجوة وسط البيانات أو فاصل بين الشهور)
    return r.some(function (c) { return c !== '' && c != null; });
  }).map(function (r, rowIdx) {
    const o = {};
    for (let c = 1; c <= lastCol; c++) {
      const key = colToKey[c];
      if (!key) continue;
      let v = r[c - 1];
      // كشف Date موثوق (instanceof يفشل أحياناً بين سياقات V8)
      if (v && typeof v === 'object' && typeof v.getTime === 'function') {
        if (key === 'date')              v = Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
        else if (key === 'time')         v = Utilities.formatDate(v, TZ, 'HH:mm:ss');
        else if (key === 'registeredAt') v = Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ss");
        else                             v = Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
      }
      if (key === 'id' && typeof v === 'number') v = String(v);
      if (key === 'card' && typeof v === 'number') v = String(v);
      // الوقت مخزَّن أحياناً ككسر يوم (0.517) — حوّله لنص مقروء بدل الرقم الخام
      if (key === 'time' && typeof v === 'number') v = fracToHMS(v);
      // ترجمة قيم direction العربية → الإنجليزية المعتمدة في الفرونت
      if (key === 'direction' && typeof v === 'string') {
        const norm = v.trim();
        if (DIRECTION_VALUES[norm]) v = DIRECTION_VALUES[norm];
      }
      o[key] = v;
    }
    // ضمان نهائي: direction لازم تكون 'debit' أو 'credit' فقط
    // أي قيمة غير معروفة → نستنتج من type (سداد بطاقة/إضافة → credit، الباقي → debit)
    if (o.direction !== 'debit' && o.direction !== 'credit') {
      const t = String(o.type || '').trim();
      o.direction = (t === 'سداد بطاقة' || t === 'سداد بطاقة ائتمانية' || t === 'إضافة') ? 'credit' : 'debit';
    }
    if (!o.id) {
      if (o.registeredAt) {
        const t = new Date(o.registeredAt).getTime();
        if (isFinite(t)) o.id = String(t + rowIdx); // +rowIdx لضمان تفرّد المعرف عند تطابق وقت التسجيل
      }
      if (!o.id) o.id = 'r' + (rowIdx + 2);
    }
    if (!o.origAmount && o.amount) o.origAmount = o.amount;
    return o;
  });
  return { status: 'ok', rows: rows };
}

function readDict() {
  const ss = getSS();
  const sh = ss.getSheetByName(SHEET_DICT);
  if (!sh) return { status: 'ok', dict: {} };
  const last = sh.getLastRow();
  if (last < 1) return { status: 'ok', dict: {} };
  const data = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
  const dict = {};
  // الصيغة: العمود A = اسم التصنيف، الأعمدة B+ = الكلمات المفتاحية
  data.forEach(function (r) {
    const cat = String(r[0] || '').trim();
    if (!cat) return;
    if (!dict[cat]) dict[cat] = [];
    for (let i = 1; i < r.length; i++) {
      const kw = String(r[i] || '').trim();
      if (kw) dict[cat].push(kw);
    }
  });
  return { status: 'ok', dict: dict };
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
