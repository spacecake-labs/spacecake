// Import the icon as a React component
import IconSvg from "@assets/icon.svg?react"

import { cn } from "@/lib/utils"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <IconSvg
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-pulse", className)}
      {...props}
    />
  )
}

export { Spinner }
