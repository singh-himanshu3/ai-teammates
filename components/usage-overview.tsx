"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { loadUsage } from "@/actions/usage"
import { USAGE_LIMITS } from "@/lib/usage/policy"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"

const money = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 3,
  }).format(amount / 1_000_000)
const hours = (seconds: number) => `${(seconds / 3600).toFixed(2)} h`

export function UsageOverview({
  initial,
}: {
  initial: Awaited<ReturnType<typeof loadUsage>>
}) {
  const [usage, setUsage] = useState(initial)
  const [now, setNow] = useState<number>()
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const refresh = setInterval(() => {
      if (document.visibilityState !== "visible") return
      void loadUsage()
        .then((result) => {
          if (active) {
            setUsage(result)
            setError(false)
          }
        })
        .catch(() => {
          if (active) setError(true)
        })
    }, 30000)
    return () => {
      active = false
      clearInterval(tick)
      clearInterval(refresh)
    }
  }, [])
  if (!usage.paid)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pro includes your monthly usage</CardTitle>
          <CardDescription>
            $5 in AI usage, 20 sandbox hours, and up to 3 stored sandboxes per
            subscription period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/pricing" />}>View plans</Button>
        </CardContent>
      </Card>
    )
  const seconds =
    now === undefined
      ? undefined
      : Math.max(0, Math.ceil((Date.parse(usage.endsAt) - now) / 1000))
  const countdown =
    seconds === undefined
      ? "Calculating…"
      : seconds === 0
        ? "Checking renewal…"
        : `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Current period</CardTitle>
          <CardDescription>
            {new Date(usage.startsAt).toLocaleDateString("en-US", {
              timeZone: "UTC",
            })}{" "}
            –{" "}
            {new Date(usage.endsAt).toLocaleDateString("en-US", {
              timeZone: "UTC",
            })}{" "}
            (UTC)
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">
            Time until reset
          </span>
          <span className="text-xl font-medium tabular-nums">{countdown}</span>
        </CardContent>
      </Card>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            Usage could not be refreshed. Displayed balances may be out of date.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Meter
          title="AI allowance"
          value={usage.aiDebited}
          limit={usage.aiLimit}
          label={`${money(usage.aiDebited)} / ${money(usage.aiLimit)}`}
          description="Includes reservations for calls in progress or calls whose final usage is unknown."
        />
        <Meter
          title="Sandbox runtime"
          value={usage.sandboxSeconds}
          limit={usage.sandboxLimit}
          label={`${hours(usage.sandboxSeconds)} / ${hours(usage.sandboxLimit)}`}
          description="Booked in sessions of up to 15 minutes, including startup and stopping time. Shared by tools and desktop connections."
        />
        <Meter
          title="Stored sandboxes"
          value={usage.sandboxes}
          limit={USAGE_LIMITS.sandboxes}
          label={`${usage.sandboxes} / ${USAGE_LIMITS.sandboxes}`}
          description="Up to 1 vCPU, 1 GiB RAM and 3 GiB disk each. Archived sessions keep files. Delete a bot to free its slot."
        />
      </div>
      <p className="text-sm text-muted-foreground">
        AI calls temporarily reserve their maximum possible cost, then settle to
        reported token usage. A request may require more remaining allowance
        than its final cost. Interrupted calls with unknown usage keep their
        reservation. Unused allowance does not roll over. No overage charges.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>
            Latest 20 ledger entries in this subscription period.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!usage.entries.length && (
            <p className="text-sm text-muted-foreground">No usage yet.</p>
          )}
          {usage.entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-sm">{entry.description}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString("en-US", {
                    timeZone: "UTC",
                  })}{" "}
                  UTC
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline">
                  {entry.status === "reserved" ? "Reserved" : "Recorded"}
                </Badge>
                <span className="text-sm tabular-nums">
                  {entry.resource === "ai"
                    ? money(entry.amount)
                    : hours(entry.amount)}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  )
}

function Meter({
  title,
  value,
  limit,
  label,
  description,
}: {
  title: string
  value: number
  limit: number
  label: string
  description: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <span className="text-lg font-medium tabular-nums">{label}</span>
        <Progress value={Math.min(value, limit)} max={limit}>
          <ProgressLabel className="sr-only">{title}</ProgressLabel>
        </Progress>
      </CardContent>
    </Card>
  )
}
