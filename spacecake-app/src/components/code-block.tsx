"use client";

import { useState } from "react";
import { Copy, Check, Play, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  showLineNumbers?: boolean;
  editable?: boolean;
  theme?: "light" | "dark" | "auto";
  className?: string;
  onCodeChange?: (code: string) => void;
  onRun?: () => void;
  children?: React.ReactNode;
}

export function CodeBlock({
  code,
  language = "javascript",
  title,
  editable = false,
  className,
  onRun,
  children,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  return (
    <div
      className={cn(
        "group relative rounded-lg border-muted bg-card text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2 rounded-t-lg">
        <div className="flex items-center gap-2">
          {language && (
            <Badge variant="secondary" className="text-xs font-mono">
              {language}
            </Badge>
          )}
          {title && (
            <span className="text-sm font-medium text-muted-foreground">
              {title}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onRun && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRun}
              className="h-7 w-7 p-0"
            >
              <Play className="h-3 w-3" />
              <span className="sr-only">Run code</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={copyToClipboard}
            className="h-7 w-7 p-0"
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
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
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
  );
}
