import { UsersIcon } from "lucide-react"

import { ChatAvatar } from "@/components/chat-avatar"
import { cn } from "@/lib/utils"
import type { ChatBotProfile } from "@/lib/db/schema"

export function GroupChatAvatar({
  members,
  className,
}: {
  members: ChatBotProfile[]
  className?: string
}) {
  const count = members.length
  const slots =
    count === 2
      ? ["left-0 top-[20%] size-[60%]", "right-0 top-[20%] size-[60%]"]
      : count === 3
        ? [
            "left-1/4 top-0 size-1/2",
            "bottom-0 left-0 size-1/2",
            "bottom-0 right-0 size-1/2",
          ]
        : [
            "left-0 top-0 size-1/2",
            "right-0 top-0 size-1/2",
            "bottom-0 left-0 size-1/2",
          ]
  return (
    <span
      className={cn(
        "relative inline-flex size-8 shrink-0 overflow-hidden",
        className
      )}
      role="img"
      aria-label={`Group with ${count} ${count === 1 ? "bot" : "bots"}`}
    >
      {count === 0 ? (
        <UsersIcon className="size-full text-muted-foreground" />
      ) : count === 1 ? (
        <ChatAvatar seed={members[0].avatar} className="size-full" />
      ) : (
        members.slice(0, 3).map((member, index) => (
          <span
            key={member.id}
            className={cn("absolute overflow-hidden", slots[index])}
            aria-hidden="true"
          >
            <ChatAvatar seed={member.avatar} className="size-full" />
          </span>
        ))
      )}
      {count > 3 && (
        <span
          className="absolute right-0 bottom-0 flex size-1/2 items-center justify-center rounded-sm bg-muted text-[8px] leading-none text-muted-foreground"
          aria-hidden="true"
        >
          +{count - 3}
        </span>
      )}
    </span>
  )
}
