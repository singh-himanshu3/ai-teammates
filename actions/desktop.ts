"use server"

import { auth } from "@clerk/nextjs/server"
import { z } from "zod"
import { and, eq } from "drizzle-orm"

import { getAgentContext } from "@/lib/agent/context"
import { meteredSandbox } from "@/lib/usage/sandbox"
import { usageDb } from "@/lib/usage/ledger"
import { sandboxSlots } from "@/lib/db/schema"
import { prepareDesktopPreview } from "@/lib/agent/vnc"
import { sandboxErrorMessage } from "@/lib/agent/sandbox-errors"
import { getChat } from "@/queries/chat"
import { PAID_PLAN, paidPlanFailure } from "@/lib/billing/shared"

const chatIdSchema = z.string().trim().min(1).max(100)

export async function connectChatDesktop(input: unknown) {
  const { userId, has } = await auth.protect()
  if (!has({ plan: PAID_PLAN })) return paidPlanFailure
  const parsed = chatIdSchema.safeParse(input)
  const chat = parsed.success ? await getChat(parsed.data) : undefined
  if (!chat || !parsed.success) {
    return { success: false as const, error: "This chat could not be found." }
  }
  if (chat.kind === "group") {
    return {
      success: false as const,
      error: "Desktop previews are only available in direct chats.",
    }
  }

  try {
    const { bot } = await getAgentContext(parsed.data)
    if (!bot || bot.userId !== userId) {
      return { success: false as const, error: "This chat has no bot desktop." }
    }
    const sandbox = await meteredSandbox(bot)
    const [lease] = await usageDb()
      .select()
      .from(sandboxSlots)
      .where(
        and(eq(sandboxSlots.botId, bot.id), eq(sandboxSlots.userId, userId))
      )
    const remaining = Math.floor(
      ((lease?.expiresAt?.getTime() ?? 0) - Date.now()) / 1000
    )
    if (remaining <= 0) throw new Error("The desktop session has expired.")
    const preview = await prepareDesktopPreview(sandbox, remaining)
    return {
      success: true as const,
      url: preview.url,
      expiresAt: lease.expiresAt!.toISOString(),
    }
  } catch (error) {
    console.error("Failed to connect chat desktop", error)
    return {
      success: false as const,
      error: sandboxErrorMessage(error),
    }
  }
}
