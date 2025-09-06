import { useSetAtom } from "jotai"

import {
  baselineFileAtom,
  editorStateAtom,
  expandedFoldersAtom,
  fileContentAtom,
  fileTreeAtom,
  lexicalEditorAtom,
  loadingFoldersAtom,
  selectedFilePathAtom,
  workspaceAtom,
} from "@/lib/atoms/atoms"

/**
 * A hook that returns a function to clear all workspace-related state.
 */
export function useClearWorkspace() {
  const setFileTree = useSetAtom(fileTreeAtom)
  const setExpandedFolders = useSetAtom(expandedFoldersAtom)
  const setLoadingFolders = useSetAtom(loadingFoldersAtom)
  const setSelectedFilePath = useSetAtom(selectedFilePathAtom)
  const setFileContent = useSetAtom(fileContentAtom)
  const setEditorState = useSetAtom(editorStateAtom)
  const setBaselineFile = useSetAtom(baselineFileAtom)
  const setLexicalEditor = useSetAtom(lexicalEditorAtom)
  const setWorkspace = useSetAtom(workspaceAtom)

  return () => {
    setFileTree([])
    setExpandedFolders({})
    setLoadingFolders([])
    setSelectedFilePath(null)
    setFileContent(null)
    setEditorState(null)
    setBaselineFile(null)
    setLexicalEditor(null)
    setWorkspace(null)
  }
}
