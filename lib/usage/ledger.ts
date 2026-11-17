import { randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/neon-http"
import { getPaidPeriod } from "../billing/server.ts"
import { usagePeriods, usageEntries, sandboxSlots } from "../db/schema.ts"
import { USAGE_LIMITS, UsageLimitError } from "./policy.ts"

export const usageDb = () => drizzle(process.env.DATABASE_URL!)

export async function allocateSandboxSlot(bot: { id: string; userId: string }) {
  const db = usageDb()
  // Database uniqueness makes allocation safe across app/worker processes.
  for (let attempt = 0; attempt < USAGE_LIMITS.sandboxes; attempt++) {
    await db.execute(sql`
      INSERT INTO sandbox_slots (user_id, slot, bot_id)
      SELECT ${bot.userId}, n, ${bot.id} FROM generate_series(1, 3) n
      WHERE NOT EXISTS (SELECT 1 FROM sandbox_slots WHERE bot_id = ${bot.id})
        AND NOT EXISTS (SELECT 1 FROM sandbox_slots WHERE user_id = ${bot.userId} AND slot = n)
      ORDER BY n LIMIT 1 ON CONFLICT DO NOTHING
    `)
    const [slot] = await db
      .select()
      .from(sandboxSlots)
      .where(
        and(eq(sandboxSlots.botId, bot.id), eq(sandboxSlots.userId, bot.userId))
      )
    if (slot) return slot
  }
  throw new UsageLimitError(
    "You already have 3 stored sandboxes. Delete a bot with a sandbox to free a slot."
  )
}

export async function currentUsagePeriod(userId: string) {
  const period = await getPaidPeriod(userId)
  const db = usageDb()
  const id = `${userId}:${period.startsAt.getTime()}`
  await db
    .insert(usagePeriods)
    .values({
      ...period,
      id,
      aiLimit: USAGE_LIMITS.aiMicrodollars,
      sandboxLimit: USAGE_LIMITS.sandboxSeconds,
    })
    .onConflictDoNothing()
  const [row] = await db
    .select()
    .from(usagePeriods)
    .where(eq(usagePeriods.id, id))
  if (!row || row.endsAt.getTime() !== period.endsAt.getTime())
    throw new Error("The current billing period could not be verified.")
  return row
}

function constraintName(error: unknown): string {
  if (!error || typeof error !== "object") return ""
  const e = error as { constraint?: string; cause?: unknown }
  return e.constraint ?? constraintName(e.cause)
}

/** Atomic HTTP transaction: the CHECK constraint rolls back BOTH writes on exhaustion. */
export async function reserveAi(
  periodId: string,
  amount: number,
  description: string,
  id = randomUUID()
) {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error("Invalid reservation.")
  const db = usageDb()
  try {
    await db.batch([
      db.insert(usageEntries).values({
        id,
        periodId,
        resource: "ai",
        description,
        reserved: amount,
        amount,
      }),
      db
        .update(usagePeriods)
        .set({
          aiDebited: sql`CASE WHEN ${usagePeriods.endsAt} > now() THEN ${usagePeriods.aiDebited} + ${amount} ELSE -1 END`,
        })
        .where(eq(usagePeriods.id, periodId)),
    ])
  } catch (error) {
    if (constraintName(error) === "usage_ai_budget")
      throw new UsageLimitError(
        "Your remaining AI allowance cannot cover another request. Try the lower-cost model or wait for reset."
      )
    throw error
  }
  return id
}

/** Settle once, including replayed finish events. An uncertain call keeps its reservation. */
export async function settleAi(
  id: string,
  amount: number,
  input: number,
  output: number
) {
  if (![amount, input, output].every((n) => Number.isSafeInteger(n) && n >= 0))
    throw new Error("Invalid settlement.")
  await usageDb().execute(sql`
    WITH settled AS (
      UPDATE usage_entries SET amount = ${amount}, status = 'settled',
        input_tokens = ${input}, output_tokens = ${output}
      WHERE id = ${id} AND resource = 'ai' AND status = 'reserved' AND reserved >= ${amount}
      RETURNING period_id, reserved
    )
    UPDATE usage_periods p SET ai_debited = p.ai_debited - s.reserved + ${amount}
    FROM settled s WHERE p.id = s.period_id
  `)
}

export async function bookSandboxSession(
  bot: { id: string; userId: string },
  periodId: string,
  seconds: number,
  expiresAt: Date,
  leaseId: string
) {
  if (
    !Number.isSafeInteger(seconds) ||
    seconds <= 0 ||
    seconds > USAGE_LIMITS.sessionSeconds
  )
    throw new Error("Invalid sandbox session.")
  try {
    const result = await usageDb().execute(sql`
      WITH claimed AS (
        UPDATE sandbox_slots SET state = 'arming', lease_id = ${leaseId}, expires_at = ${expiresAt.toISOString()}
        WHERE bot_id = ${bot.id} AND user_id = ${bot.userId} AND state = 'idle'
          AND EXISTS (SELECT 1 FROM usage_periods WHERE id = ${periodId} AND user_id = ${bot.userId})
        RETURNING bot_id
      ), charged AS (
        UPDATE usage_periods SET sandbox_seconds = CASE WHEN ends_at > now() THEN sandbox_seconds + ${seconds} ELSE -1 END
        WHERE id = ${periodId} AND user_id = ${bot.userId} AND EXISTS (SELECT 1 FROM claimed) RETURNING id
      )
      INSERT INTO usage_entries (id, period_id, resource, description, reserved, amount, status)
      SELECT ${leaseId}, id, 'sandbox', 'Sandbox session (includes startup and stopping)', ${seconds}, ${seconds}, 'settled'
      FROM charged RETURNING id
    `)
    if (!result.rows.length)
      throw new UsageLimitError(
        "A sandbox session is already starting. Try again shortly."
      )
  } catch (error) {
    if (constraintName(error) === "usage_sandbox_budget")
      throw new UsageLimitError(
        "You have used your sandbox allowance for this subscription period."
      )
    throw error
  }
}
