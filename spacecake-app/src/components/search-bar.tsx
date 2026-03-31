import { useSelector } from "@xstate/react"
import { useAtomValue } from "jotai"
import { ChevronDown, ChevronUp, X } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { searchActorAtom } from "@/lib/atoms/search"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// selectors — extract values from the machine snapshot
// ---------------------------------------------------------------------------

const selectMatchCount = (snapshot: { context: { matchCount: number } }) =>
  snapshot.context.matchCount
const selectMatchIndex = (snapshot: { context: { matchIndex: number } }) =>
  snapshot.context.matchIndex
const selectQuery = (snapshot: { context: { query: string } }) => snapshot.context.query
const selectCaseSensitive = (snapshot: { context: { caseSensitive: boolean } }) =>
  snapshot.context.caseSensitive
const selectWholeWord = (snapshot: { context: { wholeWord: boolean } }) =>
  snapshot.context.wholeWord
const selectRegex = (snapshot: { context: { regex: boolean } }) => snapshot.context.regex
const selectFocusTrigger = (snapshot: { context: { focusTrigger: number } }) =>
  snapshot.context.focusTrigger

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
  const actor = useAtomValue(searchActorAtom)
  // useSelector expects undefined (not null) for "no actor"
  const actorOrUndefined = actor ?? undefined

  // read all state from the machine via selectors
  const query = useSelector(actorOrUndefined, selectQuery) ?? ""
  const caseSensitive = useSelector(actorOrUndefined, selectCaseSensitive) ?? false
  const wholeWord = useSelector(actorOrUndefined, selectWholeWord) ?? false
  const regex = useSelector(actorOrUndefined, selectRegex) ?? false
  const matchCount = useSelector(actorOrUndefined, selectMatchCount) ?? 0
  const matchIndex = useSelector(actorOrUndefined, selectMatchIndex) ?? 0
  const focusTrigger = useSelector(actorOrUndefined, selectFocusTrigger) ?? 0

  const inputRef = React.useRef<HTMLInputElement>(null)

  // focus and select all text when opened or refocused via cmd+f
  React.useEffect(() => {
    const input = inputRef.current
    if (input) {
      input.focus()
      input.select()
    }
  }, [focusTrigger])

  const close = React.useCallback(() => {
    actor?.send({ type: "search.close" })
  }, [actor])

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
      actor?.send({ type: "search.input.change", query: e.target.value })
    },
    [actor],
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
    if (!actor) return
    const ctx = actor.getSnapshot().context
    actor.send({
      type: "search.options.change",
      caseSensitive: !ctx.caseSensitive,
      wholeWord: ctx.wholeWord,
      regex: ctx.regex,
    })
  }, [actor])

  const toggleWholeWord = React.useCallback(() => {
    if (!actor) return
    const ctx = actor.getSnapshot().context
    actor.send({
      type: "search.options.change",
      caseSensitive: ctx.caseSensitive,
      wholeWord: !ctx.wholeWord,
      regex: ctx.regex,
    })
  }, [actor])

  const toggleRegex = React.useCallback(() => {
    if (!actor) return
    const ctx = actor.getSnapshot().context
    actor.send({
      type: "search.options.change",
      caseSensitive: ctx.caseSensitive,
      wholeWord: ctx.wholeWord,
      regex: !ctx.regex,
    })
  }, [actor])

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
