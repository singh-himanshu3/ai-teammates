import { SignIn } from "@clerk/nextjs"
import { Suspense } from "react"

export default function SignInPage() {
  return (
    <main className="flex min-h-[calc(100svh-4rem)] items-center justify-center px-4 py-12">
      <Suspense fallback={<p role="status">Loading sign in…</p>}>
        <SignIn />
      </Suspense>
    </main>
  )
}
