import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { after, test } from "node:test"

const state = { slot: null, calls: [], sandbox: null }
const db = {
  select() {
    return {
      from() {
        return { where: async () => (state.slot ? [state.slot] : []) }
      },
    }
  },
  update() {
    return {
      set(values) {
        return {
          where() {
            const operation = Promise.resolve().then(() => {
              state.calls.push(values.state)
              return [state.slot]
            })
            operation.returning = () => operation
            return operation
          },
        }
      },
    }
  },
}
globalThis.__leaseTest = { state, db }
const source = (s) => `data:text/javascript,${encodeURIComponent(s)}`
const mocks = {
  "@trigger.dev/sdk": source(
    "export const schemaTask = x => x; export const schedules = {task: x => x};"
  ),
  "../lib/db/schema": new URL("../lib/db/schema.ts", import.meta.url).href,
  "../lib/usage/ledger": source(
    "export const usageDb = () => globalThis.__leaseTest.db"
  ),
  "../lib/agent/sandbox": source(
    "export const botSandboxName = id => id; export const getDaytonaClient = () => ({get: async () => globalThis.__leaseTest.state.sandbox});"
  ),
}
const hooks = registerHooks({
  resolve(specifier, context, next) {
    return mocks[specifier]
      ? { url: mocks[specifier], shortCircuit: true }
      : next(specifier, context)
  },
})
const { expireSandboxLease } = await import("../trigger/sandbox-lease.ts")
after(() => {
  hooks.deregister()
  delete globalThis.__leaseTest
})
function setup() {
  state.calls = []
  state.slot = {
    botId: "bot",
    leaseId: "lease",
    expiresAt: new Date(Date.now() - 1000),
    state: "active",
  }
  state.sandbox = {
    state: "started",
    async stop() {
      state.calls.push("stop")
      this.state = "stopped"
    },
    async archive() {
      state.calls.push("archive")
      this.state = "archived"
    },
  }
}
test("expired desktops stop and archive before the session can be reused", async () => {
  assert.deepEqual(expireSandboxLease.concurrency, { perKey: 1 })
  setup()
  await expireSandboxLease.run({ botId: "bot", leaseId: "lease" })
  assert.deepEqual(state.calls, ["stopping", "stop", "archive", "idle"])
})
test("cleanup failures and in-progress archival keep the session locked for retry", async () => {
  setup()
  state.sandbox.stop = async () => {
    throw new Error("Daytona outage")
  }
  await assert.rejects(
    expireSandboxLease.run({ botId: "bot", leaseId: "lease" }),
    /Daytona outage/
  )
  assert.deepEqual(state.calls, ["stopping"])
  setup()
  state.sandbox.state = "archiving"
  await assert.rejects(
    expireSandboxLease.run({ botId: "bot", leaseId: "lease" }),
    /in progress/
  )
  assert.deepEqual(state.calls, ["stopping"])
})
test("obsolete or deleted leases never stop a newer session, and early jobs cannot stop a live lease", async () => {
  setup()
  state.slot = null
  await expireSandboxLease.run({ botId: "bot", leaseId: "old" })
  assert.deepEqual(state.calls, [])
  setup()
  state.slot.state = "deleting"
  await expireSandboxLease.run({ botId: "bot", leaseId: "lease" })
  assert.deepEqual(state.calls, [])
  setup()
  state.slot.expiresAt = new Date(Date.now() + 10000)
  await assert.rejects(
    expireSandboxLease.run({ botId: "bot", leaseId: "lease" }),
    /not expired/
  )
  assert.deepEqual(state.calls, [])
})
