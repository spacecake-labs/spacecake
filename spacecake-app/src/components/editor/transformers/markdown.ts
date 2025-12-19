import { $createLinkNode, $isLinkNode, LinkNode } from "@lexical/link"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  CHECK_LIST,
  CODE,
  ELEMENT_TRANSFORMERS,
  ElementTransformer,
  MULTILINE_ELEMENT_TRANSFORMERS,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
  TextMatchTransformer,
  type MultilineElementTransformer,
} from "@lexical/markdown"
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
  TableRowNode,
} from "@lexical/table"
import {
  $createNodeSelection,
  $isParagraphNode,
  $isTextNode,
  $setSelection,
  LexicalNode,
} from "lexical"

import { delimitWithSpaceConsumer } from "@/lib/parser/delimit"
import {
  $createCodeBlockNode,
  $isCodeBlockNode,
} from "@/components/editor/nodes/code-node"
import { delimitedNode } from "@/components/editor/nodes/delimited-node"
import {
  $createImageNode,
  $isImageNode,
  ImageNode,
} from "@/components/editor/nodes/image-node"
import {
  $createMermaidNode,
  $isMermaidNode,
} from "@/components/editor/nodes/mermaid-node"

export function createCodeTransformer(): MultilineElementTransformer {
  return {
    ...CODE,
    // dependencies: [CodeBlockNode],
    export: (node: LexicalNode) => {
      if ($isMermaidNode(node)) {
        return "```mermaid\n" + node.getDiagram() + "\n```"
      }
      if (!$isCodeBlockNode(node)) {
        return null
      }
      const language = node.getLanguage()
      const textContent = node.getTextContent()

      if (language === "markdown") {
        return textContent
      }
      const languageForMarkdown = language === "plaintext" ? "" : language
      return (
        "```" +
        (languageForMarkdown || "") +
        (textContent ? "\n" + textContent : "") +
        "\n" +
        "```"
      )
    },
    replace: (rootNode, _children, startMatch, endMatch, linesInBetween) => {
      const language = startMatch[1] ?? ""

      if (linesInBetween) {
        if (linesInBetween?.[0]?.trim().length === 0) {
          // Filter out all start and end lines that are length 0 until we find the first line with content
          while (linesInBetween.length > 0 && !linesInBetween[0].length) {
            linesInBetween.shift()
          }
        } else {
          // The first line already has content => Remove the first space of the line if it exists
          linesInBetween[0] = linesInBetween[0].startsWith(" ")
            ? linesInBetween[0].slice(1)
            : linesInBetween[0]
        }

        // Filter out all end lines that are length 0 until we find the last line with content
        while (
          linesInBetween.length > 0 &&
          !linesInBetween[linesInBetween.length - 1].length
        ) {
          linesInBetween.pop()
        }
      }

      const content = linesInBetween?.join("\n") ?? ""

      // if no ending backticks, user has just created the block
      const isUserCreated = !endMatch

      // Create mermaid node for mermaid blocks
      if (language === "mermaid") {
        const mermaidNode = $createMermaidNode({
          diagram: content,
          viewMode: isUserCreated ? "code" : "diagram",
        })

        if (!rootNode.getParent()) {
          rootNode.append(mermaidNode)
        } else {
          rootNode.replace(mermaidNode)
        }

        const nodeSelection = $createNodeSelection()
        nodeSelection.add(mermaidNode.getKey())
        $setSelection(nodeSelection)

        if (isUserCreated) {
          // refocus after replacement
          Promise.resolve(
            setTimeout(() => {
              mermaidNode.select()
            }, 0)
          )
        }
        return
      }

      // Create code block for other language blocks
      const delimitedString = delimitWithSpaceConsumer("\n" + content)

      const codeNode = delimitedNode(
        (text: string) =>
          $createCodeBlockNode({
            code: text,
            language: language || "plaintext",
            // meta: "",
            // src: "",
            // block: node.getBlock(),
          }),
        delimitedString
      )

      if (!rootNode.getParent()) {
        rootNode.append(codeNode)
      } else {
        rootNode.replace(codeNode)
      }

      const nodeSelection = $createNodeSelection()
      nodeSelection.add(codeNode.getKey())
      $setSelection(nodeSelection)

      if (isUserCreated) {
        // refocus after replacement
        codeNode.select()
      }
    },
  }
}

export const IMAGE: TextMatchTransformer = {
  dependencies: [ImageNode],
  export: (node) => {
    if (!$isImageNode(node)) {
      return null
    }

    return `![${node.getAltText()}](${node.getSrc()})`
  },
  importRegExp: /!(?:\[([^[]*)\])(?:\(([^(]+)\))/,
  regExp: /!(?:\[([^[]*)\])(?:\(([^(]+)\))$/,
  replace: (textNode, match) => {
    const [, altText, src] = match
    const imageNode = $createImageNode({
      altText,
      maxWidth: 800,
      src,
    })
    textNode.replace(imageNode)
  },
  trigger: ")",
  type: "text-match",
}

export const LINKED_IMAGE: TextMatchTransformer = {
  dependencies: [LinkNode, ImageNode],

  export: (node, exportChildren) => {
    if (!$isLinkNode(node) || !$isImageNode(node.getFirstChild())) {
      return null
    }
    const imageContent = exportChildren(node)
    return `[${imageContent}](${node.getURL()})`
  },
  importRegExp: /\[!\[([^\]]*)\]\(([^)]*)\)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/,
  regExp: /\[!\[([^\]]*)\]\(([^)]*)\)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/,

  replace: (textNode, match) => {
    const [, altText, imageUrl, linkUrl, linkTitle] = match

    const linkNode = $createLinkNode(linkUrl, { title: linkTitle })
    const imageNode = $createImageNode({
      altText,
      maxWidth: 800,
      src: imageUrl,
    })
    linkNode.append(imageNode)
    textNode.replace(linkNode)
  },
  trigger: ")",
  type: "text-match",
}

// Very primitive table setup
const TABLE_ROW_REG_EXP = /^(?:\|)(.+)(?:\|)\s?$/
const TABLE_ROW_DIVIDER_REG_EXP = /^(\| ?:?-*:? ?)+\|\s?$/

export const TABLE: ElementTransformer = {
  dependencies: [TableNode, TableRowNode, TableCellNode],
  export: (node: LexicalNode) => {
    if (!$isTableNode(node)) {
      return null
    }

    const output: string[] = []

    for (const row of node.getChildren()) {
      const rowOutput = []
      if (!$isTableRowNode(row)) {
        continue
      }

      let isHeaderRow = false
      for (const cell of row.getChildren()) {
        // It's TableCellNode so it's just to make flow happy
        if ($isTableCellNode(cell)) {
          rowOutput.push(
            $convertToMarkdownString(MARKDOWN_TRANSFORMERS, cell)
              .replace(/\n/g, "\\n")
              .trim()
          )
          if (cell.__headerState === TableCellHeaderStates.ROW) {
            isHeaderRow = true
          }
        }
      }

      output.push(`| ${rowOutput.join(" | ")} |`)
      if (isHeaderRow) {
        output.push(`| ${rowOutput.map((_) => "---").join(" | ")} |`)
      }
    }

    return output.join("\n")
  },
  regExp: TABLE_ROW_REG_EXP,
  replace: (parentNode, _1, match) => {
    // Header row
    if (TABLE_ROW_DIVIDER_REG_EXP.test(match[0])) {
      const table = parentNode.getPreviousSibling()
      if (!table || !$isTableNode(table)) {
        return
      }

      const rows = table.getChildren()
      const lastRow = rows[rows.length - 1]
      if (!lastRow || !$isTableRowNode(lastRow)) {
        return
      }

      // Add header state to row cells
      lastRow.getChildren().forEach((cell) => {
        if (!$isTableCellNode(cell)) {
          return
        }
        cell.setHeaderStyles(
          TableCellHeaderStates.ROW,
          TableCellHeaderStates.ROW
        )
      })

      // Remove line
      parentNode.remove()
      return
    }

    const matchCells = mapToTableCells(match[0])

    if (matchCells == null) {
      return
    }

    const rows = [matchCells]
    let sibling = parentNode.getPreviousSibling()
    let maxCells = matchCells.length

    while (sibling) {
      if (!$isParagraphNode(sibling)) {
        break
      }

      if (sibling.getChildrenSize() !== 1) {
        break
      }

      const firstChild = sibling.getFirstChild()

      if (!$isTextNode(firstChild)) {
        break
      }

      const cells = mapToTableCells(firstChild.getTextContent())

      if (cells == null) {
        break
      }

      maxCells = Math.max(maxCells, cells.length)
      rows.unshift(cells)
      const previousSibling = sibling.getPreviousSibling()
      sibling.remove()
      sibling = previousSibling
    }

    const table = $createTableNode()

    for (const cells of rows) {
      const tableRow = $createTableRowNode()
      table.append(tableRow)

      for (let i = 0; i < maxCells; i++) {
        tableRow.append(i < cells.length ? cells[i] : $createTableCell(""))
      }
    }

    const previousSibling = parentNode.getPreviousSibling()
    if (
      $isTableNode(previousSibling) &&
      getTableColumnsSize(previousSibling) === maxCells
    ) {
      previousSibling.append(...table.getChildren())
      parentNode.remove()
    } else {
      parentNode.replace(table)
    }

    table.selectEnd()
  },
  type: "element",
}

function getTableColumnsSize(table: TableNode) {
  const row = table.getFirstChild()
  return $isTableRowNode(row) ? row.getChildrenSize() : 0
}

const $createTableCell = (textContent: string): TableCellNode => {
  textContent = textContent.replace(/\\n/g, "\n")
  const cell = $createTableCellNode(TableCellHeaderStates.NO_STATUS)
  $convertFromMarkdownString(textContent, MARKDOWN_TRANSFORMERS, cell)
  return cell
}

const mapToTableCells = (textContent: string): Array<TableCellNode> | null => {
  const match = textContent.match(TABLE_ROW_REG_EXP)
  if (!match || !match[1]) {
    return null
  }
  return match[1].split("|").map((text) => $createTableCell(text))
}

// Filter out conflicting code transformers
const MULTILINE_ELEMENT_TRANSFORMERS_FILTERED =
  MULTILINE_ELEMENT_TRANSFORMERS.filter((transformer) => {
    return !(
      "replace" in transformer &&
      typeof transformer.replace === "function" &&
      transformer.replace.toString().includes("$createCodeNode")
    )
  })

export const MARKDOWN_TRANSFORMERS = [
  TABLE,
  CHECK_LIST,
  ...ELEMENT_TRANSFORMERS,
  createCodeTransformer(),
  ...MULTILINE_ELEMENT_TRANSFORMERS_FILTERED,
  ...TEXT_FORMAT_TRANSFORMERS,
  LINKED_IMAGE,
  IMAGE,
  ...TEXT_MATCH_TRANSFORMERS,
]
