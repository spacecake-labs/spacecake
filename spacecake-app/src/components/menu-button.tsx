import { Menu } from "lucide-react"
import { useCallback } from "react"

import { Button } from "@/components/ui/button"

export function MenuButton() {
  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    window.electronAPI.popupMenu({ x: Math.round(rect.left), y: Math.round(rect.bottom) })
  }, [])

  return (
    <Button
      variant="ghost"
      size="icon"
      className="app-no-drag h-full rounded-none"
      onClick={handleClick}
      aria-label="menu"
    >
      <Menu className="size-4" />
    </Button>
  )
}
