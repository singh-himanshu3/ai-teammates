"use server"

import { auth } from "@clerk/nextjs/server"
import { z } from "zod"

import { claimBotSandbox, getAgentContext } from "@/lib/agent/context"
import { ensureBotSandbox, getDaytonaClient } from "@/lib/agent/sandbox"
import { prepareDesktopPreview } from "@/lib/agent/vnc"
import { sandboxErrorMessage } from "@/lib/agent/sandbox-errors"
import { getChat } from "@/queries/chat"

const chatIdSchema = z.string().trim().min(1).max(100)

export async function connectChatDesktop(input: unknown) {
  const { userId } = await auth.protect()
  const parsed = chatIdSchema.safeParse(input)
  if (!parsed.success || !(await getChat(parsed.data))) {
    return { success: false as const, error: "This chat could not be found." }
  }

  try {
    const { bot } = await getAgentContext(parsed.data)
    if (!bot || bot.userId !== userId) {
      return { success: false as const, error: "This chat has no bot desktop." }
    }
    const sandbox = await ensureBotSandbox(
      bot,
      getDaytonaClient(),
      (sandboxId) => claimBotSandbox(bot, sandboxId)
    )
    const preview = await prepareDesktopPreview(sandbox)
    return { success: true as const, url: preview.url }
  } catch (error) {
    console.error("Failed to connect chat desktop", error)
    return {
      success: false as const,
      error: sandboxErrorMessage(error),
    }
  }
}
