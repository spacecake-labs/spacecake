import React from "react"

import type { CodeBlockEditorContextValue } from "@/components/editor/nodes/code-node"
import type { LanguageSpec } from "@/types/language"
import type { Block } from "@/types/parser"

import { BlockHeader } from "@/components/editor/block-header"
import { TypographyH3, TypographyP } from "@/components/typography"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useRoute } from "@/hooks/use-route"
import { blockId } from "@/lib/parser/block-id"
import { delimitPythonDocString } from "@/lib/parser/python/utils"
import { cn } from "@/lib/utils"
import { fileTypeEmoji, fileTypeFromLanguage } from "@/lib/workspace"
import { LANGUAGE_SUPPORT } from "@/types/language"
import { FileType } from "@/types/workspace"

type CodeMirrorLanguage = LanguageSpec["codemirrorName"]

interface CodeBlockProps {
  block: Block
  language?: CodeMirrorLanguage
  editable?: boolean
  theme?: "light" | "dark" | "auto"
  className?: string
  onCodeChange?: (code: string) => void
  onRun?: () => void
  onDelete?: () => void
  children?: React.ReactNode
  codeBlockContext?: CodeBlockEditorContextValue
}

export function CodeBlock({
  block,
  language = "plaintext" as CodeMirrorLanguage,
  editable = false,
  className,
  // onRun,
  children,
  codeBlockContext,
  onDelete,
}: CodeBlockProps) {
  const route = useRoute()

  // can change language only if the file is markdown and in rich view
  const canChangeLanguage = route?.fileType === FileType.Markdown && route?.viewKind === "rich"

  const code = block.text
  const blockName = block.name.value
  const title = blockName
  const badgeValue =
    route?.viewKind === "source" ? (route?.filePath?.split("/").pop() ?? block.kind) : block.kind

  const dataBlockId = blockId(block)
  const doc = language === "python" && block.doc ? delimitPythonDocString(block.doc?.text) : null

  const firstLineBreak = doc?.between.indexOf("\n") ?? -1
  const docHeader = firstLineBreak === -1 ? doc?.between : doc?.between.substring(0, firstLineBreak)
  const docContent =
    firstLineBreak === -1 ? null : doc?.between.substring(firstLineBreak + 1).trimStart()

  const availableLanguages = Object.entries(LANGUAGE_SUPPORT).map(([fileType, spec]) => ({
    value: fileType,
    label: spec.name.toLowerCase(),
  }))

  const languageSelector = codeBlockContext && editable && (
    <Select
      value={language}
      onValueChange={codeBlockContext.setLanguage}
      disabled={!canChangeLanguage}
    >
      <SelectTrigger size="sm" className="w-auto !px-2 !py-0.5 !h-auto !text-xs font-mono">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {availableLanguages.map(({ value, label }) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <div
      className={cn(
        "group relative rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        className,
      )}
      data-block-id={dataBlockId}
    >
      <BlockHeader
        emoji={language && fileTypeEmoji(fileTypeFromLanguage(language))}
        title={title}
        badge={badgeValue}
        rightActions={languageSelector}
        onDelete={onDelete}
      />

      {/* doc section */}
      {doc && (
        <div className="border-b bg-muted/10 px-4 py-3" data-section="doc">
          <TypographyH3>{docHeader}</TypographyH3>
          {docContent && <TypographyP>{docContent}</TypographyP>}
        </div>
      )}

      {/* code section */}
      <div className="overflow-hidden rounded-b-lg" data-section="code">
        {children || (
          <div className="min-h-[60px] p-4 bg-muted/10 rounded-b-lg">
            <pre className="text-sm font-mono text-muted-foreground">
              {code || "// Your CodeMirror component goes here"}
            </pre>
          </div>
        )}
      </div>

      {/* resize handle for editable blocks */}
      {editable && (
        <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-0 group-hover:opacity-50 transition-opacity">
          <div className="absolute bottom-1 right-1 w-2 h-2 border-r-2 border-b-2 border-muted-foreground/50" />
        </div>
      )}
    </div>
  )
}
