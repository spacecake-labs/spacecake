// side-effect-only lexical plugin that performs search highlighting.
// reads search state from jotai atoms, walks the editor DOM to find matches,
// and uses the CSS Custom Highlight API to paint them.

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useEffect, useRef } from "react"

import {
  searchCaseSensitiveAtom,
  searchMatchCountAtom,
  searchMatchIndexAtom,
  searchOpenAtom,
  searchQueryAtom,
  searchRegexAtom,
  searchTargetLineAtom,
} from "@/lib/atoms/search"
import {
  clearSearchHighlights,
  updateSearchHighlights,
  scrollToCurrentMatch,
  type SearchMatch,
} from "@/lib/search/highlight-manager"
import { buildTextIndex, findMatches } from "@/lib/search/text-walker"

const DEBOUNCE_MS = 150

export function SearchPlugin(): null {
  const [editor] = useLexicalComposerContext()

  // read-only atoms
  const searchOpen = useAtomValue(searchOpenAtom)
  const query = useAtomValue(searchQueryAtom)
  const caseSensitive = useAtomValue(searchCaseSensitiveAtom)
  const regex = useAtomValue(searchRegexAtom)

  // read+write atoms
  const [currentMatchIndex, setCurrentMatchIndex] = useAtom(searchMatchIndexAtom)
  const [targetLine, setTargetLine] = useAtom(searchTargetLineAtom)

  // write-only atoms
  const setMatchCount = useSetAtom(searchMatchCountAtom)

  // refs
  const matchesRef = useRef<SearchMatch[]>([])
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // helper: run the search against the current editor DOM
  const runSearchRef = useRef<() => void>(() => {})

  runSearchRef.current = () => {
    if (!searchOpen || !query) {
      matchesRef.current = []
      setMatchCount(0)
      clearSearchHighlights()
      return
    }

    const rootElement = editor.getRootElement()
    if (!rootElement) return

    const index = buildTextIndex(rootElement)
    const matches = findMatches(index, query, { caseSensitive, regex })

    matchesRef.current = matches
    setMatchCount(matches.length)

    // handle target line from workspace search (one-shot)
    if (targetLine !== null) {
      // jump to the first match — close enough for MVP since workspace search
      // already filtered to the right file
      setCurrentMatchIndex(0)
      setTargetLine(null)
    } else if (matches.length > 0 && currentMatchIndex >= matches.length) {
      // current index is out of bounds after content changed
      setCurrentMatchIndex(0)
    }

    updateSearchHighlights(matches, currentMatchIndex)
  }

  // main search effect: re-run when query, options, or search-open state change
  useEffect(() => {
    runSearchRef.current()
  }, [searchOpen, query, caseSensitive, regex])

  // re-run search when editor content changes (debounced)
  useEffect(() => {
    const unregister = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      // skip selection-only updates
      const isContentChange = dirtyElements.size > 0 || dirtyLeaves.size > 0
      if (!isContentChange) return

      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
      }

      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null
        runSearchRef.current()
      }, DEBOUNCE_MS)
    })

    return () => {
      unregister()
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [editor])

  // highlight update effect: runs when the current match index changes
  useEffect(() => {
    const matches = matchesRef.current
    if (matches.length === 0) return

    updateSearchHighlights(matches, currentMatchIndex)

    const scrollContainer = editor.getRootElement() ?? undefined
    scrollToCurrentMatch(matches, currentMatchIndex, scrollContainer)
  }, [currentMatchIndex, editor])

  // clear stale DOM references when the editor root element changes (file navigation)
  useEffect(() => {
    matchesRef.current = []
    clearSearchHighlights()
  }, [editor])

  // cleanup when search closes
  useEffect(() => {
    if (!searchOpen) {
      matchesRef.current = []
      clearSearchHighlights()
    }
  }, [searchOpen])

  // cleanup on unmount
  useEffect(() => {
    return () => {
      clearSearchHighlights()
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [])

  return null
}
