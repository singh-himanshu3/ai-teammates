/** The transport may choose a group member, never an arbitrary bot. */
export function selectChatBot<T extends { id: string }>(
  kind: "direct" | "group",
  members: T[],
  botId?: string
): T | null {
  if (kind === "group" && !botId)
    throw new Error("Choose a bot to reply in this group.")
  if (botId) {
    const selected = members.find((bot) => bot.id === botId)
    if (!selected)
      throw new Error("The selected bot is not a member of this chat.")
    return selected
  }
  return members[0] ?? null
}
