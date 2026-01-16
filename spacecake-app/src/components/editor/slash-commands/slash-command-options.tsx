/**
 * Defines the slash command options for the editor.
 */

// import { JSX } from "react"
import { MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin"
import { $createHeadingNode } from "@lexical/rich-text"
import { $setBlocksType } from "@lexical/selection"
import {
  $createNodeSelection,
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  LexicalEditor,
} from "lexical"
import {
  Code,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  // List,
  // ListOrdered,
  // Minus,
  // Quote,
  Type,
} from "lucide-react"

import { insertBlockNode } from "@/lib/editor/insert-block-node"
import { $createCodeBlockNode } from "@/components/editor/nodes/code-node"
import {
  $createFrontmatterNode,
  $isFrontmatterNode,
} from "@/components/editor/nodes/frontmatter-node"

export class SlashCommandOption extends MenuOption {
  title: string
  icon?: React.ReactElement
  keywords: Array<string>
  keyboardShortcut?: string
  onSelect: (queryString: string) => void

  constructor(
    title: string,
    options: {
      icon?: React.ReactElement
      keywords?: Array<string>
      keyboardShortcut?: string
      onSelect: (queryString: string) => void
    }
  ) {
    super(title)
    this.title = title
    this.keywords = options.keywords || []
    this.icon = options.icon
    this.keyboardShortcut = options.keyboardShortcut
    this.onSelect = options.onSelect.bind(this)
  }
}

// type ShowModal = (
//   title: string
//   // showModal: (onClose: () => void) => JSX.Element
// ) => void

export function slashCommandOptions(
  editor: LexicalEditor,
  language: string
  // showModal: ShowModal
) {
  return [
    new SlashCommandOption("code", {
      icon: <Code className="w-4 h-4" />,
      keywords: [
        "code",
        "codeblock",
        "snippet",
        "javascript",
        "python",
        "markdown",
      ],
      onSelect: () =>
        editor.update(() => {
          const selection = $getSelection()

          if ($isRangeSelection(selection)) {
            if (selection.isCollapsed()) {
              const codeNode = $createCodeBlockNode({
                code: "",
                language: language,
                // meta: String(block.kind),
                // src: filePath,
                // block: block,
              })
              insertBlockNode(codeNode, selection)

              const nodeSelection = $createNodeSelection()
              nodeSelection.add(codeNode.getKey())
              $setSelection(nodeSelection)

              Promise.resolve(
                setTimeout(() => {
                  codeNode.select()
                }, 0)
              )
            } else {
              // Will this ever happen?
              const textContent = selection.getTextContent()
              const codeNode = $createCodeBlockNode({
                code: textContent,
                language: language,
                // meta: String(block.kind),
                // src: filePath,
                // block: block,
              })
              insertBlockNode(codeNode, selection)
              selection.insertRawText(textContent)
            }
          }
        }),
    }),
    new SlashCommandOption("frontmatter", {
      icon: <FileText className="w-4 h-4" />,
      keywords: ["frontmatter", "yaml", "metadata", "fm", "properties"],
      onSelect: () =>
        editor.update(() => {
          const root = $getRoot()
          const firstChild = root.getFirstChild()

          // Check if frontmatter already exists
          if (firstChild && $isFrontmatterNode(firstChild)) {
            // Focus existing frontmatter instead of creating new
            firstChild.select()
            return
          }

          const frontmatterNode = $createFrontmatterNode({
            yaml: "",
            viewMode: "code", // Start in code mode for new frontmatter
          })

          // Insert at the very beginning
          if (firstChild) {
            firstChild.insertBefore(frontmatterNode)
          } else {
            root.append(frontmatterNode)
          }

          const nodeSelection = $createNodeSelection()
          nodeSelection.add(frontmatterNode.getKey())
          $setSelection(nodeSelection)

          Promise.resolve(
            setTimeout(() => {
              frontmatterNode.select()
            }, 0)
          )
        }),
    }),
    new SlashCommandOption("text", {
      icon: <Type className="w-4 h-4" />,
      keywords: ["normal", "paragraph", "p", "text"],
      onSelect: () =>
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createParagraphNode())
          }
        }),
    }),

    new SlashCommandOption("heading 1", {
      icon: <Heading1 className="w-4 h-4" />,
      keywords: ["heading", "header", "h1", "title"],
      keyboardShortcut: "#",
      onSelect: () =>
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createHeadingNode(`h1`))
          }
        }),
    }),
    new SlashCommandOption("heading 2", {
      icon: <Heading2 className="w-4 h-4" />,
      keywords: ["heading", "header", "h2", "subtitle"],
      keyboardShortcut: "##",
      onSelect: () =>
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createHeadingNode(`h2`))
          }
        }),
    }),
    new SlashCommandOption("heading 3", {
      icon: <Heading3 className="w-4 h-4" />,
      keywords: ["heading", "header", "h3"],
      keyboardShortcut: "###",
      onSelect: () =>
        editor.update(() => {
          const selection = $getSelection()
          if ($isRangeSelection(selection)) {
            $setBlocksType(selection, () => $createHeadingNode(`h3`))
          }
        }),
    }),
    // new SlashCommandOption("bullet list", {
    //   icon: <List className="w-4 h-4" />,
    //   keywords: ["bullet", "list", "ul", "unordered"],
    //   onSelect: () => {
    //     // placeholder for bullet list action
    //   },
    // }),
    // new SlashCommandOption("numbered list", {
    //   icon: <ListOrdered className="w-4 h-4" />,
    //   keywords: ["numbered", "list", "ol", "ordered"],
    //   onSelect: () => {
    //     // placeholder for numbered list action
    //   },
    // }),
    // new SlashCommandOption("quote", {
    //   icon: <Quote className="w-4 h-4" />,
    //   keywords: ["quote", "blockquote", "citation"],
    //   onSelect: () => {
    //     // placeholder for quote action
    //   },
    // }),
    // new SlashCommandOption("divider", {
    //   icon: <Minus className="w-4 h-4" />,
    //   keywords: ["divider", "horizontal rule", "hr", "separator"],
    //   onSelect: () => {
    //     // placeholder for divider action
    //   },
    // }),
  ]
}
