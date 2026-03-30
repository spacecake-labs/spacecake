import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { ChevronDown, ChevronUp, X } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import {
  searchActorAtom,
  searchCaseSensitiveAtom,
  searchFocusTriggerAtom,
  searchOpenAtom,
  searchQueryAtom,
  searchRegexAtom,
  searchWholeWordAtom,
} from "@/lib/atoms/search"
import { store } from "@/lib/store"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// subscribe to search machine context for matchCount and matchIndex.
// uses useSyncExternalStore to handle the case where the actor may not be
// available on first render (SearchPlugin sets it in a useEffect).
// ---------------------------------------------------------------------------

function useSearchMachineValue<T>(
  selector: (ctx: { matchCount: number; matchIndex: number }) => T,
  fallback: T,
): T {
  const actor = useAtomValue(searchActorAtom)

  const subscribe = React.useCallback(
    (cb: () => void) => {
      if (!actor) return () => {}
      const sub = actor.subscribe(cb)
      return () => sub.unsubscribe()
    },
    [actor],
  )

  return React.useSyncExternalStore(
    subscribe,
    () => {
      if (!actor) return fallback
      const ctx = actor.getSnapshot().context as { matchCount: number; matchIndex: number }
      return selector(ctx)
    },
    () => fallback,
  )
}

// ---------------------------------------------------------------------------
// components
// ---------------------------------------------------------------------------

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
  const [caseSensitive, setCaseSensitive] = useAtom(searchCaseSensitiveAtom)
  const [wholeWord, setWholeWord] = useAtom(searchWholeWordAtom)
  const [regex, setRegex] = useAtom(searchRegexAtom)

  const actor = useAtomValue(searchActorAtom)
  const matchCount = useSearchMachineValue((ctx) => ctx.matchCount, 0)
  const matchIndex = useSearchMachineValue((ctx) => ctx.matchIndex, 0)

  const inputRef = React.useRef<HTMLInputElement>(null)
  const focusTrigger = useAtomValue(searchFocusTriggerAtom)

  // focus and select all text when opened or refocused via cmd+f
  React.useEffect(() => {
    const input = inputRef.current
    if (input) {
      input.focus()
      input.select()
    }
  }, [focusTrigger])

  const close = React.useCallback(() => {
    setOpen(false)
  }, [setOpen])

  const goToNext = React.useCallback(() => {
    if (!actor) return
    const { matchCount: mc, matchIndex: mi } = actor.getSnapshot().context
    if (mc === 0) return
    actor.send({ type: "search.navigate.to", matchIndex: (mi + 1) % mc })
  }, [actor])

  const goToPrev = React.useCallback(() => {
    if (!actor) return
    const { matchCount: mc, matchIndex: mi } = actor.getSnapshot().context
    if (mc === 0) return
    actor.send({ type: "search.navigate.to", matchIndex: (mi - 1 + mc) % mc })
  }, [actor])

  const handleQueryChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value
      setQuery(q) // persist for next open / workspace search handoff
      actor?.send({ type: "search.input.change", query: q })
    },
    [setQuery, actor],
  )

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

  const toggleCaseSensitive = React.useCallback(() => {
    setCaseSensitive((prev) => {
      const next = !prev
      actor?.send({
        type: "search.options.change",
        caseSensitive: next,
        wholeWord: store.get(searchWholeWordAtom),
        regex: store.get(searchRegexAtom),
      })
      return next
    })
  }, [setCaseSensitive, actor])

  const toggleWholeWord = React.useCallback(() => {
    setWholeWord((prev) => {
      const next = !prev
      actor?.send({
        type: "search.options.change",
        caseSensitive: store.get(searchCaseSensitiveAtom),
        wholeWord: next,
        regex: store.get(searchRegexAtom),
      })
      return next
    })
  }, [setWholeWord, actor])

  const toggleRegex = React.useCallback(() => {
    setRegex((prev) => {
      const next = !prev
      actor?.send({
        type: "search.options.change",
        caseSensitive: store.get(searchCaseSensitiveAtom),
        wholeWord: store.get(searchWholeWordAtom),
        regex: next,
      })
      return next
    })
  }, [setRegex, actor])

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
        onChange={handleQueryChange}
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
        onClick={toggleCaseSensitive}
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
        onClick={toggleWholeWord}
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
        onClick={toggleRegex}
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
