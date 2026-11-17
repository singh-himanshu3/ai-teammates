import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { after, test } from "node:test"
import { aiCost, modelRate, USAGE_LIMITS } from "../lib/usage/policy.ts"

const state = { calls: [], reservations: [], settlements: [] }
globalThis.__usageTest = state
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier === "./ledger.ts" &&
      context.parentURL?.endsWith("/usage/model.ts")
    )
      return {
        shortCircuit: true,
        url: `data:text/javascript,${encodeURIComponent(`
        export async function currentUsagePeriod() { return {id: "period"} }
        export async function reserveAi(...args) { globalThis.__usageTest.calls.push("reserve"); globalThis.__usageTest.reservations.push(args); return "reservation" }
        export async function settleAi(...args) { globalThis.__usageTest.settlements.push(args) }
      `)}`,
      }
    return next(specifier, context)
  },
})
const { usageMiddleware } = await import("../lib/usage/model.ts")
after(() => {
  hooks.deregister()
  delete globalThis.__usageTest
})

test("published model prices use integer microdollars, including the scheduled Gemini price change", () => {
  assert.equal(
    aiCost(modelRate("google", Date.UTC(2026, 10, 16)), 1_000_000, 1_000_000),
    4_500_000
  )
  assert.equal(
    aiCost(modelRate("google", Date.UTC(2027, 0, 1)), 1_000_000, 1_000_000),
    9_000_000
  )
  assert.equal(aiCost(modelRate("groq"), 1_000_000, 1_000_000), 750_000)
  assert.equal(aiCost(modelRate("groq"), 1, 0), 1)
  assert.throws(() => aiCost(modelRate("groq"), -1, 2))
})

function reset() {
  state.calls = []
  state.reservations = []
  state.settlements = []
}
async function run(chunks, error) {
  const middleware = usageMiddleware("owner", "groq")
  const result = await middleware.wrapStream({
    doStream: async () => {
      state.calls.push("provider")
      if (error) throw error
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk)
            controller.close()
          },
        }),
      }
    },
  })
  const reader = result.stream.getReader()
  while (!(await reader.read()).done) {}
}
test("each provider call reserves before IO and settles reported input plus reasoning-inclusive output", async () => {
  reset()
  await run([
    {
      type: "finish",
      usage: { inputTokens: { total: 1000 }, outputTokens: { total: 200 } },
    },
  ])
  assert.deepEqual(state.calls, ["reserve", "provider"])
  assert.equal(
    state.reservations[0][1],
    aiCost(modelRate("groq"), 131072, 4096)
  )
  assert.deepEqual(state.settlements, [["reservation", 270, 1000, 200]])
  const params = await usageMiddleware("owner", "google").transformParams({
    params: { maxOutputTokens: 999999 },
  })
  assert.equal(params.maxOutputTokens, USAGE_LIMITS.maxOutputTokens)
})
test("provider errors, aborted streams and absent final usage never refund potentially billed calls", async () => {
  for (const chunks of [
    [],
    [{ type: "finish", usage: { inputTokens: {}, outputTokens: {} } }],
  ]) {
    reset()
    await run(chunks)
    assert.equal(state.settlements.length, 0)
  }
  reset()
  await assert.rejects(run([], new Error("Connection lost")), /Connection lost/)
  assert.equal(state.reservations.length, 1)
  assert.equal(state.settlements.length, 0)
})
test("out-of-envelope provider usage fails closed and retains the reservation", async () => {
  reset()
  await assert.rejects(
    run([
      {
        type: "finish",
        usage: {
          inputTokens: { total: 2_000_000 },
          outputTokens: { total: 4096 },
        },
      },
    ]),
    /reserved maximum/
  )
  assert.equal(state.settlements.length, 0)
})
