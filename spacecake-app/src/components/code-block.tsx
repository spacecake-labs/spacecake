/**
 * A component that displays a block of content.
 * Used for code blocks and doc/context blocks.
 */

import { useState } from "react"
import { Check, Code, Copy, MoreHorizontal, Play } from "lucide-react"

import type { Block } from "@/types/parser"
import { blockId } from "@/lib/parser/block-id"
import { delimitPythonDocString } from "@/lib/parser/python/utils"
import { cn } from "@/lib/utils"
import { fileTypeEmoji, fileTypeFromLanguage } from "@/lib/workspace"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TypographyH3, TypographyP } from "@/components/typography"

interface CodeBlockProps {
  block: Block
  language?: string
  editable?: boolean
  theme?: "light" | "dark" | "auto"
  className?: string
  onCodeChange?: (code: string) => void
  onRun?: () => void
  children?: React.ReactNode
}

export function CodeBlock({
  block,
  language = "javascript",
  editable = false,
  className,
  onRun,
  children,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  // derive properties from block
  const code = block.text
  const blockName = block.name.value
  const title = blockName
  const dataBlockId = blockId(block)
  const doc =
    language === "python" && block.doc
      ? delimitPythonDocString(block.doc?.text)
      : null

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("failed to copy code:", err)
    }
  }

  // split docstring at first linebreak
  const firstLineBreak = doc?.between.indexOf("\n") ?? -1
  const docHeader =
    firstLineBreak === -1
      ? doc?.between
      : doc?.between.substring(0, firstLineBreak)
  const docContent =
    firstLineBreak === -1
      ? null
      : doc?.between.substring(firstLineBreak + 1).trimStart()

  return (
    <div
      className={cn(
        "group relative rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        className
      )}
      data-block-id={dataBlockId}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2 rounded-t-lg">
        <div className="flex items-center gap-2 flex-wrap">
          {language && (
            <span className="text-sm mr-2">
              {fileTypeEmoji(fileTypeFromLanguage(language))}
            </span>
          )}
          {title === "anonymous" ? (
            <h3 className="font-semibold text-foreground text-sm leading-tight">
              <Code className="inline-block h-[1em] w-[1em] align-middle text-foreground" />
            </h3>
          ) : (
            <h3 className="font-semibold text-foreground text-sm leading-tight">
              {title}
            </h3>
          )}
          <Badge variant="secondary" className="text-xs font-mono">
            {block.kind}
          </Badge>
        </div>

        {/* <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onRun && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRun}
              className="h-7 w-7 p-0 cursor-pointer"
            >
              <Play className="h-3 w-3" />
              <span className="sr-only">run code</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={copyToClipboard}
            className="h-7 w-7 p-0 cursor-pointer"
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            <span className="sr-only">copy code</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 cursor-pointer"
              >
                <MoreHorizontal className="h-3 w-3" />
                <span className="sr-only">more options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={copyToClipboard}>
                copy code
              </DropdownMenuItem>
              <DropdownMenuItem>download</DropdownMenuItem>
              <DropdownMenuItem>share</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div> */}
      </div>

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
