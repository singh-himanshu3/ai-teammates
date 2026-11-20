import type { ErrorEvent, EventHint } from "@sentry/nextjs"

// Sentry DSNs identify the event destination and are public, unlike auth tokens.
export const SENTRY_DSN =
  "https://ac50908d75176354fd558177f3887fb4@o4512464393994240.ingest.us.sentry.io/4512464427417600"

export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || SENTRY_DSN,
  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
    genAI: { inputs: false, outputs: false },
  },
  // Existing console logs can include provider responses and tool arguments.
  beforeBreadcrumb: (breadcrumb: { category?: string }) =>
    breadcrumb.category === "console" ? null : breadcrumb,
  beforeSend: (event: ErrorEvent, hint: EventHint) =>
    isExpectedError(hint.originalException) ? null : event,
}

export function isExpectedError(error: unknown) {
  const name =
    error && typeof error === "object" && "name" in error
      ? error.name
      : undefined
  return (
    name === "UsageLimitError" ||
    name === "PaidPlanRequiredError" ||
    name === "AbortError"
  )
}
