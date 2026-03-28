import { useVirtualizer } from "@tanstack/react-virtual"
import { useAtom, useSetAtom } from "jotai"
import { Ellipsis, X } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { SidebarContent, SidebarHeader } from "@/components/ui/sidebar"
import { searchCaseSensitiveAtom, searchQueryAtom, searchRegexAtom } from "@/lib/atoms/search"
import {
  workspaceSearchExcludeAtom,
  workspaceSearchIncludeAtom,
  workspaceSearchLimitHitAtom,
  workspaceSearchLoadingAtom,
  workspaceSearchOpenAtom,
  workspaceSearchResultsAtom,
} from "@/lib/atoms/workspace-search"
import { cn } from "@/lib/utils"
import type { SearchResult } from "@/services/ripgrep-search"
import { match } from "@/types/adt"

// flattened row types for the virtualizer
type FileHeaderRow = {
  kind: "file-header"
  filePath: string
  fileName: string
  dirPath: string
  matchCount: number
  firstMatchLine: number
}

type MatchRow = {
  kind: "match"
  filePath: string
  lineNumber: number
  lineContent: string
  matchStart: number
  matchEnd: number
}

export type FlatRow = FileHeaderRow | MatchRow

interface WorkspaceSearchPanelProps {
  workspacePath: string
  onResultClick: (filePath: string, lineNumber: number) => void
}

function renderHighlightedLine(row: MatchRow) {
  const { lineContent, matchStart, matchEnd } = row
  const before = lineContent.slice(0, matchStart)
  const matched = lineContent.slice(matchStart, matchEnd)
  const after = lineContent.slice(matchEnd)

  return (
    <span className="truncate">
      {before}
      <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300 rounded-sm">
        {matched}
      </span>
      {after}
    </span>
  )
}

// flatten grouped search results into a single list of file-header and match rows
export function flattenResults(results: SearchResult[], workspacePath: string): FlatRow[] {
  const rows: FlatRow[] = []
  const prefix = workspacePath.endsWith("/") ? workspacePath : `${workspacePath}/`

  for (const result of results) {
    const relativePath = result.file.startsWith(prefix)
      ? result.file.slice(prefix.length)
      : result.file

    const lastSlash = relativePath.lastIndexOf("/")
    const fileName = lastSlash >= 0 ? relativePath.slice(lastSlash + 1) : relativePath
    const dirPath = lastSlash >= 0 ? relativePath.slice(0, lastSlash) : ""

    rows.push({
      kind: "file-header",
      filePath: result.file,
      fileName,
      dirPath,
      matchCount: result.matches.length,
      firstMatchLine: result.matches[0]?.lineNumber ?? 1,
    })

    for (const m of result.matches) {
      rows.push({
        kind: "match",
        filePath: result.file,
        lineNumber: m.lineNumber,
        lineContent: m.lineContent,
        matchStart: m.matchStart,
        matchEnd: m.matchEnd,
      })
    }
  }

  return rows
}

export const WorkspaceSearchPanel = React.memo(function WorkspaceSearchPanel({
  workspacePath,
  onResultClick,
}: WorkspaceSearchPanelProps) {
  const [query, setQuery] = useAtom(searchQueryAtom)
  const [caseSensitive, setCaseSensitive] = useAtom(searchCaseSensitiveAtom)
  const [regex, setRegex] = useAtom(searchRegexAtom)
  const [include, setInclude] = useAtom(workspaceSearchIncludeAtom)
  const [exclude, setExclude] = useAtom(workspaceSearchExcludeAtom)
  const setOpen = useSetAtom(workspaceSearchOpenAtom)
  const [results, setResults] = useAtom(workspaceSearchResultsAtom)
  const [loading, setLoading] = useAtom(workspaceSearchLoadingAtom)
  const [limitHit, setLimitHit] = useAtom(workspaceSearchLimitHitAtom)

  const [filtersOpen, setFiltersOpen] = React.useState(() => Boolean(include || exclude))

  const scrollParentRef = React.useRef<HTMLDivElement>(null)
  const requestCounterRef = React.useRef(0)
  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // focus search input on mount
  React.useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // total match count across all files
  const totalMatchCount = React.useMemo(
    () => results.reduce((sum, r) => sum + r.matches.length, 0),
    [results],
  )

  const flatRows = React.useMemo(
    () => flattenResults(results, workspacePath),
    [results, workspacePath],
  )

  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => (flatRows[index]?.kind === "file-header" ? 28 : 24),
    overscan: 20,
  })

  // debounced search execution
  React.useEffect(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
    }

    if (!query.trim()) {
      setResults([])
      setLoading(false)
      setLimitHit(false)
      return
    }

    setLoading(true)
    setLimitHit(false)

    debounceTimerRef.current = setTimeout(() => {
      const currentRequest = ++requestCounterRef.current

      window.electronAPI.search
        .workspace({
          query,
          workspacePath,
          caseSensitive,
          regex,
          includeGlob: include || undefined,
          excludeGlob: exclude || undefined,
        })
        .then((result) => {
          // discard stale responses
          if (currentRequest !== requestCounterRef.current) return

          match(result, {
            onLeft: (error) => {
              console.error("workspace search failed:", error.description)
              setResults([])
              setLoading(false)
              setLimitHit(false)
            },
            onRight: (data) => {
              setResults(data.results)
              setLimitHit(data.limitHit)
              setLoading(false)
            },
          })
        })
        .catch((err) => {
          if (currentRequest !== requestCounterRef.current) return
          console.error("workspace search ipc error:", err)
          setResults([])
          setLoading(false)
          setLimitHit(false)
        })
    }, 300)

    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [
    query,
    caseSensitive,
    regex,
    include,
    exclude,
    workspacePath,
    setResults,
    setLoading,
    setLimitHit,
  ])

  const handleClose = React.useCallback(() => {
    setOpen(false)
    setResults([])
    setLimitHit(false)
  }, [setOpen, setResults, setLimitHit])

  // clear retained results when component unmounts without explicit close
  React.useEffect(() => {
    return () => {
      setResults([])
      setLimitHit(false)
    }
  }, [setResults, setLimitHit])

  return (
    <>
      {/* header */}
      <SidebarHeader>
        <div className="flex items-center justify-between px-1.5">
          <span className="text-sm font-medium" data-testid="workspace-search-header">
            search
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 cursor-pointer"
            onClick={handleClose}
            aria-label="close search panel"
            data-testid="workspace-search-close"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent
        className="overflow-hidden flex flex-col gap-0"
        data-testid="workspace-search-panel"
      >
        {/* search inputs */}
        <div className="flex flex-col gap-1.5 px-1.5 py-2 border-b border-border shrink-0">
          {/* query row with toggle buttons */}
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              data-testid="workspace-search-input"
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                if (e.target.value.trim()) setLoading(true)
              }}
              placeholder="search..."
              className="h-7 flex-1 min-w-0 rounded-sm border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[2px]"
            />
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
              data-testid="workspace-search-case-toggle"
            >
              Aa
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
              data-testid="workspace-search-regex-toggle"
            >
              .*
            </Button>
            <Button
              variant={filtersOpen ? "default" : "ghost"}
              size="icon"
              className={cn("h-6 w-6 cursor-pointer shrink-0", !filtersOpen && "opacity-60")}
              onClick={() => setFiltersOpen((prev) => !prev)}
              title="toggle search filters"
              aria-label="toggle search filters"
              aria-pressed={filtersOpen}
              data-testid="workspace-search-filters-toggle"
            >
              <Ellipsis className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* include/exclude filters */}
          {filtersOpen && (
            <>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">files to include</span>
                <input
                  data-testid="workspace-search-include"
                  type="text"
                  value={include}
                  onChange={(e) => setInclude(e.target.value)}
                  placeholder="e.g. *.ts, src/**/include"
                  className="h-6 w-full rounded-sm border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[2px]"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">files to exclude</span>
                <input
                  data-testid="workspace-search-exclude"
                  type="text"
                  value={exclude}
                  onChange={(e) => setExclude(e.target.value)}
                  placeholder="e.g. *.ts, src/**/exclude"
                  className="h-6 w-full rounded-sm border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[2px]"
                />
              </div>
            </>
          )}
        </div>

        {/* status */}
        <div
          className="flex items-center gap-2 px-1.5 py-1 text-xs text-muted-foreground shrink-0"
          data-testid="workspace-search-status"
        >
          {!loading && query.trim() ? (
            <span data-testid="workspace-search-result-count">
              {totalMatchCount} {totalMatchCount === 1 ? "result" : "results"} in {results.length}{" "}
              {results.length === 1 ? "file" : "files"}
            </span>
          ) : (
            "\u00A0"
          )}
          {limitHit && (
            <span
              className="ml-auto text-yellow-600 dark:text-yellow-500"
              data-testid="workspace-search-limit-hit"
            >
              results limited
            </span>
          )}
        </div>

        {/* results area */}
        <div
          ref={scrollParentRef}
          className="flex-1 overflow-y-auto min-h-0"
          data-testid="workspace-search-results"
        >
          {flatRows.length > 0 && (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                const row = flatRows[virtualItem.index]
                if (!row) return null

                if (row.kind === "file-header") {
                  return (
                    <div
                      key={virtualItem.key}
                      data-testid="workspace-search-file-header"
                      className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium cursor-pointer hover:bg-accent/50 truncate"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: `${virtualItem.size}px`,
                        transform: `translateY(${virtualItem.start}px)`,
                      }}
                      onClick={() => onResultClick(row.filePath, row.firstMatchLine)}
                    >
                      <span className="truncate font-medium">{row.fileName}</span>
                      {row.dirPath && (
                        <span className="truncate text-muted-foreground font-normal">
                          {row.dirPath}
                        </span>
                      )}
                      <span className="shrink-0 ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {row.matchCount}
                      </span>
                    </div>
                  )
                }

                return (
                  <div
                    key={virtualItem.key}
                    data-testid="workspace-search-match-row"
                    className="flex items-center gap-2 pl-5 pr-3 text-xs cursor-pointer hover:bg-accent/50 truncate"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                    onClick={() => onResultClick(row.filePath, row.lineNumber)}
                  >
                    <span className="shrink-0 w-8 text-right text-muted-foreground tabular-nums">
                      {row.lineNumber}
                    </span>
                    <span className="truncate font-mono text-[11px]">
                      {renderHighlightedLine(row)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </SidebarContent>
    </>
  )
})
