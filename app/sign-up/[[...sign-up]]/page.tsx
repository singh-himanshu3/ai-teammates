import { SignUp } from "@clerk/nextjs"
import { Suspense } from "react"

export default function SignUpPage() {
  return (
    <main className="flex min-h-[calc(100svh-4rem)] items-center justify-center px-4 py-12">
      <Suspense fallback={<p role="status">Loading sign up…</p>}>
        <SignUp />
      </Suspense>
    </main>
  )
}
