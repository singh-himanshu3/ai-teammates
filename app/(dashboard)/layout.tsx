import { cookies } from "next/headers"
import { Suspense } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <Suspense fallback={null}>
        <AppSidebar />
      </Suspense>
      <div className="min-w-0 flex-1">{children}</div>
    </SidebarProvider>
  )
}
