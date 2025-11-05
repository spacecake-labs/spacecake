import * as React from "react"
import { createRef } from "react"
import { InitialConfigType } from "@lexical/react/LexicalComposer"
import {
  createLexicalComposerContext,
  LexicalComposerContext,
} from "@lexical/react/LexicalComposerContext"
import { createEditor, type LexicalEditor } from "lexical"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach } from "vitest"

// this is a simplified version of the lexical test utils
// https://github.com/facebook/lexical/blob/main/packages/lexical/src/__tests__/utils/index.tsx

type TestEnv = {
  readonly container: HTMLDivElement
  readonly editor: LexicalEditor
  readonly outerHTML: string
  readonly innerHTML: string
}

export function initializeUnitTest(
  runTests: (testEnv: TestEnv) => void,
  editorConfig: InitialConfigType = {
    namespace: "test",
    theme: {},
    onError: (_error: Error) => {},
  },
  plugins?: React.ReactNode
) {
  const testEnv = {
    _container: null as HTMLDivElement | null,
    _editor: null as LexicalEditor | null,
    get container() {
      if (!this._container) {
        throw new Error("testEnv.container not initialized.")
      }
      return this._container
    },
    set container(container) {
      this._container = container
    },
    get editor() {
      if (!this._editor) {
        throw new Error("testEnv.editor not initialized.")
      }
      return this._editor
    },
    set editor(editor) {
      this._editor = editor
    },
    get innerHTML() {
      return (this.container.firstChild as HTMLElement).innerHTML
    },
    get outerHTML() {
      return this.container.innerHTML
    },
    reset() {
      this._container = null
      this._editor = null
    },
  }

  beforeEach(async () => {
    testEnv.container = document.createElement("div")
    document.body.appendChild(testEnv.container)
    const ref = createRef<HTMLDivElement>()

    const useLexicalEditor = (
      rootElementRef: React.RefObject<null | HTMLDivElement>
    ) => {
      const lexicalEditor = React.useMemo(() => {
        const { editorState: _editorState, ...rest } = editorConfig
        const createEditorConfig = {
          ...rest,
          onError: (_error: Error) => {},
        }
        const lexical = createEditor(createEditorConfig)
        return lexical
      }, [])

      React.useEffect(() => {
        const rootElement = rootElementRef.current
        lexicalEditor.setRootElement(rootElement)
      }, [rootElementRef, lexicalEditor])
      return lexicalEditor
    }

    const Editor = () => {
      testEnv.editor = useLexicalEditor(ref)
      const context = createLexicalComposerContext(
        null,
        editorConfig?.theme ?? {}
      )
      return (
        <LexicalComposerContext.Provider value={[testEnv.editor, context]}>
          <div ref={ref} contentEditable={true} />
          {plugins}
        </LexicalComposerContext.Provider>
      )
    }

    React.act(() => {
      createRoot(testEnv.container).render(<Editor />)
    })
  })

  afterEach(() => {
    document.body.removeChild(testEnv.container)
    testEnv.reset()
  })

  runTests(testEnv)
}
