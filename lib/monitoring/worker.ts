import * as Sentry from "@sentry/node"
import { isExpectedError, sentryOptions } from "./shared.ts"

export function initializeWorkerMonitoring(environment?: string) {
  if (Sentry.isInitialized()) return
  Sentry.init({
    ...sentryOptions,
    environment: environment?.toLowerCase() || process.env.NODE_ENV,
    // Otherwise let the bundler-injected release match the uploaded artifacts.
    release: process.env.SENTRY_RELEASE,
    initialScope: { tags: { service: "trigger" } },
    // Trigger owns its OpenTelemetry pipeline; never install a competing provider.
    enableOpenTelemetrySetup: false,
    integrations: [Sentry.openTelemetryIntegration()],
  })
}

export async function reportWorkerError(
  error: unknown,
  tags: Record<string, string>
) {
  if (isExpectedError(error)) return
  initializeWorkerMonitoring()
  // Trigger's final-failure hook supplies a serialized error rather than Error.
  let exception = error
  if (
    !(error instanceof Error) &&
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    const restored = new Error(error.message)
    if ("name" in error && typeof error.name === "string")
      restored.name = error.name
    if ("stack" in error && typeof error.stack === "string")
      restored.stack = error.stack
    exception = restored
  }
  Sentry.captureException(exception, { tags: { service: "trigger", ...tags } })
  await Sentry.flush(2000)
}
