import type { NextConfig } from "next"
import { withSentryConfig } from "@sentry/nextjs/config"

const nextConfig: NextConfig = {
  devIndicators: false,
  // Public browser bundle versions are pinned alongside the billing SDKs.
  env: {
    NEXT_PUBLIC_CLERK_JS_VERSION: "6.42.3",
    NEXT_PUBLIC_CLERK_UI_VERSION: "1.42.4",
    NEXT_PUBLIC_SENTRY_ENVIRONMENT:
      process.env.RAILWAY_ENVIRONMENT_NAME ||
      process.env.NODE_ENV ||
      "development",
    NEXT_PUBLIC_SENTRY_RELEASE:
      process.env.SENTRY_RELEASE || process.env.RAILWAY_GIT_COMMIT_SHA || "",
  },
}

export default withSentryConfig(nextConfig, {
  org: "ai-teammates",
  project: "ai-teammates",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  release: {
    name: process.env.SENTRY_RELEASE || process.env.RAILWAY_GIT_COMMIT_SHA,
  },
})
