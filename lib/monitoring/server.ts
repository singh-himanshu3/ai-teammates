import * as Sentry from "@sentry/nextjs"
import { isExpectedError } from "./shared.ts"

/** Returned action failures are handled errors, so Next's error hook won't see them. */
export function reportServerError(error: unknown, operation: string) {
  if (!Sentry.isInitialized() || isExpectedError(error)) return
  Sentry.captureException(error, { tags: { service: "web", operation } })
}
