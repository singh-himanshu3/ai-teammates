# Pro usage limits

Each verified Clerk Pro billing period includes $5 in AI usage and 20 booked
sandbox hours. An account can hold at most three stored sandboxes across all
periods. Allowances do not roll over and there are no automatic overage charges.
Limits live in `lib/usage/policy.ts`; a period stores its limits when first used.
User IDs and period dates always come from authenticated server data and Clerk.
The database is the source of truth for balances, reservations and sessions.

## Accounting

AI amounts are integer microdollars. Every model invocation, including handoff
and tool-loop steps, reserves the documented full input-window cost plus 4,096
output tokens before contacting the provider. This intentionally over-reserves
instead of relying on a text-only token estimate for screenshots and tool data.
A request can be refused when its maximum reservation exceeds the remaining
allowance even if its eventual cost would have fit. Provider retries are disabled.
On a finish event, the reservation settles once to reported input and total
output tokens (including reasoning). Cache reads use ordinary input rates.
Interrupted calls or missing usage retain their full reservation, since the
provider may have billed them. No client-submitted costs or usage are accepted.

The model-price allowlist is verified against these primary sources on 2026-11-16:

- https://aistudio.google.com/docs/pricing#gemini-3.6-flash
  Gemini 3.6 Flash: $0.75/M input and $3.75/M output through 2026-12-31,
  then $1.50/M input and $7.50/M output. The policy includes this date change.
- https://console.groq.com/docs/model/openai/gpt-oss-120b
  GPT OSS 120B: $0.15/M input, $0.60/M output.
- https://www.daytona.io/pricing
  Linux compute: $0.0504/vCPU-hour, $0.0162/GiB-hour; disk $0.000108/GiB-hour.
- https://www.daytona.io/docs/billing
  Archived container sandboxes are not billed. Stopped sandboxes still incur disk costs.

Review these rates before adding models or paid hosted tools. At the enforced
size, 20 hours of sandbox CPU/RAM cost approximately $1.33; three 3-GiB disks
held for a full 31-day period would cost approximately $0.72 before archival.
These estimates exclude the app's other infrastructure and payment fees.

## Sandbox sessions

All computer tools, memory reads/writes that start a sandbox, and desktop
connections share one lease per bot. A lease books up to 15 minutes upfront;
it ends a minute earlier to allow stopping and archival transitions. Early
idle stops, failed provisioning, and disconnects do not refund booked time.
Existing sessions may be reused without another debit; concurrent acquisition
cannot double-charge or exceed the period budget. Desktop sessions end when
their lease expires; users reconnect explicitly to book another session.

Only container sandboxes of at most 1 vCPU, 1 GiB RAM, 3 GiB disk and no GPU are
accepted. Snapshots inherit sizing: an incompatible configured snapshot is
rejected and its newly encountered sandbox deleted. Do not configure larger
snapshots. Slot allocation happens before provisioning and remains occupied on
uncertain failures, preventing repeated creation from leaking untracked resources.
Deleting a bot deletes its sandbox before releasing the slot and database row.
Archival preserves sandbox files, including MEMORY.md, across periods.

## Operations

Deploy **both** `expire-sandbox-lease` and `reconcile-sandbox-leases` with the chat
worker when shipping. In development, keep `npm run trigger:dev` running so
delayed cleanup jobs execute. The per-minute reconciliation schedule runs in
deployed Trigger environments and recovers expired leases after failures.
One-minute Daytona idle stop and auto-archive settings provide additional
protection. Monitor failed cleanup runs: an active VNC connection can prevent
idle stopping, and a Trigger/Daytona outage can delay enforcement beyond the
reserved stopping margin. This is application metering, not a provider-side
hard spending cap. Configure Daytona organization resource/spending limits as
an additional operational backstop.

Apply schema with `npm run db:push` only. No usage is backfilled from previous
versions. Resources created outside this metered flow are not included in its
ledger and should be stopped/archived or removed separately.
No new environment variables or payment webhooks are required. Preserve the
production `tr_prod_...` key; never deploy the local `tr_dev_...` key.

## Verification

- `node --test --test-concurrency=1 scripts/*.test.mjs`
- Set `RUN_USAGE_DB_TESTS=1` and run `scripts/usage-db.test.mjs` with Node's test
  runner for live Postgres races, exhausted budgets, rollback, duplicate
  settlement, expired periods and independent period allowances. It creates and
  removes only temporary test-owned rows and does not call AI or Daytona.
- Authenticated checkout, browser rendering, and real cloud session expiry need
  an integration check with an active Pro account and running Trigger worker.
