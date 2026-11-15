import { and, asc, eq, isNull } from "drizzle-orm"
import { drizzle } from "drizzle-orm/neon-http"

import { bots, chatMembers, chats } from "@/lib/db/schema"
import { selectChatBot } from "./select-bot.ts"

export async function getAgentContext(chatId: string, botId?: string) {
  const db = drizzle(process.env.DATABASE_URL!)
  const rows = await db
    .select({
      kind: chats.kind,
      bot: {
        id: bots.id,
        userId: bots.userId,
        name: bots.name,
        avatar: bots.avatar,
        job: bots.job,
        instructions: bots.instructions,
        sandboxId: bots.sandboxId,
      },
    })
    .from(chats)
    .leftJoin(chatMembers, eq(chatMembers.chatId, chats.id))
    .leftJoin(
      bots,
      and(eq(bots.id, chatMembers.botId), eq(bots.userId, chats.userId))
    )
    .where(eq(chats.id, chatId))
    .orderBy(asc(chatMembers.joinedAt), asc(bots.id))

  if (!rows.length) throw new Error("Chat not found.")
  const kind = rows[0].kind
  const members = rows.flatMap((row) => (row.bot ? [row.bot] : []))
  return { kind, members, bot: selectChatBot(kind, members, botId) }
}

export async function claimBotSandbox(
  bot: { id: string; userId: string },
  sandboxId: string
) {
  const db = drizzle(process.env.DATABASE_URL!)
  const [claimed] = await db
    .update(bots)
    .set({ sandboxId })
    .where(
      and(
        eq(bots.id, bot.id),
        eq(bots.userId, bot.userId),
        isNull(bots.sandboxId)
      )
    )
    .returning({ sandboxId: bots.sandboxId })
  if (claimed) return claimed.sandboxId
  const [current] = await db
    .select({ sandboxId: bots.sandboxId })
    .from(bots)
    .where(and(eq(bots.id, bot.id), eq(bots.userId, bot.userId)))
    .limit(1)
  return current?.sandboxId ?? null
}
