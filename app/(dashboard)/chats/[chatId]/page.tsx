import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import { getChat } from "@/queries/chat"
import { ChatHeader } from "@/components/chat-header"
import { Chat } from "@/components/chat"
import {
  ChatDesktopHandle,
  ChatDesktopPanel,
  ChatDesktopProvider,
} from "@/components/chat-desktop"
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"

export default async function ChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>
}) {
  await auth.protect()
  const { chatId } = await params
  const chat = await getChat(chatId)

  if (!chat) notFound()

  const conversation = (
    <main className="flex h-full min-w-0 flex-col overflow-hidden bg-background text-foreground">
      <ChatHeader
        name={chat.name ?? chat.bot?.name ?? "Untitled chat"}
        avatar={chat.bot?.avatar ?? chat.id}
        bot={chat.bot}
        members={chat.members}
        isGroup={chat.kind === "group"}
      />
      <Chat
        key={chat.id}
        chatId={chat.id}
        kind={chat.kind}
        members={chat.members}
      />
    </main>
  )

  if (chat.kind === "group") return <div className="h-svh">{conversation}</div>

  return (
    <ChatDesktopProvider key={chat.id}>
      <ResizablePanelGroup
        orientation="horizontal"
        style={{ height: "100svh" }}
      >
        <ResizablePanel id="conversation" defaultSize="100%" minSize="30%">
          {conversation}
        </ResizablePanel>
        <ChatDesktopHandle />
        <ChatDesktopPanel
          chatId={chat.id}
          name={chat.bot?.name ?? chat.name ?? "Teammate"}
        />
      </ResizablePanelGroup>
    </ChatDesktopProvider>
  )
}
