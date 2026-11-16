"use server"

import { auth } from "@clerk/nextjs/server"
import { and, eq, inArray } from "drizzle-orm"
import { nanoid } from "nanoid"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { db } from "@/lib/db"
import { PAID_PLAN, paidPlanFailure } from "@/lib/billing/shared"
import {
  bots,
  chats,
  chatMembers,
  createGroupChatSchema,
} from "@/lib/db/schema"

export async function createGroupChat(input: unknown) {
  const { userId, has } = await auth.protect()
  if (!has({ plan: PAID_PLAN })) return paidPlanFailure
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

const groupIdSchema = z.string().trim().min(1).max(100)

export async function updateGroupChat(groupId: unknown, input: unknown) {
  const { userId, has } = await auth.protect()
  if (!has({ plan: PAID_PLAN })) return paidPlanFailure
  const parsedId = groupIdSchema.safeParse(groupId)
  const parsed = createGroupChatSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false as const,
      error: "Check the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }
  if (!parsedId.success)
    return { success: false as const, error: "This group could not be found." }

  try {
    const scope = and(
      eq(chats.id, parsedId.data),
      eq(chats.userId, userId),
      eq(chats.kind, "group")
    )
    const [group] = await db
      .select({ id: chats.id })
      .from(chats)
      .where(scope)
      .limit(1)
    if (!group)
      return {
        success: false as const,
        error: "This group could not be found.",
      }
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
    // Rename and replace membership together; direct chats cannot match scope.
    await db.batch([
      db.update(chats).set({ name: parsed.data.name }).where(scope),
      db
        .delete(chatMembers)
        .where(
          inArray(
            chatMembers.chatId,
            db.select({ id: chats.id }).from(chats).where(scope)
          )
        ),
      db
        .insert(chatMembers)
        .values(
          parsed.data.botIds.map((botId) => ({ chatId: group.id, botId }))
        ),
    ])
    revalidatePath("/", "layout")
    return { success: true as const, chatId: group.id }
  } catch (error) {
    console.error("Failed to update group chat", error)
    return {
      success: false as const,
      error: "Your group could not be updated. Please try again.",
    }
  }
}

export async function deleteGroupChat(groupId: unknown) {
  const { userId, has } = await auth.protect()
  if (!has({ plan: PAID_PLAN })) return paidPlanFailure
  const parsedId = groupIdSchema.safeParse(groupId)
  if (!parsedId.success)
    return { success: false as const, error: "This group could not be found." }
  try {
    const deleted = await db
      .delete(chats)
      .where(
        and(
          eq(chats.id, parsedId.data),
          eq(chats.userId, userId),
          eq(chats.kind, "group")
        )
      )
      .returning({ id: chats.id })
    if (!deleted.length)
      return {
        success: false as const,
        error: "This group could not be found.",
      }
    // Memberships cascade; bots, their direct chats, and their sandboxes are separate.
    revalidatePath("/", "layout")
    return { success: true as const }
  } catch (error) {
    console.error("Failed to delete group chat", error)
    return {
      success: false as const,
      error: "Your group could not be deleted. Please try again.",
    }
  }
}
