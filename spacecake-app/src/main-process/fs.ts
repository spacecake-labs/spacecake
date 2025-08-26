import type { Dirent } from "fs"
import fs from "fs/promises"
import path from "path"

import writeFileAtomic from "write-file-atomic"

import type { FileContent } from "@/types/workspace"
import { FileType } from "@/types/workspace"
import { fnv1a64Hex } from "@/lib/hash"

export interface FileNode {
  name: string
  isDirectory(): boolean
}
export interface FileStat {
  size: number
  mtime: Date
  isDirectory(): boolean
}
export interface Fs {
  readdir: (
    dirPath: string,
    opts?: { withFileTypes?: boolean }
  ) => Promise<FileNode[]>
  stat: (path: string) => Promise<FileStat>
  access: (path: string) => Promise<void>
  mkdir: (
    path: string,
    options?: { recursive?: boolean }
  ) => Promise<string | undefined>
  writeFile: (
    path: string,
    data: string,
    options?: BufferEncoding | { encoding?: BufferEncoding }
  ) => Promise<void>
  readFile: (
    path: string,
    options?: BufferEncoding | { encoding?: BufferEncoding }
  ) => Promise<string>
  rename: (oldPath: string, newPath: string) => Promise<void>
  rmdir: (path: string, options?: { recursive?: boolean }) => Promise<void>
  unlink: (path: string) => Promise<void>
}

// Create an fs adapter that implements our Fs interface
const createFsAdapter = (): Fs => ({
  async readdir(
    dirPath: string,
    opts?: { withFileTypes?: boolean }
  ): Promise<FileNode[]> {
    if (opts?.withFileTypes) {
      const dirents = await fs.readdir(dirPath, { withFileTypes: true })
      return dirents.map((dirent: Dirent) => ({
        name: dirent.name,
        path: path.join(dirPath, dirent.name),
        mtime: new Date(), // We'll need to stat for real mtime if needed
        isDirectory: () => dirent.isDirectory(),
      }))
    } else {
      const names = await fs.readdir(dirPath)
      return Promise.all(
        names.map(async (name: string) => {
          const fullPath = path.join(dirPath, name)
          const stats = await fs.stat(fullPath)
          return {
            name,
            path: fullPath,
            mtime: stats.mtime,
            isDirectory: () => stats.isDirectory(),
          }
        })
      )
    }
  },
  stat: fs.stat,
  access: fs.access,
  mkdir: fs.mkdir,
  writeFile: fs.writeFile,
  async readFile(
    path: string,
    options?: BufferEncoding | { encoding?: BufferEncoding }
  ): Promise<string> {
    if (typeof options === "string") {
      return fs.readFile(path, { encoding: options })
    } else if (options?.encoding) {
      return fs.readFile(path, { encoding: options.encoding })
    } else {
      return fs.readFile(path, { encoding: "utf8" })
    }
  },
  rename: fs.rename,
  rmdir: fs.rmdir,
  unlink: fs.unlink,
})

// Create the default fs adapter instance
const fsAdapter = createFsAdapter()

/**
 * Ensures the .spacecake folder exists in the given workspace directory
 * @param workspacePath - The workspace directory path
 * @param fsModule - The fs module to use (defaults to fs/promises)
 * @returns Promise that resolves when the folder is created or already exists
 */
export async function ensureSpacecakeFolder(
  workspacePath: string,
  fsModule: Fs = fsAdapter
): Promise<void> {
  const spacecakePath = path.join(workspacePath, ".spacecake")
  try {
    // Check if the folder already exists
    await fsModule.access(spacecakePath)
  } catch {
    // Folder doesn't exist, create it
    await fsModule.mkdir(spacecakePath, { recursive: true })
  }
}

/**
 * Creates a new file in the specified directory
 * @param filePath - The full path where the file should be created
 * @param content - The initial content of the file (optional)
 * @param fsModule - The fs module to use (defaults to fs/promises)
 * @returns Promise that resolves when the file is created
 */
export async function createFile(
  filePath: string,
  content: string = "",
  fsModule: Fs = fsAdapter
): Promise<void> {
  await fsModule.writeFile(filePath, content, { encoding: "utf8" })
}

/**
 * Creates a new folder in the specified directory
 * @param folderPath - The full path where the folder should be created
 * @param fsModule - The fs module to use (defaults to fs/promises)
 * @returns Promise that resolves when the folder is created
 */
export async function createFolder(
  folderPath: string,
  fsModule: Fs = fsAdapter
): Promise<void> {
  await fsModule.mkdir(folderPath, { recursive: true })
}

/**
 * Gets the file type based on the file extension
 * @param fileName - The name of the file
 * @returns The FileType enum value
 */
export function getFileType(fileName: string): FileType {
  const extension = fileName.split(".").pop()?.toLowerCase()

  switch (extension) {
    case "md":
    case "markdown":
      return FileType.Markdown
    case "py":
      return FileType.Python
    default:
      return FileType.Plaintext
  }
}

/**
 * Reads a file and returns both content and metadata
 * @param filePath - The path of the file to read
 * @param fsModule - The fs module to use (defaults to fs/promises)
 * @returns Promise that resolves to file entry with content
 */
export async function readFile(
  filePath: string,
  fsModule: Fs = fsAdapter
): Promise<FileContent> {
  const [content, stats] = await Promise.all([
    fsModule.readFile(filePath, { encoding: "utf8" }),
    fsModule.stat(filePath),
  ])

  const pathParts = filePath.split(path.sep)
  const name = pathParts[pathParts.length - 1]

  return {
    name,
    path: filePath,
    kind: "file" as const,
    etag: {
      mtimeMs: stats.mtime.getTime(),
      size: stats.size,
    },
    content,
    fileType: getFileType(name),
    cid: fnv1a64Hex(content),
  }
}

/**
 * Renames a file or directory
 * @param oldPath - The current path of the file/directory
 * @param newPath - The new path for the file/directory
 * @param fsModule - The fs module to use (defaults to fs/promises)
 * @returns Promise that resolves when the file/directory is renamed
 * @throws Error if the new path already exists
 */
export async function renameFile(
  oldPath: string,
  newPath: string,
  fsModule: Fs = fsAdapter
): Promise<void> {
  // Check if the new path already exists
  try {
    await fsModule.access(newPath)
    throw new Error(`file or directory already exists: ${newPath}`)
  } catch (error) {
    // If access throws an error, it means the file doesn't exist, which is what we want
    if (error instanceof Error && error.message.includes("already exists")) {
      throw error
    }
    // Otherwise, the file doesn't exist, so we can proceed with the rename
  }

  await fsModule.rename(oldPath, newPath)
}

/**
 * Deletes a file or directory
 * @param filePath - The path of the file/directory to delete
 * @param fsModule - The fs module to use (defaults to fs/promises)
 * @returns Promise that resolves when the file/directory is deleted
 */
export async function deleteFile(
  filePath: string,
  fsModule: Fs = fsAdapter
): Promise<void> {
  const stats = await fsModule.stat(filePath)
  if (stats.isDirectory()) {
    await fsModule.rmdir(filePath, { recursive: true })
  } else {
    await fsModule.unlink(filePath)
  }
}

/**
 * Writes a file atomically to avoid partial writes and corruption
 * @param filePath - The path of the file to write
 * @param content - The file contents to write
 */
export async function saveFileAtomic(
  filePath: string,
  content: string
): Promise<void> {
  await writeFileAtomic(filePath, content, { encoding: "utf8" })
}
