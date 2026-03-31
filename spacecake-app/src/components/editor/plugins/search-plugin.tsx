// unified search coordinator — uses an xstate machine to coordinate search
// across both lexical prose and codemirror code blocks.
//
// the machine subscribes to searchOpenAtom via an internal "atomBridge" actor,
// handles debouncing, search execution, highlight dispatch, and navigation.
// see src/machines/search.ts for the full state chart.

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useActorRef } from "@xstate/react"
import { useEffect } from "react"

import { searchActorAtom } from "@/lib/atoms/search"
import { store } from "@/lib/store"
import { searchMachine } from "@/machines/search"

export function SearchPlugin({ filePath }: { filePath: string }): null {
  const [editor] = useLexicalComposerContext()

  const actorRef = useActorRef(searchMachine, {
    input: { editor, filePath },
  })

  // expose actor ref so SearchBar and workspace search can send events directly
  useEffect(() => {
    store.set(searchActorAtom, actorRef)
    return () => store.set(searchActorAtom, null)
  }, [actorRef])

  return null
}
