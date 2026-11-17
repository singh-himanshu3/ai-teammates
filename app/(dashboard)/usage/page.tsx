import { Suspense } from "react"
import { loadUsage } from "@/actions/usage"
import { UsageOverview } from "@/components/usage-overview"
import { Spinner } from "@/components/ui/spinner"

async function UsageContent() {
  return <UsageOverview initial={await loadUsage()} />
}

export default function UsagePage() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6 md:p-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Usage</h1>
        <p className="text-sm text-muted-foreground">
          Your Pro allowance for this subscription period.
        </p>
      </div>
      <Suspense fallback={<Spinner aria-label="Loading usage" />}>
        <UsageContent />
      </Suspense>
    </main>
  )
}
