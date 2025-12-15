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

export function fileTypeToCodeMirrorLanguage(
  fileType: FileType
): string | null {
  const name = LANGUAGE_SUPPORT[fileType].codemirrorName
  return name || null
}
