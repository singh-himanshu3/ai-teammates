import * as Sentry from "@sentry/nextjs"
import { sentryOptions } from "./lib/monitoring/shared"

Sentry.init({
  ...sentryOptions,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1 : 0.1,
})
