import { ChatAvatar } from "@/components/chat-avatar"
import { GroupChatAvatar } from "@/components/group-chat-avatar"
import type { ChatBotProfile } from "@/lib/db/schema"
import { ChatDesktopToggle } from "@/components/chat-desktop"
import { BotDialog, type EditableBot } from "@/components/bot-dialog"
import { Button } from "@/components/ui/button"
import {
  GroupChatDialog,
  type EditableGroupChat,
} from "@/components/group-chat-dialog"

export function ChatHeader({
  name,
  avatar,
  bot,
  members = [],
  isGroup = false,
  group,
  availableBots = [],
}: {
  name: string
  avatar: string
  bot?: EditableBot | null
  members?: ChatBotProfile[]
  isGroup?: boolean
  group?: EditableGroupChat
  availableBots?: ChatBotProfile[]
}) {
  const identity = (
    <>
      {isGroup ? (
        <GroupChatAvatar members={members} className="size-6" />
      ) : (
        <ChatAvatar seed={avatar} className="size-6" />
      )}
      <span className="truncate">{name}</span>
    </>
  )
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b bg-background px-4 text-foreground">
      <h1 className="min-w-0 text-sm font-medium">
        {isGroup && group ? (
          <GroupChatDialog group={group} bots={availableBots}>
            <Button
              type="button"
              variant="ghost"
              className="max-w-full justify-start"
              aria-label={`Edit ${name}`}
            >
              {identity}
            </Button>
          </GroupChatDialog>
        ) : !isGroup && bot ? (
          <BotDialog seed={avatar} bot={bot}>
            <Button
              type="button"
              variant="ghost"
              className="max-w-full justify-start"
              aria-label={`Edit ${name}`}
            >
              {identity}
            </Button>
          </BotDialog>
        ) : (
          <span className="flex min-w-0 items-center gap-2">{identity}</span>
        )}
      </h1>
      {!isGroup && <ChatDesktopToggle />}
    </header>
  )
}
