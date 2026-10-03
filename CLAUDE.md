# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**مصروفاتي (Masroufati)** — a single-page Arabic (RTL) expense tracker. It parses Saudi bank SMS messages, classifies spending, persists locally, and mirrors entries to a Google Sheet. There is no build step, no framework, no dependencies, and no tests. Open `index.html` directly in a browser (or serve the folder statically, e.g. `python3 -m http.server`) to run it. All JS is plain ES5-style globals loaded via `<script>` tags — functions are called directly from inline `onclick` handlers in the HTML.

## Architecture

Scripts load in a fixed order (see bottom of `index.html`); later files depend on globals defined earlier:

1. **`js/config.js`** — global state and constants. `expenses` (array, persisted to `localStorage['expenses_v2']`), `settings` (persisted to `localStorage['settings_v2']`), `DICT` (keyword→category map), and `WEBAPP_DEFAULT` (the Google Apps Script Web App URL). Editing default finance figures or the bundled keyword dictionary happens here.
2. **`js/parsers.js`** — pure SMS-parsing and classification logic. `detectAndParse()` sniffs the bank from message text, then dispatches to `parseRAJHI` / `parseAHLI` / `parseSAB`, each falling back to the others if extraction fails. `classifyMerchant()` maps merchant/text to a category using `DICT` (loan → essentials → luxuries priority order). No DOM access here.
3. **`js/save.js`** — persistence and Google Sheets sync. `doSave()` pushes to `expenses`, writes localStorage, then fires the entry to the Web App via GET query params. `syncFromSheets()` (`?action=read`) replaces local data with the sheet's, and `loadDictFromSheets()` (`?action=dict`) overrides `DICT` from the sheet. localStorage is always written first, so sheet failures degrade gracefully.
4. **`js/render.js`** — all DOM rendering. `analyze()` renders the parsed-SMS result card; `renderHistory()`, `renderFinance()`, `renderSettings()` build their tab contents as HTML strings injected into the section `<div>`s. The finance tab computes a 24-month loan projection from `settings` (total, payment, basic, salary, start).
5. **`js/app.js`** — `switchTab()` (re-renders the target tab on switch) and the init block that sets the date field, loads the remote dictionary, and syncs from Sheets on load.

`css/style.css` — all styling, including the CSS variables and the badge/dot color classes (`badge-green`, `dot-ess`, etc.) that `parsers.js` returns class names for.

### Data flow

SMS text → `detectAndParse()` → parsed object (`amount`, `merchant`, `bank`, `date`, `balance`, `card`, `method`, plus optional `fxCurrency`/`fxAmount`/`fxRate` for SAB international) → `classifyMerchant()` sets `type` → user confirms category → `doSave()` → localStorage + Google Sheet.

### Backend

The backend is a Google Apps Script Web App (reference source checked in as `apps-script.gs`; the live copy is in the sheet-bound editor) reached over `fetch`. Actions on one URL: a bare GET with entry params (append a row, inserted in date order with month separators), `?action=read` (return all rows), `?action=dict` (return the keyword dictionary), `?action=update`/`?action=delete` (by `id`), plus diagnostics `?action=info`/`headers`/`preview`/`tabs` and the one-time maintenance actions `?action=backfillmy` (fill `month`/`year`), `?action=reordercols` (enforce `COLUMN_ORDER`), `?action=normalizetime` (convert the time column to text `HH:mm:ss`), `?action=sortrows` (normalize time to text then sort rows by date desc, then time desc), `?action=settz` (set the spreadsheet timezone to `Asia/Riyadh`). Unknown actions are rejected — older deployments instead appended a junk row, so always redeploy a **New version** of the existing deployment (not "New deployment"). The default URL and the linked sheet URL live in `js/config.js` and are overridable in the Settings tab (persisted to `settings`).
  - **`doPost` — `?action=bulkappend`** with a JSON body `{entries:[...]}` (each shaped like the GET append params, built by `appendEntryFields()` in `js/save.js`): appends a whole batch within one Apps Script execution via a loop over the same `appendRow()` used by single-entry GET appends, returning `{status, results:[{id, status}, ...]}` matched back to rows by `id`. Used by bulk PDF statement import (`js/bulkimport.js`, `bulkAppendEntries()`, chunks of `BULK_UPLOAD_CHUNK`=40) — one GET per row took minutes for 100+ rows (each Web App invocation pays its own Apps Script auth/cold-start overhead); batching into few POSTs cut that to seconds. Same double-encoding note as GET: `appendEntryFields()` applies `encodeURIComponent` once to `ENCODED_KEYS` fields for both the GET-`URLSearchParams` and POST-JSON paths — the backend's `dec()` always undoes exactly one layer, GET gets a second transient layer from `URLSearchParams`/query-string parsing that cancels itself out, JSON has no such layer so one `encodeURIComponent` is correct as-is.

## Conventions

- **Arabic-first.** Category names (`'أساسيات'`, `'كماليات'`, `'سداد التمويل'`, `'غير محدد'`) are the canonical keys used everywhere — as `expense.type` values, `DICT` keys, switch conditions, and select options. Keep them byte-identical when comparing or adding cases.
- **Bank parsers are heuristic regex.** Each bank's SMS format differs; the parsers lean on Arabic anchor words (`لدى`, `بمبلغ`, `من`, `سعر الصرف`) and tolerate failures via the fallback chain in `detectAndParse()`. When fixing a parse bug, add/adjust regex in the specific `parseXXX` function and verify the others still detect correctly — recent commits are exactly such fixes for SAB international (FX) messages.
- **No module system.** New functions are globals; if a new file is added, wire its `<script>` tag into `index.html` in dependency order.

## Financial constants (user's actual numbers — do not change unless instructed)

These are the defaults in `js/config.js`'s `settings` object and reflect the user's real financing plan:

- Total financing: **208,500 SAR** over 24 months
- Monthly payment: **7,750 SAR** (covers all 24 months)
- Basic-needs ceiling: **2,750 SAR/month**
- Salary: **15,000 SAR/month**
- Financing start: **2026-05** (ends April 2028)

## Live infrastructure

- **GitHub repo:** `engaqel98/masroufati-v2` (public; GitHub Pages serves `main`/root)
- **Live site:** https://engaqel98.github.io/masroufati-v2/
- **Google Sheet:** `ورقة المصاريف` — ID `13yjVYW2J2mJmuZiqyX-5tehdexPke7EBN2OWpPbcOqQ`
- **Apps Script Web App URL** (deployed; "Anyone" access, "Execute as me"): `https://script.google.com/macros/s/AKfycbzUJm5BgBNHGtoY0sbaAiSTCa2kvYLVPO8M-nYL1nJukgBqEQs4UDRjJYHFTACuq-oR/exec`
  - Both this URL and the linked sheet URL also live in `js/config.js` (`WEBAPP_DEFAULT` + `settings.sheetUrl`), overridable in the Settings tab.
  - The backend reference source is checked in as `apps-script.gs` (the actual deployed copy lives in the sheet-bound Apps Script editor — keep them in sync, and **redeploy via Manage deployments → ✎ → New version**, not "New deployment").
- **Sheet tabs:**
  - `المعاملات` — transactions. **Header row is row 3** (rows 1–2 are blank/title); the backend auto-detects the header row, so position is not assumed.
  - `القاموس` — optional dictionary override (read via `?action=dict`).
  - `خطة التمويل` — a user-built finance-plan table that aggregates `المعاملات` per month via `SUMIFS` (criteria: `$B`=month, `$C`=year, `$F`=type; sum `$D`=amount). Its ranges now use **full columns** (`$D:$D`, not `$D$23:$D$152`) so they cover all rows regardless of sort order — `?action=fixplan` converts any bounded `'المعاملات'!$X$n:$X$m` range in this tab to a full column. **When reordering `المعاملات` columns, these formulas reference columns by letter — keep `month`/`year`/`amount`/`type` at B/C/D/F or update the formulas.** Inspect any tab's values+formulas with `?action=peektab&tab=<name>`, and its conditional-format rules with `?action=cfrules&cell=<A1>`.
- **Conditional formatting on `المعاملات`:** `?action=cleanfmt` resets it to exactly 4 clean rules on the full التصنيف column (`F4:F…`, `TEXT_EQUAL_TO`): أساسيات→green, كماليات→orange, سداد التمويل→blue, غير محدد→gray (app color semantics). It removes legacy/fragmented rules, the "registeredAt non-empty → green" rule, and any manual fill on the registeredAt column. Re-run after a column reorder if the التصنيف column moves (the rule range is rebuilt from the `type` header position). `?action=tidy` extends the same cleanup sheet-wide: deletes the empty legacy `العمليات` tab, re-colors the `القاموس` النوع column and the `خطة التمويل` commitment column (✅/❌) with clean full-range rules.
- **Column layout** (`المعاملات`, 23 cols — the backend maps by header *name*, not position, so columns may be reordered safely):

  | Col | Header (Arabic) | Key |
  |-----|-----------------|-----|
  | A | التاريخ | `date` |
  | B | الشهر (تلقائي) | `month` — **auto-derived from date** (number, no leading zero) |
  | C | السنة (تلقائي) | `year` — **auto-derived from date** (4-digit) |
  | D | المبلغ (ريال) | `amount` |
  | E | الملاحظة / الوصف | `merchant` |
  | F | النوع (تلقائي) | `type` |
  | G | الاتجاه | `direction` |
  | H | نيابة | `behalf` — who this expense was paid on behalf of, if any |
  | I | طريقة الدفع | `method` |
  | J | البطاقة | `card` |
  | K | البنك/ البطاقة | `bank` |
  | L | الرصيد | `balance` |
  | M | العملة الدولية | `intl` — display string, e.g. `USD 10.5` or `QAR 60 @1.03117` |
  | N | رمز العملة | `fxCurrency` — ISO code of the foreign currency, e.g. `USD` |
  | O | بانتظار التحويل | `fxUnconverted` — `TRUE`/blank; SMS had no exchange rate or final SAR total, amount is still the raw foreign number |
  | P | الرسوم الدولية | `intlFee` — international-transaction fee parsed from a SAB SMS |
  | Q | الرسوم مسجَّلة؟ | `intlFeeSettled` — `TRUE`/blank; whether a delayed `intlFee` has been registered as its own expense |
  | R | نوع العملية | `txType` |
  | S | ملاحظة | `note` |
  | T | المبلغ الأصلي | `origAmount` |
  | U | وقت العملية | `time` |
  | V | المعرّف | `id` |
  | W | وقت التسجيل | `registeredAt` |

  `month`/`year` are **not sent by the frontend** — the backend (`apps-script.gs`) derives them from the entry date on append/update. A one-time backfill for legacy rows is exposed at `?action=backfillmy`. The above column order is enforced by `?action=reordercols` (constant `COLUMN_ORDER` in `apps-script.gs`); since the backend maps by header *name*, columns can be reordered freely without breaking reads/writes. `time` (col U) is stored as **plain text `HH:mm:ss`** (converted by `?action=normalizetime`/`sortrows`). It used to be a day-fraction serial, and the spreadsheet's timezone was a non-Riyadh zone while the serials encoded the real time directly (frac × 24), so reading them as Date objects mangled the value via timezone conversion (the sheet timezone is now set to `Asia/Riyadh` via `?action=settz`). Storing as text sidesteps all timezone/epoch issues and makes the sheet, the app, and sorting agree. New entries are written as `HH:mm:ss` strings into the text-formatted column. Legacy rows (pre-June 2026) have no captured transaction time and are intentionally left blank (sorted to the bottom of their day).
  - **`behalf`** worked correctly from its introduction (auto-created on first use by `appendRow`) but was missing from `COLUMN_ORDER`/undocumented until 2026-07-10 — `?action=reordercols` treated it as a stray leftover column instead of placing it at H.
  - **`fxCurrency`/`fxUnconverted`/`intlFee`/`intlFeeSettled`** (cols N–Q) were frontend-only fields (never sent to/stored in the sheet) until 2026-07-10, discovered when a fresh/incognito browser synced from Sheets and lost an entry's "unconverted" status with no local history to recover it from. Migrated to real columns so pulling from the sheet is always lossless. Boolean-style columns store the literal text `TRUE` (Sheets may auto-coerce to a real boolean cell) vs. blank for false — every consumer only ever checks truthiness, never strict equality, so either representation works. **One-time action after any redeploy that adds new `KEY_HEADERS` entries:** `?action=ensurecols` creates all missing columns sheet-wide immediately (safer than relying on the next `appendRow` to create them lazily, since `updateRow` never creates columns and would silently drop a field targeting a column that doesn't exist yet) — run it once, then `?action=reordercols`.

## Canonical category strings (exact bytes — used as object keys and dict values)

- `أساسيات` (green)
- `كماليات` (orange)
- `سداد التمويل` (blue)
- `غير محدد` (gray; default fallback)

Never translate, abbreviate, or change spacing — all comparisons are exact-string against `expense.type`, `DICT` keys, switch conditions, and select options.

## Bank detection priority (`detectAndParse` in `js/parsers.js`)

Checked in order; the first match wins, and the chosen parser falls back to the others if it returns `null`:

1. **Rajhi** — contains `الراجحي` / `rajhi` / `رصيدك` / `تم خصم` / a `ب SR` amount / `عبر:` pattern
2. **SAB** — contains `الأول` / `sab` / `alfursan` / `إيداع حوالة` / `نقاط البيع الدولي`, or `لدى` together with `sar`/`usd`/`qar`/`سعر الصرف`
3. **Ahli** — contains `الأهلي` / `ahli` / `ncb` / `مرسل:`
4. **Fallback chain** — if the primary parser returns `null`, the others are tried

## SAB international-transaction parsing rules

A SAB message is treated as international when it contains `نقاط البيع الدولي` **or** `سعر الصرف` **or** a non-SAR currency token. For intl messages:

- **Final amount = `المبلغ الإجمالي`** (after fees) — *not* `المبلغ بالريال` (before fees) and *not* the balance.
- **Merchant** is the text between `لدى` and the first of: `من خلال` / `بمبلغ` / `في <CAPITAL>`.
- Extract `fxCurrency` (e.g. `QAR`), `fxAmount` (e.g. `60.00`), and `fxRate` (e.g. `1.03117`). These are combined into the `intl` string field saved to Sheets **column L** (`العملة الدولية`) as `QAR 60 @1.03117`.

`js/bulkimport.js`'s `parseSABStatement()` detects the same kind of international row from PDF statement text and extracts the same fields, so bulk-imported SAB international transactions get an `intl`/`fxCurrency`/`intlFee` matching what the equivalent SMS would have produced. Detection: a 3-letter currency code (e.g. `USD`/`SAR`/`JOD` — SAB flags some domestic-currency merchants as "international" too, e.g. intercity bus companies operating cross-border, so don't exclude `SAR`) appearing between two decimal numbers on the row — domestic rows never have a letter token between their numeric columns. When detected, the row's already-extracted `amounts[]` array is `[fxAmount, fxRate, intlFee, vat, finalSAR]` in that fixed column order (same order the statement's own header row documents), so no separate extraction pass is needed. `bank` and `method` are also carried through per-row from the statement (`statementBank`/`method` on the parsed row) instead of the old hardcoded `'كشف حساب (استيراد)'`/`'بطاقة'` for every row regardless of source — Rajhi current-account statement rows in particular get `method` from the same `typeLine` text already used to build `merchant` (e.g. "عملية تحويل داخلية"), since most of those are transfers, not card purchases. `time` and `balance` stay blank for every bulk-imported row regardless of bank — genuinely absent from both statement formats at the per-transaction-row level, not a parser gap.

### Statement cycle reconciliation (`settings.statements`)

A SAB card statement cycle runs **25th → 25th**, not calendar month. This does *not* affect monthly spending totals (every row carries its own date; the backend derives `month`/`year` from that date), so the only real artifact is that the newest calendar month is covered only through the 25th until the next cycle's statement is imported.

A **calendar-month opening balance cannot be derived from a card statement** and must not be synthesized. The app's `balance` field for this card is the *available credit limit* (a debit lowers it, a card payment raises it); the statement's balances are *billed amount owed*. They are not convertible by a constant — verified against real data: rolling the last SMS anchor (3,108.51 available on 2026-07-11) forward over all 31 intervening transactions gives 1,097.14 at 2026-07-25, while `creditLimit − PreviousBalance` = 15,000 − 12,144.71 = 2,855.29, off by 1,758.15 (posting lag, pending authorizations, and unbilled AQSAT all break the relation). Writing such a figure into `balance` would inject a wrong anchor into `detectBalanceGaps`' chain. See the "avoid balance guessing" rule.

What replaces it is strictly better, because the statement's own summary table is a **closed, self-validating checksum** (`parseSABSummary()` in `js/bulkimport.js`). It is one visual row of nine numbers in fixed column order — `[prev, purchases, payments(−), tawarruq, lateFees, vat, newBalanceExclAQSAT, aqsat, totalDue]` — satisfying two exact equations: `prev + purchases − |payments| = newBalanceExclAQSAT` and `newBalanceExclAQSAT + aqsat = totalDue`. **Those equations are the recognition condition** (rather than a brittle text anchor), so detection cannot false-positive; a guard rejects an all-zeros row, which would satisfy both trivially. Verified on the three real statements in `ملفات مرفوعة من قبلي/` (statement dates 2026-06-25/07-25/08-25) plus negative cases (Rajhi amount lines, the trailing AQSAT table, random numeric rows).

Three features build on it, all **display/verification only** — nothing touches `expenses`, the sheet, or `apps-script.gs`:

1. **Import checksum** (`bulkChecksumHtml()`) — sums the parsed rows and compares against the `purchases`/`payments` columns before saving, so a missed or misread row surfaces at import time. Computed over *all* `_bulkRows` regardless of each row's `include` flag: the question is "did we read the PDF correctly", not "what will we save" — deselecting a row or skipping a duplicate is not a read error. Re-rendered in place by `updateBulkChecksum()` when a row's amount or direction is edited (a full `renderImportPreview()` would collapse open cards and lose scroll position). Confirmed exact on all three statements end-to-end: 149/127/11 parsed rows summing to the statement's own columns to the halala, which also means the deliberate AQSAT-row skip does not break the checksum (those rows are excluded from the `purchases` column too, reported separately under `aqsat`).
2. **Cycle chain** (`settings.statements`, `bulkChainHtml()`, `statementsChainHtml()`) — metadata only, no transactions: `totalDue` of one statement equals `prev` of the next exactly (verified 2026-06-25 → 07-25 → 08-25), so a skipped cycle is detected. Also flags re-importing an already-imported cycle. Capped at 36 entries.
3. **Partial-month notice** (`partialMonthNoticeHtml()` in `js/render.js`) — shown on the dashboard for the month containing the newest statement's cutoff. Self-silencing by two conditions: it hides once a newer cycle's statement is imported, or once any expense is logged in that month after the cutoff date (i.e. the user resumed SMS logging).

## Local conventions

- **localStorage keys:** `expenses_v2`, `settings_v2`, `learned_v2` (user-corrected merchant→category map, consulted first in `classifyMerchant`), `failed_parses_v2` (archive of SMS that failed to parse, surfaced in Settings for batch-fixing), `theme_v2`. The `_v2` suffix is intentional — an earlier monolithic version used different keys.
- **PWA:** `manifest.json` + `sw.js` (cache-first for same-origin app shell, network passthrough for the Google Sheets fetch) + `icons/` make the app installable and offline-capable. `sw.js` has a `CACHE` version constant — **bump it when changing any cached asset** or the old copy is served. SW registered at the bottom of `index.html`.
- **Deep-link prefill:** `index.html?sms=<url-encoded text>` auto-fills the SMS box and runs `analyze()` (then cleans the URL). Lets an iOS Shortcut / Android share pipe a bank SMS straight in without copy-paste. Handled in `js/app.js`.
- **Backup/export:** Settings tab exports a full JSON backup (`exportBackup`) or CSV (`exportCSV`), restores via `importBackupFile` (merges by `id`, no duplicates), and `removeDuplicates` dedupes by date+amount+merchant+direction. All in `js/save.js`.
- **`settings` struct:** `{ webapp, webappKey, sheetUrl, total, payment, basic, salary, start, lastSeenMonth, notify, balanceCutoff, linkedCards, statements }` (localStorage only — never written to the sheet).
- **Sheet writes** go through `fetch(WEBAPP + '?' + URLSearchParams)` with URI-encoded Arabic strings; the backend `decodeURIComponent`s them.
