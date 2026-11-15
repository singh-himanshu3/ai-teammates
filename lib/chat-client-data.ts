import { z } from "zod"

export const chatClientDataSchema = z.object({
  provider: z.enum(["google", "groq"]),
  botId: z.string().trim().min(1).max(100).optional(),
})

export type ChatClientData = z.infer<typeof chatClientDataSchema>

export const chatSpeakerSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string(),
})

export const chatDataSchemas = {
  speaker: chatSpeakerSchema,
  recipient: chatSpeakerSchema,
}
