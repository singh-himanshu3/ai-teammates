import assert from "node:assert/strict"
import test from "node:test"

import { createGroupChatSchema } from "../lib/db/schema.ts"
import { chatClientDataSchema } from "../lib/chat-client-data.ts"
import { selectChatBot } from "../lib/agent/select-bot.ts"

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
