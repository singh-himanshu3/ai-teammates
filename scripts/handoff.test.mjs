import assert from "node:assert/strict"
import test from "node:test"
import { Readable } from "node:stream"
import { generateText, stepCountIs, validateUIMessages } from "ai"
import { MockLanguageModelV4 } from "ai/test"

import {
  completeHandoff,
  computerBotId,
  createHandoffTool,
} from "../lib/agent/handoff.ts"
import { buildAgentInstructions } from "../lib/agent/instructions.ts"
import { createComputerTools } from "../lib/agent/computer-tools.ts"
import { chatSpeakerSchema } from "../lib/chat-client-data.ts"

const members = [
  {
    id: "writer",
    name: "Ada",
    avatar: "ada",
    job: "Writing",
    instructions: "Use concise prose.",
    sandboxId: "writer-desktop",
  },
  {
    id: "coder",
    name: "Linus",
    avatar: "linus",
    job: "Programming",
    instructions: "Check the code.",
    sandboxId: "coder-desktop",
  },
]
const options = { toolCallId: "handoff-1", messages: [] }
const context = async (id) => ({
  kind: "group",
  members,
  bot: members.find((bot) => bot.id === id) ?? null,
})
const initial = () => ({ activeBotId: "writer", visited: ["writer"] })

test("handoff waits until the next step and switches computer operations to the receiving bot", async () => {
  const state = initial()
  const handoff = createHandoffTool(
    () => context(state.activeBotId),
    () => state
  )
  const output = await handoff.execute(
    { botId: "coder", reason: "This needs programming." },
    options
  )
  assert.equal(output.name, "Linus")
  assert.equal(state.activeBotId, "writer")
  assert.throws(() => computerBotId(state), /handoff is pending/)
  const next = await completeHandoff(state, context)
  assert.equal(next.bot.id, "coder")
  assert.equal(computerBotId(state), "coder")
  assert.deepEqual(state.visited, ["writer", "coder"])
  assert.equal(await completeHandoff(state, context), null)
})

test("handoff rejects direct chats, foreign bots, self, cycles, duplicate requests, and excessive chains", async () => {
  for (const { state = initial(), kind = "group", botId, pattern } of [
    { kind: "direct", botId: "coder", pattern: /only available in group/ },
    { botId: "foreign", pattern: /member roster/ },
    { botId: "writer", pattern: /already handled/ },
    {
      state: { activeBotId: "coder", visited: ["writer", "coder"] },
      botId: "writer",
      pattern: /already handled/,
    },
    {
      state: { ...initial(), pendingBotId: "coder" },
      botId: "coder",
      pattern: /already pending/,
    },
    {
      state: { activeBotId: "writer", visited: ["writer", "a", "b", "c"] },
      botId: "coder",
      pattern: /limit/,
    },
  ]) {
    const tool = createHandoffTool(
      async () => ({ kind, members }),
      () => state
    )
    await assert.rejects(
      tool.execute({ botId, reason: "Better suited" }, options),
      pattern
    )
  }
})

test("a removed recipient and cancellation cannot commit a pending handoff", async () => {
  const state = { ...initial(), pendingBotId: "coder" }
  await assert.rejects(
    completeHandoff(state, async () => ({ kind: "group", bot: null })),
    /no longer available/
  )
  assert.equal(state.activeBotId, "writer")
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    completeHandoff(state, context, controller.signal),
    /abort/i
  )
  const tool = createHandoffTool(
    () => context("writer"),
    () => initial()
  )
  await assert.rejects(
    tool.execute(
      { botId: "coder", reason: "Code" },
      { ...options, abortSignal: controller.signal }
    ),
    /abort/i
  )
})

test("group instructions include roster, own role, handoff behavior, and sandbox boundaries", () => {
  const instructions = buildAgentInstructions(members[1], "group", members)
  for (const text of [
    "You are Linus",
    "Programming",
    "writer",
    "Writing",
    "handoff",
    "same turn",
    "own assigned Daytona sandbox",
    "coder-desktop",
    "Check the code.",
    "viewScreen",
    "showScreen",
  ])
    assert.ok(instructions.includes(text), text)
  const direct = buildAgentInstructions(members[0], "direct", members)
  assert.equal(direct.includes("handoff"), false)
  assert.equal(direct.includes("Group member roster"), false)
})

test("AI SDK continues after handoff with the receiver's identity and filesystem", async () => {
  const state = initial()
  let active = members[0]
  const reads = []
  const tools = {
    ...createComputerTools(async () => {
      const botId = computerBotId(state)
      return {
        id: botId,
        state: "started",
        fs: {
          getFileDetails: async () => ({ size: 13 }),
          downloadFileStream: async (path) => {
            reads.push({ botId, path })
            return Readable.from([Buffer.from("receiver file")])
          },
        },
      }
    }),
    handoff: createHandoffTool(
      () => context(state.activeBotId),
      () => state
    ),
  }
  const usage = { inputTokens: { total: 1 }, outputTokens: { total: 1 } }
  let calls = 0
  const model = new MockLanguageModelV4({
    doGenerate: async ({ prompt }) => {
      calls++
      const instructions = prompt
        .filter((message) => message.role === "system")
        .map((message) => message.content)
        .join("\n")
      assert.ok(
        instructions.includes(calls === 1 ? "You are Ada" : "You are Linus")
      )
      if (calls === 1)
        return {
          content: [
            {
              type: "tool-call",
              toolCallId: "transfer",
              toolName: "handoff",
              input: JSON.stringify({
                botId: "coder",
                reason: "Programming request",
              }),
            },
          ],
          finishReason: { unified: "tool-calls" },
          usage,
        }
      if (calls === 2)
        return {
          content: [
            {
              type: "tool-call",
              toolCallId: "read",
              toolName: "readFile",
              input: JSON.stringify({ path: "/workspace/code.ts" }),
            },
          ],
          finishReason: { unified: "tool-calls" },
          usage,
        }
      return {
        content: [{ type: "text", text: "Linus has reviewed the file." }],
        finishReason: { unified: "stop" },
        usage,
      }
    },
  })
  const result = await generateText({
    model,
    prompt: "Please review my code.",
    tools,
    stopWhen: stepCountIs(4),
    toolCallConcurrency: 1,
    prepareStep: async () => {
      const next = await completeHandoff(state, context)
      if (next) active = next.bot
      return { instructions: buildAgentInstructions(active, "group", members) }
    },
  })
  assert.equal(result.text, "Linus has reviewed the file.")
  assert.deepEqual(reads, [{ botId: "coder", path: "/workspace/code.ts" }])
  assert.equal(calls, 3)
})

test("handed-off transcripts validate with both speakers and the handoff tool result", async () => {
  const tool = createHandoffTool(() => context("writer"), initial)
  const messages = [
    {
      id: "reply",
      role: "assistant",
      parts: [
        { type: "data-speaker", data: members[0] },
        {
          type: "tool-handoff",
          toolCallId: "transfer",
          state: "output-available",
          input: { botId: "coder", reason: "Programming request" },
          output: {
            botId: "coder",
            name: "Linus",
            reason: "Programming request",
          },
        },
        { type: "data-speaker", data: members[1] },
        { type: "text", text: "I can help with the code." },
      ],
    },
  ]
  const validated = await validateUIMessages({
    messages,
    tools: { handoff: tool },
    dataSchemas: { speaker: chatSpeakerSchema },
  })
  assert.deepEqual(
    validated[0].parts
      .filter((part) => part.type === "data-speaker")
      .map((part) => part.data.id),
    ["writer", "coder"]
  )
})
