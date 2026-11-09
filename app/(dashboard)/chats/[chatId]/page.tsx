import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import { getChat } from "@/queries/chat"
import { ChatHeader } from "@/components/chat-header"
import { Chat } from "@/components/chat"

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
    <main className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
      <ChatHeader
        name={chat.bot?.name ?? chat.name ?? "Untitled chat"}
        avatar={chat.bot?.avatar ?? chat.id}
        bot={chat.bot}
      />
      <Chat key={chat.id} chatId={chat.id} />
    </main>
  )
}
