import type { Sandbox } from "@daytona/sdk"
import { tool } from "ai"
import { z } from "zod"

import { SandboxSetupError, sandboxErrorMessage } from "./sandbox-errors.ts"

const pathSchema = z.string().min(1).max(4096)
const coordinate = z.number().int().min(0).max(32767)
const position = { x: coordinate, y: coordinate }
const modifiers = z.array(z.enum(["ctrl", "alt", "shift", "cmd"])).max(4)
const maxOutputLength = 50000

/** Sandbox IDs come from the authenticated chat's database relationship. */
export function createComputerTools(
  resolveSandbox: () => Promise<Sandbox | null>,
  { supportsImages = true } = {}
) {
  const desktopReady = new Set<string>()

  async function perform<T>(
    operation: (sandbox: Sandbox) => Promise<T>,
    signal?: AbortSignal,
    desktop = false
  ): Promise<T> {
    signal?.throwIfAborted()
    try {
      const sandbox = await resolveSandbox()
      if (!sandbox) {
        throw new SandboxSetupError(
          "This bot has no sandbox assigned. Assign a Daytona sandbox before using computer tools."
        )
      }
      signal?.throwIfAborted()
      if (["stopped", "archived", "paused"].includes(sandbox.state ?? "")) {
        desktopReady.delete(sandbox.id)
        await sandbox.start(60)
      } else if (sandbox.state !== "started") {
        desktopReady.delete(sandbox.id)
        await sandbox.waitUntilStarted(60)
      }
      signal?.throwIfAborted()
      if (desktop && !desktopReady.has(sandbox.id)) {
        await sandbox.computerUse.start()
        desktopReady.add(sandbox.id)
      }
      signal?.throwIfAborted()
      return await operation(sandbox)
    } catch (error) {
      if (signal?.aborted) signal.throwIfAborted()
      if (error instanceof SandboxSetupError) throw error
      console.error("Sandbox operation failed", error)
      throw new SandboxSetupError(sandboxErrorMessage(error))
    }
  }

  async function capture(signal?: AbortSignal) {
    return perform(
      async (sandbox) => {
        // Keep full resolution so desktop coordinates match the image. Bound the
        // encoded result below Trigger's 1 MiB per-record streaming limit.
        for (const quality of [75, 45, 25]) {
          signal?.throwIfAborted()
          const screenshot =
            await sandbox.computerUse.screenshot.takeCompressed({
              format: "jpeg",
              quality,
              showCursor: true,
            })
          if (!screenshot.screenshot) throw new Error("Empty screenshot")
          const base64 = screenshot.screenshot.replace(
            /^data:image\/[^;]+;base64,/,
            ""
          )
          if (base64.length <= 700000) {
            return { base64, mediaType: "image/jpeg" as const }
          }
        }
        throw new SandboxSetupError(
          "The screenshot is too large to send. Reduce the sandbox desktop resolution before retrying."
        )
      },
      signal,
      true
    )
  }

  function screenshotModelOutput({
    output,
  }: {
    output: { base64: string; mediaType: "image/jpeg" }
  }) {
    return supportsImages
      ? {
          type: "content" as const,
          value: [
            {
              type: "file" as const,
              mediaType: output.mediaType,
              data: { type: "data" as const, data: output.base64 },
            },
          ],
        }
      : {
          type: "text" as const,
          value:
            "Screenshot captured for display. This model cannot inspect images; ask the user to select Gemini for visual tasks.",
        }
  }

  return {
    bash: tool({
      description:
        "Run a Bash command inside the bot's assigned Daytona sandbox. Never runs on the application server. Commands have a bounded timeout; inspect exitCode before claiming success.",
      inputSchema: z.object({
        command: z.string().min(1).max(20000),
        cwd: pathSchema.optional(),
        timeout: z.number().int().min(1).max(120).default(30),
      }),
      execute: ({ command, cwd, timeout }, { abortSignal }) =>
        perform(async (sandbox) => {
          // Quote the entire script as a single Bash argument, including literal apostrophes.
          const script = `bash -lc '${command.replaceAll("'", "'\\''")}'`
          const result = await sandbox.process.executeCommand(
            script,
            cwd,
            undefined,
            timeout
          )
          return {
            exitCode: result.exitCode,
            output: result.result.slice(0, maxOutputLength),
            truncated: result.result.length > maxOutputLength,
          }
        }, abortSignal),
    }),
    readFile: tool({
      description:
        "Read a UTF-8 text file in the sandbox, up to 1 MB. Large returned text is truncated. Use bash for targeted reads of larger files.",
      inputSchema: z.object({ path: pathSchema }),
      execute: ({ path }, { abortSignal }) =>
        perform(async (sandbox) => {
          const info = await sandbox.fs.getFileDetails(path)
          if (info.size > 1_000_000)
            throw new SandboxSetupError(
              "This file exceeds 1 MB. Use bash to read a specific portion."
            )
          const stream = await sandbox.fs.downloadFileStream(path, {
            signal: abortSignal,
            timeout: 30,
          })
          const chunks: Buffer[] = []
          let bytes = 0
          try {
            for await (const chunk of stream) {
              abortSignal?.throwIfAborted()
              const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
              bytes += buffer.length
              if (bytes > 1_000_000) {
                throw new SandboxSetupError(
                  "This file exceeds 1 MB. Use bash to read a specific portion."
                )
              }
              chunks.push(buffer)
            }
          } finally {
            stream.destroy()
          }
          const content = Buffer.concat(chunks).toString("utf8")
          return {
            path,
            content: content.slice(0, maxOutputLength),
            truncated: content.length > maxOutputLength,
          }
        }, abortSignal),
    }),
    writeFiles: tool({
      description:
        "Write up to five UTF-8 files in the sandbox, replacing existing contents, with up to 20,000 characters per file. Parent directories must already exist; create them with bash if needed. Split larger writes across calls.",
      inputSchema: z.object({
        files: z
          .array(z.object({ path: pathSchema, content: z.string().max(20000) }))
          .min(1)
          .max(5),
      }),
      execute: ({ files }, { abortSignal }) =>
        perform(async (sandbox) => {
          const written: string[] = []
          for (const file of files) {
            abortSignal?.throwIfAborted()
            await sandbox.fs.uploadFile(
              Buffer.from(file.content, "utf8"),
              file.path
            )
            written.push(file.path)
          }
          return { written }
        }, abortSignal),
    }),
    listFiles: tool({
      description:
        "List a directory in the sandbox. Returns at most 500 entries.",
      inputSchema: z.object({ path: pathSchema }),
      execute: ({ path }, { abortSignal }) =>
        perform(async (sandbox) => {
          const files = await sandbox.fs.listFiles(path)
          return {
            files: files.slice(0, 500).map(({ name, isDir, size }) => ({
              name,
              isDirectory: isDir,
              size,
            })),
            truncated: files.length > 500,
          }
        }, abortSignal),
    }),
    mouseClick: tool({
      description:
        "Click a position on the sandbox desktop. Use coordinates from a recent viewScreen screenshot.",
      inputSchema: z.object({
        ...position,
        button: z.enum(["left", "right", "middle"]).default("left"),
        clicks: z.number().int().min(1).max(3).default(1),
        modifiers: modifiers.default([]),
      }),
      execute: ({ x, y, button, clicks, modifiers }, { abortSignal }) =>
        perform(
          async (sandbox) => {
            await sandbox.computerUse.mouse.click(
              x,
              y,
              button,
              false,
              clicks,
              modifiers
            )
            return { clicked: true, x, y }
          },
          abortSignal,
          true
        ),
    }),
    mouseMove: tool({
      description: "Move the pointer to a position on the sandbox desktop.",
      inputSchema: z.object(position),
      execute: ({ x, y }, { abortSignal }) =>
        perform(
          async (sandbox) => {
            await sandbox.computerUse.mouse.move(x, y)
            return { moved: true, x, y }
          },
          abortSignal,
          true
        ),
    }),
    mouseScroll: tool({
      description: "Scroll at a position on the sandbox desktop.",
      inputSchema: z.object({
        ...position,
        direction: z.enum(["up", "down", "left", "right"]),
        amount: z.number().int().min(1).max(100).default(3),
      }),
      execute: ({ x, y, direction, amount }, { abortSignal }) =>
        perform(
          async (sandbox) => {
            await sandbox.computerUse.mouse.scroll(x, y, direction, amount)
            return { scrolled: true }
          },
          abortSignal,
          true
        ),
    }),
    keyboardType: tool({
      description: "Type literal text into the focused desktop application.",
      inputSchema: z.object({ text: z.string().min(1).max(20000) }),
      execute: ({ text }, { abortSignal }) =>
        perform(
          async (sandbox) => {
            await sandbox.computerUse.keyboard.type(text)
            return { typed: true }
          },
          abortSignal,
          true
        ),
    }),
    keyboardPress: tool({
      description:
        "Press a key with optional modifiers. Examples: enter; key c with modifiers [ctrl]; key tab with modifiers [alt].",
      inputSchema: z.object({
        key: z.string().min(1).max(50),
        modifiers: modifiers.default([]),
      }),
      execute: ({ key, modifiers }, { abortSignal }) =>
        perform(
          async (sandbox) => {
            await sandbox.computerUse.keyboard.press(key, modifiers)
            return { pressed: true }
          },
          abortSignal,
          true
        ),
    }),
    viewScreen: tool({
      description:
        "Inspect the current desktop screenshot privately to decide the next action. This observation is never rendered in the chat. Use showScreen only when the user requests a screenshot.",
      inputSchema: z.object({}),
      execute: (_, { abortSignal }) => {
        if (!supportsImages)
          throw new SandboxSetupError(
            "This model cannot inspect screenshots. Ask the user to select Gemini for visual tasks."
          )
        return capture(abortSignal)
      },
      toModelOutput: ({ output }) => screenshotModelOutput({ output }),
    }),
    showScreen: tool({
      description:
        "Capture and display the current sandbox desktop screenshot in chat when the user asks to see the screen. For private observations, use viewScreen.",
      inputSchema: z.object({}),
      execute: (_, { abortSignal }) => capture(abortSignal),
      toModelOutput: ({ output }) => screenshotModelOutput({ output }),
    }),
  }
}
