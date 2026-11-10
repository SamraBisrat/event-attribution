# Event attribution

## Cross-event dashboard

Open Event dashboard in the app navigation. Configure existing Shopify discount codes per event, then rerun Sync orders to populate order codes. This does not create Shopify discounts. The dashboard supports 7/30/60/90-day purchase windows, event rankings, unique buyers across events, code orders, buyers outside the attendee list, and per-customer 90-day before/after observed spending by currency.

Each eligible purchase goes to one event: a unique matching code wins, otherwise the latest confirmed attendance wins. Shared/multiple event-code matches are excluded and flagged. Codes apply only from event start through the selected purchase window. Same-time attendance ties use event ID for deterministic assignment. Guest code orders contribute revenue; those uniquely matched to an attendee email can also count as identified buyers. Revenue remains separated by currency. The earlier single-event API and Attendance and sales screen retain their nonexclusive association reports; use Event dashboard for combined totals.

First-time acquisition is deliberately unknown until complete prior purchase history is available. Current unique attributed buyers must not be interpreted as new customers. Before/after and observed lifetime totals reflect stored orders only, with explicit incomplete-history labels. There is no forecast LTV or causal claim. Monthly aggregation, full-history backfill, and automated scheduled sync are not implemented yet.

Authenticated GET `/api/events/:eventId/attribution?windowDays=30` reports stored orders for confirmed attendees (`attended = true`). The window includes event start and excludes start plus windowDays; allowed windows are 1–365 days. Events and orders are scoped to the authenticated shop. Missing events return 404.

Revenue is grouped by currency. This is an event-level association report: the same order can qualify for multiple events. It is not a causal or exclusive attribution model. Existing order totals are used; refund/cancellation synchronization is not implemented. No attribution rows are written.

CSV import automatically sets attended=true for both new and existing registrations, whether or not they exist in Shopify. Existing registrations are confirmed by the automatic-attendance migration. Use Attendance and sales to undo attendance if needed, sync orders, and view 30-day reports. Reimporting a row confirms it again. Rows with invalid emails or mismatched event IDs are not registered; attendees without a Shopify match are saved locally. Changes are restricted to the authenticated shop during import.

Order sync runs on app open, on returning to the visible tab, and every five minutes while the app is visible. Manual refresh remains available. A successful shop sync is throttled for one minute; simultaneous requests in the same process share a job. Initial sync fetches the recent 59 days under read_orders, or all accessible history if the installed session already has read_all_orders. Subsequent syncs use updated_at with a five-minute overlap to refresh changed orders. Gaining full-history access triggers a full backfill. Full-history access is not automatically requested or granted by this code.

Customer links, order upserts, and the successful-sync timestamp commit in one transaction after all pages succeed. Errors leave saved sales and the sync checkpoint unchanged. Test, cancelled, unpaid and fully refunded orders store zero revenue. Paid and partially refunded orders use current totals in shop currency, including tax/shipping. Deleted orders are not reconciled. The fetch is capped at 100 pages and fails without saving if exceeded. There is no closed-app scheduler or order webhook worker yet: the server and an open app tab are required for automatic refresh. Staging should add a durable background worker for unattended updates.

## Attendance and event locations

Attendance & Orders displays square tiles for saved events (there is no separate event-confirmation status). The default table combines confirmed attendees across completed events, using endAt when provided or startAt otherwise. Each person is shown once, with all their event names. Purchases are positive stored orders since their first qualifying event, up to now; currencies remain separate. Selecting an event uses that event's start time, so individual event views can overlap. This is attendee sales history, not the dashboard's exclusive attribution calculation.

Location is optional, limited to 300 characters, and supported by the event form and POST events API. Existing events retain a null location. Restart the development server after the schema migration and client generation.

Run tests with `node --experimental-strip-types --test tests/attribution.test.mjs` and check types with `npm run typecheck`.

## Shopify access blocker

The existing configuration declares read_customers. Verify the installed app actually granted that scope and that protected customer data access, including Email, is configured for the same app and store. Declared scopes alone do not grant protected customer data access. Development-store access and production approval have different requirements: https://shopify.dev/docs/apps/launch/protected-customer-data

Order synchronization requires read_orders and applicable protected data access. Do not treat permission failures as empty customer matches. Test with `node --experimental-strip-types --test tests/*.test.mjs`.


## Independent attendee imports

CSV imports no longer require a Shopify customer or purchase. Required headers remain `Event ID,First name,Last name,Email`; `Phone number` (or `Phone`) is optional. A valid email is required for matching. All valid rows are confirmed as attended. Existing four-column CSV files remain supported. Reimporting the same normalized email into the same event updates non-empty contact details without duplicating attendance; blank optional cells preserve existing details.

Names, phone numbers, attendee email and stored order email are encrypted. Local attendee profiles may have no Shopify customer ID. Imports do not create Shopify accounts or change marketing consent.

Reports link orders to the unique attendee profile with the same case-insensitive, trimmed email within the same store. Existing direct customer-ID attendance takes precedence. Multiple attendee profiles or multiple Shopify IDs sharing the email are not guessed. Phone numbers and names are not matching keys. Different or unavailable emails cannot automatically match. Shopify customer and order records are preserved rather than destructively merged. Reports resolve the link on read, including orders synced before an attendee import and guest orders with an available email.

The migration resets the last-sync timestamp so the next sync refreshes emails for accessible historical orders; Shopify's existing order-history access limits still apply. Automatic sync still runs only while the app is open, or via manual refresh. Shopify protected email access is required for order matching, but no longer for the CSV import itself.
