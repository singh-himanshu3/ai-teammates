import { UserButton } from "@clerk/nextjs"
import { formatDistanceToNowStrict } from "date-fns"
import Link from "next/link"
import { Suspense } from "react"

import { AppSidebarHeader } from "@/components/app-sidebar-header"
import { ChatAvatar } from "@/components/chat-avatar"
import { getUserChats } from "@/queries/bot"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export async function AppSidebar() {
  const chats = await getUserChats()
  return (
    <Sidebar>
      <AppSidebarHeader
        chats={chats.map((chat) => ({
          id: chat.id,
          name: chat.name ?? chat.botName ?? "Untitled chat",
          avatar: chat.botAvatar ?? chat.id,
          lastMessagePreview: chat.lastMessagePreview,
        }))}
      />
      <SidebarContent>
        <SidebarGroup aria-label="Your chats">
          <SidebarGroupContent>
            <SidebarMenu>
              {chats.map((chat) => (
                <SidebarMenuItem key={chat.id}>
                  <SidebarMenuButton
                    size="lg"
                    render={
                      <Link href={`/chats/${encodeURIComponent(chat.id)}`} />
                    }
                  >
                    <ChatAvatar seed={chat.botAvatar ?? chat.id} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate font-medium">
                          {chat.name ?? chat.botName ?? "Untitled chat"}
                        </span>
                        <time
                          dateTime={chat.createdAt.toISOString()}
                          title={chat.createdAt.toISOString()}
                          className="ml-auto shrink-0 text-xs text-muted-foreground"
                        >
                          {formatDistanceToNowStrict(chat.createdAt)}
                        </time>
                      </span>
                      {chat.lastMessagePreview && (
                        <span className="truncate text-xs text-muted-foreground">
                          {chat.lastMessagePreview}
                        </span>
                      )}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="mt-auto">
        <Suspense fallback={null}>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton render={<div />} className="p-0">
                <UserButton
                  showName
                  appearance={{
                    elements: {
                      rootBox: "w-full! min-w-0!",
                      userButtonTrigger:
                        "h-8! w-full! rounded-md! border-0! px-2! py-1! text-sidebar-foreground! shadow-none! outline-hidden! hover:bg-sidebar-accent! hover:text-sidebar-accent-foreground! focus-visible:ring-2! focus-visible:ring-sidebar-ring!",
                      userButtonBox:
                        "w-full! min-w-0! flex-row-reverse! justify-end! gap-2!",
                      userButtonAvatarBox: "size-6! shrink-0!",
                      userButtonOuterIdentifier:
                        "truncate! p-0! text-sm! font-normal! text-inherit! group-data-[collapsible=icon]:hidden!",
                    },
                  }}
                />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </Suspense>
      </SidebarFooter>
    </Sidebar>
  )
}
