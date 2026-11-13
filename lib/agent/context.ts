import { and, asc, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/neon-http"

import { bots, chatMembers, chats } from "@/lib/db/schema"

export async function getAgentContext(chatId: string) {
  const db = drizzle(process.env.DATABASE_URL!)
  const [conversation] = await db
    .select({
      bot: {
        name: bots.name,
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
    .limit(1)

  if (!conversation) throw new Error("Chat not found.")
  return conversation
}
