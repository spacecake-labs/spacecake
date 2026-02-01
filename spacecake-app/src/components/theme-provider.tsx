import { useAtom } from "jotai"

import { themeAtom, type Theme } from "@/lib/atoms/atoms"

// no provider or effects needed; consumers use `useTheme()` and
// set classes where appropriate (e.g., a top-level wrapper)

export function useTheme(): {
  theme: Exclude<Theme, "system">
  setTheme: (t: Theme) => void
} {
  const [rawTheme, setTheme] = useAtom(themeAtom)
  const theme = resolveTheme(rawTheme)
  return { theme, setTheme }
}

function resolveTheme(theme: Theme): Exclude<Theme, "system"> {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }
  return theme
}
