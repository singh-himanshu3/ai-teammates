import { schemaTask, schedules } from "@trigger.dev/sdk"
import { DaytonaNotFoundError } from "@daytona/sdk"
import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { sandboxSlots } from "../lib/db/schema"
import { usageDb } from "../lib/usage/ledger"
import { botSandboxName, getDaytonaClient } from "../lib/agent/sandbox"

export const expireSandboxLease = schemaTask({
  id: "expire-sandbox-lease",
  // Reconciliation and delayed jobs for the same sandbox must never overlap.
  concurrency: { perKey: 1 },
  schema: z.object({ botId: z.string(), leaseId: z.string() }),
  retry: {
    maxAttempts: 20,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
    factor: 2,
    randomize: true,
  },
  maxDuration: 180,
  run: async ({ botId, leaseId }) => {
    const db = usageDb()
    const [slot] = await db
      .select()
      .from(sandboxSlots)
      .where(
        and(eq(sandboxSlots.botId, botId), eq(sandboxSlots.leaseId, leaseId))
      )
    if (!slot || slot.state === "deleting") return
    if (!slot.expiresAt || slot.expiresAt.getTime() > Date.now())
      throw new Error("Session has not expired.")
    const [claimed] = await db
      .update(sandboxSlots)
      .set({ state: "stopping" })
      .where(
        and(
          eq(sandboxSlots.leaseId, leaseId),
          sql`${sandboxSlots.state} <> 'deleting'`
        )
      )
      .returning()
    if (!claimed) return
    try {
      const sandbox = await getDaytonaClient().get(
        slot.sandboxId ?? botSandboxName(botId)
      )
      const isArchived = () => sandbox.state === "archived"
      if (!isArchived()) {
        if (sandbox.state === "archiving")
          throw new Error("Sandbox archival is still in progress.")
        if (sandbox.state !== "stopped") await sandbox.stop(60)
        await sandbox.archive()
        if (!isArchived())
          throw new Error("Sandbox archival is still in progress.")
      }
    } catch (error) {
      if (!(error instanceof DaytonaNotFoundError)) throw error
    }
    await db
      .update(sandboxSlots)
      .set({ state: "idle", leaseId: null, expiresAt: null })
      .where(
        and(
          eq(sandboxSlots.leaseId, leaseId),
          eq(sandboxSlots.state, "stopping")
        )
      )
  },
})

// Recovery for a worker crash between booking a lease and scheduling its job,
// or a transient outage that exhausted the normal cleanup task's retries.
export const reconcileSandboxLeases = schedules.task({
  id: "reconcile-sandbox-leases",
  cron: "* * * * *",
  run: async () => {
    const expired = await usageDb()
      .select()
      .from(sandboxSlots)
      .where(
        sql`${sandboxSlots.expiresAt} < now() AND ${sandboxSlots.state} IN ('arming', 'active', 'stopping')`
      )
      .limit(100)
    for (const slot of expired) {
      if (slot.leaseId)
        await expireSandboxLease.trigger(
          { botId: slot.botId, leaseId: slot.leaseId },
          { concurrencyKey: slot.botId }
        )
    }
  },
})
