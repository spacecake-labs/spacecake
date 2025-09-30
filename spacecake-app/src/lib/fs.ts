import type { ElectronAPI } from "@/types/electron"

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

export const createFolder = async (
  folderPath: string,
  electronAPI: ElectronAPI = window.electronAPI
) => await electronAPI.createFolder(folderPath)

export const readFile = (
  filePath: string,
  electronAPI: ElectronAPI = window.electronAPI
) => electronAPI.readFile(filePath)

export const saveFile = (
  filePath: string,
  content: string,
  electronAPI: ElectronAPI = window.electronAPI
) => electronAPI.saveFile(filePath, content)

export const renameFile = async (
  oldPath: string,
  newPath: string,
  electronAPI: ElectronAPI = window.electronAPI
): Promise<boolean> => {
  try {
    const result = await electronAPI.renameFile(oldPath, newPath)

    if (result.success) {
      return true
    } else {
      console.error("failed to rename file:", result.error)
      return false
    }
  } catch (error) {
    console.error("error renaming file:", error)
    return false
  }
}

export const deleteFile = async (
  filePath: string,
  electronAPI: ElectronAPI = window.electronAPI
): Promise<boolean> => {
  try {
    const result = await electronAPI.deleteFile(filePath)

    if (result.success) {
      return true
    } else {
      console.error("failed to delete file:", result.error)
      return false
    }
  } catch (error) {
    console.error("error deleting file:", error)
    return false
  }
}

export const pathExists = (
  path: string,
  electronAPI: ElectronAPI = window.electronAPI
) => electronAPI.pathExists(path)
