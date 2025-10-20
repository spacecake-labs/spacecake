import { Spinner } from "@/components/ui/spinner"

export function LoadingAnimation() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Spinner className="size-50" />
    </div>
  )
}
