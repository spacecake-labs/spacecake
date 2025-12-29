import { BookOpen, Code, FileText, Folder as FolderIcon } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { File, FileType, Folder } from "@/types/workspace"

export function fileExtension(fileName: string): string | null {
  if (!fileName.includes(".")) return null
  return fileName.split(".").pop()?.toLowerCase() || null
}

/**
 * Gets the file type based on the file extension
 * @param extension - The file extension (with or without leading dot)
 * @returns The FileType enum value
 */
export function fileTypeFromExtension(extension: string): FileType {
  const cleanExtension = extension.replace(/^\./, "").toLowerCase()

  switch (cleanExtension) {
    case "md":
    case "markdown":
      return FileType.Markdown
    case "py":
      return FileType.Python
    case "js":
      return FileType.JavaScript
    case "ts":
      return FileType.TypeScript
    case "jsx":
      return FileType.JSX
    case "tsx":
      return FileType.TSX
    case "rs":
      return FileType.Rust
    default:
      return FileType.Plaintext
  }
}

export function fileTypeFromFileName(fileName: string): FileType {
  return fileTypeFromExtension(fileExtension(fileName) || "")
}

/**
 * Gets the file type based on the language name (e.g., from CodeMirror)
 * @param language - The language name
 * @returns The FileType enum value
 */
export function fileTypeFromLanguage(language: string): FileType {
  const cleanLanguage = language.toLowerCase()

  switch (cleanLanguage) {
    case "markdown":
      return FileType.Markdown
    case "python":
      return FileType.Python
    case "javascript":
      return FileType.JavaScript
    case "typescript":
      return FileType.TypeScript
    case "jsx":
      return FileType.JSX
    case "tsx":
      return FileType.TSX
    case "rust":
      return FileType.Rust
    default:
      return FileType.Plaintext
  }
}

/**
 * Gets the appropriate icon for a file type
 * @param fileType - The FileType enum value
 * @returns The appropriate Lucide icon component
 */
export function fileTypeIcon(fileType: FileType): LucideIcon {
  switch (fileType) {
    case FileType.Markdown:
      return BookOpen
    case FileType.Python:
    case FileType.JavaScript:
    case FileType.TypeScript:
    case FileType.JSX:
    case FileType.TSX:
    case FileType.Rust:
      return Code
    case FileType.Plaintext:
    default:
      return FileText
  }
}

/**
 * Gets the appropriate emoji for a file type
 * @param fileType - The FileType enum value
 * @returns The appropriate emoji string
 */
export function fileTypeEmoji(fileType: FileType): string {
  switch (fileType) {
    case FileType.Markdown:
      return "📖"
    case FileType.Python:
      return "🐍"
    case FileType.JavaScript:
    case FileType.JSX:
      return "🟡"
    case FileType.TypeScript:
    case FileType.TSX:
      return "🔵"
    case FileType.Rust:
      return "🦀"
    case FileType.Plaintext:
    default:
      return "📄"
  }
}

/**
 * Gets the file icon for a sidebar nav item
 * @param item - Sidebar navigation item
 * @returns The appropriate Lucide icon component
 */
export function getNavItemIcon(item: File | Folder): LucideIcon {
  if (item.kind === "file") {
    return fileTypeIcon(item.fileType)
  }
  if (item.kind === "folder") {
    return FolderIcon
  }
  return FileText
}
