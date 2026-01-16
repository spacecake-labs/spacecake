import type { JSX } from "react"
import * as React from "react"
import { yaml } from "@codemirror/lang-yaml"
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection"
import { mergeRegister } from "@lexical/utils"
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
import { Code2, Table2 } from "lucide-react"
import YAML from "yaml"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { BlockHeader } from "@/components/editor/block-header"
import {
  CodeBlockEditorContext,
  type CodeBlockEditorContextValue,
  type CodeMirrorFocusManager,
} from "@/components/editor/nodes/code-node"
import { BaseCodeMirrorEditor } from "@/components/editor/plugins/codemirror-editor"

// WeakMap to store focus managers for frontmatter nodes
const focusManagerMap = new WeakMap<FrontmatterNode, CodeMirrorFocusManager>()

export type FrontmatterViewMode = "table" | "code"

export interface CreateFrontmatterNodeOptions {
  yaml: string
  key?: NodeKey
  viewMode?: FrontmatterViewMode
}

export type SerializedFrontmatterNode = Spread<
  {
    yaml: string
    type: "frontmatter"
    version: 1
    viewMode: FrontmatterViewMode
  },
  SerializedLexicalNode
>

function $convertFrontmatterElement(domNode: Node): null | DOMConversionOutput {
  const element = domNode as HTMLElement
  const yamlContent = element.getAttribute("data-yaml")
  if (!yamlContent) {
    return null
  }
  const node = $createFrontmatterNode({ yaml: yamlContent })
  return { node }
}

export class FrontmatterNode extends DecoratorNode<JSX.Element> {
  __yaml: string
  __viewMode: FrontmatterViewMode

  static getType(): string {
    return "frontmatter"
  }

  static clone(node: FrontmatterNode): FrontmatterNode {
    return new FrontmatterNode(node.__yaml, node.__key, node.__viewMode)
  }

  static importJSON(
    serializedNode: SerializedFrontmatterNode
  ): FrontmatterNode {
    const { yaml, viewMode } = serializedNode
    return $createFrontmatterNode({ yaml, viewMode: viewMode ?? "table" })
  }

  static importDOM(): DOMConversionMap {
    return {
      div: () => ({
        conversion: $convertFrontmatterElement,
        priority: 0,
      }),
    }
  }

  constructor(
    yaml: string,
    key?: NodeKey,
    viewMode: FrontmatterViewMode = "table"
  ) {
    super(key)
    this.__yaml = yaml
    this.__viewMode = viewMode
  }

  exportJSON(): SerializedFrontmatterNode {
    return {
      ...super.exportJSON(),
      yaml: this.__yaml,
      type: "frontmatter",
      version: 1,
      viewMode: this.__viewMode,
    }
  }

  exportDOM(): { element: HTMLElement } {
    const element = document.createElement("div")
    element.setAttribute("data-yaml", this.__yaml)
    element.className = "frontmatter"
    return { element }
  }

  createDOM(): HTMLElement {
    const div = document.createElement("div")
    // padding between blocks, consistent with CodeBlockNode
    div.className = "mb-2"
    return div
  }

  updateDOM(): false {
    return false
  }

  isInline(): boolean {
    return false
  }

  getYaml(): string {
    return this.__yaml
  }

  getTextContent(): string {
    return this.__yaml
  }

  setYaml(yaml: string): void {
    const writable = this.getWritable()
    writable.__yaml = yaml
  }

  getViewMode(): FrontmatterViewMode {
    return this.__viewMode
  }

  setViewMode(viewMode: FrontmatterViewMode): void {
    const writable = this.getWritable()
    writable.__viewMode = viewMode
  }

  getParsedData(): {
    data: Record<string, unknown> | null
    error: string | null
  } {
    try {
      const data = YAML.parse(this.__yaml)
      // Handle empty YAML
      if (data === null || data === undefined) {
        return { data: {}, error: null }
      }
      // Handle non-object YAML (e.g., just a string or number)
      if (typeof data !== "object" || Array.isArray(data)) {
        return {
          data: null,
          error: "Frontmatter must be a YAML object (key-value pairs)",
        }
      }
      return { data: data as Record<string, unknown>, error: null }
    } catch (e) {
      return { data: null, error: (e as Error).message }
    }
  }

  select = () => {
    // focus the CodeMirror editor directly
    const focusManager = focusManagerMap.get(this)
    focusManager?.focus()
  }

  setFocusManager = (focusManager: CodeMirrorFocusManager) => {
    focusManagerMap.set(this, focusManager)
  }

  decorate(editor: LexicalEditor): JSX.Element {
    return (
      <FrontmatterNodeEditorContainer
        parentEditor={editor}
        frontmatterNode={this}
        nodeKey={this.getKey()}
      />
    )
  }
}

interface FrontmatterNodeEditorContainerProps {
  parentEditor: LexicalEditor
  frontmatterNode: FrontmatterNode
  nodeKey: NodeKey
}

interface FrontmatterEditorContextProviderProps {
  parentEditor: LexicalEditor
  nodeKey: NodeKey
  children: React.ReactNode
}

const FrontmatterEditorContextProvider: React.FC<
  FrontmatterEditorContextProviderProps
> = ({ parentEditor, nodeKey, children }) => {
  const contextValue = React.useMemo(() => {
    return {
      lexicalNode: null as never,
      parentEditor,
      src: "",
      setCode: (code: string) => {
        parentEditor.update(() => {
          $addUpdateTag(SKIP_DOM_SELECTION_TAG)
          const node = $getNodeByKey(nodeKey)
          if (node && $isFrontmatterNode(node)) {
            ;(node as FrontmatterNode).setYaml(code)
          }
        })
      },
      setLanguage: () => {
        // no-op for frontmatter
      },
      setMeta: () => {
        // no-op for frontmatter
      },
      setSrc: () => {
        // no-op for frontmatter
      },
    } as CodeBlockEditorContextValue
  }, [parentEditor, nodeKey])

  return (
    <CodeBlockEditorContext.Provider value={contextValue}>
      {children}
    </CodeBlockEditorContext.Provider>
  )
}

interface FrontmatterTableProps {
  data: Record<string, unknown> | null
  error: string | null
}

const FrontmatterTable: React.FC<FrontmatterTableProps> = ({ data, error }) => {
  if (error) {
    return (
      <div className="p-4 text-destructive text-sm">
        <span className="font-semibold">YAML Error:</span> {error}
      </div>
    )
  }

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="p-4 text-muted-foreground text-sm italic">
        empty - switch to code view to add properties
      </div>
    )
  }

  // Format value for display
  const formatValue = (value: unknown): string => {
    if (value === null) return "null"
    if (value === undefined) return ""
    if (typeof value === "string") return value
    if (typeof value === "number" || typeof value === "boolean")
      return String(value)
    // For arrays and objects, render as YAML string
    return YAML.stringify(value).trim()
  }

  // Check if value is complex (object or array)
  const isComplex = (value: unknown): boolean => {
    return typeof value === "object" && value !== null
  }

  return (
    <div className="overflow-x-auto" data-testid="frontmatter-table">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-2 text-left font-medium w-1/4">key</th>
            <th className="px-4 py-2 text-left font-medium">value</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(data).map(([key, value]) => (
            <tr key={key} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-2 font-mono text-xs text-muted-foreground align-top">
                {key}
              </td>
              <td
                className={cn(
                  "px-4 py-2 font-mono text-xs",
                  isComplex(value) &&
                    "whitespace-pre-wrap text-muted-foreground"
                )}
              >
                {formatValue(value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const FrontmatterNodeEditorContainer: React.FC<
  FrontmatterNodeEditorContainerProps
> = ({ parentEditor, frontmatterNode, nodeKey }) => {
  const [isNodeSelected, setNodeSelected, clearNodeSelection] =
    useLexicalNodeSelection(nodeKey)

  const viewMode = frontmatterNode.__viewMode
  const yamlContent = frontmatterNode.__yaml
  const { data, error } = frontmatterNode.getParsedData()

  React.useEffect(() => {
    return mergeRegister(
      parentEditor.registerCommand(
        CLICK_COMMAND,
        (event: MouseEvent) => {
          const frontmatterElem = parentEditor.getElementByKey(nodeKey)

          if (
            frontmatterElem &&
            frontmatterElem.contains(event.target as Node)
          ) {
            if (!event.shiftKey) {
              clearNodeSelection()
            }
            setNodeSelected(!isNodeSelected)
            return true
          }

          return false
        },
        COMMAND_PRIORITY_LOW
      )
    )
  }, [
    clearNodeSelection,
    parentEditor,
    setNodeSelected,
    nodeKey,
    isNodeSelected,
  ])

  const handleCodeChange = React.useCallback(
    (code: string) => {
      parentEditor.update(() => {
        $addUpdateTag(SKIP_DOM_SELECTION_TAG)
        const node = $getNodeByKey(nodeKey)
        if (node && $isFrontmatterNode(node)) {
          ;(node as FrontmatterNode).setYaml(code)
        }
      })
    },
    [parentEditor, nodeKey]
  )

  const handleToggleViewMode = React.useCallback(() => {
    parentEditor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node && $isFrontmatterNode(node)) {
        node.setViewMode(viewMode === "table" ? "code" : "table")
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

  // memoize the yaml language extension to avoid recreating it on every render
  const yamlLanguageExtension = React.useMemo(() => yaml(), [])

  const rightActions = (
    <>
      <Select value="yaml" disabled>
        <SelectTrigger
          size="sm"
          className="w-auto !px-2 !py-0.5 !h-auto !text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="yaml">yaml</SelectItem>
        </SelectContent>
      </Select>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleViewMode}
              className="h-6 w-6 p-0 cursor-pointer"
              data-testid="frontmatter-toggle-view-mode"
            >
              {viewMode === "table" ? (
                <Code2 className="h-4 w-4" />
              ) : (
                <Table2 className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {viewMode === "table" ? "edit yaml" : "view table"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  )

  return (
    <div
      className={cn(
        "group relative rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
      )}
      data-testid="frontmatter-node"
    >
      <BlockHeader
        title="anonymous"
        emoji="📋"
        badge="frontmatter"
        rightActions={rightActions}
        onDelete={handleDelete}
      />

      {/* Content area */}
      <div
        className="overflow-hidden rounded-b-lg"
        data-testid="frontmatter-node-content"
      >
        {viewMode === "code" ? (
          <FrontmatterEditorContextProvider
            parentEditor={parentEditor}
            nodeKey={nodeKey}
          >
            <div data-testid="frontmatter-code-editor">
              <BaseCodeMirrorEditor
                language={yamlLanguageExtension}
                code={yamlContent}
                nodeKey={nodeKey}
                onCodeChange={handleCodeChange}
                showLineNumbers={true}
                mermaidNode={frontmatterNode}
              />
            </div>
          </FrontmatterEditorContextProvider>
        ) : (
          <FrontmatterTable data={data} error={error} />
        )}
      </div>
    </div>
  )
}

export function $createFrontmatterNode({
  yaml,
  key,
  viewMode = "table",
}: CreateFrontmatterNodeOptions): FrontmatterNode {
  return $applyNodeReplacement(new FrontmatterNode(yaml, key, viewMode))
}

export function $isFrontmatterNode(
  node: LexicalNode | null | undefined
): node is FrontmatterNode {
  return node instanceof FrontmatterNode
}
