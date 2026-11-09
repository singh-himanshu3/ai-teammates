import { google } from "@ai-sdk/google"
import { groq } from "@ai-sdk/groq"
import { auth } from "@clerk/nextjs/server"
import {
  APICallError,
  RetryError,
  convertToModelMessages,
  safeValidateUIMessages,
  streamText,
} from "ai"
import { z } from "zod"

import { getChat } from "@/queries/chat"

export const maxDuration = 60

const requestSchema = z.object({
  id: z.string().min(1).max(100),
  provider: z.enum(["google", "groq"]),
  messages: z.array(z.unknown()).min(1),
})

export async function POST(request: Request) {
  await auth.protect()

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return new Response("Invalid chat request.", { status: 400 })
  }

  const { id, provider } = parsed.data
  const validated = await safeValidateUIMessages({
    messages: parsed.data.messages,
  })
  if (
    !validated.success ||
    validated.data.some((message) => message.role === "system")
  ) {
    return new Response("Invalid chat messages.", { status: 400 })
  }

  const chat = await getChat(id)
  if (!chat) return new Response("Chat not found.", { status: 404 })

  const apiKeys = {
    google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    groq: process.env.GROQ_API_KEY,
  }
  if (!apiKeys[provider]) {
    return new Response("This AI provider is not configured yet.", {
      status: 503,
    })
  }

  const models = {
    google: google("gemini-3.6-flash"),
    groq: groq("openai/gpt-oss-120b"),
  }

  const result = streamText({
    model: models[provider],
    instructions: chat.bot
      ? `You are ${chat.bot.name}. Your job is: ${chat.bot.job}.\n${chat.bot.instructions ?? ""}`
      : "You are a helpful assistant.",
    messages: await convertToModelMessages(validated.data),
    abortSignal: request.signal,
  })

  return result.toUIMessageStreamResponse({
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
  })
}
