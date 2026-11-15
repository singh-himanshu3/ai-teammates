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

  return (
    <ChatDesktopProvider key={chat.id}>
      <ResizablePanelGroup
        orientation="horizontal"
        style={{ height: "100svh" }}
      >
        <ResizablePanel id="conversation" defaultSize="100%" minSize="30%">
          <main className="flex h-full min-w-0 flex-col overflow-hidden bg-background text-foreground">
            <ChatHeader
              name={chat.bot?.name ?? chat.name ?? "Untitled chat"}
              avatar={chat.bot?.avatar ?? chat.id}
              bot={chat.bot}
            />
            <Chat key={chat.id} chatId={chat.id} />
          </main>
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
