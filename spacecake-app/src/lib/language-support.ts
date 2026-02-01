import type { ViewKind } from "@/types/lexical"

import { LANGUAGE_SUPPORT, LanguageSpec } from "@/types/language"
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

export function fileTypeToCodeMirrorLanguage(fileType: FileType): string {
  return LANGUAGE_SUPPORT[fileType].codemirrorName
}
