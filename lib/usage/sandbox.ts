import { randomUUID } from "node:crypto"
import { DaytonaNotFoundError } from "@daytona/sdk"
import { tasks } from "@trigger.dev/sdk"
import { and, eq, sql } from "drizzle-orm"
import { sandboxSlots } from "../db/schema.ts"
import { claimBotSandbox } from "../agent/context.ts"
import {
  botSandboxName,
  ensureBotSandbox,
  getDaytonaClient,
} from "../agent/sandbox.ts"
import {
  allocateSandboxSlot,
  bookSandboxSession,
  currentUsagePeriod,
  usageDb,
} from "./ledger.ts"
import { USAGE_LIMITS, UsageLimitError } from "./policy.ts"
import type { expireSandboxLease } from "../../trigger/sandbox-lease.ts"

type Bot = { id: string; userId: string; sandboxId: string | null }

export async function meteredSandbox(bot: Bot) {
  const period = await currentUsagePeriod(bot.userId)
  const db = usageDb()
  const slot = await allocateSandboxSlot(bot)
  const now = Date.now()
  if (
    slot.state === "active" &&
    slot.expiresAt &&
    slot.expiresAt.getTime() > now + 180_000
  ) {
    return getDaytonaClient().get(
      slot.sandboxId ?? bot.sandboxId ?? botSandboxName(bot.id)
    )
  }
  if (slot.state !== "idle") {
    throw new UsageLimitError(
      "This sandbox session is starting or ending. Reconnect in a moment."
    )
  }
  // A minute of the booked runtime is reserved for stop/archival transitions.
  const seconds = Math.min(
    USAGE_LIMITS.sessionSeconds,
    period.sandboxLimit - period.sandboxSeconds,
    Math.floor((period.endsAt.getTime() - now) / 1000)
  )
  if (seconds < 180)
    throw new UsageLimitError(
      "Not enough sandbox time remains to start a session. Wait for the subscription reset."
    )
  const expiresAt = new Date(
    now + (seconds - USAGE_LIMITS.stopMarginSeconds) * 1000
  )
  const leaseId = randomUUID()
  // One statement: claiming a session, charging runtime and adding its ledger
  // entry either all commit or all roll back. A negative balance aborts all CTEs.
  await bookSandboxSession(bot, period.id, seconds, expiresAt, leaseId)
  // Schedule BEFORE creating/starting resources. If scheduling fails, no
  // resource is started. The debit stays reserved for conservative accounting.
  try {
    await tasks.trigger<typeof expireSandboxLease>(
      "expire-sandbox-lease",
      { botId: bot.id, leaseId },
      { delay: expiresAt, concurrencyKey: bot.id }
    )
  } catch (error) {
    await db
      .update(sandboxSlots)
      .set({ state: "idle", leaseId: null, expiresAt: null })
      .where(eq(sandboxSlots.leaseId, leaseId))
    throw error
  }
  const sandbox = await ensureBotSandbox(bot, getDaytonaClient(), (id) =>
    claimBotSandbox(bot, id)
  )
  // Snapshots carry their own sizing. Never expose an oversized sandbox.
  if (
    ![sandbox.cpu, sandbox.memory, sandbox.disk, sandbox.gpu].every(
      (n) => Number.isFinite(n) && n >= 0
    ) ||
    sandbox.cpu > 1 ||
    sandbox.memory > 1 ||
    sandbox.disk > 3 ||
    sandbox.gpu > 0 ||
    (sandbox.sandboxClass && sandbox.sandboxClass !== "container")
  ) {
    await getDaytonaClient().delete(sandbox)
    await usageDb().execute(
      sql`UPDATE bots SET sandbox_id = NULL WHERE id = ${bot.id} AND user_id = ${bot.userId} AND sandbox_id = ${sandbox.id}`
    )
    await db
      .update(sandboxSlots)
      .set({ state: "idle", leaseId: null, expiresAt: null, sandboxId: null })
      .where(eq(sandboxSlots.leaseId, leaseId))
    throw new UsageLimitError(
      "This sandbox exceeds Pro's 1 vCPU, 1 GiB RAM and 3 GiB disk size. Use a compatible Daytona snapshot."
    )
  }
  await sandbox.setAutostopInterval(1)
  await sandbox.setAutoArchiveInterval(1)
  const [active] = await db
    .update(sandboxSlots)
    .set({ state: "active", sandboxId: sandbox.id })
    .where(
      and(
        eq(sandboxSlots.leaseId, leaseId),
        eq(sandboxSlots.state, "arming"),
        sql`${sandboxSlots.expiresAt} > now() + interval '2 minutes'`
      )
    )
    .returning()
  if (!active) {
    await sandbox.stop(60)
    await sandbox.archive()
    throw new UsageLimitError(
      "The sandbox took too long to start. Reconnect after this session ends."
    )
  }
  return sandbox
}

/** Never release a slot before cloud deletion succeeds. */
export async function deleteMeteredSandbox(bot: Bot) {
  const db = usageDb()
  const [current] = await db
    .select()
    .from(sandboxSlots)
    .where(
      and(eq(sandboxSlots.botId, bot.id), eq(sandboxSlots.userId, bot.userId))
    )
  let slot = current
  if (current) {
    const [claimed] = await db
      .update(sandboxSlots)
      .set({ state: "deleting" })
      .where(
        and(
          eq(sandboxSlots.botId, bot.id),
          eq(sandboxSlots.userId, bot.userId),
          sql`${sandboxSlots.state} IN ('idle', 'active', 'deleting')`
        )
      )
      .returning()
    if (!claimed)
      throw new Error(
        "The sandbox is starting or stopping. Wait a moment before deleting this bot."
      )
    slot = claimed
  }
  if (bot.sandboxId || slot) {
    try {
      const client = getDaytonaClient()
      await client.delete(
        await client.get(
          slot?.sandboxId ?? bot.sandboxId ?? botSandboxName(bot.id)
        )
      )
    } catch (error) {
      if (!(error instanceof DaytonaNotFoundError)) throw error
    }
    await db
      .delete(sandboxSlots)
      .where(
        and(eq(sandboxSlots.botId, bot.id), eq(sandboxSlots.userId, bot.userId))
      )
  }
}
