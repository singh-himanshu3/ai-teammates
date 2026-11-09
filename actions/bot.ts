"use server"

import { auth } from "@clerk/nextjs/server"
import { and, eq, inArray } from "drizzle-orm"
import { nanoid } from "nanoid"
import { revalidatePath } from "next/cache"
import { z } from "zod"

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

const botIdSchema = z.string().trim().min(1).max(100)

export async function updateBot(botId: unknown, input: unknown) {
  const { userId } = await auth.protect()
  const parsed = createBotSchema.safeParse(input)
  const parsedId = botIdSchema.safeParse(botId)

  if (!parsed.success) {
    return {
      success: false as const,
      error: "Check the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }
  if (!parsedId.success) {
    return { success: false as const, error: "This bot could not be found." }
  }

  try {
    const [updated] = await db
      .update(bots)
      .set(parsed.data)
      .where(and(eq(bots.id, parsedId.data), eq(bots.userId, userId)))
      .returning({ id: bots.id })

    if (!updated) {
      return { success: false as const, error: "This bot could not be found." }
    }
  } catch (error) {
    console.error("Failed to update bot", error)
    return {
      success: false as const,
      error: "Your bot could not be updated. Please try again.",
    }
  }

  revalidatePath("/", "layout")
  return { success: true as const }
}

export async function deleteBot(botId: unknown) {
  const { userId } = await auth.protect()
  const parsedId = botIdSchema.safeParse(botId)
  if (!parsedId.success) {
    return { success: false as const, error: "This bot could not be found." }
  }

  try {
    // Remove the bot's direct chats, but preserve shared group chats.
    // The batch is atomic; both mutations independently enforce ownership.
    const directChats = db
      .select({ id: chatMembers.chatId })
      .from(chatMembers)
      .innerJoin(bots, eq(bots.id, chatMembers.botId))
      .where(and(eq(bots.id, parsedId.data), eq(bots.userId, userId)))

    const [, deleted] = await db.batch([
      db
        .delete(chats)
        .where(
          and(
            eq(chats.userId, userId),
            eq(chats.kind, "direct"),
            inArray(chats.id, directChats)
          )
        ),
      db
        .delete(bots)
        .where(and(eq(bots.id, parsedId.data), eq(bots.userId, userId)))
        .returning({ id: bots.id }),
    ])

    if (!deleted.length) {
      return { success: false as const, error: "This bot could not be found." }
    }
  } catch (error) {
    console.error("Failed to delete bot", error)
    return {
      success: false as const,
      error: "Your bot could not be deleted. Please try again.",
    }
  }

  revalidatePath("/", "layout")
  return { success: true as const }
}
