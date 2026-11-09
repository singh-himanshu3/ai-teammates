import "server-only"

import { auth } from "@clerk/nextjs/server"
import { and, asc, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { bots, chatMembers, chats } from "@/lib/db/schema"

export async function getChat(chatId: string) {
  const { userId } = await auth.protect()

  const firstBot = db
    .select({
      id: bots.id,
      name: bots.name,
      avatar: bots.avatar,
      job: bots.job,
      instructions: bots.instructions,
    })
    .from(chatMembers)
    .innerJoin(
      bots,
      and(eq(bots.id, chatMembers.botId), eq(bots.userId, userId))
    )
    .where(eq(chatMembers.chatId, chats.id))
    .orderBy(asc(chatMembers.joinedAt), asc(bots.id))
    .limit(1)
    .as("first_bot")

  const [chat] = await db
    .select({
      id: chats.id,
      name: chats.name,
      kind: chats.kind,
      bot: {
        id: firstBot.id,
        name: firstBot.name,
        avatar: firstBot.avatar,
        job: firstBot.job,
        instructions: firstBot.instructions,
      },
    })
    .from(chats)
    .leftJoinLateral(firstBot, sql`true`)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .limit(1)

  return chat
}
