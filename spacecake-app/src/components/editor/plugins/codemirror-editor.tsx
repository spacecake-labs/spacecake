import React from "react"
import { indentWithTab } from "@codemirror/commands"
import { foldEffect } from "@codemirror/language"
import { languages } from "@codemirror/language-data"
import {
  Compartment,
  EditorSelection,
  EditorState,
  Extension,
} from "@codemirror/state"
import { EditorView, keymap, lineNumbers } from "@codemirror/view"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { basicSetup } from "codemirror"
import {
  $addUpdateTag,
  createCommand,
  LexicalCommand,
  SKIP_DOM_SELECTION_TAG,
} from "lexical"

import type { ClaudeSelection } from "@/types/claude-code"
import type { LanguageSpec } from "@/types/language"
import type { Block } from "@/types/parser"
import { extractCodeMirrorSelectionInfo } from "@/lib/selection-utils"
import { debounce } from "@/lib/utils"
import { CodeBlock } from "@/components/code-block"
import {
  CodeBlockNode,
  useCodeBlockEditorContext,
} from "@/components/editor/nodes/code-node"
import { SAVE_FILE_COMMAND } from "@/components/editor/plugins/save-command"
import { useNavigation } from "@/components/editor/plugins/use-navigation"
import { githubDark, githubLight } from "@/components/editor/themes"
import { useTheme } from "@/components/theme-provider"

type CodeMirrorLanguage = LanguageSpec["codemirrorName"]

// Command dispatched when CodeMirror selection changes
export interface CodeMirrorSelectionPayload {
  nodeKey: string
  anchor: number
  head: number
  selectedText: string
  claudeSelection: ClaudeSelection
}

export const CODEMIRROR_SELECTION_COMMAND: LexicalCommand<CodeMirrorSelectionPayload> =
  createCommand("CODEMIRROR_SELECTION_COMMAND")

interface NodeWithFocusManager {
  setFocusManager: (manager: {
    focus: () => void
    restoreSelection: (selection: { anchor: number; head: number }) => void
    getSelection: () => { anchor: number; head: number } | null
  }) => void
}

export interface BaseCodeMirrorEditorProps {
  language: CodeMirrorLanguage | Extension
  nodeKey: string
  code: string
  onCodeChange: (code: string) => void
  showLineNumbers?: boolean
  readOnly?: boolean
  blockStartLine?: number
  additionalExtensions?: Extension[]
  mermaidNode?: NodeWithFocusManager
}

interface CodeMirrorEditorProps {
  language: CodeMirrorLanguage
  nodeKey: string
  code: string
  block: Block
  codeBlockNode: CodeBlockNode
  enableLanguageSwitching?: boolean
  showLineNumbers?: boolean
}

const EMPTY_VALUE = "__EMPTY_VALUE__"

// Function to get language support extension dynamically
export const getLanguageSupport = async (
  language: string
): Promise<Extension | null> => {
  if (!language || language === EMPTY_VALUE) return null

  const languageData = languages.find((l) => {
    return (
      l.name === language ||
      l.alias.includes(language) ||
      l.extensions.includes(language)
    )
  })

  if (languageData) {
    try {
      const languageSupport = await languageData.load()
      return languageSupport.extension
    } catch {
      console.warn("failed to load language support for", language)
      return null
    }
  }

  return null
}

const focusedActiveLineTheme = EditorView.theme({
  // make gutter transparent by when not focused
  "&:not(.cm-focused) .cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  // make active line transparent by when not focused
  "&:not(.cm-focused) .cm-activeLine": {
    backgroundColor: "transparent",
  },
})

const foldPlaceholderTheme = EditorView.theme({
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--primary)",
    color: "var(--primary-foreground)",
    border: "none",
    padding: "0 1ch",
    margin: "0 1px",
    borderRadius: "4px",
  },
})

// Function to automatically fold docstrings using parsed block data
const foldDocstrings = (view: EditorView, block: Block) => {
  if (!block.doc) return

  const doc = view.state.doc
  const docText = doc.toString()
  const offset = block.text.length - docText.length

  const docStartChar = block.doc.startByte - block.startByte - offset
  const docEndChar = block.doc.endByte - block.startByte - offset

  if (docStartChar >= 0 && docEndChar <= docText.length) {
    const startLine = doc.lineAt(docStartChar).number
    const endLine = doc.lineAt(docEndChar).number

    // fold both single-line and multi-line docstrings
    if (endLine >= startLine) {
      view.dispatch({
        effects: foldEffect.of({ from: docStartChar, to: docEndChar }),
      })
    }
  }
}

// Base editor component for reuse by code and mermaid nodes
export const BaseCodeMirrorEditor = React.forwardRef<
  HTMLDivElement,
  BaseCodeMirrorEditorProps
>(
  (
    {
      language,
      code,
      onCodeChange,
      showLineNumbers = true,
      readOnly = false,
      blockStartLine = 1,
      additionalExtensions,
      mermaidNode,
    },
    ref
  ) => {
    const editorViewRef = React.useRef<EditorView | null>(null)
    const elRef = React.useRef<HTMLDivElement | null>(null)
    const onCodeChangeRef = React.useRef(onCodeChange)
    onCodeChangeRef.current = onCodeChange

    // use empty array as default, but stable across renders
    const stableAdditionalExtensions = React.useMemo(
      () => additionalExtensions ?? [],
      [additionalExtensions]
    )

    const { theme } = useTheme()
    const themeCompartment = React.useRef(new Compartment())

    const debounceMs = 250
    const debouncedCommitRef = React.useRef(
      debounce(() => {
        const view = editorViewRef.current
        if (view) {
          const latest = view.state.doc.toString()
          onCodeChangeRef.current(latest)
        }
      }, debounceMs)
    )

    const flushPending = React.useCallback(() => {
      debouncedCommitRef.current.flush()
    }, [])

    React.useImperativeHandle(ref, () => elRef.current!)

    // Set up focus manager for mermaid node if provided
    React.useEffect(() => {
      if (!mermaidNode) return

      const focusManager = {
        focus: () => {
          const view = editorViewRef.current
          if (view) {
            view.focus()
          }
        },
        restoreSelection: (selection: { anchor: number; head: number }) => {
          const view = editorViewRef.current
          if (view) {
            const docLength = view.state.doc.length
            // Clamp selection to valid range
            const anchor = Math.min(selection.anchor, docLength)
            const head = Math.min(selection.head, docLength)
            view.dispatch({
              selection: EditorSelection.create([
                EditorSelection.range(anchor, head),
              ]),
            })
            view.focus()
          }
        },
        getSelection: () => {
          const view = editorViewRef.current
          if (view) {
            const sel = view.state.selection.main
            return { anchor: sel.anchor, head: sel.head }
          }
          return null
        },
      }

      // Use the setFocusManager method which uses WeakMap internally
      mermaidNode.setFocusManager(focusManager)
    }, [mermaidNode])

    React.useEffect(() => {
      const el = elRef.current
      if (!el) return

      void (async () => {
        // Load language support if language is a string
        let languageExtension: Extension | null = null
        if (typeof language === "string" && language !== "") {
          languageExtension = await getLanguageSupport(language)
        } else if (typeof language !== "string") {
          // language is already an Extension
          languageExtension = language
        }

        const extensions: Extension[] = [
          basicSetup,
          ...(showLineNumbers
            ? [
                lineNumbers({
                  formatNumber: (lineNo) => String(lineNo + blockStartLine - 1),
                }),
              ]
            : []),
          keymap.of([indentWithTab]),
          EditorView.lineWrapping,
          themeCompartment.current.of(
            theme === "dark" ? githubDark : githubLight
          ),
          focusedActiveLineTheme,
          foldPlaceholderTheme,
          ...stableAdditionalExtensions,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              debouncedCommitRef.current.schedule()
            }
          }),
        ]

        if (languageExtension) {
          extensions.push(languageExtension)
        }

        if (readOnly) {
          extensions.push(EditorState.readOnly.of(true))
        }

        el.innerHTML = ""
        editorViewRef.current = new EditorView({
          parent: el,
          state: EditorState.create({ doc: code, extensions }),
        })
      })()

      return () => {
        flushPending()
        editorViewRef.current?.destroy()
        editorViewRef.current = null
      }
    }, [
      language,
      blockStartLine,
      showLineNumbers,
      readOnly,
      stableAdditionalExtensions,
      flushPending,
      theme,
    ])

    // Handle theme changes
    React.useEffect(() => {
      const view = editorViewRef.current
      if (!view) return

      const newTheme = theme === "dark" ? githubDark : githubLight
      view.dispatch({
        effects: themeCompartment.current.reconfigure(newTheme),
      })
    }, [theme])

    return <div ref={elRef} />
  }
)
BaseCodeMirrorEditor.displayName = "BaseCodeMirrorEditor"

export const CodeMirrorEditor: React.FC<CodeMirrorEditorProps> = ({
  language,
  nodeKey,
  code,
  block,
  codeBlockNode,
  enableLanguageSwitching = true,
  showLineNumbers = true,
}) => {
  const [editor] = useLexicalComposerContext()
  const { setCode } = useCodeBlockEditorContext()

  // Use hardcoded values instead of atoms to avoid re-renders
  const readOnly = false
  const codeMirrorExtensions: Extension[] = []
  const autoLoadLanguageSupport = true

  const editorViewRef = React.useRef<EditorView | null>(null)
  const elRef = React.useRef<HTMLDivElement | null>(null)

  const setCodeRef = React.useRef(setCode)
  setCodeRef.current = setCode

  // Use the navigation hook
  const { navigationKeymap } = useNavigation(nodeKey)

  // Set up focus manager for the code block node
  React.useEffect(() => {
    const focusManager = {
      focus: () => {
        const view = editorViewRef.current
        if (view) {
          Promise.resolve().then(() => {
            view.focus()
          })
        }
      },
      restoreSelection: (selection: { anchor: number; head: number }) => {
        const view = editorViewRef.current
        if (view) {
          const docLength = view.state.doc.length
          // Clamp selection to valid range
          const anchor = Math.min(selection.anchor, docLength)
          const head = Math.min(selection.head, docLength)
          view.dispatch({
            selection: EditorSelection.create([
              EditorSelection.range(anchor, head),
            ]),
          })
          view.focus()
        }
      },
      getSelection: () => {
        const view = editorViewRef.current
        if (view) {
          const sel = view.state.selection.main
          return { anchor: sel.anchor, head: sel.head }
        }
        return null
      },
    }

    // Use the setFocusManager method which uses WeakMap internally
    codeBlockNode.setFocusManager(focusManager)
  }, [codeBlockNode])

  const { theme } = useTheme()

  // Create a compartment for the theme extension
  const themeCompartment = React.useRef(new Compartment())

  // debounce settings and helpers
  const debounceMs = 250
  const debouncedCommitRef = React.useRef(
    debounce(() => {
      const view = editorViewRef.current
      if (view) {
        const latest = view.state.doc.toString()
        setCodeRef.current(latest)
      }
    }, debounceMs)
  )

  // Store latest selection for debounced dispatch
  const pendingSelectionRef = React.useRef<{
    anchor: number
    head: number
  } | null>(null)

  // Debounced selection dispatch - fires less frequently than every keystroke
  const debouncedSelectionRef = React.useRef(
    debounce(() => {
      const sel = pendingSelectionRef.current
      const view = editorViewRef.current
      if (sel && view) {
        const { selectedText, claudeSelection } =
          extractCodeMirrorSelectionInfo(view.state, sel.anchor, sel.head)

        editor.dispatchCommand(CODEMIRROR_SELECTION_COMMAND, {
          nodeKey,
          anchor: sel.anchor,
          head: sel.head,
          selectedText,
          claudeSelection,
        })
      }
    }, debounceMs)
  )

  const flushPending = React.useCallback(() => {
    debouncedCommitRef.current.flush()
    debouncedSelectionRef.current.flush()
  }, [])

  React.useEffect(() => {
    const el = elRef.current!
    void (async () => {
      // Load language support first
      let languageSupport = null
      if (language !== "" && autoLoadLanguageSupport) {
        languageSupport = await getLanguageSupport(language)
      }

      const startLine = Math.max(1, Number(block.startLine) || 1)

      const extensions = [
        ...codeMirrorExtensions,
        navigationKeymap,
        basicSetup,
        ...(showLineNumbers
          ? [
              lineNumbers({
                formatNumber: (lineNo) => String(lineNo + startLine - 1),
              }),
            ]
          : []),
        keymap.of([indentWithTab]),
        EditorView.lineWrapping,
        themeCompartment.current.of(
          theme === "dark" ? githubDark : githubLight
        ),
        focusedActiveLineTheme,
        foldPlaceholderTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            debouncedCommitRef.current.schedule()
          }
          // Dispatch selection changes to Lexical
          if (update.selectionSet || update.docChanged) {
            const sel = update.state.selection.main
            pendingSelectionRef.current = {
              anchor: sel.anchor,
              head: sel.head,
            }
            debouncedSelectionRef.current.schedule()
          }
        }),
      ]

      // Add language support if available
      if (languageSupport) {
        extensions.push(languageSupport)
      }

      if (readOnly) {
        extensions.push(EditorState.readOnly.of(true))
      }

      el.innerHTML = ""
      editorViewRef.current = new EditorView({
        parent: el,
        state: EditorState.create({ doc: code, extensions }),
      })

      const view = editorViewRef.current

      // Focus the editor if the node is selected
      editor.read(() => {
        if (codeBlockNode.isSelected()) {
          view.focus()
        }
      })

      // automatically fold docstrings if this block has one
      if (language === "python" && block.doc) {
        foldDocstrings(view, block)
      }

      const onKeyDown = (ev: KeyboardEvent) => {
        // allow cmd+O (open workspace) and cmd+P (quick open) to propagate to document handlers
        const isOpenWorkspaceKey = (ev.metaKey || ev.ctrlKey) && ev.key === "o"
        const isQuickOpenKey = (ev.metaKey || ev.ctrlKey) && ev.key === "p"

        if (isOpenWorkspaceKey || isQuickOpenKey) {
          ev.preventDefault()
          return
        }

        // prevent lexical from handling keystrokes while in codemirror
        ev.stopPropagation()

        // flush on save shortcuts
        const isSaveKey = (ev.metaKey || ev.ctrlKey) && ev.key === "s"
        if (isSaveKey) {
          ev.preventDefault()
          flushPending()
          // dispatch save command directly to the Lexical editor
          editor.dispatchCommand(SAVE_FILE_COMMAND, undefined)
        }
      }

      const onCut = (ev: ClipboardEvent) => {
        // prevent lexical from handling cut events while in codemirror
        ev.stopPropagation()
      }

      const onPaste = (ev: ClipboardEvent) => {
        // prevent lexical from handling paste events while in codemirror
        ev.stopPropagation()
      }

      const onBlur = () => {
        // only flush pending changes; do not trigger save on blur
        flushPending()
      }

      view.contentDOM.addEventListener("keydown", onKeyDown, false)
      view.contentDOM.addEventListener("cut", onCut, false)
      view.contentDOM.addEventListener("paste", onPaste, false)
      view.contentDOM.addEventListener("blur", onBlur, false)
    })()

    return () => {
      // ensure any pending changes are committed before teardown
      flushPending()
      editorViewRef.current?.destroy()
      editorViewRef.current = null
      // listeners are attached to contentDOM; they are removed by destroy()
    }
  }, [language, debounceMs, flushPending])

  // Handle theme changes dynamically using compartment
  React.useEffect(() => {
    const view = editorViewRef.current
    if (!view) return

    const newTheme = theme === "dark" ? githubDark : githubLight
    view.dispatch({
      effects: themeCompartment.current.reconfigure(newTheme),
    })
  }, [theme])

  // // keep codemirror doc in sync if external updates change the node code
  // React.useEffect(() => {
  //   const view = editorViewRef.current;
  //   if (!view) return;
  //   const current = view.state.doc.toString();
  //   if (current !== code) {
  //     // TO DO: when splitting blocks, selection logic can fail

  //     // preserve selection anchor/head where possible
  //     const sel = view.state.selection;
  //     const newLength = code.length;
  //     const clamp = (pos: number) => Math.min(pos, newLength);

  //     view.dispatch({
  //       changes: { from: 0, to: clamp(current.length), insert: code },
  //       selection: sel,
  //     });
  //   }
  // }, [code]);

  const codeBlockContext = useCodeBlockEditorContext()

  const handleDelete = React.useCallback(() => {
    editor.update(() => {
      $addUpdateTag(SKIP_DOM_SELECTION_TAG)
      codeBlockNode.remove()
    })
  }, [editor, codeBlockNode])

  return (
    <CodeBlock
      block={block}
      language={language}
      editable={!readOnly}
      theme={theme}
      onCodeChange={(newCode) => {
        setCodeRef.current(newCode)
      }}
      codeBlockContext={enableLanguageSwitching ? codeBlockContext : undefined}
      onDelete={handleDelete}
    >
      <div ref={elRef} />
    </CodeBlock>
  )
}

// no-op legacy handler removed in favor of onKeyDown above
