import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useAtomValue } from "jotai"
import { useEffect } from "react"

import { useRoute } from "@/hooks/use-route"
import { getOrCreateFileStateAtom } from "@/lib/atoms/file-tree"
import { AbsolutePath } from "@/types/workspace"

/**
 * Freezes the editor while saving or reparsing to prevent race conditions.
 * User cannot edit while file is being persisted or tree is being rebuilt.
 */
export function FreezePlugin() {
  const route = useRoute()
  if (!route?.filePath) return null
  return <FreezePluginInner filePath={AbsolutePath(route.filePath)} />
}

function FreezePluginInner({ filePath }: { filePath: AbsolutePath }) {
  const [editor] = useLexicalComposerContext()
  const fileState = useAtomValue(getOrCreateFileStateAtom(filePath))

  useEffect(() => {
    if (!editor || !fileState) return

    const shouldFreeze = fileState.value === "Reparsing"
    editor.setEditable(!shouldFreeze)
  }, [editor, fileState?.value])

  return null
}
