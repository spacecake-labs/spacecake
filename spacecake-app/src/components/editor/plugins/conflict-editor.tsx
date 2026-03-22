import { acceptChunk, getChunks, rejectChunk, unifiedMergeView } from "@codemirror/merge"
import { EditorState, Extension } from "@codemirror/state"
import { EditorView, lineNumbers } from "@codemirror/view"
import { basicSetup } from "codemirror"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { getLanguageSupport } from "@/components/editor/plugins/codemirror-editor"
import { githubDark, githubLight } from "@/components/editor/themes"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { isRight } from "@/types/adt"
import { AbsolutePath } from "@/types/workspace"

export interface ConflictEditorProps {
  ours: string
  theirs: string
  filePath: string
  workspacePath: string
  language?: string
  onResolved?: () => void
}

export const ConflictEditor: React.FC<ConflictEditorProps> = ({
  ours,
  theirs,
  filePath,
  workspacePath,
  language,
  onResolved,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const { theme } = useTheme()
  const [isResolving, setIsResolving] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    if (viewRef.current) {
      viewRef.current.destroy()
      viewRef.current = null
    }

    let cancelled = false

    void (async () => {
      let languageExtension: Extension | null = null
      if (language) {
        languageExtension = await getLanguageSupport(language)
      }

      // guard against stale async callback after cleanup
      if (cancelled) return

      const extensions: Extension[] = [
        basicSetup,
        lineNumbers(),
        EditorView.lineWrapping,
        theme === "dark" ? githubDark : githubLight,
        unifiedMergeView({
          original: theirs,
          highlightChanges: true,
          gutter: true,
          syntaxHighlightDeletions: true,
          mergeControls: true,
        }),
      ]

      if (languageExtension) {
        extensions.push(languageExtension)
      }

      container.innerHTML = ""
      const view = new EditorView({
        parent: container,
        state: EditorState.create({
          doc: ours,
          extensions,
        }),
      })

      // if cleanup ran while awaiting, destroy immediately to avoid leak
      if (cancelled) {
        view.destroy()
        return
      }

      viewRef.current = view
    })()

    return () => {
      cancelled = true
      viewRef.current?.destroy()
      viewRef.current = null
    }
  }, [ours, theirs, language, theme])

  const handleAcceptAllCurrent = useCallback(() => {
    const view = viewRef.current
    if (!view) return
    // reject all chunks (keeps current/ours content, removes incoming/theirs)
    const chunks = getChunks(view.state)
    if (!chunks) return
    // iterate from end to start to avoid position shifts
    for (let i = chunks.chunks.length - 1; i >= 0; i--) {
      rejectChunk(view, chunks.chunks[i].fromA)
    }
  }, [])

  const handleAcceptAllIncoming = useCallback(() => {
    const view = viewRef.current
    if (!view) return
    const chunks = getChunks(view.state)
    if (!chunks) return
    for (let i = chunks.chunks.length - 1; i >= 0; i--) {
      acceptChunk(view, chunks.chunks[i].fromA)
    }
  }, [])

  const handleResolve = useCallback(async () => {
    const view = viewRef.current
    if (!view) return

    const resolvedContent = view.state.doc.toString()
    setIsResolving(true)

    try {
      // write the resolved content to disk
      const relativePath = filePath.startsWith(workspacePath + "/")
        ? filePath.slice(workspacePath.length + 1)
        : filePath

      const saveResult = await window.electronAPI.saveFile(AbsolutePath(filePath), resolvedContent)
      if (!isRight(saveResult)) {
        toast.error("failed to save resolved file")
        return
      }

      // stage the file to mark as resolved
      const resolveResult = await window.electronAPI.git.resolveConflict(
        workspacePath,
        relativePath,
      )
      if (isRight(resolveResult)) {
        toast.success("conflict resolved")
        onResolved?.()
      } else {
        toast.error(resolveResult.value.description, {
          description: resolveResult.value.detail,
        })
      }
    } catch (err) {
      toast.error("failed to resolve conflict", { description: String(err) })
    } finally {
      setIsResolving(false)
    }
  }, [filePath, workspacePath, onResolved])

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-background/50">
        <span className="text-xs text-muted-foreground">conflict resolution</span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs px-2 cursor-pointer"
          onClick={handleAcceptAllCurrent}
        >
          accept all current
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs px-2 cursor-pointer"
          onClick={handleAcceptAllIncoming}
        >
          accept all incoming
        </Button>
        <Button
          size="sm"
          className="h-6 text-xs px-2 cursor-pointer"
          onClick={handleResolve}
          disabled={isResolving}
        >
          mark as resolved
        </Button>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto" data-testid="conflict-editor" />
    </div>
  )
}

ConflictEditor.displayName = "ConflictEditor"
