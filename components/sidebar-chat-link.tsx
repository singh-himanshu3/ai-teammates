"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ComponentProps } from "react"

import { SidebarMenuButton } from "@/components/ui/sidebar"

export function SidebarChatLink({
  href,
  ...props
}: Omit<ComponentProps<typeof SidebarMenuButton>, "render" | "isActive"> & {
  href: string
}) {
  const pathname = usePathname()
  const isActive = pathname === href

  return (
    <SidebarMenuButton
      {...props}
      isActive={isActive}
      render={<Link href={href} aria-current={isActive ? "page" : undefined} />}
    />
  )
}
