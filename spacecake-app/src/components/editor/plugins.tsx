import * as React from "react"
import { CheckListPlugin } from "@lexical/react/LexicalCheckListPlugin"
import { ClearEditorPlugin } from "@lexical/react/LexicalClearEditorPlugin"
import { ClickableLinkPlugin } from "@lexical/react/LexicalClickableLinkPlugin"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { HashtagPlugin } from "@lexical/react/LexicalHashtagPlugin"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin"
import { ListPlugin } from "@lexical/react/LexicalListPlugin"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin"
import { TablePlugin } from "@lexical/react/LexicalTablePlugin"
import { atom, useAtom } from "jotai"

// import { CommandMenu } from "@/components/command-menu"
// import { CodeHighlightPlugin } from "@/components/editor/plugins/code-highlighter";
// import { CodeBlockPlugin } from "@/components/editor/plugins/code-block";

// import { CodeToolbarPlugin } from "@/components/editor/plugins/code-toolbar";

import { ContentEditable } from "@/components/editor/content-editable"
import { NodeNavigationPlugin } from "@/components/editor/plugins/node-navigation"
import { SlashCommandPlugin } from "@/components/editor/plugins/slash-command"
import { MARKDOWN_TRANSFORMERS } from "@/components/editor/transformers/markdown"

const floatingAnchorAtom = atom<HTMLDivElement | null>(null)

export const Plugins = React.memo(function Plugins() {
  const [, setFloatingAnchorElem] = useAtom(floatingAnchorAtom)

  const onRef = (_floatingAnchorElem: HTMLDivElement) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem)
    }
  }

  const placeholder = "..."

  return (
    <div className="relative">
      <div className="relative">
        <RichTextPlugin
          contentEditable={
            <div className="h-full flex flex-1 min-h-0">
              <div className="h-full flex-1 min-h-0" ref={onRef}>
                <ContentEditable
                  placeholder={placeholder}
                  className="ContentEditable__root relative block h-full min-h-0 flex-1 overflow-auto px-8 py-4 focus:outline-none"
                />
              </div>
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />

        <ClickableLinkPlugin />
        <CheckListPlugin />
        <HorizontalRulePlugin />
        <TablePlugin />
        <ListPlugin />
        <TabIndentationPlugin />
        <HashtagPlugin />
        <HistoryPlugin />
        {/* <CodeHighlightPlugin /> */}
        {/* <CodeBlockPlugin /> */}
        <NodeNavigationPlugin />

        {/* <CodeToolbarPlugin /> */}
        <MarkdownShortcutPlugin transformers={MARKDOWN_TRANSFORMERS} />

        {/* Command Menu - accessible via Cmd+k */}
        {/* <CommandMenu /> */}
        <SlashCommandPlugin />
      </div>

      <ClearEditorPlugin />
    </div>
  )
})
