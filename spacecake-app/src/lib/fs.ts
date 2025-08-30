import type { FileContent } from "@/types/workspace"
import { fnv1a64Hex } from "@/lib/hash"

// Define the interface for the electron API
export interface ElectronAPI {
  showOpenDialog: (options: { properties: string[] }) => Promise<{
    canceled: boolean
    filePaths: string[]
  }>
  readFile: (filePath: string) => Promise<{
    success: boolean
    file?: FileContent
    error?: string
  }>
  saveFile: (
    filePath: string,
    content: string
  ) => Promise<{
    success: boolean
    error?: string
  }>
  createFile: (
    filePath: string,
    content: string
  ) => Promise<{
    success: boolean
    error?: string
  }>
  createFolder: (folderPath: string) => Promise<{
    success: boolean
    error?: string
  }>
  renameFile: (
    oldPath: string,
    newPath: string
  ) => Promise<{
    success: boolean
    error?: string
  }>
  deleteFile: (filePath: string) => Promise<{
    success: boolean
    error?: string
  }>
}

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

export const readFile = async (
  filePath: string,
  electronAPI: ElectronAPI = window.electronAPI
): Promise<FileContent | null> => {
  try {
    const result = await electronAPI.readFile(filePath)

    if (result.success && result.file) {
      // compute cid from file content
      const cid = fnv1a64Hex(result.file.content)
      return {
        ...result.file,
        cid,
      }
    } else {
      console.error("failed to read file:", result.error)
      return null
    }
  } catch (error) {
    console.error("error reading file:", error)
    return null
  }
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

export const saveFile = async (
  filePath: string,
  content: string,
  electronAPI: ElectronAPI = window.electronAPI
): Promise<boolean> => {
  try {
    const result = await electronAPI.saveFile(filePath, content)
    if (result.success) {
      return true
    } else {
      console.error("failed to save file:", result.error)
      return false
    }
  } catch (error) {
    console.error("error saving file:", error)
    return false
  }
}
