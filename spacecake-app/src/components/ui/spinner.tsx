import { CakeSliceIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <CakeSliceIcon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-bounce", className)}
      {...props}
    />
  )
}

export { Spinner }
