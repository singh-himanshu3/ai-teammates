import { google } from "@ai-sdk/google"
import { groq } from "@ai-sdk/groq"
import { chat } from "@trigger.dev/sdk/ai"
import {
  APICallError,
  RetryError,
  stepCountIs,
  wrapLanguageModel,
  validateUIMessages,
  type UIMessage,
  type InferUITools,
} from "ai"
import { z } from "zod"

import { createComputerTools } from "@/lib/agent/computer-tools"
import { getAgentContext } from "@/lib/agent/context"
import { meteredSandbox } from "@/lib/usage/sandbox"
import { usageMiddleware } from "@/lib/usage/model"
import { UsageLimitError } from "@/lib/usage/policy"
import { SandboxSetupError } from "@/lib/agent/sandbox-errors"
import {
  chatClientDataSchema,
  chatSpeakerSchema,
  chatDataSchemas,
} from "@/lib/chat-client-data"
import {
  completeHandoff,
  computerBotId,
  createHandoffTool,
  type HandoffState,
} from "@/lib/agent/handoff"
import { buildAgentInstructions } from "@/lib/agent/instructions"
import { createMemoryTools, loadMemoryContext } from "@/lib/agent/memory"
import { assertPaidUser } from "@/lib/billing/server"
import { PaidPlanRequiredError } from "@/lib/billing/shared"
import { reportWorkerError } from "@/lib/monitoring/worker"

async function resolveChatSandbox(
  chatId: string,
  botId: string | undefined,
  create: boolean
) {
  const { bot } = await getAgentContext(chatId, botId)
  if (!bot || (!bot.sandboxId && !create)) return null
  return meteredSandbox(bot)
}

const turnState = chat.local<{ handoff: HandoffState }>({
  id: "teammate-turn-handoff",
})
type TeammateTools = ReturnType<typeof createComputerTools> &
  ReturnType<typeof createMemoryTools> & {
    handoff: ReturnType<typeof createHandoffTool>
  }

export type TeammateMessage = UIMessage<
  unknown,
  {
    speaker: z.infer<typeof chatSpeakerSchema>
    recipient: z.infer<typeof chatSpeakerSchema>
  },
  InferUITools<TeammateTools>
>

export const teammateChat = chat.withUIMessage<TeammateMessage>().agent({
  id: "teammate-chat",
  clientDataSchema: chatClientDataSchema,
  onTurnComplete: async ({ error }) => {
    if (error)
      await reportWorkerError(error, { task: "teammate-chat", phase: "turn" })
  },
  onBoot: () => {
    turnState.init({ handoff: { visited: [] } })
  },
  tools: ({ chatId, clientData }) => ({
    ...createComputerTools(
      async () => {
        // Re-read the association for each action; sandbox IDs never come from the model.
        return resolveChatSandbox(
          chatId,
          computerBotId(turnState.handoff, clientData?.botId),
          true
        )
      },
      { supportsImages: clientData?.provider !== "groq" }
    ),
    ...createMemoryTools((create) =>
      resolveChatSandbox(
        chatId,
        computerBotId(turnState.handoff, clientData?.botId),
        create
      )
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
      dataSchemas: chatDataSchemas,
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
      model: wrapLanguageModel({
        model:
          provider === "google"
            ? google("gemini-3.6-flash")
            : groq("openai/gpt-oss-120b"),
        middleware: usageMiddleware(initialContext.userId, provider),
      }),
      maxRetries: 0,
      instructions: buildAgentInstructions(bot, kind, members),
      prepareStep: async ({ stepNumber }) => {
        signal.throwIfAborted()
        await assertPaidUser(initialContext.userId)
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
          instructions: buildAgentInstructions(
            bot,
            kind,
            members,
            await loadMemoryContext(
              (create) =>
                resolveChatSandbox(chatId, handoff.activeBotId, create),
              signal
            )
          ),
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
      if (error instanceof PaidPlanRequiredError) return error.message
      if (error instanceof UsageLimitError) return error.message
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
