import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { after, test } from "node:test"
import {
  hasPaidSubscription,
  PAID_PLAN_MESSAGE,
} from "../lib/billing/shared.ts"

const now = 1_000_000
const item = {
  status: "active",
  periodStart: now - 1000,
  periodEnd: now + 1000,
  endedAt: null,
  isFreeTrial: false,
  plan: { slug: "pro", forPayerType: "user" },
}
test("only an entitled personal Pro subscription unlocks features", () => {
  assert.equal(hasPaidSubscription({ subscriptionItems: [item] }, now), true)
  assert.equal(
    hasPaidSubscription(
      { subscriptionItems: [{ ...item, status: "canceled" }] },
      now
    ),
    true
  )
  assert.equal(hasPaidSubscription({ subscriptionItems: [] }, now), false)
  for (const change of [
    { plan: { slug: "free_user", forPayerType: "user" } },
    { plan: { slug: "pro", forPayerType: "org" } },
    { plan: null },
    { status: "upcoming" },
    { status: "incomplete" },
    { status: "past_due" },
    { status: "ended" },
    { status: "expired" },
    { isFreeTrial: true },
    { periodStart: now + 100 },
    { periodEnd: now },
    { endedAt: now - 1 },
    { status: "canceled", periodEnd: null },
  ])
    assert.equal(
      hasPaidSubscription({ subscriptionItems: [{ ...item, ...change }] }, now),
      false,
      JSON.stringify(change)
    )
})

const state = { paid: false, lookedUp: [], error: null, rows: [] }
const backend = {
  billing: {
    async getUserBillingSubscription(userId) {
      state.lookedUp.push(userId)
      if (state.error) throw state.error
      return {
        subscriptionItems: state.paid
          ? [{ ...item, periodStart: 0, periodEnd: Date.now() + 10000 }]
          : [],
      }
    },
  },
}
const db = {
  select() {
    const builder = {
      from() {
        return builder
      },
      leftJoin() {
        return builder
      },
      where() {
        return builder
      },
      orderBy() {
        return Promise.resolve(state.rows)
      },
    }
    return builder
  },
}
globalThis.__billingTest = { backend, db }
const source = (value) => `data:text/javascript,${encodeURIComponent(value)}`
const mocks = {
  "@clerk/backend": source(
    "export const createClerkClient = () => globalThis.__billingTest.backend;"
  ),
  "drizzle-orm/neon-http": source(
    "export const drizzle = () => globalThis.__billingTest.db;"
  ),
  "@/lib/db/schema": new URL("../lib/db/schema.ts", import.meta.url).href,
}
const hooks = registerHooks({
  resolve(specifier, context, next) {
    return mocks[specifier]
      ? { url: mocks[specifier], shortCircuit: true }
      : next(specifier, context)
  },
})
const originalKey = process.env.CLERK_SECRET_KEY
process.env.CLERK_SECRET_KEY = "test-only-placeholder"
const { assertPaidUser } = await import("../lib/billing/server.ts")
const { getAgentContext } = await import("../lib/agent/context.ts")
after(() => {
  hooks.deregister()
  delete globalThis.__billingTest
  if (originalKey === undefined) delete process.env.CLERK_SECRET_KEY
  else process.env.CLERK_SECRET_KEY = originalKey
})

test("worker verifies subscription against the database owner before permitting a bot", async () => {
  state.rows = [
    {
      kind: "group",
      userId: "database-owner",
      bot: {
        id: "bot-one",
        userId: "database-owner",
        name: "Ada",
        avatar: "ada",
        job: "Code",
        instructions: null,
        sandboxId: "sandbox-one",
      },
    },
  ]
  state.paid = false
  await assert.rejects(getAgentContext("chat-one", "bot-one"), {
    message: PAID_PLAN_MESSAGE,
  })
  assert.equal(state.lookedUp.at(-1), "database-owner")
  state.paid = true
  assert.equal((await getAgentContext("chat-one", "bot-one")).bot.id, "bot-one")
  // Revocation is checked again on the next turn/tool lookup, with no positive cache.
  state.paid = false
  await assert.rejects(getAgentContext("chat-one", "bot-one"), {
    message: PAID_PLAN_MESSAGE,
  })
})

test("missing, unavailable, and unconfigured billing fails closed", async () => {
  state.error = { status: 404 }
  await assert.rejects(assertPaidUser("owner"), { message: PAID_PLAN_MESSAGE })
  state.error = new Error("network unavailable")
  await assert.rejects(
    assertPaidUser("owner"),
    /Could not verify your subscription/
  )
  state.error = null
  delete process.env.CLERK_SECRET_KEY
  await assert.rejects(assertPaidUser("owner"), /not configured/)
  process.env.CLERK_SECRET_KEY = "test-only-placeholder"
})
