import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { ChevronDown, ChevronUp, X } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  searchCaseSensitiveAtom,
  searchMatchCountAtom,
  searchMatchIndexAtom,
  searchOpenAtom,
  searchQueryAtom,
  searchRegexAtom,
  searchWholeWordAtom,
} from "@/lib/atoms/search"
import { clearSearchHighlights } from "@/lib/search/highlight-manager"
import { cn } from "@/lib/utils"

const MatchCounter = React.memo(function MatchCounter({
  query,
  matchIndex,
  matchCount,
}: {
  query: string
  matchIndex: number
  matchCount: number
}) {
  const text =
    query.length === 0 ? "" : matchCount === 0 ? "no results" : `${matchIndex + 1} of ${matchCount}`

  // invisible "no results" sets the minimum width so the bar never resizes
  return (
    <span
      data-testid="search-match-counter"
      className="relative text-xs text-muted-foreground whitespace-nowrap px-1.5 text-center"
    >
      <span className="invisible" aria-hidden="true">
        no results
      </span>
      <span className="absolute inset-0 flex items-center justify-center px-1.5">{text}</span>
    </span>
  )
})

export const SearchBar = React.memo(function SearchBar() {
  const [query, setQuery] = useAtom(searchQueryAtom)
  const setOpen = useSetAtom(searchOpenAtom)
  const [matchIndex, setMatchIndex] = useAtom(searchMatchIndexAtom)
  const matchCount = useAtomValue(searchMatchCountAtom)
  const [caseSensitive, setCaseSensitive] = useAtom(searchCaseSensitiveAtom)
  const [wholeWord, setWholeWord] = useAtom(searchWholeWordAtom)
  const [regex, setRegex] = useAtom(searchRegexAtom)

  const inputRef = React.useRef<HTMLInputElement>(null)

  // focus and select all text on mount
  React.useEffect(() => {
    const input = inputRef.current
    if (input) {
      input.focus()
      input.select()
    }
  }, [])

  // clear highlights on unmount (when search is closed)
  React.useEffect(() => {
    return () => {
      clearSearchHighlights()
    }
  }, [])

  // reset match index when query changes
  React.useEffect(() => {
    setMatchIndex(0)
  }, [query, setMatchIndex])

  const close = React.useCallback(() => {
    setOpen(false)
  }, [setOpen])

  const goToNext = React.useCallback(() => {
    if (matchCount === 0) return
    setMatchIndex((prev) => (prev + 1) % matchCount)
  }, [matchCount, setMatchIndex])

  const goToPrev = React.useCallback(() => {
    if (matchCount === 0) return
    setMatchIndex((prev) => (prev - 1 + matchCount) % matchCount)
  }, [matchCount, setMatchIndex])

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault()
        if (e.shiftKey) {
          goToPrev()
        } else {
          goToNext()
        }
      } else if (e.key === "Escape") {
        e.preventDefault()
        close()
      }
    },
    [goToNext, goToPrev, close],
  )

  return (
    <div
      data-testid="search-bar"
      className="absolute top-2 right-4 z-50 flex items-center gap-1 rounded-md border bg-popover px-2 py-1 shadow-md"
    >
      <input
        ref={inputRef}
        data-testid="search-input"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="search..."
        className="h-6 w-48 rounded-sm border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[2px]"
      />

      <MatchCounter query={query} matchIndex={matchIndex} matchCount={matchCount} />

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 cursor-pointer"
        onClick={goToPrev}
        disabled={matchCount === 0}
        aria-label="previous match"
        data-testid="search-prev"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 cursor-pointer"
        onClick={goToNext}
        disabled={matchCount === 0}
        aria-label="next match"
        data-testid="search-next"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>

      <Button
        variant={caseSensitive ? "default" : "ghost"}
        size="icon"
        className={cn(
          "h-6 w-6 cursor-pointer text-xs font-semibold shrink-0",
          !caseSensitive && "opacity-60",
        )}
        onClick={() => setCaseSensitive((prev) => !prev)}
        title="match case"
        aria-label="toggle case sensitive"
        aria-pressed={caseSensitive}
        data-testid="search-case-toggle"
      >
        Aa
      </Button>

      <Button
        variant={wholeWord ? "default" : "ghost"}
        size="icon"
        className={cn(
          "h-6 w-6 cursor-pointer text-xs font-semibold underline underline-offset-[3px] shrink-0",
          !wholeWord && "opacity-60",
        )}
        onClick={() => setWholeWord((prev) => !prev)}
        title="match whole word"
        aria-label="toggle whole word"
        aria-pressed={wholeWord}
        data-testid="search-whole-word-toggle"
      >
        ab
      </Button>

      <Button
        variant={regex ? "default" : "ghost"}
        size="icon"
        className={cn(
          "h-6 w-6 cursor-pointer text-xs font-semibold shrink-0",
          !regex && "opacity-60",
        )}
        onClick={() => setRegex((prev) => !prev)}
        title="use regular expression"
        aria-label="toggle regex"
        aria-pressed={regex}
        data-testid="search-regex-toggle"
      >
        .*
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 cursor-pointer"
        onClick={close}
        aria-label="close search"
        data-testid="search-close"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
})
