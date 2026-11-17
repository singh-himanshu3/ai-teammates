"use client"

import { UserButton } from "@clerk/nextjs"
import { ChartNoAxesCombinedIcon } from "lucide-react"
import type { ComponentProps } from "react"

export function AccountButton(props: ComponentProps<typeof UserButton>) {
  return (
    <UserButton {...props}>
      <UserButton.MenuItems>
        <UserButton.Link
          label="Usage"
          href="/usage"
          labelIcon={<ChartNoAxesCombinedIcon className="size-4" />}
        />
      </UserButton.MenuItems>
    </UserButton>
  )
}
