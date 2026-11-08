"use server"

import { auth } from "@clerk/nextjs/server"
import { nanoid } from "nanoid"
import { revalidatePath } from "next/cache"

import { db } from "@/lib/db"
import { bots, chatMembers, chats, createBotSchema } from "@/lib/db/schema"

export async function createBot(input: unknown) {
  const { userId } = await auth.protect()
  const parsed = createBotSchema.safeParse(input)

  if (!parsed.success) {
    return {
      success: false as const,
      error: "Check the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  try {
    const botId = nanoid()
    const chatId = nanoid()

    await db.batch([
      db.insert(bots).values({ ...parsed.data, id: botId, userId }),
      db.insert(chats).values({ id: chatId, userId, kind: "direct" }),
      db.insert(chatMembers).values({ chatId, botId }),
    ])
  } catch (error) {
    console.error("Failed to create bot", error)
    return {
      success: false as const,
      error: "Your bot could not be created. Please try again.",
    }
  }

  revalidatePath("/")
  return { success: true as const }
}
