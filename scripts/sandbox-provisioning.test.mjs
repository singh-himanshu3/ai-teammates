import assert from "node:assert/strict"
import test from "node:test"

import {
  DaytonaConflictError,
  DaytonaNotFoundError,
  DaytonaTimeoutError,
} from "@daytona/sdk"

import { ensureBotSandbox } from "../lib/agent/sandbox.ts"

const bot = { id: "bot-one", sandboxId: null }
function fixture() {
  const sandbox = {
    id: "sandbox-one",
    labels: { app: "ai-teammates", botId: bot.id },
  }
  const calls = []
  const client = {
    get: async (id) => {
      calls.push(["get", id])
      throw new DaytonaNotFoundError("Not found")
    },
    create: async (params) => {
      calls.push(["create", params])
      return sandbox
    },
    delete: async (value) => {
      calls.push(["delete", value.id])
    },
  }
  return { sandbox, calls, client }
}

test("existing assignments are reused without creating a sandbox", async () => {
  const { sandbox, calls, client } = fixture()
  client.get = async (id) => {
    calls.push(["get", id])
    return sandbox
  }
  const result = await ensureBotSandbox(
    { ...bot, sandboxId: sandbox.id },
    client,
    async () => assert.fail("must not overwrite existing assignment")
  )
  assert.equal(result, sandbox)
  assert.deepEqual(calls, [["get", sandbox.id]])
})

test("first tool use creates one bot-specific sandbox and persists its ID", async () => {
  const { sandbox, calls, client } = fixture()
  let saved
  const result = await ensureBotSandbox(bot, client, async (id) => {
    saved = id
    return id
  })
  assert.equal(result, sandbox)
  assert.equal(saved, sandbox.id)
  assert.equal(calls[1][1].name, "teammate-bot-one")
  assert.deepEqual(calls[1][1].labels, sandbox.labels)
  assert.equal(calls[1][1].autoStopInterval, 5)
  assert.equal(calls[1][1].target, process.env.DAYTONA_TARGET || undefined)
})

test("an interrupted assignment recovers the existing named sandbox", async () => {
  const { sandbox, calls, client } = fixture()
  client.get = async () => sandbox
  await ensureBotSandbox(bot, client, async () => {
    throw new Error("database unavailable")
  }).catch(() => {})
  const result = await ensureBotSandbox(bot, client, async (id) => id)
  assert.equal(result, sandbox)
  assert.equal(calls.length, 0)
})

test("concurrent creation resolves the winner by the stable sandbox name", async () => {
  const { sandbox, client } = fixture()
  let lookups = 0
  client.get = async () => {
    if (++lookups === 1) throw new DaytonaNotFoundError("Not found")
    return sandbox
  }
  client.create = async () => {
    throw new DaytonaConflictError("Name already exists")
  }
  assert.equal(await ensureBotSandbox(bot, client, async (id) => id), sandbox)
  assert.equal(lookups, 2)
})

test("a creation timeout retains the already-created sandbox ID", async () => {
  const { sandbox, client } = fixture()
  let lookups = 0
  client.get = async (id) => {
    if (++lookups === 1) throw new DaytonaNotFoundError("Not found")
    assert.equal(id, sandbox.id)
    return sandbox
  }
  client.create = async () => {
    const error = new DaytonaTimeoutError("Starting")
    error.sandboxId = sandbox.id
    throw error
  }
  assert.equal(await ensureBotSandbox(bot, client, async (id) => id), sandbox)
})

test("name collisions cannot attach another bot's sandbox", async () => {
  const { sandbox, client } = fixture()
  sandbox.labels.botId = "other-bot"
  client.get = async () => sandbox
  await assert.rejects(
    ensureBotSandbox(bot, client, async () => assert.fail("must not claim")),
    /different bot/
  )
})

test("a bot removed during provisioning has its new sandbox cleaned up", async () => {
  const { client, calls } = fixture()
  await assert.rejects(
    ensureBotSandbox(bot, client, async () => null),
    /bot was removed/
  )
  assert.deepEqual(calls.at(-1), ["delete", "sandbox-one"])
})

test("authentication and other lookup failures never fall back to creating a sandbox", async () => {
  const { client, calls } = fixture()
  client.get = async () => {
    throw new Error("Credentials rejected")
  }
  await assert.rejects(
    ensureBotSandbox(bot, client, async (id) => id),
    /Credentials rejected/
  )
  assert.equal(calls.length, 0)
})
