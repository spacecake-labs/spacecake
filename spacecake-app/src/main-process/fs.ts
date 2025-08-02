import fs from "fs/promises";
import path from "path";
import type { FileEntry, File } from "@/types/workspace";
import { FileType } from "@/types/workspace";

/**
 * Sorts file entries: directories first, then files, both alphabetically
 * @param files - Array of file entries to sort
 * @returns Sorted array of file entries
 */
export function sortFiles(files: FileEntry[]): FileEntry[] {
  return files.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
}

export interface FileNode {
  name: string;
  isDirectory(): boolean;
}
export interface FileStat {
  size: number;
  mtime: Date;
  isDirectory(): boolean;
}
export interface Fs {
  readdir: (
    dirPath: string,
    opts?: { withFileTypes?: boolean }
  ) => Promise<FileNode[]>;
  stat: (path: string) => Promise<FileStat>;
  access: (path: string) => Promise<void>;
  mkdir: (
    path: string,
    options?: { recursive?: boolean }
  ) => Promise<string | undefined>;
  writeFile: (
    path: string,
    data: string,
    options?: BufferEncoding | { encoding?: BufferEncoding }
  ) => Promise<void>;
  readFile: (
    path: string,
    options?: BufferEncoding | { encoding?: BufferEncoding }
  ) => Promise<string>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  rmdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  unlink: (path: string) => Promise<void>;
}

/**
 * Reads directory contents and returns sorted file entries
 * @param dirPath - The directory path to read
 * @param fsModule - The fs module to use (defaults to fs/promises)
 * @returns Array of sorted file entries
 */
export async function readDir(
  dirPath: string,
  fsModule: Fs = fs
): Promise<FileEntry[]> {
  const entries = await fsModule.readdir(dirPath, { withFileTypes: true });

  // Filter out .spacecake folder and other hidden files
  const filteredEntries = entries.filter(
    (entry) => !entry.name.startsWith(".")
  );

  const files = await Promise.all(
    filteredEntries.map(async (entry: FileNode) => {
      const fullPath = path.join(dirPath, entry.name);
      const stats = await fsModule.stat(fullPath);

      return {
        name: entry.name,
        path: fullPath,
        type: entry.isDirectory() ? ("directory" as const) : ("file" as const),
        size: stats.size,
        modified: stats.mtime.toISOString(),
        isDirectory: entry.isDirectory(),
      };
    })
  );

  return sortFiles(files);
}

/**
 * Gets the file type based on the file extension
 * @param fileName - The name of the file
 * @returns The FileType enum value
 */
export function getFileType(fileName: string): FileType {
  const extension = fileName.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "md":
    case "markdown":
      return FileType.Markdown;
    default:
      return FileType.Plaintext;
  }
}

/**
 * Ensures the .spacecake folder exists in the given workspace directory
 * @param workspacePath - The workspace directory path
 * @param fsModule - The fs module to use (defaults to fs/promises)
 * @returns Promise that resolves when the folder is created or already exists
 */
export async function ensureSpacecakeFolder(
  workspacePath: string,
  fsModule: Fs = fs
): Promise<void> {
  const spacecakePath = path.join(workspacePath, ".spacecake");
  try {
    // Check if the folder already exists
    await fsModule.access(spacecakePath);
  } catch {
    // Folder doesn't exist, create it
    await fsModule.mkdir(spacecakePath, { recursive: true });
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
  fsModule: Fs = fs
): Promise<void> {
  await fsModule.writeFile(filePath, content, { encoding: "utf8" });
}

/**
 * Reads a file and returns both content and metadata
 * @param filePath - The path of the file to read
 * @param fsModule - The fs module to use (defaults to fs/promises)
 * @returns Promise that resolves to file entry with content
 */
export async function readFile(
  filePath: string,
  fsModule: Fs = fs
): Promise<File> {
  const [content, stats] = await Promise.all([
    fsModule.readFile(filePath, { encoding: "utf8" }),
    fsModule.stat(filePath),
  ]);

  const pathParts = filePath.split(path.sep);
  const name = pathParts[pathParts.length - 1];

  return {
    name,
    path: filePath,
    type: "file" as const,
    size: stats.size,
    modified: stats.mtime.toISOString(),
    isDirectory: false,
    content,
    fileType: getFileType(name),
  };
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
  fsModule: Fs = fs
): Promise<void> {
  // Check if the new path already exists
  try {
    await fsModule.access(newPath);
    throw new Error(`file or directory already exists: ${newPath}`);
  } catch (error) {
    // If access throws an error, it means the file doesn't exist, which is what we want
    if (error instanceof Error && error.message.includes("already exists")) {
      throw error;
    }
    // Otherwise, the file doesn't exist, so we can proceed with the rename
  }

  await fsModule.rename(oldPath, newPath);
}

/**
 * Deletes a file or directory
 * @param filePath - The path of the file/directory to delete
 * @param fsModule - The fs module to use (defaults to fs/promises)
 * @returns Promise that resolves when the file/directory is deleted
 */
export async function deleteFile(
  filePath: string,
  fsModule: Fs = fs
): Promise<void> {
  const stats = await fsModule.stat(filePath);
  if (stats.isDirectory()) {
    await fsModule.rmdir(filePath, { recursive: true });
  } else {
    await fsModule.unlink(filePath);
  }
}
