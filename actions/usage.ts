"use server"

import { auth } from "@clerk/nextjs/server"
import { desc, eq } from "drizzle-orm"
import { currentUsagePeriod, usageDb } from "@/lib/usage/ledger"
import { sandboxSlots, usageEntries } from "@/lib/db/schema"
import { PaidPlanRequiredError } from "@/lib/billing/shared"

export async function loadUsage() {
  const { userId } = await auth.protect()
  try {
    const period = await currentUsagePeriod(userId)
    const db = usageDb()
    const [entries, slots] = await Promise.all([
      db
        .select()
        .from(usageEntries)
        .where(eq(usageEntries.periodId, period.id))
        .orderBy(desc(usageEntries.createdAt))
        .limit(20),
      db
        .select({ slot: sandboxSlots.slot })
        .from(sandboxSlots)
        .where(eq(sandboxSlots.userId, userId)),
    ])
    return {
      paid: true as const,
      startsAt: period.startsAt.toISOString(),
      endsAt: period.endsAt.toISOString(),
      aiLimit: period.aiLimit,
      aiDebited: period.aiDebited,
      sandboxLimit: period.sandboxLimit,
      sandboxSeconds: period.sandboxSeconds,
      sandboxes: slots.length,
      entries: entries.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
    }
  } catch (error) {
    if (error instanceof PaidPlanRequiredError) return { paid: false as const }
    throw error
  }
}
