import "server-only"

import { auth } from "@clerk/nextjs/server"
import { and, asc, desc, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { bots, chatMembers, chats } from "@/lib/db/schema"

export async function getUserChats() {
  const { userId } = await auth.protect()

  const firstBot = db
    .select({ name: bots.name, avatar: bots.avatar })
    .from(chatMembers)
    .innerJoin(
      bots,
      and(eq(bots.id, chatMembers.botId), eq(bots.userId, userId))
    )
    .where(eq(chatMembers.chatId, chats.id))
    .orderBy(asc(chatMembers.joinedAt), asc(bots.id))
    .limit(1)
    .as("first_bot")

  return db
    .select({
      id: chats.id,
      name: chats.name,
      lastMessagePreview: chats.lastMessagePreview,
      createdAt: chats.createdAt,
      botName: firstBot.name,
      botAvatar: firstBot.avatar,
    })
    .from(chats)
    .leftJoinLateral(firstBot, sql`true`)
    .where(eq(chats.userId, userId))
    .orderBy(desc(chats.createdAt), desc(chats.id))
}
