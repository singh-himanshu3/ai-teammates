import { DaytonaNotFoundError, type Sandbox } from "@daytona/sdk"
import { tool } from "ai"
import { z } from "zod"

import { SandboxSetupError, sandboxErrorMessage } from "./sandbox-errors.ts"

type ResolveMemorySandbox = (create: boolean) => Promise<Sandbox | null>
export type MemoryContext =
  { available: true; content: string } | { available: false; error: string }

async function withMemorySandbox<T>(
  resolve: ResolveMemorySandbox,
  create: boolean,
  signal: AbortSignal | undefined,
  operation: (sandbox: Sandbox | null) => Promise<T>
) {
  signal?.throwIfAborted()
  try {
    const sandbox = await resolve(create)
    signal?.throwIfAborted()
    if (sandbox) {
      if (["stopped", "archived", "paused"].includes(sandbox.state ?? ""))
        await sandbox.start(60)
      else if (sandbox.state !== "started") await sandbox.waitUntilStarted(60)
    }
    signal?.throwIfAborted()
    return await operation(sandbox)
  } catch (error) {
    if (signal?.aborted) signal.throwIfAborted()
    throw new SandboxSetupError(sandboxErrorMessage(error))
  }
}

export async function getBotMemory(
  resolve: ResolveMemorySandbox,
  signal?: AbortSignal
) {
  return withMemorySandbox(resolve, false, signal, async (sandbox) => {
    // A bot without a sandbox has no saved memory; reading alone need not create one.
    if (!sandbox) return { content: "" }
    try {
      const info = await sandbox.fs.getFileDetails("MEMORY.md")
      if (info.size > 100_000)
        throw new SandboxSetupError(
          "MEMORY.md is too large to load safely. Shorten the file before updating memory."
        )
      const stream = await sandbox.fs.downloadFileStream("MEMORY.md", {
        signal,
        timeout: 30,
      })
      const chunks: Buffer[] = []
      let bytes = 0
      try {
        for await (const chunk of stream) {
          signal?.throwIfAborted()
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          bytes += buffer.length
          if (bytes > 100_000)
            throw new SandboxSetupError(
              "MEMORY.md is too large to load safely. Shorten the file before updating memory."
            )
          chunks.push(buffer)
        }
      } finally {
        stream.destroy()
      }
      return { content: Buffer.concat(chunks).toString("utf8") }
    } catch (error) {
      if (error instanceof DaytonaNotFoundError) return { content: "" }
      throw error
    }
  })
}

export async function loadMemoryContext(
  resolve: ResolveMemorySandbox,
  signal?: AbortSignal
): Promise<MemoryContext> {
  try {
    return { available: true, ...(await getBotMemory(resolve, signal)) }
  } catch (error) {
    if (signal?.aborted) signal.throwIfAborted()
    return { available: false, error: sandboxErrorMessage(error) }
  }
}

export function createMemoryTools(resolve: ResolveMemorySandbox) {
  return {
    getMemory: tool({
      description:
        "Read your persistent memory shared between your own private and group chats. Returns the complete current contents of MEMORY.md. Other bots' memory is separate.",
      inputSchema: z.object({}),
      execute: (_input, { abortSignal }) => getBotMemory(resolve, abortSignal),
    }),
    setMemory: tool({
      description:
        "Save your persistent memory to MEMORY.md. Replaces the entire file: first getMemory, merge new facts or requested corrections with existing notes, and provide the full updated content. Keep it concise. Empty content clears all memory only when the user requests that.",
      inputSchema: z.object({
        content: z
          .string()
          .max(20_000)
          .describe(
            "The complete updated memory, preserving unrelated existing notes."
          ),
      }),
      execute: ({ content }, { abortSignal }) =>
        withMemorySandbox(resolve, true, abortSignal, async (sandbox) => {
          if (!sandbox)
            throw new SandboxSetupError(
              "No bot sandbox is available to save memory."
            )
          abortSignal?.throwIfAborted()
          await sandbox.fs.uploadFile(Buffer.from(content, "utf8"), "MEMORY.md")
          return { saved: true }
        }),
    }),
  }
}
