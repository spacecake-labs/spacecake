import React from "react"
import { indentWithTab } from "@codemirror/commands"
import { languages } from "@codemirror/language-data"
import { EditorState, Extension } from "@codemirror/state"
import { EditorView, keymap, lineNumbers } from "@codemirror/view"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { githubDark, githubLight } from "@uiw/codemirror-theme-github"
import { basicSetup } from "codemirror"
import { atom } from "jotai"

import type { Block } from "@/types/parser"
import { blockId } from "@/lib/parser/block-id"
import { debounce } from "@/lib/utils"
import { ContentBlock } from "@/components/content-block"
import {
  CodeBlockNode,
  useCodeBlockEditorContext,
} from "@/components/editor/nodes/code-node"
import { SAVE_FILE_COMMAND } from "@/components/editor/plugins/save-command"
import { useNavigation } from "@/components/editor/plugins/use-navigation"
import { useTheme } from "@/components/theme-provider"

// jotai atoms for state management
export const codeBlockLanguagesAtom = atom<Record<string, string>>({
  js: "JavaScript",
  ts: "TypeScript",
  tsx: "TypeScript (React)",
  jsx: "JavaScript (React)",
  //   css: "CSS",
  //   html: "HTML",
  //   json: "JSON",
  //   md: "Markdown",
  py: "Python",
  //   java: "Java",
  //   cpp: "C++",
  //   c: "C",
  //   go: "Go",
  //   rs: "Rust",
  //   php: "PHP",
  //   rb: "Ruby",
  //   sql: "SQL",
})

interface CodeMirrorEditorProps {
  language: string
  nodeKey: string
  code: string
  block: Block
  codeBlockNode: CodeBlockNode
}

const EMPTY_VALUE = "__EMPTY_VALUE__"

// Function to get language support extension dynamically
const getLanguageSupport = async (
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

export const CodeMirrorEditor: React.FC<CodeMirrorEditorProps> = ({
  language,
  nodeKey,
  code,
  block,
  codeBlockNode,
}) => {
  const [editor] = useLexicalComposerContext()
  const { setCode } = useCodeBlockEditorContext()

  // Use block info
  const blockKind = String(block.kind)
  const blockName = block.name.value

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
          view.focus()
        }
      },
    }

    // Use the setFocusManager method which uses WeakMap internally
    codeBlockNode.setFocusManager(focusManager)
  }, [codeBlockNode])

  const { theme } = useTheme()

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

  const flushPending = React.useCallback(() => {
    debouncedCommitRef.current.flush()
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
        lineNumbers({
          formatNumber: (lineNo) => String(lineNo + startLine - 1),
        }),
        keymap.of([indentWithTab]),
        EditorView.lineWrapping,
        theme === "dark" ? githubDark : githubLight,
        focusedActiveLineTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            debouncedCommitRef.current.schedule()
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
          console.log("Focusing CodeMirror editor after creation")
          view.focus()
        }
      })

      const onKeyDown = (ev: KeyboardEvent) => {
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

      const onBlur = () => {
        // only flush pending changes; do not trigger save on blur
        flushPending()
      }

      view.contentDOM.addEventListener("keydown", onKeyDown, false)
      view.contentDOM.addEventListener("blur", onBlur, false)
    })()

    return () => {
      // ensure any pending changes are committed before teardown
      flushPending()
      editorViewRef.current?.destroy()
      editorViewRef.current = null
      // listeners are attached to contentDOM; they are removed by destroy()
    }
  }, [language, theme, debounceMs, flushPending])

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

  return (
    <ContentBlock
      code={code}
      language={language}
      blockName={blockKind}
      title={blockName}
      editable={!readOnly}
      showLineNumbers={true}
      theme="dark"
      dataBlockId={blockId(block)}
      onCodeChange={(newCode) => {
        setCodeRef.current(newCode)
      }}
    >
      <div ref={elRef} />
    </ContentBlock>
  )
}

// no-op legacy handler removed in favor of onKeyDown above
