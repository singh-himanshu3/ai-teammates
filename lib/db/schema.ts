import { relations, sql } from "drizzle-orm"
import {
  index,
  check,
  integer,
  uniqueIndex,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
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

export const chatKind = pgEnum("chat_kind", ["direct", "group"])

export const chats = pgTable(
  "chats",
  {
    id: text("id")
      .$defaultFn(() => nanoid())
      .primaryKey(),
    userId: text("user_id").notNull(),
    kind: chatKind("kind").default("direct").notNull(),
    name: text("name"),
    lastMessagePreview: text("last_message_preview"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("chats_user_id_idx").on(table.userId)]
)

export const chatMembers = pgTable(
  "chat_members",
  {
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    botId: text("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.chatId, table.botId] }),
    index("chat_members_bot_id_idx").on(table.botId),
  ]
)

export const botsRelations = relations(bots, ({ many }) => ({
  memberships: many(chatMembers),
}))

export const chatsRelations = relations(chats, ({ many }) => ({
  members: many(chatMembers),
}))

export const chatMembersRelations = relations(chatMembers, ({ one }) => ({
  chat: one(chats, {
    fields: [chatMembers.chatId],
    references: [chats.id],
  }),
  bot: one(bots, {
    fields: [chatMembers.botId],
    references: [bots.id],
  }),
}))

export type Chat = typeof chats.$inferSelect
export type NewChat = typeof chats.$inferInsert
export type ChatMember = typeof chatMembers.$inferSelect
export type NewChatMember = typeof chatMembers.$inferInsert

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

export const createGroupChatSchema = createInsertSchema(chats, {
  name: z.string().trim().min(1, "Give the group a name.").max(100),
})
  .pick({ name: true })
  .extend({
    botIds: z
      .array(z.string().trim().min(1).max(100))
      .min(2, "Choose at least two bots.")
      .max(50, "Choose up to 50 bots.")
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Choose each bot only once."
      ),
  })

export type CreateGroupChatInput = z.infer<typeof createGroupChatSchema>
export type ChatBotProfile = Pick<Bot, "id" | "name" | "avatar">

// Integer microdollars and seconds; never use floating point account balances.
export const usagePeriods = pgTable(
  "usage_periods",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    aiLimit: integer("ai_limit").notNull(),
    sandboxLimit: integer("sandbox_limit").notNull(),
    aiDebited: integer("ai_debited").default(0).notNull(),
    sandboxSeconds: integer("sandbox_seconds").default(0).notNull(),
  },
  (t) => [
    uniqueIndex("usage_user_period_idx").on(t.userId, t.startsAt),
    check(
      "usage_ai_budget",
      sql`${t.aiDebited} >= 0 AND ${t.aiDebited} <= ${t.aiLimit}`
    ),
    check(
      "usage_sandbox_budget",
      sql`${t.sandboxSeconds} >= 0 AND ${t.sandboxSeconds} <= ${t.sandboxLimit}`
    ),
  ]
)

export const usageEntries = pgTable(
  "usage_entries",
  {
    id: text("id").primaryKey(),
    periodId: text("period_id")
      .notNull()
      .references(() => usagePeriods.id),
    resource: text("resource").notNull(),
    description: text("description").notNull(),
    reserved: integer("reserved").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").default("reserved").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("usage_entries_period_idx").on(t.periodId)]
)

// Cloud deletion must succeed and release the slot before deleting its bot.
export const sandboxSlots = pgTable(
  "sandbox_slots",
  {
    userId: text("user_id").notNull(),
    slot: integer("slot").notNull(),
    botId: text("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "restrict" }),
    sandboxId: text("sandbox_id"),
    leaseId: text("lease_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    state: text("state").default("idle").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.slot] }),
    uniqueIndex("sandbox_slots_bot_idx").on(t.botId),
    check("sandbox_slot_limit", sql`${t.slot} BETWEEN 1 AND 3`),
  ]
)
