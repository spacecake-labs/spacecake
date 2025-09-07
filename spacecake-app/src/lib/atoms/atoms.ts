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
  WorkspaceInfo,
} from "@/types/workspace"
import { FileType } from "@/types/workspace"
import { convertToSourceView, serializeEditorToPython } from "@/lib/editor"
import { saveFile } from "@/lib/fs"
import {
  fileTypeToCodeMirrorLanguage,
  supportedViews,
  supportsBlockView,
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

export const workspaceAtom = atomWithStorage<WorkspaceInfo | null>(
  "spacecake:workspace",
  null
)

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

// Selected file path
export const selectedFilePathAtom = atom<string | null>(null)

// baseline content for the currently opened file
export const baselineFileAtom = atom<{
  path: string
  content: string
} | null>(null)

// store the current lexical editor instance
export const lexicalEditorAtom = atom<LexicalEditor | null>(null)

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
export const viewKindAtom = atom((get) => (fileType: FileType): ViewKind => {
  const userPrefs = get(userViewPreferencesAtom)
  const userPref = userPrefs[fileType]

  if (userPref) return userPref

  // default: block if supported, otherwise source
  return supportsBlockView(fileType) ? "block" : "source"
})

// Derived atom that determines if the current file can toggle between views
export const canToggleViewsAtom = atom((get) => {
  const currentFile = get(fileContentAtom)
  if (!currentFile) return false

  const views = supportedViews(currentFile.fileType)
  return views.size > 1
})

// Derived atom that handles toggling between block and source views
export const toggleViewAtom = atom(null, (get, set) => {
  const currentFile = get(fileContentAtom)
  if (!currentFile) return

  const userPrefs = get(userViewPreferencesAtom)
  const currentView =
    userPrefs[currentFile.fileType] ||
    (supportsBlockView(currentFile.fileType) ? "block" : "source")

  const nextView: ViewKind = currentView === "block" ? "source" : "block"

  // Update the preference
  set(userViewPreferencesAtom, (prev) => ({
    ...prev,
    [currentFile.fileType]: nextView,
  }))

  // Get the current editor instance for live switching
  const currentEditor = get(lexicalEditorAtom)
  if (!currentEditor) return

  // Handle live view switching for Python files
  if (currentFile.fileType === FileType.Python) {
    const sourceContent = serializeEditorToPython(currentEditor)
    if (nextView === "source") {
      convertToSourceView(sourceContent, currentFile, currentEditor)
    } else {
      convertPythonBlocksToLexical(sourceContent, currentFile, currentEditor)
    }
  }

  // Handle live view switching for Markdown files
  if (currentFile.fileType === FileType.Markdown) {
    if (nextView === "source") {
      // Convert current WYSIWYG state to markdown string
      const markdownContent = currentEditor.getEditorState().read(() => {
        return $convertToMarkdownString(MARKDOWN_TRANSFORMERS)
      })
      convertToSourceView(markdownContent, currentFile, currentEditor)
    } else {
      // Convert markdown string back to WYSIWYG state
      const markdownContent = currentEditor.getEditorState().read(() => {
        return $convertToMarkdownString(MARKDOWN_TRANSFORMERS)
      })
      currentEditor.update(() => {
        $addUpdateTag(SKIP_DOM_SELECTION_TAG)
        $convertFromMarkdownString(markdownContent, MARKDOWN_TRANSFORMERS)
      })
    }
  }
})

// An action atom to handle saving the current file
export const saveFileAtom = atom(null, async (get, set) => {
  const selectedFilePath = get(selectedFilePathAtom)
  const lexicalEditor = get(lexicalEditorAtom)
  const isSaving = get(isSavingAtom)
  const fileContent = get(fileContentAtom)
  const baseline = get(baselineFileAtom)

  if (!selectedFilePath || !lexicalEditor || isSaving) return

  set(isSavingAtom, true)
  try {
    // All the logic from doSave moves here
    let contentToWrite = ""
    const inferredType = (() => {
      if (fileContent?.fileType) return fileContent.fileType
      if (selectedFilePath) {
        const ext = selectedFilePath.split(".").pop() || ""
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
    } else if (baseline && baseline.path === selectedFilePath) {
      // fallback: write baseline until other serializers exist
      contentToWrite = baseline.content
    } else {
      contentToWrite = ""
    }

    window.dispatchEvent(new Event("sc-before-save"))
    const ok = await saveFile(selectedFilePath, contentToWrite)

    if (ok) {
      toast(`saved ${selectedFilePath}`)
      // Update the baseline to the content we just wrote
      set(baselineFileAtom, {
        path: selectedFilePath,
        content: contentToWrite,
      })
    } else {
      toast("failed to save file")
    }
  } finally {
    set(isSavingAtom, false)
  }
})
