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
 *   N المعرّف | O وقت التسجيل | P المبلغ الأصلي | Q ملاحظة | R نوع الحركة
 *
 * Note: column E (النوع) is the category the USER chose for that transaction
 * (from the app's dropdown), stored as a value — because the same merchant can
 * be essentials one time and a luxury the next, so a fixed dictionary mapping
 * is wrong. The dictionary only pre-selects a SUGGESTED default in the app's
 * dropdown; the user can override it per transaction. F/G (month/year) are
 * computed from the date. The financing plan's SUMIFS filter on the text in E.
 */

var TX_SHEET   = 'المعاملات';
var PLAN_SHEET = 'خطة التمويل';
var DICT_SHEET = 'القاموس';
var TX_START   = 4;          // first data row (headers are on row 3)
var TX_FIRSTCOL = 2;         // column B
var TX_WIDTH   = 17;         // columns B..R

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'read')   return json_(readTx_());
    if (p.action === 'dict')   return json_(readDict_());
    if (p.action === 'delete') return json_(deleteTx_(p));
    if (p.action === 'update') return json_(updateTx_(p));
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

function parseDate_(s, t) {
  s = String(s == null ? '' : s).trim();
  var hh = 0, mm = 0, ss = 0;
  var tm = String(t == null ? '' : t).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (tm) { hh = +tm[1]; mm = +tm[2]; ss = tm[3] ? +tm[3] : 0; }
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], hh, mm, ss);   // local, with time
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

// Sort the transaction rows newest-first by date (col B), then by registration
// time (col O). Safe with the formula columns because every formula references
// only same-row cells (C/B) or named ranges, which stay correct after a sort.
function sortTx_(sh) {
  var last = lastTxRow_(sh);
  if (last <= TX_START) return;
  sh.getRange(TX_START, TX_FIRSTCOL, last - TX_START + 1, TX_WIDTH)
    .sort([{ column: 2, ascending: false }, { column: 15, ascending: false }]);
}

function appendTx_(p) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TX_SHEET);
  if (!sh) return { status: 'error', message: 'sheet "' + TX_SHEET + '" not found' };

  var date = parseDate_(p.date, p.time);
  var bal  = (p.balance == null || p.balance === '') ? '' : Number(p.balance);
  var amount = Number(p.amount) || 0;
  var orig = (p.origAmount == null || p.origAmount === '') ? amount : Number(p.origAmount);
  var row = [
    date,                                 // B التاريخ
    dec_(p.merchant),                     // C الوصف
    amount,                               // D المبلغ (المُسجَّل / حصتي)
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
    new Date(),                           // O وقت التسجيل
    orig,                                 // P المبلغ الأصلي (المخصوم من البنك)
    dec_(p.note),                         // Q ملاحظة
    (p.direction === 'credit' ? 'إضافة' : 'خصم')  // R نوع الحركة
  ];

  var writeRow = lastTxRow_(sh) + 1;
  if (writeRow > sh.getMaxRows()) {
    sh.insertRowsAfter(sh.getMaxRows(), writeRow - sh.getMaxRows());
  }
  var dest = sh.getRange(writeRow, TX_FIRSTCOL, 1, TX_WIDTH);
  // Carry the table's look (fill, font, borders, number formats) from the row
  // above onto the new row, so rows added past the original styled block
  // (the xlsx pre-formatted ~row 203) still match the rest of the table.
  if (writeRow - 1 >= TX_START) {
    sh.getRange(writeRow - 1, TX_FIRSTCOL, 1, TX_WIDTH)
      .copyTo(dest, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  }
  dest.setValues([row]);
  sh.getRange(writeRow, TX_FIRSTCOL).setNumberFormat('yyyy-mm-dd');  // B display
  sortTx_(sh);   // keep المعاملات newest-first by transaction date
  return { status: 'ok', row: writeRow };
}

// Find the spreadsheet row whose id (column N) matches `id`; -1 if not found.
// The app stores ids as text in N, so we compare as strings (no precision loss).
function findRowById_(sh, id) {
  var last = lastTxRow_(sh);
  if (last < TX_START) return -1;
  id = String(id);
  var idCol = TX_FIRSTCOL + 12;   // N (B=2 -> N=14)
  var vals = sh.getRange(TX_START, idCol, last - TX_START + 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]) === id) return TX_START + i;
  }
  return -1;
}

// ?action=delete&id=N  -> removes the matching row from المعاملات.
function deleteTx_(p) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TX_SHEET);
  if (!sh) return { status: 'error', message: 'sheet "' + TX_SHEET + '" not found' };
  var id = String(p.id == null ? '' : p.id);
  if (!id) return { status: 'error', message: 'missing id' };
  var row = findRowById_(sh, id);
  if (row < 0) return { status: 'error', message: 'id ' + id + ' not found' };
  sh.deleteRow(row);
  return { status: 'ok', deleted: row };
}

// ?action=update&id=N&merchant=&amount=&date=&type=&direction=&note=&behalf=
// Updates only the fields the edit form sends. behalf has no column in the
// sheet (it's app-local), so it's ignored here on purpose.
function updateTx_(p) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TX_SHEET);
  if (!sh) return { status: 'error', message: 'sheet "' + TX_SHEET + '" not found' };
  var id = String(p.id == null ? '' : p.id);
  if (!id) return { status: 'error', message: 'missing id' };
  var row = findRowById_(sh, id);
  if (row < 0) return { status: 'error', message: 'id ' + id + ' not found' };

  if (p.merchant != null) sh.getRange(row, 3).setValue(dec_(p.merchant));               // C الوصف
  if (p.amount != null && p.amount !== '') sh.getRange(row, 4).setValue(Number(p.amount) || 0);  // D المبلغ
  if (p.type != null) sh.getRange(row, 5).setValue(dec_(p.type) || 'غير محدد');         // E النوع
  if (p.date != null && p.date !== '') {
    var d = parseDate_(p.date, '');
    var old = sh.getRange(row, 2).getValue();   // keep the original time-of-day
    if (old instanceof Date) d.setHours(old.getHours(), old.getMinutes(), old.getSeconds());
    sh.getRange(row, 2).setValue(d).setNumberFormat('yyyy-mm-dd');                       // B التاريخ
    sh.getRange(row, 6).setValue(d.getMonth() + 1);                                      // F الشهر
    sh.getRange(row, 7).setValue(d.getFullYear());                                       // G السنة
  }
  if (p.note != null) sh.getRange(row, 17).setValue(dec_(p.note));                       // Q ملاحظة
  if (p.direction != null && p.direction !== '') {
    sh.getRange(row, 18).setValue(p.direction === 'credit' ? 'إضافة' : 'خصم');           // R نوع الحركة
  }
  sortTx_(sh);   // date may have changed -> keep newest-first
  return { status: 'ok', row: row };
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
    // 11=M txType,12=N id,13=O timestamp,14=P origAmount,15=Q note,16=R direction
    var hasDesc = String(r[1]).trim() !== '';
    var hasAmt  = !(r[2] === '' || r[2] == null);
    if (!hasDesc && !hasAmt) continue;

    var d = r[0];
    var dateStr = (d instanceof Date)
      ? Utilities.formatDate(d, tz, 'yyyy-MM-dd')
      : String(d == null ? '' : d);
    var timeStr = (d instanceof Date) ? Utilities.formatDate(d, tz, 'HH:mm:ss') : '';

    rows.push({
      id:         String(r[12] || (TX_START + i)),
      date:       dateStr,
      time:       timeStr,
      merchant:   String(r[1] == null ? '' : r[1]),
      amount:     Number(r[2]) || 0,
      type:       String(r[3] == null ? '' : r[3]),
      method:     String(r[7] == null ? '' : r[7]),
      balance:    (r[8] === '' || r[8] == null) ? '' : r[8],
      card:       String(r[9] == null ? '' : r[9]),
      bank:       String(r[6] == null ? '' : r[6]),
      txType:     String(r[11] == null ? '' : r[11]),
      intl:       String(r[10] == null ? '' : r[10]),
      origAmount: (r[14] === '' || r[14] == null) ? '' : Number(r[14]),
      note:       String(r[15] == null ? '' : r[15]),
      direction:  (String(r[16]).trim() === 'إضافة') ? 'credit' : 'debit'
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
  sh.getRange(3, 9, 1, 10).setValues([[
    'طريقة الدفع', 'الرصيد', 'البطاقة', 'العملة الدولية', 'نوع العملية', 'المعرّف', 'وقت التسجيل', 'المبلغ الأصلي', 'ملاحظة', 'نوع الحركة'
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

function sortByDate() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TX_SHEET);
  if (sh) sortTx_(sh);
}

// Re-applies the first data row's styling (fill, font, borders, number formats)
// to every data row — fixes rows that were appended unstyled before the
// format-copy fix in appendTx_. Run once from the مصروفاتي menu.
function fixRowFormatting() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TX_SHEET);
  if (!sh) return;
  var last = lastTxRow_(sh);
  if (last <= TX_START) return;
  sh.getRange(TX_START, TX_FIRSTCOL, 1, TX_WIDTH)
    .copyTo(sh.getRange(TX_START + 1, TX_FIRSTCOL, last - TX_START, TX_WIDTH),
            SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  sh.getRange(TX_START, 2, last - TX_START + 1, 1).setNumberFormat('yyyy-mm-dd');  // B
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('مصروفاتي')
    .addItem('تجهيز رؤوس الأعمدة الإضافية', 'setupHeaders')
    .addItem('توسيع نطاقات خطة التمويل', 'expandPlanRanges')
    .addItem('ترتيب حسب التاريخ', 'sortByDate')
    .addItem('توحيد تنسيق الصفوف', 'fixRowFormatting')
    .addToUi();
}
