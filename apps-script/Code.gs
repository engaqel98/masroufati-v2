/**
 * Masroufati backend — Google Apps Script bound to the spreadsheet created
 * from "ورقة المصاريف.xlsx".
 *
 * Spreadsheet tabs:
 *   - المعاملات   transactions (headers on row 3, data from row 4)
 *   - خطة التمويل  24-month financing plan (reads المعاملات via SUMIFS)
 *   - القاموس      keyword -> category dictionary (headers row 3, data from row 4)
 *
 * Wire API — identical to what the front-end already sends/expects, so the
 * front-end needs no logic change. All column-layout logic lives here.
 *
 *   GET ?date=&merchant=&amount=&type=&method=&balance=&card=&bank=&intl=
 *        -> appends one transaction, returns { status:'ok', row:N }
 *   GET ?action=read
 *        -> { status:'ok', rows:[ {id,date,merchant,amount,type,method,
 *                                   balance,card,bank,txType,intl}, ... ] }
 *   GET ?action=dict
 *        -> { status:'ok', dict:{ 'أساسيات':[...], 'كماليات':[...],
 *                                  'سداد التمويل':[...] } }
 *
 * Column map for المعاملات (column A is a left margin and stays empty):
 *   B التاريخ | C الوصف | D المبلغ | E النوع | F الشهر | G السنة | H البنك
 *   I طريقة الدفع | J الرصيد | K البطاقة | L العملة الدولية | M نوع العملية
 *   N المعرّف | O وقت التسجيل
 *
 * Note: column E (النوع) is written as a STORED value coming from the app's
 * own classifier — it intentionally overwrites the old dictionary formula on
 * each written row. The financing plan's SUMIFS still works because it filters
 * on the text in E (categories are byte-identical to the app's).
 */

var TX_SHEET   = 'المعاملات';
var PLAN_SHEET = 'خطة التمويل';
var DICT_SHEET = 'القاموس';
var TX_START   = 4;          // first data row (headers are on row 3)
var TX_FIRSTCOL = 2;         // column B
var TX_WIDTH   = 14;         // columns B..O

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'read') return json_(readTx_());
    if (p.action === 'dict') return json_(readDict_());
    return json_(appendTx_(p));
  } catch (err) {
    return json_({ status: 'error', message: String(err) });
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// The front-end double-encodes Arabic params (encodeURIComponent + URLSearchParams).
// Apps Script decodes once, so we decode the remaining layer here.
function dec_(v) {
  if (v == null || v === '') return '';
  try { return decodeURIComponent(String(v)); } catch (e) { return String(v); }
}

function parseDate_(s) {
  s = String(s == null ? '' : s).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);   // local time, no TZ shift
  var d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

// Last real data row, scanning column C (description) so the pre-filled
// formulas in E4:E203 don't fool getLastRow().
function lastTxRow_(sh) {
  var maxRows = sh.getMaxRows();
  if (maxRows < TX_START) return TX_START - 1;
  var vals = sh.getRange(TX_START, 3, maxRows - TX_START + 1, 1).getValues();
  var last = TX_START - 1;
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() !== '') last = TX_START + i;
  }
  return last;
}

function appendTx_(p) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TX_SHEET);
  if (!sh) return { status: 'error', message: 'sheet "' + TX_SHEET + '" not found' };

  var date = parseDate_(p.date);
  var bal  = (p.balance == null || p.balance === '') ? '' : Number(p.balance);
  var row = [
    date,                                 // B التاريخ
    dec_(p.merchant),                     // C الوصف
    Number(p.amount) || 0,                // D المبلغ
    dec_(p.type) || 'غير محدد',           // E النوع (stored, from app)
    date.getMonth() + 1,                  // F الشهر
    date.getFullYear(),                   // G السنة
    dec_(p.bank),                         // H البنك/البطاقة
    dec_(p.method),                       // I طريقة الدفع
    bal,                                  // J الرصيد
    String(p.card || ''),                 // K البطاقة
    dec_(p.intl),                         // L العملة الدولية
    dec_(p.txType),                       // M نوع العملية
    String(p.id || Date.now()),           // N المعرّف (text, avoids precision loss)
    new Date()                            // O وقت التسجيل
  ];

  var writeRow = lastTxRow_(sh) + 1;
  if (writeRow > sh.getMaxRows()) {
    sh.insertRowsAfter(sh.getMaxRows(), writeRow - sh.getMaxRows());
  }
  sh.getRange(writeRow, TX_FIRSTCOL, 1, TX_WIDTH).setValues([row]);
  sh.getRange(writeRow, TX_FIRSTCOL).setNumberFormat('yyyy-mm-dd');  // B display
  return { status: 'ok', row: writeRow };
}

function readTx_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TX_SHEET);
  if (!sh) return { status: 'error', message: 'sheet "' + TX_SHEET + '" not found' };

  var last = lastTxRow_(sh);
  if (last < TX_START) return { status: 'ok', rows: [] };

  var vals = sh.getRange(TX_START, TX_FIRSTCOL, last - TX_START + 1, TX_WIDTH).getValues();
  var tz = ss.getSpreadsheetTimeZone();
  var rows = [];
  for (var i = 0; i < vals.length; i++) {
    var r = vals[i];
    // r indices (offset from column B): 0=B date,1=C merchant,2=D amount,3=E type,
    // 4=F month,5=G year,6=H bank,7=I method,8=J balance,9=K card,10=L intl,
    // 11=M txType,12=N id,13=O timestamp
    var hasDesc = String(r[1]).trim() !== '';
    var hasAmt  = !(r[2] === '' || r[2] == null);
    if (!hasDesc && !hasAmt) continue;

    var d = r[0];
    var dateStr = (d instanceof Date)
      ? Utilities.formatDate(d, tz, 'yyyy-MM-dd')
      : String(d == null ? '' : d);

    rows.push({
      id:       String(r[12] || (TX_START + i)),
      date:     dateStr,
      merchant: String(r[1] == null ? '' : r[1]),
      amount:   Number(r[2]) || 0,
      type:     String(r[3] == null ? '' : r[3]),
      method:   String(r[7] == null ? '' : r[7]),
      balance:  (r[8] === '' || r[8] == null) ? '' : r[8],
      card:     String(r[9] == null ? '' : r[9]),
      bank:     String(r[6] == null ? '' : r[6]),
      txType:   String(r[11] == null ? '' : r[11]),
      intl:     String(r[10] == null ? '' : r[10])
    });
  }
  rows.reverse();   // newest first, to match the app's unshift ordering
  return { status: 'ok', rows: rows };
}

function readDict_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(DICT_SHEET);
  if (!sh) return { status: 'ok', dict: {} };

  var last = sh.getLastRow();
  if (last < 4) return { status: 'ok', dict: {} };

  var vals = sh.getRange(4, 2, last - 3, 2).getValues();   // B keyword, C type
  var dict = {};
  for (var i = 0; i < vals.length; i++) {
    var kw = String(vals[i][0]).trim();
    var ty = String(vals[i][1]).trim();
    if (!kw || !ty) continue;
    if (!dict[ty]) dict[ty] = [];
    dict[ty].push(kw);
  }
  return { status: 'ok', dict: dict };
}

// ---------------------------------------------------------------------------
// One-time setup helpers — run from the "مصروفاتي" menu after pasting this code.
// ---------------------------------------------------------------------------

// Labels the extra app columns (I..O) on row 3 of المعاملات. Cosmetic only.
function setupHeaders() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TX_SHEET);
  if (!sh) return;
  sh.getRange(3, 9, 1, 7).setValues([[
    'طريقة الدفع', 'الرصيد', 'البطاقة', 'العملة الدولية', 'نوع العملية', 'المعرّف', 'وقت التسجيل'
  ]]);
}

// Future-proofs the financing plan: converts the SUMIFS ranges that are
// hard-capped at row 203 into whole-column ranges, so transactions beyond
// row 203 are still counted. Safe to run once after setup.
function expandPlanRanges() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PLAN_SHEET);
  if (!sh) return;
  var rng = sh.getRange(13, 9, 24, 3);   // I13:K36 (أساسيات/كماليات/سداد فعلية)
  var f = rng.getFormulas();
  for (var i = 0; i < f.length; i++) {
    for (var j = 0; j < f[i].length; j++) {
      if (f[i][j]) {
        f[i][j] = f[i][j].replace(/\$([DEFG])\$4:\$\1\$203/g, '$$$1:$$$1');
      }
    }
  }
  rng.setFormulas(f);
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('مصروفاتي')
    .addItem('تجهيز رؤوس الأعمدة الإضافية', 'setupHeaders')
    .addItem('توسيع نطاقات خطة التمويل', 'expandPlanRanges')
    .addToUi();
}
