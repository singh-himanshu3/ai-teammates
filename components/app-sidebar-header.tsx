"use client"

import { PlusIcon, SearchIcon, UsersIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react"

import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarHeader } from "@/components/ui/sidebar"
import { Kbd, KbdGroup } from "@/components/ui/kbd"

type SearchChat = {
  id: string
  name: string
  avatar: string
  lastMessagePreview: string | null
}

const subscribeToPlatform = () => () => {}
const getIsMac = () =>
  /Macintosh|Mac OS X|iPhone|iPad|iPod/i.test(navigator.userAgent)
const getServerIsMac = () => false

export function AppSidebarHeader({ chats }: { chats: SearchChat[] }) {
  const router = useRouter()
  const isMac = useSyncExternalStore(
    subscribeToPlatform,
    getIsMac,
    getServerIsMac
  )
  const [botDialogOpen, setBotDialogOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const createButtonRef = useRef<HTMLButtonElement>(null)
  const seed = useId()

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() === "k" &&
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.repeat &&
        !botDialogOpen
      ) {
        event.preventDefault()
        setSearchOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [botDialogOpen])

  return (
    <>
      <SidebarHeader>
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button ref={createButtonRef} variant="ghost" size="icon" />
              }
              aria-label="Create bot or group chat"
            >
              <PlusIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setBotDialogOpen(true)}>
                  <PlusIcon />
                  Create new bot
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <UsersIcon />
                  Create group chat
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button
          variant="ghost"
          aria-label="Search chats"
          aria-haspopup="dialog"
          aria-expanded={searchOpen}
          aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
          onClick={() => setSearchOpen(true)}
          className="h-8 w-full min-w-0 justify-start rounded-lg border border-input bg-transparent px-2.5 py-1 text-base font-normal text-muted-foreground transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 has-data-[icon=inline-start]:pl-2.5 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
        >
          <SearchIcon data-icon="inline-start" />
          Search
          <KbdGroup className="ml-auto" aria-hidden="true">
            <Kbd>{isMac ? "⌘" : "Ctrl"}</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </Button>
      </SidebarHeader>
      <CommandDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Search chats"
        description="Search your chats by name or message preview."
      >
        <Command>
          <CommandInput placeholder="Search chats..." />
          <CommandList>
            <CommandEmpty>No chats found.</CommandEmpty>
            <CommandGroup heading="Chats">
              {chats.map((chat) => (
                <CommandItem
                  key={chat.id}
                  value={chat.id}
                  keywords={[chat.name, chat.lastMessagePreview ?? ""]}
                  onSelect={() => {
                    setSearchOpen(false)
                    router.push(`/chats/${encodeURIComponent(chat.id)}`)
                  }}
                >
                  <ChatAvatar seed={chat.avatar} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate">{chat.name}</span>
                    {chat.lastMessagePreview && (
                      <span className="truncate text-xs text-muted-foreground">
                        {chat.lastMessagePreview}
                      </span>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
      <BotDialog
        seed={seed}
        open={botDialogOpen}
        onOpenChange={setBotDialogOpen}
        finalFocus={createButtonRef}
      />
    </>
  )
}
