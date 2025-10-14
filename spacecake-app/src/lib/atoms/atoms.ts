import { EditorPrimaryKey, FilePrimaryKey } from "@/schema"
import { $convertToMarkdownString } from "@lexical/markdown"
import { atom, WritableAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { SerializedEditorState } from "lexical"
import type { LexicalEditor } from "lexical"
import { toast } from "sonner"

import type {
  ExpandedFolders,
  File,
  FileContent,
  FileTree,
  Folder,
} from "@/types/workspace"
import { AbsolutePath, FileType } from "@/types/workspace"
import { serializeEditorToPython, serializeEditorToSource } from "@/lib/editor"
import { saveFile } from "@/lib/fs"
import { fileTypeToCodeMirrorLanguage } from "@/lib/language-support"
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

// An action atom to handle saving the current file
export const saveFileAtom = atom(
  null,
  async (
    get,
    set,
    filePath: AbsolutePath | null,
    lexicalEditor?: LexicalEditor
  ) => {
    const isSaving = get(isSavingAtom)
    const fileContent = get(fileContentAtom)

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
      contentToWrite = serializeEditorToPython(lexicalEditor.getEditorState())
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
      contentToWrite = serializeEditorToSource(lexicalEditor.getEditorState())
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
        contentToWrite = serializeEditorToPython(lexicalEditor.getEditorState())
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

        // Trigger immediate re-parsing for block splitting after successful save
        if (inferredType === FileType.Python && lexicalEditor) {
          // Create a mock FileContent object for re-parsing
          const mockEditorFile = {
            fileId: FilePrimaryKey(""),
            editorId: EditorPrimaryKey(""),
            path: filePath,
            name: filePath.split("/").pop() || "",
            content: contentToWrite,
            fileType: inferredType,
          }

          // Trigger re-parsing for block splitting
          convertPythonBlocksToLexical(mockEditorFile, lexicalEditor)
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
