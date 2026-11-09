import { MonitorIcon } from "lucide-react"

import { ChatAvatar } from "@/components/chat-avatar"
import { BotDialog, type EditableBot } from "@/components/bot-dialog"
import { Button } from "@/components/ui/button"

export function ChatHeader({
  name,
  avatar,
  bot,
}: {
  name: string
  avatar: string
  bot?: EditableBot | null
}) {
  const identity = (
    <>
      <ChatAvatar seed={avatar} className="size-6" />
      <span className="truncate">{name}</span>
    </>
  )
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b bg-background px-4 text-foreground">
      <h1 className="min-w-0 text-sm font-medium">
        {bot ? (
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
      <Button type="button" variant="ghost" size="icon" aria-label="Desktop">
        <MonitorIcon />
      </Button>
    </header>
  )
}
