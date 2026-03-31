import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin"
import { ClearEditorPlugin } from "@lexical/react/LexicalClearEditorPlugin"
import { ClickableLinkPlugin } from "@lexical/react/LexicalClickableLinkPlugin"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
// import { HashtagPlugin } from "@lexical/react/LexicalHashtagPlugin"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin"
import { TablePlugin } from "@lexical/react/LexicalTablePlugin"
import { $getRoot, $isDecoratorNode, $setSelection } from "lexical"
import * as React from "react"

import { ContentEditable } from "@/components/editor/content-editable"
import { DecoratorSpacerPlugin } from "@/components/editor/plugins/decorator-spacer"
import { FocusedNodePlugin } from "@/components/editor/plugins/focused-node"
import { FrontmatterPlugin } from "@/components/editor/plugins/frontmatter-plugin"
import { MermaidDiagramPlugin } from "@/components/editor/plugins/mermaid-diagram"
import { NodeNavigationPlugin } from "@/components/editor/plugins/node-navigation"
import { ReparsePlugin } from "@/components/editor/plugins/reparse"
import { SaveCommandPlugin } from "@/components/editor/plugins/save-command"
import { SearchPlugin } from "@/components/editor/plugins/search-plugin"
import { SlashCommandPlugin } from "@/components/editor/plugins/slash-command"
import TableCellResizer from "@/components/editor/plugins/table-cell-resizer"
import { MARKDOWN_TRANSFORMERS } from "@/components/editor/transformers/markdown"

function AutoFocusPlugin(): null {
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    let isDecorator = false

    editor.read(() => {
      const root = $getRoot()
      const firstChild = root.getFirstChild()
      isDecorator = !!(firstChild && $isDecoratorNode(firstChild))
    })

    if (isDecorator) {
      editor.update(() => {
        $setSelection(null)
      })
      setTimeout(() => {
        editor.read(() => {
          const root = $getRoot()
          const firstChild = root.getFirstChild()
          if (firstChild && $isDecoratorNode(firstChild)) {
            const selectable = firstChild as unknown as { select?: () => void }
            if (typeof selectable.select === "function") {
              selectable.select()
            }
          }
        })
      })
    } else {
      editor.focus(
        () => {
          const activeElement = document.activeElement
          const rootElement = editor.getRootElement()
          if (
            rootElement !== null &&
            (activeElement === null || !rootElement.contains(activeElement))
          ) {
            rootElement.focus({ preventScroll: true })
          }
        },
        { defaultSelection: "rootStart" },
      )
    }
  }, [editor])

  return null
}

export const Plugins = React.memo(function Plugins({ filePath = "" }: { filePath?: string }) {
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="relative flex-1 min-h-0">
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              placeholder={""}
              className="ContentEditable__root absolute inset-0 overflow-y-auto p-4 focus:outline-none [scrollbar-gutter:stable_both-edges]"
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <AutoFocusPlugin />

        <ClickableLinkPlugin />
        <CheckListPlugin />
        <HorizontalRulePlugin />
        <TablePlugin />
        <TableCellResizer />
        <ListPlugin />
        <TabIndentationPlugin />
        {/* <HashtagPlugin /> */}
        <HistoryPlugin />
        <NodeNavigationPlugin />
        <FocusedNodePlugin />
        <MermaidDiagramPlugin />
        <FrontmatterPlugin />
        <DecoratorSpacerPlugin />
        <MarkdownShortcutPlugin transformers={MARKDOWN_TRANSFORMERS} />

        {/* Freeze editor during save/reparse, perform reparse, trigger save */}
        {/* <FreezePlugin /> */}
        <ReparsePlugin />
        <SaveCommandPlugin />
        <SearchPlugin filePath={filePath} />
        <SlashCommandPlugin />
      </div>

      <ClearEditorPlugin />
    </div>
  )
})
