import { google } from "@ai-sdk/google"
import { groq } from "@ai-sdk/groq"
import { chat } from "@trigger.dev/sdk/ai"
import { APICallError, RetryError, validateUIMessages } from "ai"
import { and, asc, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/neon-http"
import { z } from "zod"

import { bots, chatMembers, chats } from "@/lib/db/schema"

export const teammateChat = chat.agent({
  id: "teammate-chat",
  clientDataSchema: z.object({ provider: z.enum(["google", "groq"]) }),
  onValidateMessages: async ({ messages }) => {
    const validated = await validateUIMessages({ messages })
    if (validated.some((message) => message.role === "system")) {
      throw new Error("Invalid chat messages.")
    }
    for (const message of validated) {
      if (message.role === "user" && chat.history.findMessage(message.id)) {
        // Editing a stopped prompt also discards its partial reply.
        chat.history.rollbackTo(message.id)
      }
    }
    return validated
  },
  run: async ({ chatId, messages, clientData, signal, streamText }) => {
    const db = drizzle(process.env.DATABASE_URL!)
    const [conversation] = await db
      .select({
        bot: {
          name: bots.name,
          job: bots.job,
          instructions: bots.instructions,
        },
      })
      .from(chats)
      .leftJoin(chatMembers, eq(chatMembers.chatId, chats.id))
      .leftJoin(
        bots,
        and(eq(bots.id, chatMembers.botId), eq(bots.userId, chats.userId))
      )
      .where(eq(chats.id, chatId))
      .orderBy(asc(chatMembers.joinedAt), asc(bots.id))
      .limit(1)

    if (!conversation) throw new Error("Chat not found.")
    const { bot } = conversation
    const provider = clientData?.provider ?? "google"
    const apiKeys = {
      google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      groq: process.env.GROQ_API_KEY,
    }
    if (!apiKeys[provider])
      throw new Error("This AI provider is not configured yet.")

    return streamText({
      model:
        provider === "google"
          ? google("gemini-3.6-flash")
          : groq("openai/gpt-oss-120b"),
      instructions: bot
        ? `You are ${bot.name}. Your job is: ${bot.job}.\n${bot.instructions ?? ""}`
        : "You are a helpful assistant.",
      messages,
      abortSignal: signal,
    })
  },
  uiMessageStreamOptions: {
    onError(error) {
      console.error("Chat generation failed", error)
      const cause = RetryError.isInstance(error) ? error.lastError : error
      if (APICallError.isInstance(cause)) {
        if (cause.statusCode === 429) {
          return "This provider's quota or rate limit was exceeded. Check your plan and usage, or choose another provider."
        }
        if (cause.statusCode === 401 || cause.statusCode === 403) {
          return "This provider rejected the API key or model access. Check its credentials and permissions."
        }
        if (cause.statusCode === 404) {
          return "This model is unavailable for your account. Choose another provider."
        }
      }
      return "Could not generate a reply. Please try again."
    },
  },
})
