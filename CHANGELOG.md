# Changelog

Notable user-facing changes and fixes, newest first. Internal refactors without behavior change are omitted.

## 2026-07-08

- **Balance reconciliation cutoff** (Settings → "مطابقة الرصيد"): balance-gap detection and the "فجوات الرصيد" tab can now ignore all transactions before a configurable date (`settings.balanceCutoff`, defaults to `2026-07-01`), so reconciliation restarts cleanly from a known-good deposit instead of dragging in old/messy history. Leave the field empty to go back to accounting for full history.
- **Retry upload for failed Sheets syncs**: any transaction that saves locally but fails to reach Google Sheets is now flagged (`entry.synced === false`) with a visible "⚠️ لم يُرفع إلى Sheets" tag and a "🔄 إعادة رفع" button in its History card. Retrying safely upserts (tries `update` first, falls back to `append`) to avoid duplicate rows.
- **Pending-delete tracking**: if deleting a transaction fails to also delete its row from Sheets (network/key issue), it's no longer silent — it's tracked and surfaced in Settings → البيانات with a "🗑 أعد محاولة الحذف" button to retry until the row is actually gone.
- **SAB international-fee-aware balance matching**:
  - Parses "الرسوم الدولية بالريال" from SAB intl SMS (`intlFee`).
  - If a balance-matching diff exactly equals *this* transaction's own fee (bank hasn't reflected the fee in the displayed balance yet), it's shown as an informational note instead of a false "unregistered gap" alert.
  - If a *later* transaction's diff matches the sum of previously-unsettled intl fees (the bank caught up), the app now recognizes this and offers a "💵 تسجيل كرسوم دولية" action instead of treating it as an unknown gap or silently dropping it.
  - The "فجوات الرصيد" tab shows the actual cause per gap: known intl-fee source (merchant + date) vs. an unknown gap (shown bounded by the two surrounding transactions for easier manual review).
  - Registering a gap/fee settlement now labels and notes which transaction(s) it's linked to, and the original causing transaction is tagged in its History card ("🔗 رسوم دولية … سُجِّلت لاحقاً") for later review.
