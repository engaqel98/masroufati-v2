// ============================================================
// CONFIG & STATE
// ============================================================
var WEBAPP_DEFAULT = 'https://script.google.com/macros/s/AKfycbzUJm5BgBNHGtoY0sbaAiSTCa2kvYLVPO8M-nYL1nJukgBqEQs4UDRjJYHFTACuq-oR/exec';

var expenses = JSON.parse(localStorage.getItem('expenses_v2') || '[]');

var settings = JSON.parse(localStorage.getItem('settings_v2') || 'null') || {
  webapp: WEBAPP_DEFAULT,
  sheetUrl: 'https://docs.google.com/spreadsheets/d/13yjVYW2J2mJmuZiqyX-5tehdexPke7EBN2OWpPbcOqQ/edit',
  total: 208500,
  payment: 7750,
  basic: 2750,
  salary: 15000,
  start: '2026-05'
};

// قائمة الأشخاص المسجّلين لـ"نيابة عن" — تُحفظ ضمن الإعدادات وتتوسّع تلقائياً
// كل ما كُتب اسم جديد. (الإعدادات القديمة قد لا تحتوي الحقل، فنضمن وجوده.)
if (!Array.isArray(settings.people)) settings.people = [];

// أرشيف الرسائل التي فشل تحليلها — تُحفظ تلقائياً لمعالجتها لاحقاً دفعة واحدة
var failedMsgs = JSON.parse(localStorage.getItem('failed_parses_v2') || '[]');

var histFilter = 'all';

var DICT = {
  'أساسيات': ['بنزين','وقود','كهرباء','إنترنت','انترنت','ماء','أكل','بقالة','خضار','لحم','دجاج','خبز','حليب','مترو','باص','مواصلات','صيدلية','دواء','ايجار','إيجار','تأمين','اشتراك انترنت','carrefour','كارفور','lulu','لولو','othaim','العثيم','tamimi','تميمي','danube','الدانوب','nesto','extra','الكترونيات','هايبر','hyper'],
  'كماليات': ['مطعم','قهوة','كافيه','كافيهات','ستاربكس','starbucks','coffee','cafe','حلويات','مخبز','ملابس','عطر','سينما','سفر','هدية','نتفلكس','netflix','اشتراك','حلاق','مغسلة','صيانة','ترفيه','ألعاب','games','amazon','امازون','noon','نون','جرير','sold out','jarir'],
  'سداد التمويل': ['سداد','قسط','تمويل','تسديد','mortgage','loan','finance','rajhi finance','الراجحي للتمويل','sabb','riyadh finance']
};
