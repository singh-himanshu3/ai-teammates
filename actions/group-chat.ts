"use server"

import { auth } from "@clerk/nextjs/server"
import { and, eq, inArray } from "drizzle-orm"
import { nanoid } from "nanoid"
import { revalidatePath } from "next/cache"

import { db } from "@/lib/db"
import {
  bots,
  chats,
  chatMembers,
  createGroupChatSchema,
} from "@/lib/db/schema"

export async function createGroupChat(input: unknown) {
  const { userId } = await auth.protect()
  const parsed = createGroupChatSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false as const,
      error: "Check the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }
  try {
    const owned = await db
      .select({ id: bots.id })
      .from(bots)
      .where(and(eq(bots.userId, userId), inArray(bots.id, parsed.data.botIds)))
    if (owned.length !== parsed.data.botIds.length) {
      return {
        success: false as const,
        error: "Some selected bots are unavailable.",
        fieldErrors: { botIds: ["Choose only bots in your account."] },
      }
    }
    const id = nanoid()
    await db.batch([
      db
        .insert(chats)
        .values({ id, userId, kind: "group", name: parsed.data.name }),
      db
        .insert(chatMembers)
        .values(parsed.data.botIds.map((botId) => ({ chatId: id, botId }))),
    ])
    revalidatePath("/", "layout")
    return { success: true as const, chatId: id }
  } catch (error) {
    console.error("Failed to create group chat", error)
    return {
      success: false as const,
      error: "Your group could not be created. Please try again.",
    }
  }
}
