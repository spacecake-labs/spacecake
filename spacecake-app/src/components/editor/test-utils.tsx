import { InitialConfigType } from "@lexical/react/LexicalComposer"
import {
  createLexicalComposerContext,
  LexicalComposerContext,
} from "@lexical/react/LexicalComposerContext"
import { createEditor, type LexicalEditor } from "lexical"
import * as React from "react"
import { act, createRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, vi, type Mock } from "vitest"

// this is a simplified version of the lexical test utils
// https://github.com/facebook/lexical/blob/main/packages/lexical/src/__tests__/utils/index.tsx

// ============================================================================
// Event Mocks
// ============================================================================

export class EventMock implements Event {
  get bubbles(): boolean {
    throw new Error("Getter not implemented.")
  }
  get cancelBubble(): boolean {
    throw new Error("Getter not implemented.")
  }
  get cancelable(): boolean {
    throw new Error("Getter not implemented.")
  }
  get composed(): boolean {
    throw new Error("Getter not implemented.")
  }
  get currentTarget(): EventTarget | null {
    throw new Error("Getter not implemented.")
  }
  get defaultPrevented(): boolean {
    throw new Error("Getter not implemented.")
  }
  get eventPhase(): number {
    throw new Error("Getter not implemented.")
  }
  get isTrusted(): boolean {
    throw new Error("Getter not implemented.")
  }
  get returnValue(): boolean {
    throw new Error("Getter not implemented.")
  }
  get srcElement(): EventTarget | null {
    throw new Error("Getter not implemented.")
  }
  get target(): EventTarget | null {
    throw new Error("Getter not implemented.")
  }
  get timeStamp(): number {
    throw new Error("Getter not implemented.")
  }
  get type(): string {
    throw new Error("Getter not implemented.")
  }
  composedPath(): EventTarget[] {
    throw new Error("Method not implemented.")
  }
  initEvent(
    _type: string,
    _bubbles?: boolean | undefined,
    _cancelable?: boolean | undefined,
  ): void {
    throw new Error("Method not implemented.")
  }
  stopImmediatePropagation(): void {
    return
  }
  stopPropagation(): void {
    return
  }
  NONE = 0 as const
  CAPTURING_PHASE = 1 as const
  AT_TARGET = 2 as const
  BUBBLING_PHASE = 3 as const
  preventDefault() {
    return
  }
}

export class KeyboardEventMock extends EventMock implements KeyboardEvent {
  altKey = false
  ctrlKey = false
  metaKey = false
  shiftKey = false
  private _key = ""
  private _code = ""
  private _keyCode = 0

  get charCode(): number {
    throw new Error("Getter not implemented.")
  }
  get code(): string {
    return this._code
  }
  get isComposing(): boolean {
    throw new Error("Getter not implemented.")
  }
  get key(): string {
    return this._key
  }
  get keyCode(): number {
    return this._keyCode
  }
  get location(): number {
    throw new Error("Getter not implemented.")
  }
  get repeat(): boolean {
    throw new Error("Getter not implemented.")
  }

  constructor(
    _type: string = "keydown",
    options?: {
      key?: string
      code?: string
      keyCode?: number
      shiftKey?: boolean
      ctrlKey?: boolean
      altKey?: boolean
      metaKey?: boolean
    },
  ) {
    super()
    if (options) {
      this._key = options.key ?? ""
      this._code = options.code ?? ""
      this._keyCode = options.keyCode ?? 0
      this.shiftKey = options.shiftKey ?? false
      this.ctrlKey = options.ctrlKey ?? false
      this.altKey = options.altKey ?? false
      this.metaKey = options.metaKey ?? false
    }
  }

  getModifierState(_keyArg: string): boolean {
    throw new Error("Method not implemented.")
  }
  initKeyboardEvent(
    _typeArg: string,
    _bubblesArg?: boolean | undefined,
    _cancelableArg?: boolean | undefined,
    _viewArg?: Window | null | undefined,
    _keyArg?: string | undefined,
    _locationArg?: number | undefined,
    _ctrlKey?: boolean | undefined,
    _altKey?: boolean | undefined,
    _shiftKey?: boolean | undefined,
    _metaKey?: boolean | undefined,
  ): void {
    throw new Error("Method not implemented.")
  }
  DOM_KEY_LOCATION_STANDARD = 0 as const
  DOM_KEY_LOCATION_LEFT = 1 as const
  DOM_KEY_LOCATION_RIGHT = 2 as const
  DOM_KEY_LOCATION_NUMPAD = 3 as const
  get detail(): number {
    throw new Error("Getter not implemented.")
  }
  get view(): Window | null {
    throw new Error("Getter not implemented.")
  }
  get which(): number {
    throw new Error("Getter not implemented.")
  }
  initUIEvent(
    _typeArg: string,
    _bubblesArg?: boolean | undefined,
    _cancelableArg?: boolean | undefined,
    _viewArg?: Window | null | undefined,
    _detailArg?: number | undefined,
  ): void {
    throw new Error("Method not implemented.")
  }
}

export class ClipboardDataMock {
  getData: Mock<(type: string) => [string]>
  setData: Mock<() => [string, string]>

  constructor() {
    this.getData = vi.fn()
    this.setData = vi.fn()
  }
}

export class DataTransferMock implements DataTransfer {
  _data: Map<string, string> = new Map()
  get dropEffect(): DataTransfer["dropEffect"] {
    throw new Error("Getter not implemented.")
  }
  get effectAllowed(): DataTransfer["effectAllowed"] {
    throw new Error("Getter not implemented.")
  }
  get files(): FileList {
    throw new Error("Getter not implemented.")
  }
  get items(): DataTransferItemList {
    throw new Error("Getter not implemented.")
  }
  get types(): ReadonlyArray<string> {
    return Array.from(this._data.keys())
  }
  clearData(_dataType?: string): void {
    //
  }
  getData(dataType: string): string {
    return this._data.get(dataType) || ""
  }
  setData(dataType: string, data: string): void {
    this._data.set(dataType, data)
  }
  setDragImage(_image: Element, _x: number, _y: number): void {
    //
  }
}

// ============================================================================
// Keyboard Event Helpers
// ============================================================================

export function tabKeyboardEvent() {
  return new KeyboardEventMock("keydown", {
    key: "Tab",
    code: "Tab",
    keyCode: 9,
  })
}

export function shiftTabKeyboardEvent() {
  return new KeyboardEventMock("keydown", {
    key: "Tab",
    code: "Tab",
    keyCode: 9,
    shiftKey: true,
  })
}

export function enterKeyboardEvent() {
  return new KeyboardEventMock("keydown", {
    key: "Enter",
    code: "Enter",
    keyCode: 13,
  })
}

export function backspaceKeyboardEvent() {
  return new KeyboardEventMock("keydown", {
    key: "Backspace",
    code: "Backspace",
    keyCode: 8,
  })
}

// ============================================================================
// Test Environment
// ============================================================================

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
  plugins?: React.ReactNode,
) {
  const testEnv = {
    _container: null as HTMLDivElement | null,
    _editor: null as LexicalEditor | null,
    _root: null as Root | null,
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
    get root() {
      return this._root
    },
    set root(root) {
      this._root = root
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
      this._root = null
    },
  }

  beforeEach(async () => {
    testEnv.container = document.createElement("div")
    document.body.appendChild(testEnv.container)
    const ref = createRef<HTMLDivElement>()

    const useLexicalEditor = (rootElementRef: React.RefObject<null | HTMLDivElement>) => {
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
      const context = createLexicalComposerContext(null, editorConfig?.theme ?? {})
      return (
        <LexicalComposerContext.Provider value={[testEnv.editor, context]}>
          <div ref={ref} contentEditable={true} />
          {plugins}
        </LexicalComposerContext.Provider>
      )
    }

    testEnv.root = createRoot(testEnv.container)
    await act(async () => {
      testEnv.root?.render(<Editor />)
    })
  })

  afterEach(async () => {
    // Properly unmount React before removing DOM to flush pending updates
    await act(async () => {
      testEnv.root?.unmount()
    })
    document.body.removeChild(testEnv.container)
    testEnv.reset()
  })

  runTests(testEnv)
}
