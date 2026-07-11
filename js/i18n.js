// ============================================================
// i18n — ترجمة كاملة عربي/إنجليزي (طبقة بعد العرض)
// render.js يبقى عربياً؛ هذه الطبقة تترجم المخرجات للإنجليزية.
// أي نص غير مغطّى يبقى عربياً (رجوع آمن — لا يكسر شيئاً).
// ============================================================
var LANG = (function () { try { return localStorage.getItem('lang_v2') || 'ar'; } catch (e) { return 'ar'; } })();
function isEN() { return LANG === 'en'; }
// أرقام إنجليزية دائماً (حتى بالعربي) — الفاصلة العشرية وفاصلة الآلاف بالأرقام العربية
// متشابهتان بصرياً وتلبّس، فنستخدم en-US لعرض الأرقام فقط بغض النظر عن لغة الواجهة.
function localeCode() { return 'en-US'; }

// أشهر السنة
var MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
var MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// قاموس الاستبدال (عربي → إنجليزي). يُطبَّق على نصوص DOM مرتّباً من الأطول للأقصر.
var REPL_RAW = [
  // وحدات وعملة
  [' ر.س', ' SAR'], ['ر.س', 'SAR'],
  // فئات (عرض فقط — القيم المخزّنة تبقى عربية)
  ['سداد التمويل', 'Loan payment'], ['غير محدد', 'Uncategorized'],
  ['أساسيات', 'Essentials'], ['كماليات', 'Luxuries'],
  ['حوالة واردة', 'Incoming transfer'], ['سداد بطاقة', 'Card payment'],
  ['استرداد', 'Refund'], ['إضافة', 'Credit'], ['راتب', 'Salary'],
  // ===== ملخّص الشهر + بداية شهر جديد =====
  ['🎉 بدأ شهر جديد — ملخّص ', '🎉 New month started — summary of '],
  ['📋 ملخّص ', '📋 Summary of '],
  ['إجمالي الصرف', 'Total spending'],
  ['🏦 سداد التمويل', '🏦 Loan payment'], ['⬇️ الوارد', '⬇️ Incoming'],
  ['💰 الفائض (راتب − صرف − قسط)', '💰 Surplus (salary − spend − installment)'],
  ['🏷️ أعلى تاجر', '🏷️ Top merchant'], ['🧾 عدد العمليات', '🧾 Transactions'],
  ['التزمت بالخطة هذا الشهر', 'On track with the plan this month'],
  ['لم تلتزم بالخطة بالكامل', 'Not fully on track this month'],
  ['✓ ابدأ الشهر الجديد', '✓ Start the new month'],
  ['لا توجد عمليات في هذا الشهر.', 'No transactions this month.'],
  ['صرف الشهر', 'Spent'],
  // ===== تنبيهات الميزانية =====
  ['⚠️ اقتربت من السقف — باقي ', '⚠️ Near the cap — only '], [' ر.س فقط', ' SAR left'],
  ['تنبيهات الميزانية (المتصفح)', 'Budget alerts (browser)'],
  ['🔔 مفعّل', '🔔 On'], ['🔕 معطّل', '🔕 Off'], ['🔕 محظور', '🔕 Blocked'],
  ['إشعار عند الاقتراب من سقف الأساسيات/الكماليات (80%) أو تجاوزه — مرة واحدة لكل عتبة شهرياً.',
   'Get notified when essentials/luxuries near (80%) or exceed their cap — once per threshold each month.'],
  // أسماء بنوك ووصف عمليات شائعة (عرض فقط)
  ['الأول (SAB)', 'SAB'], ['الراجحي', 'Al Rajhi'], ['الأهلي', 'SNB'], ['الإنماء', 'Alinma'],
  ['الرياض', 'Riyad Bank'], ['الفرنسي', 'BSF'], ['البلاد', 'Albilad'], ['الجزيرة', 'Aljazira'], ['تسوية', 'Settlement'],
  ['سداد بطاقة ائتمانية', 'Credit card payment'], ['سداد من ', 'Settled from '],
  ['استرداد/إيداع غير مسجّل', 'Unrecorded refund/deposit'], ['خصم غير مسجّل', 'Unrecorded charge'],
  ['يدعم: الراجحي · الأهلي · SAB/الأول', 'Supports: Al Rajhi · SNB · SAB'],
  ['مثال: تم الشراء مبلغ', 'e.g. Purchased for'],
  // ===== تحليل الرسالة =====
  ['الرجاء لصق رسالة SMS', 'Please paste an SMS message'],
  ['تعذّر استخراج البيانات — حُفظت الرسالة في «الإعدادات ← رسائل لم تُحلَّل» لمعالجتها لاحقاً.',
   'Could not extract data — saved under «Settings → Unparsed messages» for later.'],
  ['✍️ أدخلها يدوياً الآن', '✍️ Enter it manually'],
  ['تنبيه مطابقة الرصيد', 'Balance check'],
  ['الرصيد السابق لهذه البطاقة: ', 'Previous balance for this card: '],
  ['المتوقّع بعد هذه العملية: ', 'Expected after this transaction: '],
  [' · الفعلي: ', ' · Actual: '],
  ['زيادة غير مُسجَّل', 'over (unrecorded)'], ['نقص غير مُسجَّل', 'short (unrecorded)'],
  ['فرق ', 'Diff '],
  ['غالباً صار استرداد/إيداع لم تُسجَّله.', 'Likely an unrecorded refund/deposit.'],
  ['غالباً صار خصم/عملية لم تُسجَّلها.', 'Likely an unrecorded charge/transaction.'],
  ['💵 سجّل الفرق المفقود', '💵 Record missing diff'],
  ['يمكنك الحفظ عادي — هذا تنبيه فقط لمراجعة عملياتك.', 'You can still save — this is just a heads-up.'],
  ['الرصيد مطابق للمتوقّع (لا عمليات مفقودة على هذه البطاقة).', 'Balance matches expected (no missing transactions).'],
  [' ر.س يطابق الرسوم الدولية لهذه العملية — البنك غالباً ما يحدّث الرصيد المعروض بالرسوم فوراً (تُخصم لاحقاً). مو فجوة حقيقية.',
   ' SAR matches this transaction\'s international fee — the bank often doesn\'t reflect the fee in the displayed balance right away (deducted later). Not a real gap.'],
  ['— اختر التصنيف —', '— Choose category —'],
  ['✓ صُنّفت تلقائياً من القاموس — غيّرها إن لزم', '✓ Auto-categorized — change if needed'],
  ['حركة إضافة (', 'Credit ('],
  [') — تزيد الرصيد وغير محسوبة في الصرف.', ') — increases balance, excluded from spending.'],
  ['👥 سداد من شخص (اختياري)', '👥 Settle from person (optional)'],
  ['👥 نيابة عن (اختياري)', '👥 On behalf of (optional)'],
  ['اسم الشخص — يُخصم من المتبقي عليه', 'Person — deducted from what they owe'],
  ['اكتب اسم الشخص أو اختر من القائمة', 'Type a name or pick from the list'],
  ['💾 حفظ وإرسال', '💾 Save & send'],
  ['المبلغ المُسجَّل (ر.س)', 'Recorded amount (SAR)'],
  ['مبلغ السداد: ', 'Settlement amount: '], ['المخصوم: ', 'Charged: '],
  [' — عدّله لو الخصم مشترك', ' — adjust if shared'],
  ['ملاحظة (اختياري)', 'Note (optional)'],
  ['مثال: قسمتها مع فلان', 'e.g. split with someone'],
  ['💳 البطاقة / الحساب', '💳 Card / account'],
  ['مثال: •••• 1234 أو اسم البنك', 'e.g. •••• 1234 or bank name'],
  ['صحّحها لو التحليل اختار بطاقة/حساب خطأ — تُستخدم في ملخّص الوارد الشهري', 'Fix if the wrong card/account was picked — used in the monthly incoming summary'],
  ['طريقة الدفع', 'Payment method'], ['العملة الدولية', 'Foreign currency'],
  ['سعر الصرف ', 'FX rate '],
  // ===== عناوين الصفحات + بطاقات اللوحة الجديدة =====
  ['السجل', 'History'], ['الإعدادات', 'Settings'], ['التمويل', 'Financing'],
  ['صرف ', 'Spending '], ['من الدخل', 'of income'], ['عن الشهر السابق', 'vs last month'],
  ['عملية الشهر', 'Transactions'], ['متوسط يومي', 'Daily avg'], ['متبقّي الدخل', 'Income left'],
  ['آخر العمليات', 'Recent activity'], ['عرض الكل ›', 'View all ›'], ['➕ إدخال يدوي', '➕ Manual entry'],
  ['📅 خطة الأشهر القادمة', '📅 Upcoming months plan'], ['ملتزم بالخطة هذا الشهر', 'On track this month'],
  ['💳 أرصدة البطاقات والحسابات', '💳 Card & account balances'],
  // ===== اللوحة =====
  ['خطة التمويل · يتبقّى ', 'Financing plan · '],
  ['المتبقّي من إجمالي ', 'Remaining of '],
  ['شهر ', 'Month '], ['التقدّم', 'Progress'], ['القسط الشهري', 'Monthly payment'], ['الانتهاء', 'Ends'],
  ['📊 المتبقي حسب التصنيف · ', '📊 Remaining by category · '],
  ['باقي على الآخرين ', 'Others owe '], ['باقي ', 'Left '],
  ['صُرف ', 'Spent '], [' · تجاوزت بـ ', ' · over by '],
  ['بدون سقف — صنّفها لتدخل أحد المظاريف', 'No cap — categorize it'],
  ['👥 نيابة عن آخرين', '👥 On behalf of others'],
  [' · تراكمي (مستثناة من ميزانيتك)', ' · cumulative (excluded from budget)'],
  ['المجموع لك عند الآخرين: ', 'Total owed to you: '],
  ['دفعت ', 'Paid '], [' · استرد ', ' · refunded '],
  ['المتبقي عليه', 'They owe'], ['المتبقي على الآخرين', 'Others owe'],
  ['💵 سجّل سداد / تصفية', '💵 Record settlement'],
  ['دفعت', 'Paid'], ['استرد', 'Refunded'],
  ['شهر أقدم', 'Older month'], ['شهر أحدث', 'Newer month'],
  // ===== السجل =====
  ['لا توجد فجوات — كل الأرصدة مطابقة للمتوقّع.', 'No gaps — all balances match expected.'],
  [' فجوة مكتشفة', ' gaps found'], ['صافي', 'net'],
  ['فرق بين الرصيد الفعلي والمتوقّع — غالباً عمليات/استردادات لم تُسجَّل. سجّلها لإغلاق الفجوة.',
   'Difference between actual and expected balance — likely unrecorded transactions/refunds. Record to close the gap.'],
  ['المتوقّع ', 'Expected '], [' · الفعلي ', ' · Actual '],
  ['💵 سجّل', '💵 Record'],
  ['🎚️ فلاتر متقدّمة', '🎚️ Advanced filters'],
  ['📊 ملخّص الحساب (الرصيد والوارد)', '📊 Account summary (balance & incoming)'],
  ['💳 الأرصدة والوارد', '💳 Balances & incoming'], ['الرصيد المتاح', 'Available balance'], ['الوارد (', 'Incoming ('],
  ['⬇️ الوارد لكل بطاقة/حساب', '⬇️ Incoming per card/account'],
  ['إجمالي الوارد', 'Total incoming'],
  ['الرصيد: ', 'Balance: '], ['الرصيد', 'Balance'],
  [' عملية · سداد التمويل', ' txns · Loan payment'],
  [' عملية · وارد للرصيد', ' txns · Incoming'],
  ['دفعت نيابة عن ', 'Paid on behalf of '], [' عملية · دفعت نيابة', ' txns · Paid on behalf'],
  [' عملية · الصرف', ' txns · Spending'],
  ['سداد التمويل (منفصل)', 'Loan payment (separate)'],
  ['نيابة عن آخرين (مستثناة)', 'On behalf (excluded)'],
  ['📊 فتح Google Sheets ↗', '📊 Open Google Sheets ↗'],
  ['🔎 فجوات الرصيد', '🔎 Balance gaps'],
  ['🌍 عمليات دولية', '🌍 International transactions'],
  ['لا توجد عمليات دولية بانتظار التحويل.', 'No international transactions pending conversion.'],
  [' عملية بانتظار المبلغ الصحيح بالريال', ' transaction(s) awaiting the correct SAR amount'],
  ['بعملتها الأجنبية بدون سعر صرف أو مبلغ نهائي واضح بالرسالة — مسجَّلة مؤقتاً بعملتها الأصلية وغير محسوبة بأي مصروف أو دفتر ذمم. عدّل كل عملية بالمبلغ الصحيح من كشف حسابك متى ما وصلك.',
   "In their original foreign currency, with no exchange rate or final amount in the message — recorded temporarily as-is and not counted in any spend total or ledger. Edit each one with the correct amount from your statement once you have it."],
  [' عملية دولية غير محوَّلة غير محسوبة بعد — صحّحها من السجل أولاً', ' unconverted international transaction(s) not yet counted — fix them from History first'],
  ['🌍 السبب: عملية/عمليات دولية غير محوَّلة — ', '🌍 Cause: unconverted international transaction(s) — '],
  ['🌍 عملية دولية بدون تحويل — عدّلها بالمبلغ الصحيح بالريال', '🌍 Unconverted international transaction — edit it with the correct SAR amount'],
  ['ابحث: تاجر، مبلغ، ملاحظة…', 'Search: merchant, amount, note…'],
  ['كل الأشهر', 'All months'], ['📅 الشهر', '📅 Month'],
  ['كل الأشخاص', 'All people'], ['👤 الشخص', '👤 Person'],
  ['مسح اليوم', 'Clear day'], ['📅 يوم', '📅 Day'], ['يوم محدد', 'Specific day'],
  ['لا توجد سجلات', 'No records'], [' لهذا التصنيف', ' for this filter'],
  [' بتاريخ ', ' on '], [' مطابقة لـ «', ' matching «'],
  [' عملية', ' txns'],
  // ===== التمويل =====
  ['تقدم السداد', 'Repayment progress'],
  ['المبلغ الأصلي', 'Original amount'], ['المتبقي', 'Remaining'],
  ['الشهر ', 'Month '], [' من 24', ' of 24'],
  ['متبقي ', 'Left '], [' شهر · ينتهي ', ' months · ends '], [' شهر', ' months'],
  ['📉 تناقص الرصيد المتبقي', '📉 Remaining balance over time'],
  ['البداية: ', 'Start: '], ['الحين: ', 'Now: '], [' ← الحين', ' ← now'],
  ['أساسيات فعلية', 'Actual essentials'], ['كماليات فعلية', 'Actual luxuries'],
  ['هدف ≤ ', 'Target ≤ '], ['فائض ', 'Surplus '], ['هدف ', 'Target '],
  ['مؤشر الالتزام', 'On-track'], ['غير ملتزم بعد', 'Not yet on track'], ['ملتزم', 'On track'],
  ['لم يُسجَّل سداد التمويل هذا الشهر (', 'No loan payment recorded this month ('],
  ['الأساسيات تجاوزت الهدف', 'Essentials exceeded target'],
  ['الكماليات تجاوزت الفائض الحر', 'Luxuries exceeded free surplus'],
  ['توزيع الراتب', 'Salary breakdown'],
  ['القسط المُسدَّد', 'Paid installment'], ['أساسيات (هدف)', 'Essentials (target)'], ['فائض حر', 'Free surplus'],
  ['الراتب الإجمالي: ', 'Gross salary: '], ['/شهر', '/mo'],
  ['الأشهر القادمة', 'Upcoming months'],
  ['الشهر', 'Month'], ['القسط', 'Installment'],
  // ===== الإعدادات =====
  ['المجموع لك: ', 'Total owed to you: '],
  ['المظهر واللغة', 'Appearance & language'], ['الوضع الداكن', 'Dark mode'], ['اللغة · Language', 'Language'],
  ['مفعّل', 'On'], ['معطّل', 'Off'],
  ['إعدادات التمويل', 'Financing settings'],
  ['الراتب (ر.س)', 'Salary (SAR)'], ['القسط الشهري (ر.س)', 'Monthly payment (SAR)'],
  ['أساسيات (ر.س)', 'Essentials (SAR)'], ['إجمالي التمويل (ر.س)', 'Total financing (SAR)'],
  ['تاريخ بداية التمويل (YYYY-MM)', 'Financing start (YYYY-MM)'],
  ['💾 حفظ الإعدادات', '💾 Save settings'],
  ['مطابقة الرصيد', 'Balance reconciliation'],
  ['تجاهل العمليات قبل تاريخ (YYYY-MM-DD)', 'Ignore transactions before date (YYYY-MM-DD)'],
  ['مطابقة الرصيد وتبويب «فجوات الرصيد» تتجاهل أي عملية قبل هذا التاريخ تماماً، وتبدأ السلسلة من أول عملية برصيد بعده (مثلاً إيداع بداية شهر جديد). اتركه فارغاً لإلغاء القطع والعودة لاحتساب كل التاريخ.',
   'Balance reconciliation and the "Balance gaps" tab fully ignore any transaction before this date, restarting the chain from the first balance-bearing entry after it (e.g. a start-of-month deposit). Leave empty to remove the cutoff and account for the full history again.'],
  ['رابط Web App', 'Web App URL'], ['المفتاح السري', 'Secret key'],
  ['مفتاح الحماية (Script Property: SECRET)', 'Security key (Script Property: SECRET)'],
  ['المفتاح يُحفظ في متصفحك فقط ويُرسل مع كل طلب. لازم يطابق قيمة', 'Stored in your browser only and sent with each request. Must match'],
  ['في إعدادات الـ Apps Script.', 'in the Apps Script settings.'],
  ['رابط الشيت', 'Sheet URL'], ['حفظ الروابط', 'Save links'], ['فتح الشيت ↗', 'Open sheet ↗'],
  ['البيانات', 'Data'], ['عدد العمليات المحفوظة', 'Saved transactions'],
  ['🔄 تحديث من Sheets', '🔄 Sync from Sheets'], ['🗑 مسح البيانات', '🗑 Clear data'],
  [' عملية لم تُحذف من Sheets', ' transaction(s) not deleted from Sheets'],
  ['🗑 أعد محاولة الحذف', '🗑 Retry delete'],
  ['حُذفت من التطبيق لكن فشل حذف صفّها من الشيت (انقطاع شبكة/مفتاح خاطئ) — ستبقى ظاهرة هناك حتى تنجح إعادة المحاولة.',
   'Deleted from the app but failed to delete its row from the sheet (network issue/wrong key) — it stays there until the retry succeeds.'],
  ['⏳ جاري إعادة محاولة الحذف...', '⏳ Retrying delete...'],
  ['⚠️ لا يزال ', '⚠️ Still '], [' حذف معلّقاً', ' deletion(s) pending'],
  ['✅ اكتمل حذف كل العمليات المعلَّقة من Sheets', '✅ All pending deletions from Sheets completed'],
  ['💾 النسخ الاحتياطي والتصدير', '💾 Backup & export'],
  ['احفظ نسخة كاملة (عمليات + إعدادات + تصنيفات متعلَّمة) أو صدّرها كـCSV.', 'Save a full backup (transactions + settings + learned categories) or export CSV.'],
  ['⬇️ نسخة احتياطية (JSON)', '⬇️ Backup (JSON)'], ['⬆️ استعادة', '⬆️ Restore'],
  ['📄 تصدير CSV', '📄 Export CSV'], ['🔍 فحص التكرارات', '🔍 Find duplicates'],
  ['تصنيفات متعلَّمة من تصحيحاتك', 'Categories learned from your edits'],
  ['🧠 نسيان التصنيفات المتعلَّمة', '🧠 Forget learned categories'],
  ['📥 رسائل لم تُحلَّل', '📥 Unparsed messages'],
  ['لا توجد رسائل فاشلة — كل شيء تمام 👍', 'No failed messages — all good 👍'],
  ['رسائل تعذّر تحليلها وحُفظت تلقائياً. انسخها كلها وألصقها في المحادثة لمعالجتها دفعة واحدة وتحسين المحلّل.',
   'Messages that could not be parsed, saved automatically. Copy them all to fix in one batch.'],
  ['📋 نسخ الكل', '📋 Copy all'], ['🧹 احذف غير الصالح', '🧹 Remove invalid'], ['🗑 مسح الكل', '🗑 Clear all'],
  // ===== رسائل الحفظ/التأكيد (save.js) =====
  ['مسح كل الرسائل غير المحلَّلة؟', 'Clear all unparsed messages?'],
  ['لا توجد مدخلات غير صالحة', 'No invalid entries'],
  ['لا توجد عمليات مكررة', 'No duplicate transactions'],
  ['تم الإلغاء — عملية مكررة', 'Cancelled — duplicate'],
  ['حُفظ محلياً', 'Saved locally'],
  ['حُفظت — الصق الرسالة التالية', 'Saved — paste the next message'],
  ['أدخل مبلغاً صحيحاً', 'Enter a valid amount'],
  ['الرجاء اختيار التصنيف أولاً', 'Please choose a category first'],
  ['الرجاء اختيار التصنيف', 'Please choose a category'],
  ['ملف غير صالح', 'Invalid file'],
  ['لم يُحدَّد Web App URL', 'Web App URL not set'],
  ['جاري التحديث...', 'Updating...'],
  ['لا توجد بيانات في Sheets', 'No data in Sheets'],
  ['تم مسح البيانات المحلية', 'Local data cleared'],
  ['تم حفظ الإعدادات', 'Settings saved'],
  ['✅ تم الحفظ — سيتم تجاهل ما قبل ', '✅ Saved — will ignore everything before '],
  ['✅ تم الحفظ — أُلغي القطع', '✅ Saved — cutoff removed'],
  ['تم حفظ الروابط والمفتاح', 'Links and key saved'],
  ['جاري حفظ التعديلات في Sheets...', 'Saving changes to Sheets...'],
  ['تم التحديث في Sheets', 'Updated in Sheets'],
  ['تم التحديث · ', 'Updated · '],
  ['⚠️ لم يُرفع إلى Sheets', '⚠️ Not uploaded to Sheets'],
  ['🔄 إعادة رفع', '🔄 Retry upload'],
  ['⏳ جاري إعادة الرفع...', '⏳ Retrying upload...'],
  ['✅ تم الرفع لـ Sheets', '✅ Uploaded to Sheets'],
  ['⚠️ فشل مرة أخرى: ', '⚠️ Failed again: '],
  ['فشل الرفع: ', 'Upload failed: '],
  ['🌍 <b>عملية دولية بدون سعر صرف بالرسالة</b>', '🌍 <b>International transaction with no rate in the message</b>'],
  [') لسه بعملته الأجنبية بدون تحويل — الرسالة ما فيها سعر صرف ولا مبلغ نهائي بالريال.',
   ') is still in its foreign currency, unconverted — the message has no exchange rate or final SAR amount.'],
  ['عدّله يدوياً بالمبلغ الصحيح بالريال من كشف حسابك، أو احفظه كذا وصحّحه لاحقاً إذا وصلتك رسالة تأكيد.',
   'Edit it manually with the correct SAR amount from your statement, or save it as-is and fix it later if a confirmation message arrives.'],
  ['ℹ️ <b>الفرق يطابق عملية/عمليات دولية غير محوَّلة</b>', 'ℹ️ <b>The difference matches unconverted international transaction(s)</b>'],
  ['يمكنك الحفظ عادي — عدّل العملية القديمة لما توصلك القيمة الصحيحة.', "You can still save — edit the older transaction once you know the correct amount."],
  ['🌍 السبب: عملية/عمليات دولية غير محوَّلة — ', '🌍 Cause: unconverted international transaction(s) — '],
  ['🌍 عملية دولية — المبلغ أعلاه بعملة ', '🌍 International transaction — the amount above is in '],
  [' بدون تحويل، عدّلها بالمبلغ الصحيح بالريال', ', unconverted — edit it with the correct SAR amount'],
  // ===== الترويسة / النموذج اليدوي / التعديل (index.html ثابت) =====
  ['متابعة المصاريف', 'Expense tracker'],
  ['الصق رسالة SMS البنكية', 'Paste your bank SMS'],
  ['🔍 تحليل', '🔍 Analyze'], ['📋 لصق وتحليل', '📋 Paste & analyze'],
  ['إدخال يدوي', 'Manual entry'],
  ['التاجر / الجهة', 'Merchant / payee'], ['مثال: كارفور', 'e.g. Carrefour'],
  ['التصنيف', 'Category'], ['💾 حفظ', '💾 Save'],
  ['مدى / Apple Pay', 'Mada / Apple Pay'],
  ['✎ تعديل العملية', '✎ Edit transaction'], ['التاجر', 'Merchant'],
  ['المبلغ (ر.س)', 'Amount (SAR)'], ['التاريخ', 'Date'], ['الاتجاه', 'Direction'],
  ['خصم', 'Debit'], ['ملاحظة', 'Note'],
  ['💾 حفظ التعديلات', '💾 Save changes'], ['إلغاء', 'Cancel'],
  ['إضافة (وارد)', 'Credit (incoming)'],
  ['الكل', 'All'], ['⬇️ وارد', '⬇️ Incoming'], ['👥 نيابة', '👥 On behalf'],
  ['البنك', 'Bank'], ['مسح', 'Clear'],
  ['المبلغ الأصلي', 'Original amount'], ['✎ تعديل', '✎ Edit'], ['🗑 حذف', '🗑 Delete'], ['عُدّل من ', 'Edited from '],
  ['⚠️ تحليل خاطئ', '⚠️ Wrong result'], ['حُفظت في «رسائل لم تُحلَّل» لمراجعتها لاحقاً. شكراً!', 'Saved to "Unparsed messages" for later review. Thanks!'],
  // عام
  [' من ', ' of ']
];
// رتّب من الأطول للأقصر لتفادي الاستبدال الجزئي
var REPL = REPL_RAW.slice().sort(function (a, b) { return b[0].length - a[0].length; });

// أي حرف/رمز عربي (حروف، تشكيل، علامات ترقيم عربية كـ ٪ ، ؛) — وجوده يعني ترجمة ناقصة
var ARABIC_RE = /[؀-ۿ]/;

function translateStr(s) {
  if (!isEN() || !s) return s;
  var out = s;
  // الأشهر
  for (var m = 0; m < 12; m++) { if (out.indexOf(MONTHS_AR[m]) !== -1) out = out.split(MONTHS_AR[m]).join(MONTHS_EN[m]); }
  for (var i = 0; i < REPL.length; i++) {
    if (out.indexOf(REPL[i][0]) !== -1) out = out.split(REPL[i][0]).join(REPL[i][1]);
  }
  // لو بقي أي حرف عربي بعد كل الاستبدالات (كلمة ما بالقاموس، اسم شخص/تاجر حر، إلخ) فالترجمة
  // جزئية/مختلطة وغير واضحة — نرجّع النص الأصلي كاملاً بدل خلط عربي/إنجليزي مربك، لحين ربط
  // قاموس أو مترجم فعلي يغطّي كل الحالات.
  if (ARABIC_RE.test(out)) return s;
  return out;
}

// ====== الخصوصية: إخفاء كل الأرقام كـ •••• (ما عدا التواريخ/الأوقات/السنوات) ======
function privOn() { return document.body.classList.contains('priv'); }
function maskNumbers(s) {
  if (!s) return s;
  return s.replace(/[\d٠-٩]+(?:[.,٫٬][\d٠-٩]+)*/g, function (m, idx, str) {
    var before = idx > 0 ? str.charAt(idx - 1) : '';
    var after = str.charAt(idx + m.length) || '';
    if (/[-:\/]/.test(before) || /[-:\/]/.test(after)) return m;   // جزء تاريخ/وقت
    if (/^(19|20)\d{2}$/.test(m)) return m;                        // سنة (يبقى الشهر/السنة مقروءاً)
    return '••••';
  });
}

// تحويل نص حسب اللغة ثم الخصوصية
function transformStr(s) {
  var o = s;
  if (isEN()) o = translateStr(o);
  if (privOn()) o = maskNumbers(o);
  return o;
}

// يطبّق الترجمة + الإخفاء على شجرة DOM، مع حفظ الأصل للرجوع
function applyText(root) {
  if (!root) return;
  var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
  var n;
  while ((n = walker.nextNode())) {
    if (n.__o == null) n.__o = n.nodeValue;
    n.nodeValue = transformStr(n.__o);
  }
  ['placeholder', 'title'].forEach(function (attr) {
    root.querySelectorAll('[' + attr + ']').forEach(function (el) {
      var key = '__a_' + attr;
      if (el[key] == null) el[key] = el.getAttribute(attr);
      el.setAttribute(attr, isEN() ? translateStr(el[key]) : el[key]);   // السمات: ترجمة فقط
    });
  });
}
var translateTree = applyText;   // توافق مع الاستدعاءات القديمة

// يعيد تطبيق الترجمة/الإخفاء على كامل الواجهة (يُستدعى عند تبديل العين)
function applyPrivacyDOM() {
  applyText(document.querySelector('.container'));
  applyText(document.getElementById('edit-modal'));
  applyText(document.getElementById('add-sheet'));
}

var I18N_CONTAINERS = { analyze: 'result-area', renderDashboard: 'dashboard', renderHistory: 'history-content', renderAccounts: 'accounts-content', renderSettings: 'settings-content' };

// يلفّ دوال العرض ليُترجَم ناتجها بعد كل رسم
function wrapRenderers() {
  Object.keys(I18N_CONTAINERS).forEach(function (fn) {
    var orig = window[fn];
    if (typeof orig !== 'function' || orig.__wrapped) return;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try { translateTree(document.getElementById(I18N_CONTAINERS[fn])); } catch (e) {}
      return r;
    };
    wrapped.__wrapped = true;
    window[fn] = wrapped;
  });
}

function updateLangButton() {
  var b = document.getElementById('lang-btn');
  if (b) b.textContent = isEN() ? 'ع' : 'EN';
}

function applyLang() {
  var h = document.documentElement;
  h.setAttribute('lang', LANG);
  h.setAttribute('dir', isEN() ? 'ltr' : 'rtl');
  updateLangButton();
  // أعد رسم التبويب الظاهر (لتحديث الأرقام للّغة) ثم ترجم كامل الواجهة الثابتة + المودال
  var visible = ['parse', 'history', 'accounts', 'settings'].filter(function (id) {
    var s = document.getElementById('sec-' + id); return s && s.style.display !== 'none';
  })[0] || 'parse';
  if (visible === 'parse' && typeof renderDashboard === 'function') renderDashboard();
  if (visible === 'history' && typeof renderHistory === 'function') renderHistory();
  if (visible === 'accounts' && typeof renderAccounts === 'function') renderAccounts();
  if (visible === 'settings' && typeof renderSettings === 'function') renderSettings();
  translateTree(document.querySelector('.container'));
  translateTree(document.getElementById('edit-modal'));
  translateTree(document.getElementById('add-sheet'));
}

function toggleLang() {
  LANG = isEN() ? 'ar' : 'en';
  try { localStorage.setItem('lang_v2', LANG); } catch (e) {}
  applyLang();
}

wrapRenderers();
window.addEventListener('load', function () {
  updateLangButton();
  if (isEN()) applyLang(); else applyPrivacyDOM();   // طبّق الإخفاء/الترجمة على ما رُسم
});
