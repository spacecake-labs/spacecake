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
import { BackspacePreventionPlugin } from "@/components/editor/plugins/backspace-prevention"
import { DecoratorSpacerPlugin } from "@/components/editor/plugins/decorator-spacer"
import { MermaidDiagramPlugin } from "@/components/editor/plugins/mermaid-diagram"
import { NodeNavigationPlugin } from "@/components/editor/plugins/node-navigation"
import { ReparsePlugin } from "@/components/editor/plugins/reparse"
import { SaveCommandPlugin } from "@/components/editor/plugins/save-command"
import { SlashCommandPlugin } from "@/components/editor/plugins/slash-command"
import TableCellResizer from "@/components/editor/plugins/table-cell-resizer"
import { MARKDOWN_TRANSFORMERS } from "@/components/editor/transformers/markdown"

export const Plugins = React.memo(function Plugins() {
  return (
    <div className="relative">
      <div className="relative">
        <RichTextPlugin
          contentEditable={
            <div className="h-full flex flex-1 min-h-0">
              <div className="h-full flex-1 min-h-0">
                <ContentEditable
                  placeholder={""}
                  className="ContentEditable__root relative block h-full min-h-0 flex-1 overflow-auto px-8 py-4 focus:outline-none"
                />
              </div>
            </div>
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
        <BackspacePreventionPlugin />
        <MermaidDiagramPlugin />
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
