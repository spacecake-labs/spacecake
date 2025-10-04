import type { ElectronAPI } from "@/types/electron"
import type { AbsolutePath } from "@/types/workspace"

export const openDirectory = async (
  electronAPI: ElectronAPI = window.electronAPI
): Promise<string | null> => {
  try {
    const result = await electronAPI.showOpenDialog({
      properties: ["openDirectory"],
    })

    if (!result.canceled && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0]
      return selectedPath
    }
    return null
  } catch (error) {
    console.error("error opening folder:", error)
    return null
  }
}

export const createFolder = (
  folderPath: AbsolutePath,
  electronAPI: ElectronAPI = window.electronAPI
) => electronAPI.createFolder(folderPath)

export const readFile = (
  filePath: AbsolutePath,
  electronAPI: ElectronAPI = window.electronAPI
) => electronAPI.readFile(filePath)

export const saveFile = (
  filePath: AbsolutePath,
  content: string,
  electronAPI: ElectronAPI = window.electronAPI
) => electronAPI.saveFile(filePath, content)

export const rename = (
  path: AbsolutePath,
  newPath: AbsolutePath,
  electronAPI: ElectronAPI = window.electronAPI
) => electronAPI.rename(path, newPath)

export const remove = (
  filePath: AbsolutePath,
  recursive?: boolean,
  electronAPI: ElectronAPI = window.electronAPI
) => electronAPI.remove(filePath, recursive)

export const pathExists = (
  path: AbsolutePath,
  electronAPI: ElectronAPI = window.electronAPI
) => electronAPI.pathExists(path)

export const readDirectory = (
  path: AbsolutePath,
  electronAPI: ElectronAPI = window.electronAPI
) => electronAPI.readDirectory(path)

export const startWatcher = (
  path: AbsolutePath,
  electronAPI: ElectronAPI = window.electronAPI
) => electronAPI.startWatcher(path)

export const stopWatcher = (
  path: AbsolutePath,
  electronAPI: ElectronAPI = window.electronAPI
) => electronAPI.stopWatcher(path)
