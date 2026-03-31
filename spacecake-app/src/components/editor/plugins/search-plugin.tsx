// unified search coordinator — uses an xstate machine to coordinate search
// across both lexical prose and codemirror code blocks.
//
// the machine is the single source of truth for all search state.
// see src/machines/search.ts for the full state chart.

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useActorRef } from "@xstate/react"
import { useEffect } from "react"

import { consumePendingSearch, searchActorAtom } from "@/lib/atoms/search"
import { store } from "@/lib/store"
import { searchMachine } from "@/machines/search"

export function SearchPlugin({ filePath }: { filePath: string }): null {
  const [editor] = useLexicalComposerContext()

  const actorRef = useActorRef(searchMachine, {
    input: { editor, filePath },
  })

  // expose actor ref so SearchBar, Cmd+F, and workspace search can interact
  // with the machine. also check for a pending search (workspace search
  // opened a file and wants to jump to a line).
  useEffect(() => {
    store.set(searchActorAtom, actorRef)

    const pending = consumePendingSearch()
    if (pending) {
      actorRef.send({
        type: "search.open",
        query: pending.query,
        targetLine: pending.targetLine,
        targetFile: pending.targetFile,
      })
    }

    return () => store.set(searchActorAtom, null)
  }, [actorRef])

  return null
}
