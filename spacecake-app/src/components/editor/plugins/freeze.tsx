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

    // in future we could freeze when saving or reparsing.
    // this might need extra selection restoration logic
    // as setting editable to false seems to steal focus and selection
    // from lexical nodes (non-decorator)

    // Freeze editor when Reparsing
    const shouldFreeze = fileState.value === "Reparsing"

    editor.setEditable(!shouldFreeze)
  }, [editor, fileState?.value])

  return null
}
