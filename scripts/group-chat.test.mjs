import assert from "node:assert/strict"
import test from "node:test"
import { validateUIMessages } from "ai"

import { createGroupChatSchema } from "../lib/db/schema.ts"
import {
  chatClientDataSchema,
  chatDataSchemas,
} from "../lib/chat-client-data.ts"
import { selectChatBot } from "../lib/agent/select-bot.ts"

test("shared chat schemas validate recipient badges and handoff speakers together", async () => {
  const original = { id: "one", name: "No", avatar: "no" }
  const receiving = { id: "two", name: "Ada", avatar: "ada" }
  const messages = [
    {
      id: "prompt",
      role: "user",
      parts: [
        { type: "data-recipient", data: original },
        { type: "text", text: "Can you review code?" },
      ],
    },
    {
      id: "reply",
      role: "assistant",
      parts: [
        { type: "data-speaker", data: original },
        { type: "text", text: "I'll pass this to Ada." },
        { type: "data-speaker", data: receiving },
        { type: "text", text: "Please share the code." },
      ],
    },
  ]
  await assert.rejects(
    validateUIMessages({
      messages,
      dataSchemas: { speaker: chatDataSchemas.speaker },
    }),
    /No data schema found for data part recipient/
  )
  const loaded = await validateUIMessages({
    messages: JSON.parse(JSON.stringify(messages)),
    dataSchemas: chatDataSchemas,
  })
  assert.equal(loaded[0].parts[0].data.id, "one")
  assert.equal(
    loaded[1].parts.findLast((part) => part.type === "data-speaker").data.id,
    "two"
  )
})

test("group input trims editable fields and excludes server-managed values", () => {
  assert.deepEqual(
    createGroupChatSchema.parse({
      name: "  Weekend plans  ",
      botIds: [" one ", "two"],
      id: "forged",
      userId: "other-user",
      kind: "direct",
      createdAt: new Date(),
    }),
    { name: "Weekend plans", botIds: ["one", "two"] }
  )
})

test("group input rejects empty names, excessive lengths, and invalid membership lists", () => {
  for (const name of ["   ", "a".repeat(101)]) {
    assert.equal(
      createGroupChatSchema.safeParse({ name, botIds: ["one", "two"] }).success,
      false
    )
  }
  for (const botIds of [
    [],
    ["one"],
    ["one", "one"],
    ["one", " one "],
    ["one", " "],
    ["one", "a".repeat(101)],
    Array.from({ length: 51 }, (_, i) => String(i)),
  ]) {
    assert.equal(
      createGroupChatSchema.safeParse({ name: "Group", botIds }).success,
      false
    )
  }
  assert.equal(
    createGroupChatSchema.safeParse({
      name: "a".repeat(100),
      botIds: Array.from({ length: 50 }, (_, i) => String(i)),
    }).success,
    true
  )
})

test("each turn selects only the requested group member from transport metadata", () => {
  const members = [
    { id: "one", name: "Linus" },
    { id: "two", name: "Quill" },
  ]
  for (const [botId, provider] of [
    ["one", "google"],
    ["two", "groq"],
    ["one", "google"],
  ]) {
    const metadata = chatClientDataSchema.parse({ botId, provider })
    assert.equal(
      selectChatBot("group", members, metadata.botId),
      members.find((bot) => bot.id === botId)
    )
  }
  assert.throws(() => selectChatBot("group", members), /Choose a bot/)
  assert.throws(
    () => selectChatBot("group", members, "foreign-bot"),
    /not a member/
  )
  assert.throws(() => selectChatBot("group", [], "one"), /not a member/)
  assert.equal(selectChatBot("direct", members), members[0])
  assert.equal(selectChatBot("direct", []), null)
})

test("transport metadata rejects invalid providers and bot IDs", () => {
  for (const metadata of [
    { provider: "other", botId: "one" },
    { provider: "google", botId: " " },
    { provider: "google", botId: "a".repeat(101) },
  ]) {
    assert.equal(chatClientDataSchema.safeParse(metadata).success, false)
  }
})
