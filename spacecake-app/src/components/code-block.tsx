import { useState } from "react"
import { Check, Code, Copy, MoreHorizontal, Play } from "lucide-react"

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

interface CodeBlockProps {
  code: string
  language?: string
  blockName?: string
  title?: string
  showLineNumbers?: boolean
  editable?: boolean
  theme?: "light" | "dark" | "auto"
  className?: string
  onCodeChange?: (code: string) => void
  onRun?: () => void
  children?: React.ReactNode
  dataBlockId?: string
}

export function CodeBlock({
  code,
  language = "javascript",
  blockName,
  title,
  editable = false,
  className,
  onRun,
  children,
  dataBlockId,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  // dev-only render counter for the wrapper container
  // removed dev render logging

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy code:", err)
    }
  }

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
          {title &&
            (title === "anonymous" ? (
              <h3 className="font-semibold text-foreground text-sm leading-tight">
                <Code className="inline-block h-[1em] w-[1em] align-middle text-foreground" />
              </h3>
            ) : (
              <h3 className="font-semibold text-foreground text-sm leading-tight">
                {title}
              </h3>
            ))}
          {blockName ? (
            <Badge variant="secondary" className="text-xs font-mono">
              {blockName}
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onRun && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRun}
              className="h-7 w-7 p-0 cursor-pointer"
            >
              <Play className="h-3 w-3" />
              <span className="sr-only">Run code</span>
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
            <span className="sr-only">Copy code</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 cursor-pointer"
              >
                <MoreHorizontal className="h-3 w-3" />
                <span className="sr-only">More options</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={copyToClipboard}>
                Copy code
              </DropdownMenuItem>
              <DropdownMenuItem>Download</DropdownMenuItem>
              <DropdownMenuItem>Share</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Code Editor Container */}
      <div className="overflow-hidden rounded-b-lg">
        {children || (
          <div className="min-h-[60px] p-4 bg-muted/10 rounded-b-lg">
            <pre className="text-sm font-mono text-muted-foreground">
              {code || "// Your CodeMirror component goes here"}
            </pre>
          </div>
        )}
      </div>

      {/* Resize handle for editable blocks */}
      {editable && (
        <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-0 group-hover:opacity-50 transition-opacity">
          <div className="absolute bottom-1 right-1 w-2 h-2 border-r-2 border-b-2 border-muted-foreground/50" />
        </div>
      )}
    </div>
  )
}
