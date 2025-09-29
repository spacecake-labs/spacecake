import type { ElectronAPI } from "@/types/electron"

// Parameterize functions to accept the API as a dependency
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

export const createFile = async (
  filePath: string,
  content: string = "",
  electronAPI: ElectronAPI = window.electronAPI
): Promise<boolean> => {
  try {
    const result = await electronAPI.createFile(filePath, content)

    if (result.success) {
      return true
    } else {
      console.error("failed to create file:", result.error)
      return false
    }
  } catch (error) {
    console.error("error creating file:", error)
    return false
  }
}

export const createFolder = async (
  folderPath: string,
  electronAPI: ElectronAPI = window.electronAPI
): Promise<boolean> => {
  try {
    const result = await electronAPI.createFolder(folderPath)

    if (result.success) {
      return true
    } else {
      console.error("failed to create folder:", result.error)
      return false
    }
  } catch (error) {
    console.error("error creating folder:", error)
    return false
  }
}

export const readFile = (
  filePath: string,
  electronAPI: ElectronAPI = window.electronAPI
) => {
  return electronAPI.readFile(filePath)
}

export const saveFile = async (
  filePath: string,
  content: string,
  electronAPI: ElectronAPI = window.electronAPI
) => {
  return electronAPI.saveFile(filePath, content)
}

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

export const pathExists = async (
  path: string,
  electronAPI: ElectronAPI = window.electronAPI
): Promise<boolean> => {
  try {
    const result = await electronAPI.pathExists(path)
    if (result.success) {
      return result.exists ?? false
    } else {
      console.error("failed to check path exists:", result.error)
      return false
    }
  } catch (error) {
    console.error("error checking path exists:", error)
    return false
  }
}
