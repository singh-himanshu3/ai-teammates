import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  devIndicators: false,
  // Public browser bundle versions are pinned alongside the billing SDKs.
  env: {
    NEXT_PUBLIC_CLERK_JS_VERSION: "6.42.3",
    NEXT_PUBLIC_CLERK_UI_VERSION: "1.42.4",
  },
}

export default nextConfig
