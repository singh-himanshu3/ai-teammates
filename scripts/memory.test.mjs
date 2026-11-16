import assert from "node:assert/strict"
import { Readable } from "node:stream"
import test from "node:test"
import { DaytonaNotFoundError } from "@daytona/sdk"
import { generateText, stepCountIs, validateUIMessages } from "ai"
import { MockLanguageModelV4 } from "ai/test"

import {
  createMemoryTools,
  getBotMemory,
  loadMemoryContext,
} from "../lib/agent/memory.ts"
import { buildAgentInstructions } from "../lib/agent/instructions.ts"
import { completeHandoff, createHandoffTool } from "../lib/agent/handoff.ts"

function fixture() {
  const files = new Map()
  const writes = []
  const sandbox = {
    state: "started",
    start: async () => {
      sandbox.state = "started"
    },
    fs: {
      getFileDetails: async (path) => {
        if (!files.has(path)) throw new DaytonaNotFoundError("Not found")
        return { size: files.get(path).length }
      },
      downloadFileStream: async (path) => Readable.from([files.get(path)]),
      uploadFile: async (content, path) => {
        writes.push(path)
        files.set(path, content)
      },
    },
  }
  return {
    sandbox,
    files,
    writes,
    tools: createMemoryTools(async () => sandbox),
  }
}
const execute = (tool, input = {}, abortSignal) =>
  tool.execute(tool.inputSchema.parse(input), {
    toolCallId: "memory-test",
    messages: [],
    abortSignal,
  })
const juli = {
  id: "juli",
  name: "Juli",
  job: "Assistant",
  instructions: null,
  sandboxId: "juli-sandbox",
}
const ada = { ...juli, id: "ada", name: "Ada", sandboxId: "ada-sandbox" }
const usage = { inputTokens: { total: 1 }, outputTokens: { total: 1 } }

test("reading unassigned or absent memory does not create a sandbox or overwrite files", async () => {
  const calls = []
  const tools = createMemoryTools(async (create) => {
    calls.push(create)
    return null
  })
  assert.deepEqual(
    await execute(tools.getMemory, { path: "/other-bot/MEMORY.md" }),
    { content: "" }
  )
  assert.deepEqual(calls, [false])
  const { tools: existing, writes } = fixture()
  assert.deepEqual(await execute(existing.getMemory), { content: "" })
  assert.deepEqual(writes, [])
})

test("a private-chat save reaches a fresh group turn's model without a model-selected read", async () => {
  const { tools, sandbox, files, writes } = fixture()
  await execute(tools.setMemory, {
    content: "The user's cat is named Oliver.",
    path: "/wrong-file.md",
  })
  assert.deepEqual(writes, ["MEMORY.md"])
  assert.equal(files.has("/wrong-file.md"), false)
  sandbox.state = "stopped"
  let modelCalls = 0
  const model = new MockLanguageModelV4({
    doGenerate: async ({ prompt }) => {
      modelCalls++
      const instructions = prompt.find(
        (message) => message.role === "system"
      ).content
      assert.ok(instructions.includes("Oliver"))
      assert.ok(instructions.includes("You are Juli"))
      return {
        content: [{ type: "text", text: "Your cat's name is Oliver." }],
        finishReason: { unified: "stop" },
        usage,
      }
    },
  })
  const result = await generateText({
    model,
    prompt: "Do you remember my cat's name?",
    prepareStep: async () => ({
      instructions: buildAgentInstructions(
        juli,
        "group",
        [juli, ada],
        await loadMemoryContext(async () => sandbox)
      ),
    }),
  })
  assert.equal(result.text, "Your cat's name is Oliver.")
  assert.equal(modelCalls, 1)
  assert.equal(sandbox.state, "started")
})

test("a handoff replaces the loaded memory with the receiving bot's memory", async () => {
  const first = fixture()
  const second = fixture()
  await execute(second.tools.setMemory, {
    content: "The user's cat is Oliver.",
  })
  const state = { activeBotId: "ada", visited: ["ada"] }
  const members = [ada, juli]
  const context = async (id) => ({
    kind: "group",
    bot: members.find((bot) => bot.id === id),
    members,
  })
  const handoff = createHandoffTool(
    () => context(state.activeBotId),
    () => state
  )
  let calls = 0
  const model = new MockLanguageModelV4({
    doGenerate: async ({ prompt }) => {
      calls++
      const instructions = prompt.find(
        (message) => message.role === "system"
      ).content
      if (calls === 1) {
        assert.equal(instructions.includes("Oliver"), false)
        return {
          content: [
            {
              type: "tool-call",
              toolCallId: "transfer",
              toolName: "handoff",
              input: JSON.stringify({
                botId: "juli",
                reason: "Ask Juli about your earlier conversation.",
              }),
            },
          ],
          finishReason: { unified: "tool-calls" },
          usage,
        }
      }
      assert.ok(instructions.includes("You are Juli"))
      assert.ok(instructions.includes("Oliver"))
      return {
        content: [{ type: "text", text: "I remember Oliver." }],
        finishReason: { unified: "stop" },
        usage,
      }
    },
  })
  const result = await generateText({
    model,
    prompt: "Ask Juli what my cat is named.",
    tools: { handoff },
    stopWhen: stepCountIs(3),
    prepareStep: async () => {
      await completeHandoff(state, context)
      const active = members.find((bot) => bot.id === state.activeBotId)
      const sandbox = active.id === "ada" ? first.sandbox : second.sandbox
      return {
        instructions: buildAgentInstructions(
          active,
          "group",
          members,
          await loadMemoryContext(async () => sandbox)
        ),
      }
    },
  })
  assert.equal(result.text, "I remember Oliver.")
  assert.equal(calls, 2)
})

test("unavailable memory is never represented as empty and failed writes never confirm saving", async () => {
  const { sandbox, tools, files } = fixture()
  files.set("MEMORY.md", Buffer.from("Existing fact"))
  sandbox.fs.getFileDetails = async () => {
    throw new Error("connection failed")
  }
  const memory = await loadMemoryContext(async () => sandbox)
  assert.equal(memory.available, false)
  assert.equal("content" in memory, false)
  assert.ok(
    buildAgentInstructions(juli, "group", [juli], memory).includes(
      "memory is unavailable"
    )
  )
  sandbox.fs.uploadFile = async () => {
    throw new Error("connection failed")
  }
  await assert.rejects(
    execute(tools.setMemory, { content: "replacement" }),
    /sandbox operation failed/
  )
  assert.equal(files.get("MEMORY.md").toString(), "Existing fact")
})

test("memory reads are bounded even when metadata understates file size, and cancellation prevents IO", async () => {
  const { sandbox, tools, writes } = fixture()
  sandbox.fs.getFileDetails = async () => ({ size: 1 })
  sandbox.fs.downloadFileStream = async () =>
    Readable.from([Buffer.alloc(100_001)])
  await assert.rejects(
    getBotMemory(async () => sandbox),
    /too large/
  )
  assert.equal(
    tools.setMemory.inputSchema.safeParse({ content: "x".repeat(20_001) })
      .success,
    false
  )
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    execute(tools.setMemory, { content: "" }, controller.signal),
    /abort/i
  )
  await assert.rejects(
    loadMemoryContext(
      async () => assert.fail("must not resolve"),
      controller.signal
    ),
    /abort/i
  )
  assert.deepEqual(writes, [])
})

test("memory tool results validate when loading a persisted chat", async () => {
  const { tools } = fixture()
  const messages = [
    {
      id: "memory-reply",
      role: "assistant",
      parts: [
        {
          type: "tool-getMemory",
          toolCallId: "read",
          state: "output-available",
          input: {},
          output: { content: "Cat: Oliver" },
        },
        {
          type: "tool-setMemory",
          toolCallId: "save",
          state: "output-available",
          input: { content: "Cat: Oliver" },
          output: { saved: true },
        },
      ],
    },
  ]
  assert.equal(
    (await validateUIMessages({ messages, tools }))[0].parts.length,
    2
  )
})
