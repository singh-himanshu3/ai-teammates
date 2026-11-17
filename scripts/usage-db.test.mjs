import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { test } from "node:test"
import nextEnv from "@next/env"
import { eq } from "drizzle-orm"
import {
  reserveAi,
  settleAi,
  usageDb,
  bookSandboxSession,
  allocateSandboxSlot,
} from "../lib/usage/ledger.ts"
import {
  bots,
  sandboxSlots,
  usageEntries,
  usagePeriods,
} from "../lib/db/schema.ts"

test(
  "Postgres enforces atomic budgets, duplicate protection, session races and independent resets",
  { skip: process.env.RUN_USAGE_DB_TESTS !== "1" },
  async () => {
    nextEnv.loadEnvConfig(process.cwd())
    const db = usageDb()
    const userId = `test-usage-${randomUUID()}`
    const periodId = `${userId}:first`
    const nextPeriodId = `${userId}:next`
    const botId = `test-bot-${randomUUID()}`
    try {
      await db.insert(usagePeriods).values([
        {
          id: periodId,
          userId,
          startsAt: new Date(Date.now() - 86400000),
          endsAt: new Date(Date.now() + 86400000),
          aiLimit: 1000,
          sandboxLimit: 900,
        },
        {
          id: nextPeriodId,
          userId,
          startsAt: new Date(Date.now() - 1000),
          endsAt: new Date(Date.now() + 86400000),
          aiLimit: 1000,
          sandboxLimit: 900,
        },
      ])
      const outcomes = await Promise.allSettled(
        Array.from({ length: 8 }, () =>
          reserveAi(periodId, 300, "Concurrency test")
        )
      )
      assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 3)
      assert.ok(
        outcomes
          .filter((x) => x.status === "rejected")
          .every((x) => x.reason.message.includes("Usage limit:"))
      )
      let [period] = await db
        .select()
        .from(usagePeriods)
        .where(eq(usagePeriods.id, periodId))
      assert.equal(period.aiDebited, 900)
      const entries = await db
        .select()
        .from(usageEntries)
        .where(eq(usageEntries.periodId, periodId))
      assert.equal(entries.length, 3) // failed reservations leave no ledger debris
      await Promise.all([
        settleAi(entries[0].id, 50, 100, 50),
        settleAi(entries[0].id, 50, 100, 50),
      ])
      ;[period] = await db
        .select()
        .from(usagePeriods)
        .where(eq(usagePeriods.id, periodId))
      assert.equal(period.aiDebited, 650) // refund once
      await assert.rejects(reserveAi(periodId, 300, "Duplicate", entries[1].id))
      ;[period] = await db
        .select()
        .from(usagePeriods)
        .where(eq(usagePeriods.id, periodId))
      assert.equal(period.aiDebited, 650)
      await reserveAi(nextPeriodId, 1000, "Fresh period")
      await db
        .insert(bots)
        .values({ id: botId, userId, name: "Test", job: "Test" })
      await db.insert(sandboxSlots).values({ userId, slot: 1, botId })
      const leases = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          bookSandboxSession(
            { id: botId, userId },
            periodId,
            900,
            new Date(Date.now() + 840000),
            randomUUID()
          )
        )
      )
      assert.equal(leases.filter((x) => x.status === "fulfilled").length, 1)
      ;[period] = await db
        .select()
        .from(usagePeriods)
        .where(eq(usagePeriods.id, periodId))
      assert.equal(period.sandboxSeconds, 900)
      await db
        .update(sandboxSlots)
        .set({ state: "idle" })
        .where(eq(sandboxSlots.botId, botId))
      await assert.rejects(
        bookSandboxSession(
          { id: botId, userId },
          periodId,
          900,
          new Date(Date.now() + 840000),
          randomUUID()
        ),
        /Usage limit:/
      )
      const [slot] = await db
        .select()
        .from(sandboxSlots)
        .where(eq(sandboxSlots.botId, botId))
      assert.equal(slot.state, "idle") // failed charge rolled back session claim
      await assert.rejects(
        db.insert(sandboxSlots).values({ userId, slot: 4, botId: "invalid" })
      )
      const extraBots = Array.from({ length: 4 }, () => ({
        id: `test-bot-${randomUUID()}`,
        userId,
        name: "Test",
        job: "Test",
      }))
      await db.insert(bots).values(extraBots)
      const allocations = await Promise.allSettled(
        extraBots.map(allocateSandboxSlot)
      )
      assert.equal(
        allocations.filter((result) => result.status === "fulfilled").length,
        2
      )
      assert.equal(
        (
          await db
            .select()
            .from(sandboxSlots)
            .where(eq(sandboxSlots.userId, userId))
        ).length,
        3
      )
      assert.equal((await allocateSandboxSlot({ id: botId, userId })).slot, 1)
      await assert.rejects(db.delete(bots).where(eq(bots.id, botId))) // cannot leak a resource by deleting its owner
      // Expired periods cannot start new provider calls, even with allowance left.
      await db
        .update(usagePeriods)
        .set({ endsAt: new Date(Date.now() - 1) })
        .where(eq(usagePeriods.id, periodId))
      await assert.rejects(reserveAi(periodId, 1, "Expired"), /Usage limit:/)
    } finally {
      await db.delete(sandboxSlots).where(eq(sandboxSlots.userId, userId))
      await db.delete(bots).where(eq(bots.userId, userId))
      for (const id of [periodId, nextPeriodId])
        await db.delete(usageEntries).where(eq(usageEntries.periodId, id))
      await db.delete(usagePeriods).where(eq(usagePeriods.userId, userId))
    }
  }
)
