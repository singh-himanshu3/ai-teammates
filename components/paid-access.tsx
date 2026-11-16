"use client"

import { useAuth } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, type ReactNode } from "react"
import { toast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { PAID_PLAN, PAID_PLAN_MESSAGE } from "@/lib/billing/shared"

export function showPaidPlanToast(openPricing: () => void) {
  toast.add({
    id: "paid-plan-required",
    type: "error",
    title: "Pro plan required",
    description: PAID_PLAN_MESSAGE,
    actionProps: { children: "View pricing", onClick: openPricing },
    timeout: 8000,
  })
}

export function usePaidAccess() {
  const { isLoaded, has } = useAuth()
  const router = useRouter()
  const allowed = isLoaded && !!has?.({ plan: PAID_PLAN })
  const showUpgrade = useCallback(() => {
    showPaidPlanToast(() => router.push("/pricing"))
  }, [router])
  function guard() {
    if (allowed) return true
    if (isLoaded) showUpgrade()
    return false
  }
  return { allowed, isLoaded, guard, showUpgrade }
}

export function PaidAccess({ children }: { children: ReactNode }) {
  const { allowed, isLoaded, guard, showUpgrade } = usePaidAccess()
  useEffect(() => {
    if (isLoaded && !allowed) showUpgrade()
  }, [isLoaded, allowed, showUpgrade])
  if (!isLoaded) return <Spinner className="m-auto" />
  if (!allowed)
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <Button variant="outline" onClick={guard}>
          Unlock with Pro
        </Button>
      </div>
    )
  return children
}
