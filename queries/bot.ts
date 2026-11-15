import "server-only"

import { auth } from "@clerk/nextjs/server"
import { and, asc, desc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { bots, chatMembers, chats, type ChatBotProfile } from "@/lib/db/schema"

export async function getUserBots() {
  const { userId } = await auth.protect()
  return db
    .select({ id: bots.id, name: bots.name, avatar: bots.avatar })
    .from(bots)
    .where(eq(bots.userId, userId))
    .orderBy(asc(bots.name), asc(bots.id))
}

export async function getUserChats() {
  const { userId } = await auth.protect()

  const rows = await db
    .select({
      id: chats.id,
      name: chats.name,
      lastMessagePreview: chats.lastMessagePreview,
      createdAt: chats.createdAt,
      kind: chats.kind,
      member: { id: bots.id, name: bots.name, avatar: bots.avatar },
    })
    .from(chats)
    .leftJoin(chatMembers, eq(chatMembers.chatId, chats.id))
    .leftJoin(
      bots,
      and(eq(bots.id, chatMembers.botId), eq(bots.userId, userId))
    )
    .where(eq(chats.userId, userId))
    .orderBy(
      desc(chats.createdAt),
      desc(chats.id),
      asc(chatMembers.joinedAt),
      asc(bots.id)
    )

  const result = new Map<
    string,
    Omit<(typeof rows)[number], "member"> & { members: ChatBotProfile[] }
  >()
  for (const { member, ...chat } of rows) {
    let entry = result.get(chat.id)
    if (!entry) {
      entry = { ...chat, members: [] }
      result.set(chat.id, entry)
    }
    if (member) entry.members.push(member)
  }
  return [...result.values()]
}
