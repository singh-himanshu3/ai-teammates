import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { after, test } from "node:test"
import { drizzle } from "drizzle-orm/neon-http"

// Exercise the real actions and SQL builders with mocked request auth and DB IO.
const state = {
  rows: [],
  queries: [],
  batches: 0,
  revalidated: [],
  authenticated: true,
  paid: true,
}
const client = {
  query(sql, params) {
    state.queries.push({ sql, params })
    return Promise.resolve({ rows: state.rows.shift() ?? [] })
  },
  transaction(queries) {
    state.batches++
    return Promise.all(queries)
  },
}
globalThis.__groupActionTest = { state, db: drizzle({ client }) }
const source = (text) => `data:text/javascript,${encodeURIComponent(text)}`
const mocks = {
  "@/lib/monitoring/server": source("export function reportServerError() {}"),
  "@clerk/nextjs/server": source(
    'export const auth = { protect: async () => { if (!globalThis.__groupActionTest.state.authenticated) throw new Error("Unauthorized"); return { userId: "owner-one", has: ({ plan }) => plan === "user:pro" && globalThis.__groupActionTest.state.paid }; } };'
  ),
  "next/cache": source(
    "export const revalidatePath = (...args) => globalThis.__groupActionTest.state.revalidated.push(args);"
  ),
  "@/lib/db": source("export const db = globalThis.__groupActionTest.db;"),
  "@/lib/db/schema": new URL("../lib/db/schema.ts", import.meta.url).href,
  "@/lib/billing/shared": new URL("../lib/billing/shared.ts", import.meta.url)
    .href,
  "@/queries/chat": source(
    'export async function getChat() { throw new Error("Must not load a chat for free users"); }'
  ),
  "@/lib/agent/context": source(
    'export async function getAgentContext() { throw new Error("Must not resolve a sandbox for free users"); } export async function claimBotSandbox() { throw new Error("Must not assign a sandbox for free users"); }'
  ),
  "@/lib/agent/sandbox": source(
    'export function getDaytonaClient() { throw new Error("Must not connect Daytona for free users"); } export function ensureBotSandbox() { throw new Error("Must not provision a sandbox for free users"); }'
  ),
  "@/lib/usage/sandbox": source(
    'export async function meteredSandbox() { throw new Error("Must not provision for free users"); } export async function deleteMeteredSandbox() { throw new Error("Must not delete resources for free users"); }'
  ),
  "@/lib/usage/ledger": source(
    'export function usageDb() { throw new Error("Must not read usage for free users"); }'
  ),
  ...Object.fromEntries(
    [
      "computer-tools",
      "memory",
      "handoff",
      "select-bot",
      "vnc",
      "sandbox-errors",
    ].map((name) => [
      `@/lib/agent/${name}`,
      new URL(`../lib/agent/${name}.ts`, import.meta.url).href,
    ])
  ),
  "@/lib/chat-client-data": new URL(
    "../lib/chat-client-data.ts",
    import.meta.url
  ).href,
}
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return mocks[specifier]
      ? { url: mocks[specifier], shortCircuit: true }
      : nextResolve(specifier, context)
  },
})
const { updateGroupChat, deleteGroupChat } =
  await import("../actions/group-chat.ts")
const { createGroupChat } = await import("../actions/group-chat.ts")
const { createBot, updateBot, deleteBot } = await import("../actions/bot.ts")
const { connectChatDesktop } = await import("../actions/desktop.ts")
const { startChatSession, mintChatAccessToken, loadChatTranscript } =
  await import("../actions/chat.ts")
after(() => {
  hooks.deregister()
  delete globalThis.__groupActionTest
})
function reset(rows = []) {
  Object.assign(state, {
    rows,
    queries: [],
    batches: 0,
    revalidated: [],
    authenticated: true,
    paid: true,
  })
}
const input = { name: "  Weekend plans  ", botIds: ["bot-one", "bot-two"] }

test("free users cannot create, modify, or delete bots or group chats", async () => {
  reset()
  state.paid = false
  for (const action of [
    () => createBot({}),
    () => updateBot("bot-one", {}),
    () => deleteBot("bot-one"),
    () => createGroupChat(input),
    () => updateGroupChat("group-one", input),
    () => deleteGroupChat("group-one"),
  ]) {
    const result = await action()
    assert.equal(result.success, false)
    assert.equal(result.code, "PAID_PLAN_REQUIRED")
  }
  assert.equal(state.queries.length, 0)
  assert.equal(state.batches, 0)
})

test("free users cannot start sessions, obtain transport tokens, load transcripts, or connect desktops", async () => {
  reset()
  state.paid = false
  assert.equal(
    (await connectChatDesktop("chat-one")).code,
    "PAID_PLAN_REQUIRED"
  )
  for (const action of [
    () =>
      startChatSession({
        chatId: "chat-one",
        clientData: { provider: "google" },
      }),
    () => mintChatAccessToken("chat-one"),
    () => loadChatTranscript({ chatId: "chat-one" }),
  ])
    await assert.rejects(action(), /Upgrade to Pro/)
  assert.equal(state.queries.length, 0)
})

test("group mutations require authentication before database access", async () => {
  reset()
  state.authenticated = false
  await assert.rejects(updateGroupChat("group-one", input), /Unauthorized/)
  await assert.rejects(deleteGroupChat("group-one"), /Unauthorized/)
  assert.equal(state.queries.length, 0)
})

test("invalid editable fields and group IDs cannot mutate groups", async () => {
  reset()
  const invalid = await updateGroupChat("group-one", { ...input, name: " " })
  assert.equal(invalid.success, false)
  assert.ok(invalid.fieldErrors.name.length)
  assert.equal((await updateGroupChat("", input)).success, false)
  assert.equal((await deleteGroupChat(" ")).success, false)
  assert.equal(state.queries.length, 0)
})

test("foreign or direct chats cannot be edited and foreign bots cannot be added", async () => {
  reset([[]])
  assert.equal((await updateGroupChat("foreign-chat", input)).success, false)
  assert.deepEqual(state.queries[0].params, [
    "foreign-chat",
    "owner-one",
    "group",
    1,
  ])
  assert.equal(state.batches, 0)
  reset([[["group-one"]], [["bot-one"]]])
  const unavailable = await updateGroupChat("group-one", input)
  assert.equal(unavailable.success, false)
  assert.ok(unavailable.fieldErrors.botIds.length)
  assert.equal(state.batches, 0)
})

test("editing atomically renames the owned group and replaces its membership", async () => {
  reset([[["group-one"]], [["bot-one"], ["bot-two"]], [], [], []])
  const result = await updateGroupChat("group-one", {
    ...input,
    id: "foreign",
    userId: "other",
    kind: "direct",
  })
  assert.equal(result.success, true)
  assert.equal(result.chatId, "group-one")
  assert.equal(state.batches, 1)
  const writes = state.queries.slice(2)
  assert.equal(writes.length, 3)
  assert.match(writes[0].sql, /^update "chats"/)
  assert.deepEqual(writes[0].params, [
    "Weekend plans",
    "group-one",
    "owner-one",
    "group",
  ])
  assert.match(writes[1].sql, /^delete from "chat_members"/)
  assert.deepEqual(writes[1].params, ["group-one", "owner-one", "group"])
  assert.match(writes[2].sql, /^insert into "chat_members"/)
  assert.deepEqual(writes[2].params, [
    "group-one",
    "bot-one",
    "group-one",
    "bot-two",
  ])
  assert.deepEqual(state.revalidated, [["/", "layout"]])
})

test("deletion is scoped to the owner's group and does not delete bots or direct chats", async () => {
  reset([[["group-one"]]])
  assert.equal((await deleteGroupChat("group-one")).success, true)
  assert.equal(state.queries.length, 1)
  assert.match(state.queries[0].sql, /^delete from "chats"/)
  assert.deepEqual(state.queries[0].params, ["group-one", "owner-one", "group"])
  reset([[]])
  assert.equal((await deleteGroupChat("foreign-chat")).success, false)
  assert.deepEqual(state.revalidated, [])
})
