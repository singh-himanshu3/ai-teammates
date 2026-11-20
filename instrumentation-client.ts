import * as Sentry from "@sentry/nextjs"
import { sentryOptions } from "./lib/monitoring/shared"

Sentry.init({
  ...sentryOptions,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1 : 0.1,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
    Sentry.feedbackIntegration({ colorScheme: "system", autoInject: false }),
  ],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
