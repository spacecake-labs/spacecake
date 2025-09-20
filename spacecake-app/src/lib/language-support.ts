import { LANGUAGE_SUPPORT, LanguageSpec } from "@/types/language"
import type { ViewKind } from "@/types/lexical"
import { FileType } from "@/types/workspace"

// pure functions with better naming
export function languageSupport(fileType: FileType): LanguageSpec {
  return LANGUAGE_SUPPORT[fileType]
}

export function supportsRichView(fileType: FileType): boolean {
  return LANGUAGE_SUPPORT[fileType].supportedViews.has("rich")
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
