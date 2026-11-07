import { auth } from "@clerk/nextjs/server"
import { Suspense } from "react"

async function Dashboard() {
  // Enforce access on the server before rendering any private content.
  await auth.protect()

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-12">
      <h1 className="text-2xl font-semibold">Your dashboard</h1>
      <p className="text-muted-foreground">
        You&apos;re signed in. Your teammates workspace starts here.
      </p>
    </main>
  )
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <p className="p-6" role="status">
          Loading your dashboard…
        </p>
      }
    >
      <Dashboard />
    </Suspense>
  )
}
