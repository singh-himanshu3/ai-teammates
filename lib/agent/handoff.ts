import { tool } from "ai"
import { z } from "zod"

export type HandoffState = {
  activeBotId?: string
  pendingBotId?: string
  visited: string[]
}

export function computerBotId(state: HandoffState, fallback?: string) {
  if (state.pendingBotId)
    throw new Error(
      "A handoff is pending. Do not run computer tools until the receiving bot takes over."
    )
  return state.activeBotId ?? fallback
}

export async function completeHandoff<
  T extends { kind: "direct" | "group"; bot: { id: string } | null },
>(
  state: HandoffState,
  resolveContext: (botId: string) => Promise<T>,
  signal?: AbortSignal
) {
  if (!state.pendingBotId) return null
  signal?.throwIfAborted()
  const next = await resolveContext(state.pendingBotId)
  signal?.throwIfAborted()
  if (next.kind !== "group" || !next.bot || next.bot.id !== state.pendingBotId)
    throw new Error("The receiving bot is no longer available in this group.")
  state.activeBotId = next.bot.id
  state.visited.push(next.bot.id)
  state.pendingBotId = undefined
  return next
}

export function createHandoffTool(
  resolveContext: () => Promise<{
    kind: "direct" | "group"
    members: { id: string; name: string }[]
  }>,
  getState: () => HandoffState
) {
  return tool({
    description:
      "Pass this request to another bot in this group when its job is a better fit. The receiving bot will continue this turn with the shared conversation. After calling handoff, stop working on the request.",
    inputSchema: z.object({
      botId: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .describe("The receiving group member's ID from the roster."),
      reason: z
        .string()
        .trim()
        .min(1)
        .max(500)
        .describe(
          "Why this bot is better suited, including any useful context."
        ),
    }),
    execute: async ({ botId, reason }, { abortSignal }) => {
      abortSignal?.throwIfAborted()
      const { kind, members } = await resolveContext()
      abortSignal?.throwIfAborted()
      const state = getState()
      if (kind !== "group")
        throw new Error("Handoff is only available in group chats.")
      const target = members.find((member) => member.id === botId)
      if (!target)
        throw new Error("Choose a bot from this group's member roster.")
      if (state.pendingBotId)
        throw new Error(
          "A handoff is already pending. Do not call more tools this step."
        )
      if (botId === state.activeBotId || state.visited.includes(botId))
        throw new Error(
          "That bot has already handled this turn. Answer the user instead of handing back."
        )
      if (state.visited.length >= 4)
        throw new Error(
          "This turn's handoff limit has been reached. Answer the user with the available information."
        )
      state.pendingBotId = botId
      return { botId, name: target.name, reason }
    },
  })
}
