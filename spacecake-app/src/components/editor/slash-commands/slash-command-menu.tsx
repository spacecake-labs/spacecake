import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { SlashCommandOption } from "@/components/editor/slash-commands/slash-command-options"
import { TypographyInlineCode } from "@/components/typography"

interface SlashCommandMenuProps {
  options: SlashCommandOption[]
  selectedIndex: number | null
  selectOptionAndCleanUp: (option: SlashCommandOption) => void
  setHighlightedIndex: (index: number) => void
}

export function SlashCommandMenu({
  options,
  selectedIndex,
  selectOptionAndCleanUp,
  setHighlightedIndex,
}: SlashCommandMenuProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      e.preventDefault()
      const newIndex =
        selectedIndex !== null
          ? (selectedIndex - 1 + options.length) % options.length
          : options.length - 1
      setHighlightedIndex(newIndex)
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      const newIndex =
        selectedIndex !== null ? (selectedIndex + 1) % options.length : 0
      setHighlightedIndex(newIndex)
    }
  }

  return (
    <div className="w-80 rounded-md border bg-popover text-popover-foreground shadow-md">
      <Command onKeyDown={handleKeyDown}>
        <CommandInput placeholder="type a command or search..." />
        <CommandList>
          <CommandEmpty>no results found</CommandEmpty>
          <CommandGroup heading="blocks">
            {options.map((option, index) => (
              <CommandItem
                key={option.key}
                onSelect={() => selectOptionAndCleanUp(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={
                  selectedIndex === index ? "bg-accent" : "!bg-transparent"
                }
              >
                {option.icon || <span className="w-4 h-4" />}
                <span>{option.title}</span>
                {option.keyboardShortcut && (
                  <CommandShortcut>{option.keyboardShortcut}</CommandShortcut>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup>
            <CommandItem>
              <span>
                type <TypographyInlineCode>/</TypographyInlineCode> on the page
              </span>
              <CommandShortcut>esc</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  )
}
