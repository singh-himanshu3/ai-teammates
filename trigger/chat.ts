import { google } from "@ai-sdk/google"
import { groq } from "@ai-sdk/groq"
import { chat } from "@trigger.dev/sdk/ai"
import {
  APICallError,
  RetryError,
  stepCountIs,
  validateUIMessages,
  type UIMessage,
  type InferUITools,
} from "ai"
import { z } from "zod"

import { createComputerTools } from "@/lib/agent/computer-tools"
import { claimBotSandbox, getAgentContext } from "@/lib/agent/context"
import { ensureBotSandbox, getDaytonaClient } from "@/lib/agent/sandbox"
import { SandboxSetupError } from "@/lib/agent/sandbox-errors"
import { chatClientDataSchema, chatSpeakerSchema } from "@/lib/chat-client-data"
import {
  completeHandoff,
  computerBotId,
  createHandoffTool,
  type HandoffState,
} from "@/lib/agent/handoff"
import { buildAgentInstructions } from "@/lib/agent/instructions"

const turnState = chat.local<{ handoff: HandoffState }>({
  id: "teammate-turn-handoff",
})
type TeammateTools = ReturnType<typeof createComputerTools> & {
  handoff: ReturnType<typeof createHandoffTool>
}

export type TeammateMessage = UIMessage<
  unknown,
  { speaker: z.infer<typeof chatSpeakerSchema> },
  InferUITools<TeammateTools>
>

export const teammateChat = chat.withUIMessage<TeammateMessage>().agent({
  id: "teammate-chat",
  clientDataSchema: chatClientDataSchema,
  onBoot: () => {
    turnState.init({ handoff: { visited: [] } })
  },
  tools: ({ chatId, clientData }) => ({
    ...createComputerTools(
      async () => {
        // Re-read the association for each action; sandbox IDs never come from the model.
        const { bot } = await getAgentContext(
          chatId,
          computerBotId(turnState.handoff, clientData?.botId)
        )
        if (!bot) return null
        return ensureBotSandbox(bot, getDaytonaClient(), (sandboxId) =>
          claimBotSandbox(bot, sandboxId)
        )
      },
      { supportsImages: clientData?.provider !== "groq" }
    ),
    handoff: createHandoffTool(
      () =>
        getAgentContext(
          chatId,
          turnState.handoff.activeBotId ?? clientData?.botId
        ),
      () => turnState.handoff
    ),
  }),
  onValidateMessages: async ({ messages }) => {
    const validated = await validateUIMessages<TeammateMessage>({
      messages,
      dataSchemas: { speaker: chatSpeakerSchema },
    })
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
  run: async ({ chatId, messages, tools, clientData, signal, streamText }) => {
    const initialContext = await getAgentContext(chatId, clientData?.botId)
    const { kind } = initialContext
    let { bot, members } = initialContext
    const handoff: HandoffState = {
      activeBotId: bot?.id,
      visited: bot ? [bot.id] : [],
    }
    turnState.handoff = handoff
    const provider = clientData?.provider ?? "google"
    const apiKeys = {
      google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      groq: process.env.GROQ_API_KEY,
    }
    if (!apiKeys[provider])
      throw new Error("This AI provider is not configured yet.")

    if (kind === "group" && bot) {
      chat.response.write({
        type: "data-speaker",
        data: { id: bot.id, name: bot.name, avatar: bot.avatar },
      })
    }

    return streamText({
      model:
        provider === "google"
          ? google("gemini-3.6-flash")
          : groq("openai/gpt-oss-120b"),
      instructions: buildAgentInstructions(bot, kind, members),
      prepareStep: async ({ stepNumber }) => {
        signal.throwIfAborted()
        const next = await completeHandoff(
          handoff,
          (botId) => getAgentContext(chatId, botId),
          signal
        )
        if (next?.bot) {
          bot = next.bot
          members = next.members
          chat.response.write({
            type: "data-speaker",
            data: { id: bot.id, name: bot.name, avatar: bot.avatar },
          })
        }
        return {
          instructions: buildAgentInstructions(bot, kind, members),
          activeTools: (Object.keys(tools) as (keyof typeof tools)[]).filter(
            (name) =>
              name !== "handoff" ||
              (kind === "group" &&
                handoff.visited.length < 4 &&
                stepNumber < 19)
          ),
        }
      },
      messages,
      tools,
      toolCallConcurrency: 1,
      stopWhen: stepCountIs(20),
      abortSignal: signal,
    })
  },
  uiMessageStreamOptions: {
    onError(error) {
      console.error("Chat generation failed", error)
      if (error instanceof SandboxSetupError) return error.message
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
