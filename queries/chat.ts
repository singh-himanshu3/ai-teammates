import "server-only"

import { auth } from "@clerk/nextjs/server"
import { and, asc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { bots, chatMembers, chats } from "@/lib/db/schema"

export async function getChat(chatId: string) {
  const { userId } = await auth.protect()

  const rows = await db
    .select({
      id: chats.id,
      name: chats.name,
      kind: chats.kind,
      member: {
        id: bots.id,
        name: bots.name,
        avatar: bots.avatar,
        job: bots.job,
        instructions: bots.instructions,
      },
    })
    .from(chats)
    .leftJoin(chatMembers, eq(chatMembers.chatId, chats.id))
    .leftJoin(
      bots,
      and(eq(bots.id, chatMembers.botId), eq(bots.userId, userId))
    )
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .orderBy(asc(chatMembers.joinedAt), asc(bots.id))

  if (!rows.length) return undefined
  const { id, name, kind } = rows[0]
  const members = rows.flatMap((row) => (row.member ? [row.member] : []))
  return {
    id,
    name,
    kind,
    members,
    bot: kind === "direct" ? (members[0] ?? null) : null,
  }
}
