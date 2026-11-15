import {
  Daytona,
  DaytonaConflictError,
  DaytonaNotFoundError,
  DaytonaTimeoutError,
} from "@daytona/sdk"

import { SandboxSetupError } from "./sandbox-errors.ts"

let daytona: Daytona | undefined

export function getDaytonaClient() {
  if (!process.env.DAYTONA_API_KEY) {
    throw new SandboxSetupError(
      "DAYTONA_API_KEY is not configured. Set it in both the app server and chat worker."
    )
  }
  daytona ??= new Daytona({
    apiUrl: process.env.DAYTONA_API_URL ?? process.env.DAYTONA_SERVER_URL,
  })
  return daytona
}

/** A stable name also recovers a sandbox if saving its ID was interrupted. */
export function botSandboxName(botId: string) {
  return `teammate-${botId}`
}

export async function ensureBotSandbox(
  bot: { id: string; sandboxId: string | null },
  client: Pick<Daytona, "get" | "create" | "delete">,
  claimAssignment: (sandboxId: string) => Promise<string | null>
) {
  if (bot.sandboxId) return client.get(bot.sandboxId)

  const name = botSandboxName(bot.id)
  let sandbox
  try {
    sandbox = await client.get(name)
  } catch (error) {
    if (!(error instanceof DaytonaNotFoundError)) throw error
    try {
      sandbox = await client.create({
        name,
        target: process.env.DAYTONA_TARGET || undefined,
        labels: { app: "ai-teammates", botId: bot.id },
        autoStopInterval: 5,
        ...(process.env.DAYTONA_SNAPSHOT
          ? { snapshot: process.env.DAYTONA_SNAPSHOT }
          : {}),
      })
    } catch (createError) {
      // A concurrent call may have claimed the unique name. A create timeout
      // may also leave a sandbox alive; keep its identity rather than retrying.
      if (createError instanceof DaytonaConflictError) {
        sandbox = await client.get(name)
      } else if (
        createError instanceof DaytonaTimeoutError &&
        createError.sandboxId
      ) {
        sandbox = await client.get(createError.sandboxId)
      } else {
        throw createError
      }
    }
  }

  if (
    sandbox.labels.app !== "ai-teammates" ||
    sandbox.labels.botId !== bot.id
  ) {
    throw new Error("The existing sandbox name belongs to a different bot.")
  }

  // The database callback only fills a still-empty assignment and verifies that
  // the bot still belongs to the chat owner. A deleted bot cannot retain a sandbox.
  const assignedId = await claimAssignment(sandbox.id)
  if (!assignedId) {
    await client.delete(sandbox)
    throw new Error("The bot was removed before its sandbox could be assigned.")
  }
  return assignedId === sandbox.id ? sandbox : client.get(assignedId)
}
