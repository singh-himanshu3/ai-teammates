import { UserButton } from "@clerk/nextjs"
import { Suspense } from "react"

import {
  Sidebar,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function AppSidebar() {
  return (
    <Sidebar>
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
