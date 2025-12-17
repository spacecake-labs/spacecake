import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useAtomValue } from "jotai"

import { AbsolutePath } from "@/types/workspace"
import { fileStateAtomFamily } from "@/lib/atoms/file-tree"
import { useRoute } from "@/hooks/use-route"

/**
 * Freezes the editor while saving or reparsing to prevent race conditions.
 * User cannot edit while file is being persisted or tree is being rebuilt.
 */
export function FreezePlugin() {
  const [editor] = useLexicalComposerContext()
  const route = useRoute()

  if (!route?.filePath) return null

  const filePath = AbsolutePath(route.filePath)
  const fileState = useAtomValue(fileStateAtomFamily(filePath))

  useEffect(() => {
    if (!editor || !fileState) return

    // Freeze editor when Saving or Reparsing
    const shouldFreeze =
      fileState.value === "Saving" || fileState.value === "Reparsing"

    editor.setEditable(!shouldFreeze)
  }, [editor, fileState?.value])

  return null
}
