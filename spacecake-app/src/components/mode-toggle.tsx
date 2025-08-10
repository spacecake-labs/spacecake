import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";

export function ModeToggle() {
  const { theme, setTheme } = useTheme();

  const handleClick = () => {
    // toggle strictly between light/dark based on resolved theme value
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleClick}
      aria-label="toggle theme"
      className="cursor-pointer"
    >
      <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      <span className="sr-only">toggle theme</span>
    </Button>
  );
}
