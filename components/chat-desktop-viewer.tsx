"use client"

import type RFB from "@novnc/novnc"
import { RefreshCwIcon, XIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { connectChatDesktop } from "@/actions/desktop"
import { usePaidAccess } from "@/components/paid-access"
import { isPaidPlanError } from "@/lib/billing/shared"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { allowDesktopDialogChange, createVncSession } from "@/lib/vnc-session"

function loadConnection(chatId: string) {
  return Promise.all([import("@novnc/novnc"), connectChatDesktop(chatId)])
}

type Session = ReturnType<typeof createVncSession<RFB>>

export function ChatDesktopViewer({
  chatId,
  name,
}: {
  chatId: string
  name: string
}) {
  const previewHost = useRef<HTMLDivElement>(null)
  const { showUpgrade } = usePaidAccess()
  const dialogHost = useRef<HTMLDivElement | null>(null)
  const session = useRef<Session | null>(null)
  const connection = useRef<ReturnType<typeof loadConnection> | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [status, setStatus] = useState<"loading" | "connected" | "error">(
    "loading"
  )
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  // A callback ref moves the same canvas into the portal and back before the
  // popup unmounts. React never recreates the RFB-owned subtree during this move.
  const attachDialog = useCallback((host: HTMLDivElement | null) => {
    dialogHost.current = host
    const active = session.current
    const destination = host ?? previewHost.current
    if (active && destination) active.mount(destination, host !== null)
  }, [])

  useEffect(() => {
    let cancelled = false
    let active: Session | null = null
    // Cache the request across Strict Mode's effect replay as well as layout
    // changes. Only an explicit reconnect gets another signed URL/client.
    connection.current ??= loadConnection(chatId)

    const fail = (message: string) => {
      if (cancelled) return
      setError((previous) => previous ?? message)
      setStatus("error")
    }

    void connection.current
      .then(([{ default: Client }, result]) => {
        if (cancelled) return
        if (!result.success) {
          if (isPaidPlanError(result.error)) showUpgrade()
          fail(result.error)
          return
        }
        const host = dialogHost.current ?? previewHost.current
        if (!host) return
        const target = document.createElement("div")
        target.className = "size-full overflow-hidden"
        host.appendChild(target)
        active = createVncSession(target, result.url, Client)
        session.current = active
        active.mount(host, dialogHost.current !== null)
        active.client.addEventListener("connect", () => {
          if (cancelled) return
          setStatus("connected")
        })
        active.client.addEventListener("disconnect", () => {
          fail("The desktop connection closed. Reconnect to continue.")
        })
        active.client.addEventListener("securityfailure", () => {
          fail(
            "Desktop authentication failed. Reconnect to get a fresh connection."
          )
        })
        active.client.addEventListener("credentialsrequired", () => {
          fail(
            "This desktop requires VNC credentials. Check the sandbox's VNC configuration."
          )
          active?.client.disconnect()
        })
      })
      .catch(() => {
        fail("Could not load the desktop connection. Try reconnecting.")
      })

    return () => {
      cancelled = true
      active?.disconnect()
      if (session.current === active) session.current = null
    }
  }, [chatId, attempt, showUpgrade])

  function reconnect() {
    connection.current = null
    setError(null)
    setStatus("loading")
    setAttempt((value) => value + 1)
  }

  const feedback =
    status === "loading" ? (
      <div
        className="flex items-center gap-2 p-4 text-sm text-muted-foreground"
        role="status"
      >
        <Spinner /> Connecting to desktop…
      </div>
    ) : status === "error" ? (
      <Alert variant="destructive" className="m-4 w-auto">
        <AlertDescription className="flex flex-col gap-3">
          {error}
          <Button type="button" variant="outline" size="sm" onClick={reconnect}>
            Reconnect
          </Button>
        </AlertDescription>
      </Alert>
    ) : null

  return (
    <Dialog
      open={fullscreen}
      disablePointerDismissal
      onOpenChange={(open, details) => {
        if (!allowDesktopDialogChange(open, details.reason)) {
          details.cancel()
          return
        }
        setFullscreen(open)
      }}
      onOpenChangeComplete={(open) => {
        if (open) session.current?.client.focus({ preventScroll: true })
      }}
    >
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="flex h-12 shrink-0 items-center justify-end px-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={reconnect}
            disabled={status === "loading"}
            aria-label="Refresh desktop preview"
            title="Refresh desktop preview"
          >
            <RefreshCwIcon />
          </Button>
        </div>
        <figure className="flex shrink-0 flex-col gap-3 px-3 pt-3">
          <AspectRatio
            ratio={16 / 10}
            className="overflow-hidden rounded-lg border bg-muted/30"
          >
            <div ref={previewHost} className="absolute inset-0.5" />
            {status === "connected" && !fullscreen && (
              <DialogTrigger
                className="absolute inset-0 cursor-zoom-in rounded-lg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                aria-label={`Open ${name}'s screen fullscreen to interact`}
              />
            )}
            {status === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center bg-background">
                {feedback}
              </div>
            )}
            {status === "error" && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                Desktop unavailable
              </div>
            )}
          </AspectRatio>
          <figcaption className="text-center text-xs text-muted-foreground">
            {name}&apos;s screen
          </figcaption>
        </figure>
        {status === "error" && feedback}
      </div>
      <DialogContent
        showCloseButton={false}
        initialFocus={false}
        className="flex flex-col gap-0 rounded-none p-0 data-open:animate-none data-closed:animate-none"
        style={{
          inset: 0,
          width: "100vw",
          height: "100dvh",
          maxWidth: "none",
          transform: "none",
          translate: "none",
        }}
      >
        <div className="flex h-12 shrink-0 items-center justify-between gap-4 border-b px-4">
          <DialogTitle>{name}&apos;s screen</DialogTitle>
          <DialogClose
            render={<Button type="button" variant="ghost" size="icon" />}
            aria-label="Close fullscreen desktop"
          >
            <XIcon />
          </DialogClose>
        </div>
        <DialogDescription className="sr-only">
          Interactive sandbox desktop. Keyboard and mouse input goes to the
          sandbox. Use the close button to return to the preview; Escape does
          not close this dialog.
        </DialogDescription>
        <div className="relative min-h-0 flex-1">
          <div ref={attachDialog} className="absolute inset-0" />
          {feedback && (
            <div className="absolute inset-0 bg-background">{feedback}</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
