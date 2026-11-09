"use client"

import { PlusIcon, UsersIcon } from "lucide-react"
import { useId, useRef, useState } from "react"

import { BotDialog } from "@/components/bot-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarHeader } from "@/components/ui/sidebar"

export function AppSidebarHeader() {
  const [botDialogOpen, setBotDialogOpen] = useState(false)
  const createButtonRef = useRef<HTMLButtonElement>(null)
  const seed = useId()

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
      </SidebarHeader>
      <BotDialog
        seed={seed}
        open={botDialogOpen}
        onOpenChange={setBotDialogOpen}
        finalFocus={createButtonRef}
      />
    </>
  )
}
