"use client"

import { MonitorIcon } from "lucide-react"
import { createContext, useContext, useId, useRef, useState } from "react"
import type { ReactNode } from "react"
import { usePanelRef } from "react-resizable-panels"

import { Button } from "@/components/ui/button"
import { ResizableHandle, ResizablePanel } from "@/components/ui/resizable"
import { ChatDesktopViewer } from "@/components/chat-desktop-viewer"
import { PaidAccess, usePaidAccess } from "@/components/paid-access"

function useDesktopState() {
  const panelRef = usePanelRef()
  const panelId = useId()
  const lastSize = useRef(35)
  const [isOpen, setIsOpen] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)

  function toggle() {
    const panel = panelRef.current
    if (!panel) return
    if (panel.isCollapsed()) panel.resize(`${lastSize.current}%`)
    else panel.collapse()
  }

  function onResize(size: { asPercentage: number }) {
    const open = size.asPercentage > 0
    if (open) {
      lastSize.current = size.asPercentage
      setHasOpened(true)
    }
    setIsOpen(open)
  }

  return { panelRef, panelId, isOpen, hasOpened, toggle, onResize }
}

const DesktopContext = createContext<ReturnType<typeof useDesktopState> | null>(
  null
)

function useDesktop() {
  const desktop = useContext(DesktopContext)
  if (!desktop) throw new Error("Desktop controls require ChatDesktopProvider.")
  return desktop
}

export function ChatDesktopProvider({ children }: { children: ReactNode }) {
  const desktop = useDesktopState()
  return <DesktopContext value={desktop}>{children}</DesktopContext>
}

export function ChatDesktopToggle() {
  const { panelId, isOpen, toggle } = useDesktop()
  const { guard } = usePaidAccess()
  return (
    <Button
      type="button"
      variant={isOpen ? "secondary" : "ghost"}
      size="icon"
      aria-label={isOpen ? "Close desktop panel" : "Open desktop panel"}
      aria-expanded={isOpen}
      aria-controls={panelId}
      onClick={() => {
        if (isOpen || guard()) toggle()
      }}
    >
      <MonitorIcon />
    </Button>
  )
}

export function ChatDesktopHandle() {
  const { isOpen } = useDesktop()
  return (
    <ResizableHandle
      disabled={!isOpen}
      className={isOpen ? undefined : "hidden"}
      aria-label="Resize desktop panel"
    />
  )
}

export function ChatDesktopPanel({
  chatId,
  name,
}: {
  chatId: string
  name: string
}) {
  const { panelRef, panelId, onResize, hasOpened } = useDesktop()
  return (
    <ResizablePanel
      id={panelId}
      panelRef={panelRef}
      defaultSize="0%"
      minSize="20%"
      maxSize="70%"
      collapsedSize="0%"
      collapsible
      onResize={onResize}
      role="region"
      aria-label="Desktop panel"
    >
      {hasOpened && (
        <PaidAccess>
          <ChatDesktopViewer chatId={chatId} name={name} />
        </PaidAccess>
      )}
    </ResizablePanel>
  )
}
