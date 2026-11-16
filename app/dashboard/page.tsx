import { auth } from "@clerk/nextjs/server"
import { Suspense } from "react"
import { redirect } from "next/navigation"

async function Dashboard() {
  // Enforce access on the server before rendering any private content.
  await auth.protect()

  return redirect("/")
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <p className="p-6" role="status">
          Opening your chat workspace…
        </p>
      }
    >
      <Dashboard />
    </Suspense>
  )
}
