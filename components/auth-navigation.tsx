import { Show, UserButton } from "@clerk/nextjs"
import Link from "next/link"
import { Suspense } from "react"

export function AuthNavigation() {
  return (
    <header className="border-b">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-4 px-6"
      >
        <Link href="/" className="font-semibold">
          AI Teammates
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Suspense fallback={<span role="status">Loading account…</span>}>
            <Show when="signed-out">
              <Link
                href="/sign-in"
                className="underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="underline-offset-4 hover:underline"
              >
                Create account
              </Link>
            </Show>
            <Show when="signed-in">
              <Link
                href="/dashboard"
                className="underline-offset-4 hover:underline"
              >
                Dashboard
              </Link>
              <UserButton />
            </Show>
          </Suspense>
        </div>
      </nav>
    </header>
  )
}
