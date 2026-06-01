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

The backend is a Google Apps Script Web App (reference source checked in as `apps-script.gs`; the live copy is in the sheet-bound editor) reached over `fetch`. Actions on one URL: a bare GET with entry params (append a row, inserted in date order with month separators), `?action=read` (return all rows), `?action=dict` (return the keyword dictionary), `?action=update`/`?action=delete` (by `id`), plus diagnostics `?action=info`/`headers`/`preview`/`tabs` and the one-time maintenance actions `?action=backfillmy` (fill `month`/`year`), `?action=reordercols` (enforce `COLUMN_ORDER`), `?action=normalizetime` (convert the time column to text `HH:mm:ss`), `?action=sortrows` (normalize time to text then sort rows by date desc, then time desc). Unknown actions are rejected — older deployments instead appended a junk row, so always redeploy a **New version** of the existing deployment (not "New deployment"). The default URL and the linked sheet URL live in `js/config.js` and are overridable in the Settings tab (persisted to `settings`).

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
- **Column layout** (`المعاملات`, 18 cols — the backend maps by header *name*, not position, so columns may be reordered safely):

  | Col | Header (Arabic) | Key |
  |-----|-----------------|-----|
  | A | التاريخ | `date` |
  | B | الشهر (تلقائي) | `month` — **auto-derived from date** (number, no leading zero) |
  | C | السنة (تلقائي) | `year` — **auto-derived from date** (4-digit) |
  | D | المبلغ (ريال) | `amount` |
  | E | الملاحظة / الوصف | `merchant` |
  | F | النوع (تلقائي) | `type` |
  | G | الاتجاه | `direction` |
  | H | طريقة الدفع | `method` |
  | I | البطاقة | `card` |
  | J | البنك/ البطاقة | `bank` |
  | K | الرصيد | `balance` |
  | L | العملة الدولية | `intl` |
  | M | نوع العملية | `txType` |
  | N | ملاحظة | `note` |
  | O | المبلغ الأصلي | `origAmount` |
  | P | وقت العملية | `time` |
  | Q | المعرّف | `id` |
  | R | وقت التسجيل | `registeredAt` |

  `month`/`year` are **not sent by the frontend** — the backend (`apps-script.gs`) derives them from the entry date on append/update. A one-time backfill for legacy rows is exposed at `?action=backfillmy`. The above column order is enforced by `?action=reordercols` (constant `COLUMN_ORDER` in `apps-script.gs`); since the backend maps by header *name*, columns can be reordered freely without breaking reads/writes. `time` (col P) is stored as **plain text `HH:mm:ss`** (converted by `?action=normalizetime`/`sortrows`). It used to be a day-fraction serial, but the spreadsheet's timezone is `America/Los_Angeles` while the serials encode the real time directly (frac × 24), so reading them as Date objects mangled the value via timezone conversion. Storing as text sidesteps all timezone/epoch issues and makes the sheet, the app, and sorting agree. New entries are written as `HH:mm:ss` strings into the text-formatted column. Legacy rows (pre-June 2026) have no captured transaction time and are intentionally left blank (sorted to the bottom of their day).

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

## Local conventions

- **localStorage keys:** `expenses_v2`, `settings_v2`. The `_v2` suffix is intentional — an earlier monolithic version used different keys.
- **`settings` struct:** `{ webapp, sheetUrl, total, payment, basic, salary, start }`.
- **Sheet writes** go through `fetch(WEBAPP + '?' + URLSearchParams)` with URI-encoded Arabic strings; the backend `decodeURIComponent`s them.
