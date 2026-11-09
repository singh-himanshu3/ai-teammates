"use server"

import { auth } from "@clerk/nextjs/server"
import { auth as triggerAuth } from "@trigger.dev/sdk"
import { chat, defaultStorage } from "@trigger.dev/sdk/ai"
import { z } from "zod"

import { getChat } from "@/queries/chat"
import type { teammateChat } from "@/trigger/chat"

const chatIdSchema = z.string().min(1).max(100)
const providerSchema = z.enum(["google", "groq"])
const startSession =
  chat.createStartSessionAction<typeof teammateChat>("teammate-chat")
const loadTranscript = chat.createLoadTranscriptAction(defaultStorage)

async function authorizeChat(chatId: string) {
  await auth.protect()
  chatIdSchema.parse(chatId)
  if (!(await getChat(chatId))) throw new Error("Chat not found.")
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
  clientData: { provider: "google" | "groq" }
}) {
  await authorizeChat(chatId)
  return startSession({
    chatId,
    clientData: { provider: providerSchema.parse(clientData.provider) },
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
    messages: transcript.messages,
    cursors: transcript.cursors,
    publicAccessToken:
      transcript.messages.length > 0 || transcript.cursors?.lastOutEventId
        ? await createAccessToken(chatId)
        : undefined,
  }
}
