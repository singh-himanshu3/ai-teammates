interface VncClient {
  viewOnly: boolean
  focusOnClick: boolean
  scaleViewport: boolean
  resizeSession: boolean
  focus(options?: FocusOptions): void
  disconnect(): void
}

/** Moving the existing canvas preserves both the RFB client and its WebSocket. */
export function createVncSession<T extends VncClient>(
  target: HTMLElement,
  url: string,
  Client: new (
    target: HTMLElement,
    url: string,
    options: { shared: boolean }
  ) => T
) {
  const client = new Client(target, url, { shared: true })
  client.scaleViewport = true
  client.resizeSession = false
  client.viewOnly = true
  client.focusOnClick = false
  return {
    client,
    mount(host: HTMLElement, interactive: boolean) {
      if (target.parentElement !== host) host.appendChild(target)
      client.viewOnly = !interactive
      client.focusOnClick = interactive
    },
    disconnect() {
      client.disconnect()
      target.remove()
    },
  }
}

export function allowDesktopDialogChange(open: boolean, reason: string) {
  return open || reason === "close-press"
}
