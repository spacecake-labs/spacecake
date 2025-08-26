import type { ViewKind } from "@/types/editor"
import { FileType } from "@/types/workspace"

// mapping of languages to supported editor views
export interface LanguageSupport {
  fileType: FileType
  supportedViews: Set<ViewKind>
}

// static mapping - define once, canonical source
const LANGUAGE_SUPPORT: Record<FileType, LanguageSupport> = {
  [FileType.Python]: {
    fileType: FileType.Python,
    supportedViews: new Set(["block", "source"]),
  },
  [FileType.JavaScript]: {
    fileType: FileType.JavaScript,
    supportedViews: new Set(["source"]),
  },
  [FileType.TypeScript]: {
    fileType: FileType.TypeScript,
    supportedViews: new Set(["source"]),
  },
  [FileType.JSX]: {
    fileType: FileType.JSX,
    supportedViews: new Set(["source"]),
  },
  [FileType.TSX]: {
    fileType: FileType.TSX,
    supportedViews: new Set(["source"]),
  },
  [FileType.Markdown]: {
    fileType: FileType.Markdown,
    supportedViews: new Set(["block", "source"]),
  },
  [FileType.Plaintext]: {
    fileType: FileType.Plaintext,
    supportedViews: new Set(["source"]),
  },
}

// pure functions with better naming
export function languageSupport(fileType: FileType): LanguageSupport {
  return LANGUAGE_SUPPORT[fileType]
}

export function supportsBlockView(fileType: FileType): boolean {
  return LANGUAGE_SUPPORT[fileType].supportedViews.has("block")
}

export function supportsSourceView(fileType: FileType): boolean {
  return LANGUAGE_SUPPORT[fileType].supportedViews.has("source")
}

export function supportedViews(fileType: FileType): Set<ViewKind> {
  return LANGUAGE_SUPPORT[fileType].supportedViews
}

// map FileType to CodeMirror language string
export function fileTypeToCodeMirrorLanguage(
  fileType: FileType
): string | null {
  switch (fileType) {
    case FileType.Python:
      return "python"
    case FileType.JavaScript:
      return "javascript"
    case FileType.TypeScript:
      return "typescript"
    case FileType.JSX:
      return "jsx"
    case FileType.TSX:
      return "tsx"
    case FileType.Markdown:
      return "markdown"
    case FileType.Plaintext:
      return null // No syntax highlighting
  }
}
