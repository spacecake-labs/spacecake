import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown"
import { atom, WritableAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import {
  $addUpdateTag,
  SerializedEditorState,
  SKIP_DOM_SELECTION_TAG,
} from "lexical"
import type { LexicalEditor } from "lexical"
import { toast } from "sonner"

import type { ViewKind } from "@/types/lexical"
import type {
  ExpandedFolders,
  File,
  FileContent,
  FileTree,
  Folder,
} from "@/types/workspace"
import { FileType } from "@/types/workspace"
import {
  convertToSourceView,
  serializeEditorToPython,
  serializeEditorToSource,
} from "@/lib/editor"
import { saveFile } from "@/lib/fs"
import {
  fileTypeToCodeMirrorLanguage,
  supportedViews,
  supportsRichView,
} from "@/lib/language-support"
import { fileTypeFromExtension } from "@/lib/workspace"
import { convertPythonBlocksToLexical } from "@/components/editor/read-file"
import { MARKDOWN_TRANSFORMERS } from "@/components/editor/transformers/markdown"

export function atomWithToggle(
  initialValue?: boolean
): WritableAtom<boolean, [boolean?], void> {
  const anAtom = atom(initialValue, (get, set, nextValue?: boolean) => {
    const update = nextValue ?? !get(anAtom)
    set(anAtom, update)
  })

  return anAtom as WritableAtom<boolean, [boolean?], void>
}

export const quickOpenMenuOpenAtom = atomWithToggle(false)

export const fileTreeAtom = atom<FileTree>([])

// Expanded folders state (keyed by folder path)
export const expandedFoldersAtom = atom<ExpandedFolders>({})

// Loading folders state (array of folder urls currently loading)
export const loadingFoldersAtom = atom<string[]>([])

// Editor state
export const editorStateAtom = atom<SerializedEditorState | null>(null)

// File content state
export const fileContentAtom = atom<FileContent | null>(null)

export const codeMirrorLanguageAtom = atom((get) => {
  const fileContent = get(fileContentAtom)
  const fileType = fileContent?.fileType ?? FileType.Plaintext
  return fileTypeToCodeMirrorLanguage(fileType) ?? ""
})

// baseline content for the currently opened file
export const baselineFileAtom = atom<{
  path: string
  content: string
} | null>(null)

// saving state
export const isSavingAtom = atom<boolean>(false)

// Unified editing state for both create and rename operations
export const editingItemAtom = atom<{
  type: "create" | "rename"
  path: string
  value: string
  originalValue?: string // for rename operations
} | null>(null)

// Context-aware creation atoms (for dropdown menu)
export const isCreatingInContextAtom = atom<{
  kind: "file" | "folder"
  parentPath: string
} | null>(null)
export const contextItemNameAtom = atom<string>("")

// Deletion state atoms
export const deletionStateAtom = atom<{
  item: File | Folder | null
  isOpen: boolean
  isDeleting: boolean
}>({
  item: null,
  isOpen: false,
  isDeleting: false,
})

export type Theme = "light" | "dark" | "system"

// theme state (persisted)
export const themeAtom = atomWithStorage<Theme>("spacecake-theme", "system")

// View management atoms (persisted)
export const userViewPreferencesAtom = atomWithStorage<
  Partial<Record<FileType, ViewKind>>
>("spacecake-view-preferences", {})

// Derived atom that computes the current view kind for a file type
export const viewKindAtom = atom((get): ViewKind => {
  const fileContent = get(fileContentAtom)
  if (!fileContent) {
    return "source" // sensible default
  }
  const { fileType } = fileContent
  const userPrefs = get(userViewPreferencesAtom)
  const userPref = userPrefs[fileType]

  if (userPref) {
    return userPref
  }

  return supportsRichView(fileType) ? "rich" : "source"
})

// Derived atom that determines if the current file can toggle between views
export const canToggleViewsAtom = atom((get) => {
  const currentFile = get(fileContentAtom)
  if (!currentFile) return false

  const views = supportedViews(currentFile.fileType)
  return views.size > 1
})

// Derived atom that handles toggling between rich and source views
export const toggleViewAtom = atom(
  null,
  (get, set, lexicalEditor?: LexicalEditor) => {
    const currentFile = get(fileContentAtom)
    if (!currentFile) return

    const userPrefs = get(userViewPreferencesAtom)
    const currentView =
      userPrefs[currentFile.fileType] ||
      (supportsRichView(currentFile.fileType) ? "rich" : "source")

    const nextView: ViewKind = currentView === "rich" ? "source" : "rich"

    // Update the preference
    set(userViewPreferencesAtom, (prev) => ({
      ...prev,
      [currentFile.fileType]: nextView,
    }))

    // Use the passed editor instance for live switching
    if (!lexicalEditor) return

    // Handle live view switching for Python files
    if (currentFile.fileType === FileType.Python) {
      const sourceContent = serializeEditorToPython(lexicalEditor)
      if (nextView === "source") {
        convertToSourceView(sourceContent, currentFile, lexicalEditor)
      } else {
        convertPythonBlocksToLexical(currentFile, lexicalEditor)
      }
    }

    // Handle live view switching for Markdown files
    if (currentFile.fileType === FileType.Markdown) {
      if (nextView === "source") {
        // Convert current WYSIWYG state to markdown string
        const markdownContent = lexicalEditor.getEditorState().read(() => {
          return $convertToMarkdownString(MARKDOWN_TRANSFORMERS)
        })
        convertToSourceView(markdownContent, currentFile, lexicalEditor)
      } else {
        // Convert markdown string back to WYSIWYG state
        const markdownContent = lexicalEditor.getEditorState().read(() => {
          return $convertToMarkdownString(MARKDOWN_TRANSFORMERS)
        })
        lexicalEditor.update(() => {
          $addUpdateTag(SKIP_DOM_SELECTION_TAG)
          $convertFromMarkdownString(markdownContent, MARKDOWN_TRANSFORMERS)
        })
      }
    }
  }
)

// An action atom to handle saving the current file
export const saveFileAtom = atom(
  null,
  async (get, set, filePath: string | null, lexicalEditor?: LexicalEditor) => {
    const isSaving = get(isSavingAtom)
    const fileContent = get(fileContentAtom)
    const baseline = get(baselineFileAtom)

    if (!filePath || !lexicalEditor || isSaving) return

    // Calculate content and CID first
    let contentToWrite = ""
    const inferredType = (() => {
      if (fileContent?.fileType) return fileContent.fileType
      if (filePath) {
        const ext = filePath.split(".").pop() || ""
        return fileTypeFromExtension(ext)
      }
      return FileType.Plaintext
    })()

    if (inferredType === FileType.Python) {
      contentToWrite = serializeEditorToPython(lexicalEditor)
    } else if (inferredType === FileType.Markdown) {
      // For markdown files, convert Lexical state to markdown
      contentToWrite = lexicalEditor.read(() =>
        $convertToMarkdownString(MARKDOWN_TRANSFORMERS)
      )
    } else if (
      inferredType === FileType.TypeScript ||
      inferredType === FileType.JavaScript ||
      inferredType === FileType.TSX ||
      inferredType === FileType.JSX
    ) {
      // For TypeScript/JavaScript files, use the source serializer
      contentToWrite = serializeEditorToSource(lexicalEditor)
    } else if (baseline && baseline.path === filePath) {
      // fallback: write baseline until other serializers exist
      contentToWrite = baseline.content
    } else {
      contentToWrite = ""
    }

    const { fnv1a64Hex } = await import("@/lib/hash")
    const newCid = fnv1a64Hex(contentToWrite)
    const oldCid = fileContent?.cid

    // Set saving state for UI feedback
    set(isSavingAtom, true)

    try {
      // OPTIMISTIC: Update CID immediately (before save!)
      if (oldCid !== newCid) {
        set(fileContentAtom, (prev) =>
          prev && prev.path === filePath ? { ...prev, cid: newCid } : prev
        )
      }

      // Serialize the current editor state
      if (inferredType === FileType.Python) {
        contentToWrite = serializeEditorToPython(lexicalEditor)
      } else if (inferredType === FileType.Markdown) {
        contentToWrite = lexicalEditor.read(() =>
          $convertToMarkdownString(MARKDOWN_TRANSFORMERS)
        )
      }

      const ok = await saveFile(filePath, contentToWrite)

      if (ok) {
        toast(`saved ${filePath}`)
        // Update content to match what was saved
        set(fileContentAtom, (prev) =>
          prev && prev.path === filePath
            ? { ...prev, content: contentToWrite }
            : prev
        )
        // Update the baseline to the content we just wrote
        set(baselineFileAtom, {
          path: filePath,
          content: contentToWrite,
        })

        // Trigger immediate re-parsing for block splitting after successful save
        if (inferredType === FileType.Python && lexicalEditor) {
          // Create a mock FileContent object for re-parsing
          const mockFileContent = {
            path: filePath,
            name: filePath.split("/").pop() || "",
            content: contentToWrite,
            fileType: inferredType,
            size: contentToWrite.length,
            modified: new Date().toISOString(),
            etag: { mtimeMs: Date.now(), size: contentToWrite.length },
            cid: newCid,
            kind: "file" as const,
          }

          // Trigger re-parsing for block splitting
          convertPythonBlocksToLexical(mockFileContent, lexicalEditor)
        }
      } else {
        // Rollback CID on failure
        if (oldCid !== newCid && oldCid !== undefined) {
          set(fileContentAtom, (prev) =>
            prev && prev.path === filePath ? { ...prev, cid: oldCid } : prev
          )
        }
        toast("failed to save file")
      }
    } finally {
      set(isSavingAtom, false)
    }
  }
)
