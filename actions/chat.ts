"use server"

import { auth } from "@clerk/nextjs/server"
import { auth as triggerAuth } from "@trigger.dev/sdk"
import { chat, defaultStorage } from "@trigger.dev/sdk/ai"
import { validateUIMessages } from "ai"
import { z } from "zod"

import { getChat } from "@/queries/chat"
import { createComputerTools } from "@/lib/agent/computer-tools"
import type { teammateChat, TeammateMessage } from "@/trigger/chat"
import {
  chatClientDataSchema,
  chatDataSchemas,
  type ChatClientData,
} from "@/lib/chat-client-data"
import { selectChatBot } from "@/lib/agent/select-bot"
import { createHandoffTool } from "@/lib/agent/handoff"
import { createMemoryTools } from "@/lib/agent/memory"

const chatIdSchema = z.string().min(1).max(100)
const startSession =
  chat.createStartSessionAction<typeof teammateChat>("teammate-chat")
const loadTranscript = chat.createLoadTranscriptAction(defaultStorage)

async function authorizeChat(chatId: string) {
  await auth.protect()
  chatIdSchema.parse(chatId)
  const conversation = await getChat(chatId)
  if (!conversation) throw new Error("Chat not found.")
  return conversation
}

function createAccessToken(chatId: string) {
  return triggerAuth.createPublicToken({
    scopes: { read: { sessions: chatId }, write: { sessions: chatId } },
    expirationTime: "1h",
  })
}

export async function startChatSession({
  chatId,
  clientData,
}: {
  chatId: string
  clientData: ChatClientData
}) {
  const conversation = await authorizeChat(chatId)
  const parsed = chatClientDataSchema.parse(clientData)
  selectChatBot(conversation.kind, conversation.members, parsed.botId)
  return startSession({
    chatId,
    clientData: parsed,
  })
}

export async function mintChatAccessToken(chatId: string) {
  await authorizeChat(chatId)
  return createAccessToken(chatId)
}

export async function loadChatTranscript({ chatId }: { chatId: string }) {
  await authorizeChat(chatId)
  const transcript = await loadTranscript({ chatId })
  return {
    // Empty history is valid for a chat, but validateUIMessages requires
    // at least one message because it also validates model-generation input.
    messages:
      transcript.messages.length === 0
        ? []
        : await validateUIMessages<TeammateMessage>({
            messages: transcript.messages,
            tools: {
              ...createComputerTools(async () => null),
              ...createMemoryTools(async () => null),
              handoff: createHandoffTool(
                async () => ({ kind: "direct", members: [] }),
                () => ({ visited: [] })
              ),
            },
            dataSchemas: chatDataSchemas,
          }),
    cursors: transcript.cursors,
    publicAccessToken:
      transcript.messages.length > 0 || transcript.cursors?.lastOutEventId
        ? await createAccessToken(chatId)
        : undefined,
  }
}
