import { PricingTable } from "@clerk/nextjs"
import { auth } from "@clerk/nextjs/server"
import Link from "next/link"
import { Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

async function Pricing() {
  await auth.protect()
  return (
    <main className="mx-auto flex min-h-svh max-w-5xl flex-col gap-10 px-6 py-10">
      <header>
        <Button variant="ghost" render={<Link href="/" />}>
          Back to chats
        </Button>
      </header>
      <div className="mx-auto flex max-w-xl flex-col gap-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          One plan for your AI teammates
        </h1>
        <p className="text-muted-foreground">
          Pro unlocks bots, group chats, sandbox desktops, and persistent
          memory. Free accounts cannot create or use bots and sandboxes.
        </p>
      </div>
      <PricingTable
        for="user"
        newSubscriptionRedirectUrl="/"
        fallback={<Spinner className="mx-auto" />}
      />
    </main>
  )
}

export default function PricingPage() {
  return (
    <Suspense fallback={<Spinner className="m-auto" />}>
      <Pricing />
    </Suspense>
  )
}
