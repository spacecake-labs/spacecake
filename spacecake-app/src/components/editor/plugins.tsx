import * as React from "react"
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin"
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin"
import { ClearEditorPlugin } from "@lexical/react/LexicalClearEditorPlugin"
import { ClickableLinkPlugin } from "@lexical/react/LexicalClickableLinkPlugin"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
// import { HashtagPlugin } from "@lexical/react/LexicalHashtagPlugin"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin"
import { TablePlugin } from "@lexical/react/LexicalTablePlugin"

import { ContentEditable } from "@/components/editor/content-editable"
import { DecoratorSpacerPlugin } from "@/components/editor/plugins/decorator-spacer"
import { FocusedNodePlugin } from "@/components/editor/plugins/focused-node"
import { FrontmatterPlugin } from "@/components/editor/plugins/frontmatter-plugin"
import { MermaidDiagramPlugin } from "@/components/editor/plugins/mermaid-diagram"
import { NodeNavigationPlugin } from "@/components/editor/plugins/node-navigation"
import { ReparsePlugin } from "@/components/editor/plugins/reparse"
import { SaveCommandPlugin } from "@/components/editor/plugins/save-command"
import { SlashCommandPlugin } from "@/components/editor/plugins/slash-command"
import TableCellResizer from "@/components/editor/plugins/table-cell-resizer"
import { MARKDOWN_TRANSFORMERS } from "@/components/editor/transformers/markdown"

export const Plugins = React.memo(function Plugins() {
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="relative flex-1 min-h-0">
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              placeholder={""}
              className="ContentEditable__root absolute inset-0 overflow-auto px-8 py-4 focus:outline-none"
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <AutoFocusPlugin defaultSelection="rootStart" />

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
        <SlashCommandPlugin />
      </div>

      <ClearEditorPlugin />
    </div>
  )
})
