import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import { getChat } from "@/queries/chat"
import { ChatHeader } from "@/components/chat-header"

export default async function ChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>
}) {
  await auth.protect()
  const { chatId } = await params
  const chat = await getChat(chatId)

  if (!chat) notFound()

  return (
    <main className="flex min-h-svh flex-col bg-background text-foreground">
      <ChatHeader
        name={chat.bot?.name ?? chat.name ?? "Untitled chat"}
        avatar={chat.bot?.avatar ?? chat.id}
        bot={chat.bot}
      />
    </main>
  )
}
