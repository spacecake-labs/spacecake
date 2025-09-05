import { Moon, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"

export function ModeToggle({ variant }: { variant?: "icon" | "compact" }) {
  const { theme, setTheme } = useTheme()
  const next = theme === "light" ? "dark" : "light"

  const handleClick = () => {
    setTheme(next)
  }

  if (variant === "compact") {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleClick}
        aria-label={`switch to ${next} mode`}
        className="h-7 w-7 p-0 cursor-pointer"
        title={`switch to ${next} mode`}
      >
        <Sun className="h-3 w-3 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
        <Moon className="absolute h-3 w-3 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        <span className="sr-only">switch to {next} mode</span>
      </Button>
    )
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleClick}
      aria-label={`switch to ${next} mode`}
      className="cursor-pointer"
      title={`switch to ${next} mode`}
    >
      <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      <span className="sr-only">switch to {next} mode</span>
    </Button>
  )
}
