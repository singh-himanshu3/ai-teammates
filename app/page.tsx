import { randomUUID } from "node:crypto"
import { auth } from "@clerk/nextjs/server"
import { PlusIcon } from "lucide-react"

import { ChatAvatar } from "@/components/chat-avatar"
import { BotDialog } from "@/components/bot-dialog"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"

export default async function Page() {
  await auth.protect()
  const avatarSeed = randomUUID()

  return (
    <main className="dark flex min-h-[calc(100svh-4rem)] bg-background text-foreground">
      <Empty>
        <EmptyHeader>
          <ChatAvatar seed={avatarSeed} className="mb-4" />
          <EmptyTitle>Meet your first bot</EmptyTitle>
          <EmptyDescription>
            Every bot gets its own personality, memory, and face. Spin one up
            and start the conversation.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <BotDialog seed={avatarSeed}>
            <Button variant="secondary">
              <PlusIcon data-icon="inline-start" />
              Create a new bot
            </Button>
          </BotDialog>
        </EmptyContent>
      </Empty>
    </main>
  )
}
