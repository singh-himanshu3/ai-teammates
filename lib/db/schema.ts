import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { createInsertSchema } from "drizzle-zod"
import { nanoid } from "nanoid"
import { z } from "zod"

export const bots = pgTable(
  "bots",
  {
    id: text("id")
      .$defaultFn(() => nanoid())
      .primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    avatar: text("avatar")
      .$defaultFn(() => nanoid())
      .notNull(),
    job: text("job").notNull(),
    instructions: text("instructions"),
    sandboxId: text("sandbox_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("bots_user_id_idx").on(table.userId)]
)

export type Bot = typeof bots.$inferSelect
export type NewBot = typeof bots.$inferInsert

export const insertBotSchema = createInsertSchema(bots, {
  name: z.string().trim().min(1, "Give your bot a name.").max(100),
  avatar: z.string().trim().min(1, "Choose a face for your bot.").max(100),
  job: z.string().trim().min(1, "Give your bot a job.").max(200),
  instructions: z.string().trim().max(10000),
})

export const createBotSchema = insertBotSchema.pick({
  name: true,
  avatar: true,
  job: true,
  instructions: true,
})

export type CreateBotInput = z.infer<typeof createBotSchema>
