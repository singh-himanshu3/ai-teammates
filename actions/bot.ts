"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import { db } from "@/lib/db"
import { bots, createBotSchema } from "@/lib/db/schema"

export async function createBot(input: unknown) {
  const { userId } = await auth.protect()
  const parsed = createBotSchema.safeParse(input)

  if (!parsed.success) {
    return {
      success: false as const,
      error: "Check the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }

  try {
    await db.insert(bots).values({ ...parsed.data, userId })
  } catch (error) {
    console.error("Failed to create bot", error)
    return {
      success: false as const,
      error: "Your bot could not be created. Please try again.",
    }
  }

  revalidatePath("/")
  return { success: true as const }
}
