import { unifiedMergeView } from "@codemirror/merge"
import { EditorState, Extension } from "@codemirror/state"
import { EditorView, lineNumbers } from "@codemirror/view"
import { basicSetup } from "codemirror"
import React, { useEffect, useRef } from "react"

import { getLanguageSupport } from "@/components/editor/plugins/codemirror-editor"
import { githubDark, githubLight } from "@/components/editor/themes"
import { useTheme } from "@/components/theme-provider"

export interface DiffEditorProps {
  /** Original content (base version, e.g., from HEAD) */
  oldContent: string
  /** New content (current version, e.g., working directory) */
  newContent: string
  /** Language for syntax highlighting */
  language?: string
  /** Whether the editor is read-only */
  readOnly?: boolean
}

/**
 * A diff editor component using CodeMirror's unifiedMergeView.
 * Shows a unified (inline) diff with word-level highlighting.
 */
export const DiffEditor: React.FC<DiffEditorProps> = ({
  oldContent,
  newContent,
  language,
  readOnly = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const { theme } = useTheme()

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Cleanup previous view
    if (viewRef.current) {
      viewRef.current.destroy()
      viewRef.current = null
    }

    void (async () => {
      // Load language support if provided
      let languageExtension: Extension | null = null
      if (language) {
        languageExtension = await getLanguageSupport(language)
      }

      const extensions: Extension[] = [
        basicSetup,
        lineNumbers(),
        EditorView.lineWrapping,
        theme === "dark" ? githubDark : githubLight,
        // Unified merge view configuration
        unifiedMergeView({
          original: oldContent,
          highlightChanges: true, // Word-level highlighting
          gutter: true, // Show change indicators in gutter
          syntaxHighlightDeletions: true,
          mergeControls: false, // Hide accept/reject buttons (read-only diff)
          collapseUnchanged: {}, // Collapse unchanged sections with default margin/minSize
        }),
      ]

      if (languageExtension) {
        extensions.push(languageExtension)
      }

      if (readOnly) {
        extensions.push(EditorState.readOnly.of(true))
      }

      container.innerHTML = ""
      viewRef.current = new EditorView({
        parent: container,
        state: EditorState.create({
          doc: newContent,
          extensions,
        }),
      })
    })()

    return () => {
      viewRef.current?.destroy()
      viewRef.current = null
    }
  }, [oldContent, newContent, language, readOnly, theme])

  return (
    <div ref={containerRef} className="h-full w-full overflow-auto" data-testid="diff-editor" />
  )
}

DiffEditor.displayName = "DiffEditor"
