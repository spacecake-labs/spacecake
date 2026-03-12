import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection"
import { mergeRegister } from "@lexical/utils"
import DOMPurify from "dompurify"
import {
  $addUpdateTag,
  $applyNodeReplacement,
  $getNodeByKey,
  CLICK_COMMAND,
  COMMAND_PRIORITY_LOW,
  DecoratorNode,
  DOMConversionMap,
  DOMConversionOutput,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  SKIP_DOM_SELECTION_TAG,
  Spread,
} from "lexical"
import { Code2, Eye } from "lucide-react"
import type { JSX } from "react"
import * as React from "react"

import { BlockHeader } from "@/components/editor/block-header"
import {
  CodeBlockEditorContext,
  type CodeBlockEditorContextValue,
  type CodeMirrorFocusManager,
} from "@/components/editor/nodes/code-node"
import type { BaseCodeMirrorEditorProps } from "@/components/editor/plugins/codemirror-editor"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { VIEW_MODE_TAG } from "@/types/lexical"

const LazyHtmlCodeEditor = React.lazy(async () => {
  const [{ BaseCodeMirrorEditor }, { html }] = await Promise.all([
    import("@/components/editor/plugins/codemirror-editor"),
    import("@codemirror/lang-html"),
  ])
  const ext = html()
  return {
    default: (props: Omit<BaseCodeMirrorEditorProps, "language">) => (
      <BaseCodeMirrorEditor {...props} language={ext} />
    ),
  }
})

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "picture",
    "source",
    "img",
    "div",
    "span",
    "p",
    "br",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "ul",
    "ol",
    "li",
    "b",
    "i",
    "em",
    "strong",
    "a",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "details",
    "summary",
    "figure",
    "figcaption",
    "blockquote",
    "hr",
    "dl",
    "dt",
    "dd",
    "sup",
    "sub",
    "abbr",
    "mark",
    "del",
    "ins",
    "kbd",
    "code",
    "pre",
  ],
  ALLOWED_ATTR: [
    "src",
    "srcset",
    "alt",
    "width",
    "height",
    "href",
    "media",
    "class",
    "title",
    "id",
    "target",
    "rel",
    "colspan",
    "rowspan",
    "open",
  ],
  ALLOW_DATA_ATTR: false,
}

// WeakMap to store focus managers for html block nodes
const focusManagerMap = new WeakMap<HTMLBlockNode, CodeMirrorFocusManager>()

export interface CreateHTMLBlockNodeOptions {
  html: string
  key?: NodeKey
  viewMode?: "preview" | "code"
}

export type SerializedHTMLBlockNode = Spread<
  {
    html: string
    type: "html-block"
    version: 1
    viewMode: "preview" | "code"
  },
  SerializedLexicalNode
>

function $convertHtmlBlockElement(domNode: Node): null | DOMConversionOutput {
  const element = domNode as HTMLElement
  const htmlContent = element.getAttribute("data-html-block")
  if (!htmlContent) {
    return null
  }
  const node = $createHTMLBlockNode({ html: htmlContent })
  return { node }
}

export class HTMLBlockNode extends DecoratorNode<JSX.Element> {
  __html: string
  __viewMode: "preview" | "code"

  static getType(): string {
    return "html-block"
  }

  static clone(node: HTMLBlockNode): HTMLBlockNode {
    return new HTMLBlockNode(node.__html, node.__key, node.__viewMode)
  }

  static importJSON(serializedNode: SerializedHTMLBlockNode): HTMLBlockNode {
    const { html, viewMode } = serializedNode
    return $createHTMLBlockNode({ html, viewMode: viewMode ?? "preview" })
  }

  static importDOM(): DOMConversionMap {
    return {
      div: () => ({
        conversion: $convertHtmlBlockElement,
        priority: 0,
      }),
    }
  }

  constructor(html: string, key?: NodeKey, viewMode: "preview" | "code" = "preview") {
    super(key)
    this.__html = html
    this.__viewMode = viewMode
  }

  exportJSON(): SerializedHTMLBlockNode {
    return {
      ...super.exportJSON(),
      html: this.__html,
      type: "html-block",
      version: 1,
      viewMode: this.__viewMode,
    }
  }

  exportDOM(): { element: HTMLElement } {
    const element = document.createElement("div")
    element.setAttribute("data-html-block", this.__html)
    return { element }
  }

  createDOM(): HTMLElement {
    const div = document.createElement("div")
    div.className = "mt-2"
    return div
  }

  updateDOM(): false {
    return false
  }

  isInline(): boolean {
    return false
  }

  getHtml(): string {
    return this.__html
  }

  getTextContent(): string {
    return this.__html
  }

  setHtml(html: string): void {
    const writable = this.getWritable()
    writable.__html = html
  }

  getViewMode(): "preview" | "code" {
    return this.__viewMode
  }

  setViewMode(viewMode: "preview" | "code"): void {
    const writable = this.getWritable()
    writable.__viewMode = viewMode
  }

  select = () => {
    const focusManager = focusManagerMap.get(this)
    focusManager?.focus()
  }

  setFocusManager = (focusManager: CodeMirrorFocusManager) => {
    focusManagerMap.set(this, focusManager)
  }

  decorate(editor: LexicalEditor): JSX.Element {
    return (
      <HTMLBlockNodeEditorContainer
        parentEditor={editor}
        htmlBlockNode={this}
        nodeKey={this.getKey()}
      />
    )
  }
}

interface HTMLBlockNodeEditorContainerProps {
  parentEditor: LexicalEditor
  htmlBlockNode: HTMLBlockNode
  nodeKey: NodeKey
}

interface HTMLBlockEditorContextProviderProps {
  parentEditor: LexicalEditor
  nodeKey: NodeKey
  children: React.ReactNode
}

const HTMLBlockEditorContextProvider: React.FC<HTMLBlockEditorContextProviderProps> = ({
  parentEditor,
  nodeKey,
  children,
}) => {
  const contextValue = React.useMemo(() => {
    return {
      lexicalNode: null as never,
      parentEditor,
      src: "",
      setCode: (code: string) => {
        parentEditor.update(() => {
          $addUpdateTag(SKIP_DOM_SELECTION_TAG)
          const node = $getNodeByKey(nodeKey)
          if (node && $isHTMLBlockNode(node)) {
            node.setHtml(code)
          }
        })
      },
      setLanguage: () => {},
      setMeta: () => {},
      setSrc: () => {},
    } as CodeBlockEditorContextValue
  }, [parentEditor, nodeKey])

  return (
    <CodeBlockEditorContext.Provider value={contextValue}>
      {children}
    </CodeBlockEditorContext.Provider>
  )
}

const HTMLBlockNodeEditorContainer: React.FC<HTMLBlockNodeEditorContainerProps> = ({
  parentEditor,
  htmlBlockNode,
  nodeKey,
}) => {
  const [isNodeSelected, setNodeSelected, clearNodeSelection] = useLexicalNodeSelection(nodeKey)

  const viewMode = htmlBlockNode.__viewMode
  const htmlContent = htmlBlockNode.__html

  React.useEffect(() => {
    return mergeRegister(
      parentEditor.registerCommand(
        CLICK_COMMAND,
        (event: MouseEvent) => {
          const elem = parentEditor.getElementByKey(nodeKey)

          if (elem && elem.contains(event.target as Node)) {
            if (!event.shiftKey) {
              clearNodeSelection()
            }
            setNodeSelected(!isNodeSelected)
            return true
          }

          return false
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  }, [clearNodeSelection, parentEditor, setNodeSelected, nodeKey])

  const handleCodeChange = React.useCallback(
    (code: string) => {
      parentEditor.update(() => {
        $addUpdateTag(SKIP_DOM_SELECTION_TAG)
        const node = $getNodeByKey(nodeKey)
        if (node && $isHTMLBlockNode(node)) {
          // skip no-op writes (e.g. flush on codemirror unmount during view toggle)
          if (node.getHtml() === code) return
          node.setHtml(code)
        }
      })
    },
    [parentEditor, nodeKey],
  )

  const handleToggleViewMode = React.useCallback(() => {
    parentEditor.update(() => {
      $addUpdateTag(VIEW_MODE_TAG)
      const node = $getNodeByKey(nodeKey)
      if (node && $isHTMLBlockNode(node)) {
        node.setViewMode(viewMode === "preview" ? "code" : "preview")
      }
    })
  }, [parentEditor, nodeKey, viewMode])

  const handleDelete = React.useCallback(() => {
    parentEditor.update(() => {
      $addUpdateTag(SKIP_DOM_SELECTION_TAG)
      const node = $getNodeByKey(nodeKey)
      if (node) {
        node.remove()
      }
    })
  }, [parentEditor, nodeKey])

  const sanitizedHtml = React.useMemo(
    () => DOMPurify.sanitize(htmlContent, SANITIZE_CONFIG).replace(/>\s+</g, "><").trim(),
    [htmlContent],
  )

  const toggleButton = (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleViewMode}
            className="h-6 w-6 p-0 cursor-pointer"
            data-testid="html-toggle-view-mode"
          >
            {viewMode === "preview" ? <Code2 className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {viewMode === "preview" ? "edit code" : "view preview"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )

  return (
    <div
      className={cn(
        "group relative rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
      )}
      data-testid="html-block-node"
    >
      <BlockHeader
        title="anonymous"
        emoji="🌐"
        badge="html"
        rightActions={toggleButton}
        onDelete={handleDelete}
      />

      <div className="overflow-hidden rounded-b-lg" data-testid="html-block-node-content">
        {viewMode === "code" ? (
          <HTMLBlockEditorContextProvider parentEditor={parentEditor} nodeKey={nodeKey}>
            <div data-testid="html-code-editor">
              <React.Suspense fallback={null}>
                <LazyHtmlCodeEditor
                  code={htmlContent}
                  nodeKey={nodeKey}
                  onCodeChange={handleCodeChange}
                  showLineNumbers={true}
                  mermaidNode={htmlBlockNode}
                />
              </React.Suspense>
            </div>
          </HTMLBlockEditorContextProvider>
        ) : (
          <div
            className="p-3 text-sm [&_img]:block [&_img]:max-w-full [&_img]:h-auto [&_picture]:block"
            data-testid="html-preview"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        )}
      </div>
    </div>
  )
}

export function $createHTMLBlockNode({
  html,
  key,
  viewMode = "preview",
}: CreateHTMLBlockNodeOptions): HTMLBlockNode {
  return $applyNodeReplacement(new HTMLBlockNode(html, key, viewMode))
}

export function $isHTMLBlockNode(node: LexicalNode | null | undefined): node is HTMLBlockNode {
  return node instanceof HTMLBlockNode
}
