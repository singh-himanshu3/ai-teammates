import type { Sandbox } from "@daytona/sdk"

/** Signed links authenticate one preview port without exposing the API key. */
export function vncWebSocketUrl(previewUrl: string) {
  const url = new URL(previewUrl)
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Invalid desktop preview URL.")
  }
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = `${url.pathname.replace(/\/$/, "")}/websockify`
  return url.toString()
}

export async function prepareDesktopPreview(sandbox: Sandbox) {
  if (["stopped", "archived", "paused"].includes(sandbox.state ?? "")) {
    await sandbox.start(60)
  } else if (sandbox.state !== "started") {
    await sandbox.waitUntilStarted(60)
  }
  await sandbox.computerUse.start()
  const preview = await sandbox.getSignedPreviewUrl(6080, 3600)
  return { url: vncWebSocketUrl(preview.url) }
}
