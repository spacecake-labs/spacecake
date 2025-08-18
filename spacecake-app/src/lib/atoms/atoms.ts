import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import type {
  WorkspaceInfo,
  FileContent,
  FileTree,
  ExpandedFolders,
  File,
  Folder,
} from "@/types/workspace";
import { FileType } from "@/types/workspace";
import type { PyParsedFile } from "@/types/parser";
import { SerializedEditorState } from "lexical";
import type { LexicalEditor } from "lexical";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from "@lexical/markdown";
import type { ViewKind } from "@/types/editor";
import { supportsBlockView, supportedViews } from "@/lib/language-support";
import { serializeEditorToPython, convertToSourceView } from "@/lib/editor";
import { convertPythonBlocksToLexical } from "@/components/editor/read-file";

export const workspaceAtom = atom<WorkspaceInfo | null>(null);
export const loadingAtom = atom<boolean>(false);

export const tFileTreeAtom = atom<FileTree>([]);

// Expanded folders state (keyed by folder path)
export const expandedFoldersAtom = atom<ExpandedFolders>({});

// Loading folders state (array of folder urls currently loading)
export const loadingFoldersAtom = atom<string[]>([]);

// Editor state
export const editorStateAtom = atom<SerializedEditorState | null>(null);

// File content state
export const fileContentAtom = atom<FileContent | null>(null);

// Selected file path
export const selectedFilePathAtom = atom<string | null>(null);

// baseline content for the currently opened file
export const baselineFileAtom = atom<{
  path: string;
  content: string;
} | null>(null);

// store the current lexical editor instance
export const lexicalEditorAtom = atom<LexicalEditor | null>(null);

// saving state
export const isSavingAtom = atom<boolean>(false);

// recently saved indicator
export const recentlySavedAtom = atom<boolean>(false);

// per-path last saved etag (mtimeMs + size) to suppress self-watch events
export const lastSavedEtagAtom = atom<
  Record<string, { mtimeMs: number; size: number }>
>({});

// Unified editing state for both create and rename operations
export const editingItemAtom = atom<{
  type: "create" | "rename";
  path: string;
  value: string;
  originalValue?: string; // for rename operations
} | null>(null);

// File creation and editing atoms
export const isCreatingFileAtom = atom<boolean>(false);
export const fileNameAtom = atom<string>("");
export const isRenamingFileAtom = atom<boolean>(false);
export const renameFileNameAtom = atom<string>("");

// Context-aware creation atoms (for dropdown menu)
export const isCreatingInContextAtom = atom<{
  kind: "file" | "folder";
  parentPath: string;
} | null>(null);
export const contextItemNameAtom = atom<string>("");

// Deletion state atoms
export const deletionStateAtom = atom<{
  item: File | Folder | null;
  isOpen: boolean;
  isDeleting: boolean;
}>({
  item: null,
  isOpen: false,
  isDeleting: false,
});

// Tree-sitter parsing atoms
export const parsedFileAtom = atom<PyParsedFile | null>(null);
export const parsedAnnotationsAtom = atom<PyParsedFile | null>(null);
export const parsingStatusAtom = atom<{
  isParsing: boolean;
  error: string | null;
}>({
  isParsing: false,
  error: null,
});

export type Theme = "light" | "dark" | "system";

// theme state (persisted)
export const themeAtom = atomWithStorage<Theme>("spacecake-theme", "system");

// View management atoms
export const userViewPreferencesAtom = atom<
  Partial<Record<FileType, ViewKind>>
>({});

// Derived atom that computes the current view kind for a file type
export const viewKindAtom = atom((get) => (fileType: FileType): ViewKind => {
  const userPrefs = get(userViewPreferencesAtom);
  const userPref = userPrefs[fileType];

  if (userPref) return userPref;

  // default: block if supported, otherwise source
  return supportsBlockView(fileType) ? "block" : "source";
});

// Derived atom that determines if the current file can toggle between views
export const canToggleViewsAtom = atom((get) => {
  const currentFile = get(fileContentAtom);
  if (!currentFile) return false;

  const views = supportedViews(currentFile.fileType);
  return views.size > 1;
});

// Derived atom that handles toggling between block and source views
export const toggleViewAtom = atom(null, (get, set) => {
  const currentFile = get(fileContentAtom);
  if (!currentFile) return;

  const viewKind = get(viewKindAtom);
  const currentView = viewKind(currentFile.fileType);

  if (!currentView) return;

  // Simple toggle: block ↔ source
  const nextView: ViewKind = currentView === "block" ? "source" : "block";

  // Update the preference
  set(userViewPreferencesAtom, (prev) => ({
    ...prev,
    [currentFile.fileType]: nextView,
  }));

  // Get the current editor instance for live switching
  const currentEditor = get(lexicalEditorAtom);
  if (!currentEditor) return;

  // Handle live view switching for Python files
  if (currentFile.fileType === FileType.Python) {
    const sourceContent = serializeEditorToPython(currentEditor);
    if (nextView === "source") {
      convertToSourceView(sourceContent, currentFile, currentEditor);
    } else {
      convertPythonBlocksToLexical(sourceContent, currentFile, currentEditor);
    }
  }

  // Handle live view switching for Markdown files
  if (currentFile.fileType === FileType.Markdown) {
    if (nextView === "source") {
      // Convert current WYSIWYG state to markdown string
      const markdownContent = currentEditor.getEditorState().read(() => {
        return $convertToMarkdownString(TRANSFORMERS);
      });
      convertToSourceView(markdownContent, currentFile, currentEditor);
    } else {
      // Convert markdown string back to WYSIWYG state
      const markdownContent = currentEditor.getEditorState().read(() => {
        return $convertToMarkdownString(TRANSFORMERS);
      });
      currentEditor.update(() => {
        $convertFromMarkdownString(markdownContent, TRANSFORMERS);
      });
    }
  }
});
