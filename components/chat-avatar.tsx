import { Avatar, Style } from "@dicebear/core"
import voxelArt from "@dicebear/styles/voxel-art.json"
import Image from "next/image"

import { cn } from "@/lib/utils"

const style = new Style(voxelArt)

type ChatAvatarProps = {
  seed: string
  animated?: boolean
  className?: string
}

export function ChatAvatar({
  seed,
  animated = false,
  className,
}: ChatAvatarProps) {
  const avatar = new Avatar(style, {
    seed,
    tags: [animated ? "animation" : "!animation"],
  })

  return (
    <Image
      src={avatar.toDataUri()}
      alt="Chat avatar"
      width={32}
      height={32}
      className={cn("size-8 shrink-0", className)}
      unoptimized
    />
  )
}
